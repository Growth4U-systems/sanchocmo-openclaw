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

        const mcUrl = account?.mcServerUrl || "http://localhost:3000";
        const callbackUrl = `${mcUrl}/api/chat/webhook`;
        const headers = {
          "Content-Type": "application/json",
          ...(account?.sharedSecret ? { "X-MC-Secret": account.sharedSecret } : {}),
        };
        const body = JSON.stringify({
          slug,
          threadId,
          text,
          role: "bot",
          agent: params.agentId || "sancho",
          ts: new Date().toISOString(),
        });

        console.error(`[mc-chat] sendText to=${to} slug=${slug} threadId=${threadId} url=${callbackUrl} textLen=${(text||"").length}`);

        // Retry with exponential backoff for transient Next.js outages.
        const delays = [0, 750, 2250];
        let lastErr;
        for (let i = 0; i < delays.length; i++) {
          if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
          try {
            const response = await fetch(callbackUrl, { method: "POST", headers, body });
            if (response.ok) {
              const result = await response.json().catch(() => ({}));
              return { messageId: result.messageId || `mc-${Date.now()}` };
            }
            lastErr = new Error(`HTTP ${response.status}`);
            if (response.status >= 400 && response.status < 500) break; // don't retry 4xx
          } catch (err) {
            lastErr = err;
          }
        }
        console.error(`[mc-chat] sendText failed after ${delays.length} attempts: ${lastErr?.message || lastErr} (url=${callbackUrl})`);
        return { messageId: `mc-err-${Date.now()}` };
      },
    },
    base: {
      sendMedia: async (params) => {
        const { to, filePath, account } = params;
        const parts = (to || "").split(":");
        const slug = parts[2] || parts[1] || "unknown";
        const threadId = parts.slice(2).join(":") || "unknown";

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
