/**
 * MC Chat Channel Plugin — Entry point
 *
 * Registers the mc-chat channel + HTTP webhook endpoint for inbound messages
 * from Mission Control server.
 */

import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import {
  finalizeInboundContext,
  dispatchInboundMessageWithBufferedDispatcher,
} from "openclaw/plugin-sdk/reply-runtime";
import { loadConfig } from "openclaw/plugin-sdk/config-runtime";
import { mcChatPlugin } from "./channel.js";

const CHANNEL_KEY = "mc-chat";
const DEFAULT_ACCOUNT_ID = "default";

export default defineChannelPluginEntry({
  id: "mc-chat",
  name: "Mission Control Chat",
  description: "Webchat channel for Mission Control dashboard",
  plugin: mcChatPlugin,

  registerFull(api) {
    const logger = api.logger;

    // ─── HTTP Route: Inbound webhook from MC Server ───
    api.registerHttpRoute({
      path: "/mc-chat/inbound",
      auth: "plugin",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return true;
        }

        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 100_000) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: "Payload too large" }));
            return true;
          }
        }

        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Invalid JSON" }));
          return true;
        }

        // Validate shared secret
        const cfg = loadConfig();
        const channelCfg = cfg?.channels?.[CHANNEL_KEY];
        const expectedSecret = channelCfg?.sharedSecret;
        if (expectedSecret) {
          const providedSecret = req.headers["x-mc-secret"];
          if (providedSecret !== expectedSecret) {
            logger.warn("[mc-chat] Invalid shared secret from MC server");
            res.statusCode = 403;
            res.end(JSON.stringify({ error: "Forbidden" }));
            return true;
          }
        }

        const {
          slug,
          threadId,
          threadName,
          text,
          userId,
          userName,
          linkedTo,
          skill,
          agentId,
        } = payload;

        if (!slug || !threadId || !text) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Missing required fields: slug, threadId, text" }));
          return true;
        }

        logger.info(`[mc-chat] Inbound from ${userName || userId || "unknown"} → ${slug}/${threadId}: ${text.slice(0, 80)}`);

        const chatId = `channel:mc-chat:${slug}:${threadId}`;

        // Build structured context for the agent
        // This mimics how Discord provides guild context via inbound metadata
        const contextLines = [
          `[MC Chat Context]`,
          `client_slug: ${slug}`,
          `thread_id: ${threadId}`,
        ];
        if (threadName) contextLines.push(`thread_name: ${threadName}`);
        if (linkedTo) contextLines.push(`linked_to: ${linkedTo}`);
        if (skill) contextLines.push(`skill: ${skill}`);
        contextLines.push(`[/MC Chat Context]`);

        const bodyForAgent = contextLines.join('\n') + '\n\n' + text;

        // Build MsgContext for OpenClaw dispatch
        const msgCtx = finalizeInboundContext({
          Body: text,
          BodyForAgent: bodyForAgent,
          RawBody: text,
          CommandBody: text,
          From: chatId,
          To: chatId,
          SessionKey: chatId,
          AccountId: DEFAULT_ACCOUNT_ID,
          SenderName: userName || "MC User",
          SenderId: userId || `mc-user-${slug}`,
          SenderUsername: userId || `mc-user-${slug}`,
          Provider: CHANNEL_KEY,
          Surface: CHANNEL_KEY,
          OriginatingChannel: CHANNEL_KEY,
          OriginatingTo: chatId,
          ChatType: "channel",
          IsGroupChat: false,
          Timestamp: Date.now(),
        });

        // Acknowledge receipt immediately — response comes async via outbound callback
        res.statusCode = 200;
        res.end(JSON.stringify({
          ok: true,
          chatId,
          message: "Message dispatched to agent",
        }));

        // Dispatch to agent asynchronously
        try {
          const mcUrl = channelCfg?.mcServerUrl || "http://localhost:18790";
          const callbackUrl = `${mcUrl}/webhook/mc-chat/response`;
          const secret = channelCfg?.sharedSecret;

          await dispatchInboundMessageWithBufferedDispatcher({
            ctx: msgCtx,
            cfg,
            dispatcherOptions: {
              deliver: async (replyPayload, _info) => {
                // Support multi-message: replyPayload can have text, body, or parts
                const texts = [];
                const replyText = replyPayload?.text || replyPayload?.body || "";
                if (replyText) texts.push(replyText);
                // Also check for parts/segments if available
                if (replyPayload?.parts && Array.isArray(replyPayload.parts)) {
                  for (const part of replyPayload.parts) {
                    const t = part?.text || part?.body || "";
                    if (t) texts.push(t);
                  }
                }
                if (texts.length === 0) return;

                // Detect which agent is responding
                const respondingAgent = replyPayload?.agentId || replyPayload?.agent || agentId || "sancho";

                // Send each text as a separate message
                for (const msgText of texts) {
                  try {
                    const response = await fetch(callbackUrl, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(secret ? { "X-MC-Secret": secret } : {}),
                      },
                      body: JSON.stringify({
                        slug,
                        threadId,
                        text: msgText,
                        role: "bot",
                        agent: respondingAgent,
                        ts: new Date().toISOString(),
                      }),
                    });
                    if (!response.ok) {
                      logger.error(`[mc-chat] Callback failed: ${response.status}`);
                    }
                  } catch (err) {
                    logger.error(`[mc-chat] Callback error: ${err?.message}`);
                  }
                }
              },
              onError: (err, info) => {
                logger.error(`[mc-chat] Dispatch error (${info.kind}): ${err?.message || err}`);
              },
            },
          });
        } catch (err) {
          logger.error(`[mc-chat] Dispatch error: ${err?.message}`);
        }

        return true;
      },
    });

    // ─── HTTP Route: Health check ───
    api.registerHttpRoute({
      path: "/mc-chat/health",
      auth: "plugin",
      handler: async (req, res) => {
        res.statusCode = 200;
        res.end(JSON.stringify({
          ok: true,
          channel: "mc-chat",
          version: "0.2.0",
          ts: new Date().toISOString(),
        }));
        return true;
      },
    });

    logger.info("[mc-chat] Channel plugin registered — webhook at /mc-chat/inbound");
  },
});

export { mcChatPlugin };
