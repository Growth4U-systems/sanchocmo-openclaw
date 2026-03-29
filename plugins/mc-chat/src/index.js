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
          isAdmin,
          senderRole,
          _source, // "discord" if relayed from Discord
        } = payload;

        if (!slug || !threadId || !text) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Missing required fields: slug, threadId, text" }));
          return true;
        }

        logger.info(`[mc-chat] Inbound from ${userName || userId || "unknown"} → ${slug}/${threadId}: ${text.slice(0, 80)}`);

        // threadId may already include slug prefix (e.g. "growth4u:self-intelligence")
        const chatId = threadId.startsWith(slug + ':')
          ? `channel:mc-chat:${threadId}`
          : `channel:mc-chat:${slug}:${threadId}`;

        // Build structured context for the agent
        // This mimics how Discord provides guild context via inbound metadata
        const contextLines = [
          `[MC Chat Context]`,
          `channel: mc-chat (Mission Control webchat — NOT Discord)`,
          `client_slug: ${slug}`,
          `thread_id: ${threadId}`,
        ];
        if (threadName) contextLines.push(`thread_name: ${threadName}`);
        if (linkedTo) contextLines.push(`linked_to: ${linkedTo}`);
        if (skill) contextLines.push(`skill: ${skill}`);
        contextLines.push(`IMPORTANT: You are responding via MC Chat, NOT Discord. Do NOT use the message tool to reply. Just respond with text directly — your reply will be delivered to the user automatically via the MC Chat callback. Do NOT create Discord threads or send Discord messages for this conversation. Read files from disk (brand/${slug}/), never via HTTP/web_fetch to localhost.`);
        contextLines.push(`[/MC Chat Context]`);

        const bodyForAgent = contextLines.join('\n') + '\n\n' + text;

        // Resolve sender identity based on admin/client role
        // This maps to toolsBySender keys in openclaw.json:
        //   "id:mc-admin" → alsoAllow: [gateway, exec, cron]
        //   clients get default deny
        const resolvedSenderId = isAdmin ? "mc-admin" : (userId || `mc-client-${slug}`);
        const resolvedSenderName = userName || (isAdmin ? "Admin" : `${slug} (client)`);

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
          SenderName: resolvedSenderName,
          SenderId: resolvedSenderId,
          SenderUsername: resolvedSenderId,
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

                // Check if thread is linked to Discord
                let discordLink = null;
                try {
                  const threadRes = await fetch(`${mcUrl}/api/mc-chat/thread/${encodeURIComponent(chatId)}`);
                  const threadData = await threadRes.json();
                  if (threadData.discordThreadId && threadData.discordChannelId) {
                    discordLink = { threadId: threadData.discordThreadId, channelId: threadData.discordChannelId };
                  }
                } catch {}

                // Send each text as a separate message (MC + Discord if linked)
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
                    // Also relay to Discord if linked (skip if message came from Discord)
                    if (discordLink && _source !== "discord") {
                      try {
                        await tools.message.send({
                          action: "send",
                          target: `channel:${discordLink.threadId}`,
                          message: msgText + "\n||[_mc_relay]||", // Hidden spoiler tag
                        });
                        logger.info(`[mc-chat] Relayed to Discord thread ${discordLink.threadId}`);
                      } catch (discordErr) {
                        logger.error(`[mc-chat] Discord relay error: ${discordErr?.message}`);
                      }
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
            // Status updates: send intermediate state to MC typing indicator
            typingCallbacks: {
              onReplyStart: async () => {
                fetch(callbackUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...(secret ? { "X-MC-Secret": secret } : {}) },
                  body: JSON.stringify({ slug, threadId, role: "status", text: "🔄 Sancho está pensando...", agent: agentId || "sancho" }),
                }).catch(() => {});
              },
            },
            getReplyOptions: {
              onToolStart: async (payload) => {
                if (payload?.name) {
                  const label = payload.name === "Read" ? "📄 Leyendo"
                    : payload.name === "Write" ? "✍️ Escribiendo"
                    : payload.name === "Bash" ? "⚡ Ejecutando"
                    : payload.name === "Grep" || payload.name === "Glob" ? "🔍 Buscando"
                    : payload.name === "WebFetch" || payload.name === "WebSearch" ? "🌐 Buscando en web"
                    : payload.name === "Agent" ? "🤖 Delegando a subagente"
                    : "🔧 " + payload.name;
                  fetch(callbackUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...(secret ? { "X-MC-Secret": secret } : {}) },
                    body: JSON.stringify({ slug, threadId, role: "status", text: label + "...", agent: agentId || "sancho" }),
                  }).catch(() => {});
                }
              },
              onCompactionStart: async () => {
                fetch(callbackUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...(secret ? { "X-MC-Secret": secret } : {}) },
                  body: JSON.stringify({ slug, threadId, role: "status", text: "📦 Compactando contexto...", agent: agentId || "sancho" }),
                }).catch(() => {});
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

    // Discord thread creation endpoint (proxies to message tool)
    api.registerHttpRoute({
      path: "/mc-chat/create-discord-thread",
      auth: "plugin",
      handler: async (req, res) => {
        let body = "";
        req.on("data", (chunk) => { body += chunk; if (body.length > 100000) req.destroy(); });
        req.on("end", async () => {
          try {
            const { channelId, name, initialMessage } = JSON.parse(body);
            if (!channelId || !name) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Missing channelId or name" }));
              return;
            }
            // Create Discord thread via message tool
            const result = await tools.message.send({
              action: "thread-create",
              channel: "discord",
              target: `channel:${channelId}`,
              threadName: name.substring(0, 100),
              message: initialMessage || `🔗 Thread sincronizado con Mission Control`,
            });
            if (result?.result?.threadId) {
              res.statusCode = 200;
              res.end(JSON.stringify({
                ok: true,
                threadId: result.result.threadId,
                channelId,
              }));
            } else {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: "Thread creation failed", details: result }));
            }
          } catch (e) {
            logger.error(`[mc-chat] Discord thread creation error: ${e.message}`);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return true;
      },
    });

    // Outbound hook: watch Discord messages and relay to MC if thread is linked
    api.registerOutboundHook({
      provider: "discord",
      handler: async (msgCtx) => {
        // Only process messages from threads
        if (!msgCtx.ThreadId) return;
        const discordThreadId = msgCtx.ThreadId;
        // Check if this Discord thread is linked to an MC thread
        const mcUrl = channelCfg?.mcServerUrl || "http://localhost:18790";
        let mcThreadId = null;
        try {
          // Search all MC threads for this discordThreadId
          const searchRes = await fetch(`${mcUrl}/api/mc-chat/find-by-discord/${encodeURIComponent(discordThreadId)}`);
          const searchData = await searchRes.json();
          if (searchData.ok && searchData.threadId) {
            mcThreadId = searchData.threadId;
          }
        } catch {}
        if (!mcThreadId) return; // Not linked, ignore

        // Check for loop flag
        if (msgCtx.Body?.includes("[_mc_relay]")) return; // Avoid loop

        // Relay to MC (strip relay marker if present)
        const slug = mcThreadId.split(":")[0];
        let text = msgCtx.Body || msgCtx.RawBody || "";
        text = text.replace(/\|\|?\[_mc_relay\]\|\|?/g, "").trim(); // Remove marker
        if (!text.trim()) return;
        try {
          await fetch(`${mcUrl}/api/mc-chat/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slug,
              threadId: mcThreadId,
              text,
              userName: msgCtx.SenderName || "Discord User",
              _source: "discord", // Mark source to prevent re-relay
            }),
          });
          logger.info(`[mc-chat] Relayed Discord message from ${discordThreadId} to MC ${mcThreadId}`);
        } catch (e) {
          logger.error(`[mc-chat] Discord→MC relay error: ${e.message}`);
        }
      },
    });

    logger.info("[mc-chat] Channel plugin registered — webhook at /mc-chat/inbound");
  },
});

export { mcChatPlugin };
