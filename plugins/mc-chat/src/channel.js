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

const CHANNEL_KEY = "mc-chat";
const DEFAULT_ACCOUNT_ID = "default";

/**
 * Resolve account config from openclaw.json channels.mc-chat
 * Must be resilient to missing config — return safe defaults.
 */
function resolveAccount(cfg, accountId) {
  const section = cfg?.channels?.[CHANNEL_KEY];
  if (!section) {
    return {
      accountId: accountId ?? DEFAULT_ACCOUNT_ID,
      mcServerUrl: "http://localhost:3000",
      sharedSecret: "",
      allowFrom: [],
      dmPolicy: "allowlist",
    };
  }
  return {
    accountId: accountId ?? DEFAULT_ACCOUNT_ID,
    mcServerUrl: section.mcServerUrl || "http://localhost:3000",
    sharedSecret: section.sharedSecret || "",
    allowFrom: section.allowFrom || [],
    dmPolicy: section.dmSecurity || "allowlist",
  };
}

/**
 * Check if the channel has config present.
 */
function isConfigured(cfg) {
  const section = cfg?.channels?.[CHANNEL_KEY];
  return Boolean(section?.mcServerUrl);
}

export const mcChatPlugin = createChatChannelPlugin({
  base: createChannelPluginBase({
    id: CHANNEL_KEY,
    meta: {
      id: CHANNEL_KEY,
      label: "Mission Control Chat",
      selectionLabel: "Mission Control (Dashboard)",
      detailLabel: "MC Chat",
      docsPath: "/channels/mc-chat",
      blurb: "Connect the Mission Control dashboard webchat to OpenClaw agents.",
      aliases: ["mc", "mission-control"],
    },
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

  // Outbound: send responses back to MC server via HTTP callback
  outbound: {
    attachedResults: {
      sendText: async (params) => {
        const { to, text, account } = params;

        // Parse the target to extract slug and threadId
        // chatId format: "channel:mc-chat:slug:threadId"
        const parts = (to || "").split(":");
        const slug = parts[2] || "unknown";
        const threadId = parts.slice(3).join(":") || "unknown";

        const mcUrl = account?.mcServerUrl || "http://localhost:3000";
        const callbackUrl = `${mcUrl}/api/chat/webhook`;

        try {
          const response = await fetch(callbackUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(account?.sharedSecret ? { "X-MC-Secret": account.sharedSecret } : {}),
            },
            body: JSON.stringify({
              slug,
              threadId,
              text,
              role: "bot",
              agent: params.agentId || "sancho",
              ts: new Date().toISOString(),
            }),
          });

          if (!response.ok) {
            console.error(`[mc-chat] Callback failed: ${response.status} ${response.statusText}`);
          }

          const result = await response.json().catch(() => ({}));
          return { messageId: result.messageId || `mc-${Date.now()}` };
        } catch (err) {
          console.error(`[mc-chat] Callback error:`, err?.message);
          return { messageId: `mc-err-${Date.now()}` };
        }
      },
    },
    base: {
      sendMedia: async (params) => {
        const { to, filePath, account } = params;
        // chatId format: "channel:mc-chat:slug:threadId"
        const parts = (to || "").split(":");
        const slug = parts[2] || "unknown";
        const threadId = parts.slice(3).join(":") || "unknown";

        const mcUrl = account?.mcServerUrl || "http://localhost:3000";
        const callbackUrl = `${mcUrl}/api/chat/webhook`;

        try {
          await fetch(callbackUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(account?.sharedSecret ? { "X-MC-Secret": account.sharedSecret } : {}),
            },
            body: JSON.stringify({
              slug,
              threadId,
              text: `📎 [Archivo adjunto](${filePath})`,
              role: "bot",
              agent: "sancho",
              ts: new Date().toISOString(),
            }),
          });
        } catch (err) {
          console.error(`[mc-chat] Media callback error:`, err?.message);
        }
      },
    },
  },
});
