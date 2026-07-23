/**
 * MC Chat Channel Plugin — channel.js
 *
 * Connects Mission Control dashboard webchat to OpenClaw.
 *
 * Architecture:
 *   Frontend (HTML) ↔ WS ↔ MC Server ↔ HTTP webhook → this plugin (inbound)
 *   this plugin (outbound) → HTTP callback → MC Server → WS → Frontend
 *
 * Thread ↔ Session mapping:
 *   Each MC thread (threadId) maps to an OpenClaw session.
 *   Session key format: "mc-chat:{clientSlug}:{threadId}"
 *   Thread metadata (linkedTo, skill, name) is passed as context in the message.
 */

import {
  createChatChannelPlugin,
  createChannelPluginBase,
} from "openclaw/plugin-sdk/core";
import {
  CHANNEL_KEY,
  DEFAULT_ACCOUNT_ID,
  resolveAccount,
  isConfigured,
} from "./account.js";
import { markVisibleDelivery } from "./delivery-state.js";
import { enqueueOpenClawTerminalCallback } from "./callback-delivery.js";
import { looksLikeToolEcho } from "./tool-echo.js";
import { runtimeRunCallbackAuthorityFor } from "./runtime-run-state.js";
import { validatedControlPlaneOrigin } from "./chat-turn-authority.js";

const DEFAULT_MC_SERVER_URL = "http://localhost:3000";

function missionControlWebhookUrl(account) {
  const origin = validatedControlPlaneOrigin(
    account?.mcServerUrl || DEFAULT_MC_SERVER_URL,
  );
  return origin ? `${origin}/api/chat/webhook` : null;
}

function terminalCallbackHeaders(authority) {
  return {
    ...(authority?.dispatchRunId && authority?.dispatchLeaseToken
      ? {
          "X-Sancho-Dispatch-Run-Id": authority.dispatchRunId,
          "X-Sancho-Dispatch-Lease-Token": authority.dispatchLeaseToken,
        }
      : {}),
    ...(authority?.runtimeTerminalCallbackGrant
      ? {
          "X-Sancho-Terminal-Callback-Grant":
            authority.runtimeTerminalCallbackGrant,
        }
      : {}),
  };
}

export const mcChatPlugin = createChatChannelPlugin({
  base: createChannelPluginBase({
    id: CHANNEL_KEY,
    capabilities: {
      chatTypes: ["dm"],
      reactions: false,
      threads: false,
      media: false,
      nativeCommands: false,
      blockStreaming: true,
    },
    setup: {
      resolveAccount,
      inspectAccount(cfg, _accountId) {
        const section = cfg?.channels?.[CHANNEL_KEY];
        return {
          enabled: Boolean(section?.mcServerUrl),
          configured: Boolean(section?.mcServerUrl),
          tokenStatus: section?.sharedSecret ? "available" : "missing",
        };
      },
    },
    // ─── Config adapter: MUST provide listAccountIds ───
    // The health monitor calls plugin.config.listAccountIds(cfg) on ALL
    // registered channel plugins. Without this, it throws TypeError and
    // crashes the gateway in a restart loop.
    config: {
      listAccountIds(cfg) {
        // Single-account channel: return ["default"] when configured, [] when not
        try {
          if (isConfigured(cfg)) return [DEFAULT_ACCOUNT_ID];
          return [];
        } catch {
          return [];
        }
      },
      resolveAccount(cfg, accountId) {
        return resolveAccount(cfg, accountId);
      },
      resolveDefaultAccountId(cfg) {
        if (isConfigured(cfg)) return DEFAULT_ACCOUNT_ID;
        return undefined;
      },
    },
  }),

  // Security: MC server handles auth (portal tokens), plugin trusts it
  security: {
    dm: {
      channelKey: CHANNEL_KEY,
      resolvePolicy: (_account) => "open", // MC server already authenticates
      resolveAllowFrom: (account) => account?.allowFrom ?? [],
      defaultPolicy: "open",
    },
  },

  // No pairing needed — MC server handles user identity
  pairing: undefined,

  // Threading: replies go to the same thread context
  threading: { topLevelReplyToMode: "reply" },

  // Outbound: send responses back to MC server via HTTP callback.
  // Routes migrated to Next.js (/api/chat/*) — Next is the single writer for
  // chat threads. Plugin's deliver hook in index.js doesn't fire on this SDK
  // version (channel-plugin path takes precedence), so this is the real
  // delivery point for bot responses.
  outbound: {
    attachedResults: {
      sendText: async (params) => {
        const { to, text, account } = params;

        // Parse the target to extract slug and threadId.
        // `to` shape is "channel:mc-chat:{slug}:{rest...}" — strip the 2-part prefix.
        const parts = (to || "").split(":");
        const slug = parts[2] || parts[1] || "unknown";
        const threadId = parts.slice(2).join(":") || "unknown";

        const callbackUrl = missionControlWebhookUrl(account);
        const respondingAgent = params.agentId || "sancho";
        const callbackAuthority = runtimeRunCallbackAuthorityFor(
          slug,
          threadId,
          params.agentId,
        );
        const missionControlRunId = callbackAuthority?.missionControlRunId;
        if (looksLikeToolEcho(text)) {
          console.error(`[mc-chat] dropped tool-echo sendText threadId=${threadId} textLen=${(text || "").length}`);
          return { messageId: `mc-echo-${Date.now()}` };
        }
        if (!callbackUrl) {
          console.error("[mc-chat] sendText refused: mcServerUrl is not a valid control-plane origin");
          return { messageId: `mc-err-${Date.now()}` };
        }
        if (!callbackAuthority) {
          console.error("[mc-chat] sendText refused: active run capability unavailable");
          return { messageId: `mc-err-${Date.now()}` };
        }
        const headers = {
          "Content-Type": "application/json",
          ...(account?.sharedSecret ? { "X-MC-Secret": account.sharedSecret } : {}),
          "X-Mission-Control-Run-Id": callbackAuthority.missionControlRunId,
          "X-Sancho-Run-Capability": callbackAuthority.runtimeToolCapability,
          ...terminalCallbackHeaders(callbackAuthority),
        };
        const payload = {
          slug,
          threadId,
          ...(missionControlRunId ? { missionControlRunId } : {}),
          text,
          role: "bot",
          agent: respondingAgent,
          ts: new Date().toISOString(),
        };

        console.error(`[mc-chat] sendText to=${to} slug=${slug} threadId=${threadId} textLen=${(text||"").length}`);

        try {
          const queued = enqueueOpenClawTerminalCallback({
            deliveryId: missionControlRunId,
            url: callbackUrl,
            headers,
            payload,
          });
          // Once fsynced, this turn owns a replayable visible delivery. Keep
          // awaiting the webhook ACK so the durable parent cannot complete
          // before Mission Control has accepted the terminal result.
          markVisibleDelivery(slug, threadId);
          await queued.delivery;
          return { messageId: `mc-${queued.callbackId.slice(0, 24)}` };
        } catch (error) {
          console.error(
            `[mc-chat] durable sendText failed code=${error?.code || "unknown"}`,
          );
          throw error;
        }
      },
    },
    base: {
      sendMedia: async (params) => {
        const { to, filePath, account } = params;
        const parts = (to || "").split(":");
        const slug = parts[2] || parts[1] || "unknown";
        const threadId = parts.slice(2).join(":") || "unknown";

        const callbackUrl = missionControlWebhookUrl(account);
        const callbackAuthority = runtimeRunCallbackAuthorityFor(
          slug,
          threadId,
          "sancho",
        );
        const missionControlRunId = callbackAuthority?.missionControlRunId;

        if (!callbackUrl) {
          console.error("[mc-chat] sendMedia refused: mcServerUrl is not a valid control-plane origin");
          return;
        }
        if (!callbackAuthority) {
          console.error("[mc-chat] sendMedia refused: active run capability unavailable");
          return;
        }

        try {
          const queued = enqueueOpenClawTerminalCallback({
            deliveryId: missionControlRunId,
            url: callbackUrl,
            headers: {
              "Content-Type": "application/json",
              ...(account?.sharedSecret ? { "X-MC-Secret": account.sharedSecret } : {}),
              "X-Mission-Control-Run-Id": callbackAuthority.missionControlRunId,
              "X-Sancho-Run-Capability": callbackAuthority.runtimeToolCapability,
              ...terminalCallbackHeaders(callbackAuthority),
            },
            payload: {
              slug,
              threadId,
              ...(missionControlRunId ? { missionControlRunId } : {}),
              text: `📎 [Archivo adjunto](${filePath})`,
              role: "bot",
              agent: "sancho",
              ts: new Date().toISOString(),
            },
          });
          markVisibleDelivery(slug, threadId);
          await queued.delivery;
        } catch (err) {
          console.error(
            `[mc-chat] durable media callback failed code=${err?.code || "unknown"}`,
          );
          throw err;
        }
      },
    },
  },
});
