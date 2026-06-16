/**
 * MC Chat Channel Plugin — Entry point
 *
 * Registers the mc-chat channel + HTTP webhook endpoint for inbound messages
 * from Mission Control server.
 */

import fs from "node:fs";
import path from "node:path";
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import {
  finalizeInboundContext,
  dispatchInboundMessageWithBufferedDispatcher,
} from "openclaw/plugin-sdk/reply-runtime";
import { loadConfig } from "openclaw/plugin-sdk/config-runtime";
import { mcChatPlugin } from "./channel.js";
import { classifyAndRewriteError, mergeWithPriorCategory } from "./error-rewriter.js";
import { errorTracker } from "./error-tracker.js";
import { looksLikeToolEcho } from "./tool-echo.js";

// Best-effort lookup of an agent's current Codex auth mode + account email.
// Used to disambiguate "rate limit" errors: Codex CLI always emits the
// "subscription usage limit" wording even when auth_mode is apikey, which
// confuses debugging. The rewriter consumes this to pick auth-aware copy.
// Returns null if anything goes wrong; the rewriter then falls back to the
// generic message.
function readCodexAuthInfo(agentId) {
  if (!agentId || typeof agentId !== "string") return null;
  const home = process.env.OPENCLAW_HOME;
  if (!home) return null;
  const candidates = [
    path.join(home, ".openclaw", "agents", agentId, "agent", "codex-home", "auth.json"),
    path.join(home, "agents", agentId, "agent", "codex-home", "auth.json"),
  ];
  for (const p of candidates) {
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      // Derive auth mode: trust explicit `auth_mode` first, else infer from
      // presence of `tokens` (chatgpt OAuth) or `OPENAI_API_KEY` (apikey).
      let authMode = typeof data?.auth_mode === "string" ? data.auth_mode : null;
      if (!authMode) {
        if (data?.tokens && typeof data.tokens === "object") authMode = "chatgpt";
        else if (typeof data?.OPENAI_API_KEY === "string" && data.OPENAI_API_KEY) authMode = "apikey";
      }
      const authEmail = typeof data?.email === "string" ? data.email
        : (typeof data?.tokens?.account?.email === "string" ? data.tokens.account.email : null);
      return { authMode, authEmail };
    } catch {
      // try next candidate path
    }
  }
  return null;
}

const CHANNEL_KEY = "mc-chat";
const DEFAULT_ACCOUNT_ID = "default";

// Strip Discord-style `<URL>` wrappers from outbound bot text.
// MC chat UI does not parse them — the angle brackets leak into the
// rendered href so `…/file.md>` 404s. Sancho regresses to this pattern
// from training data despite the rule in PROTOCOLS.md (#18); the
// defensive scrub here makes the channel robust against any agent.
// Only unwraps when angle brackets surround a bare http(s) URL with no
// interior whitespace.
function scrubAngleWrappedUrls(text) {
  if (typeof text !== "string" || text.length === 0) return text;
  return text.replace(/<(https?:\/\/[^\s<>]+)>/g, "$1");
}


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
          agent,
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

        const rawRequestedAgent = typeof agentId === "string" && agentId.trim()
          ? agentId.trim()
          : (typeof agent === "string" && agent.trim() ? agent.trim() : "sancho");
        const requestedAgent = /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(rawRequestedAgent)
          ? rawRequestedAgent.toLowerCase()
          : "sancho";

        logger.info(`[mc-chat] Inbound from ${userName || userId || "unknown"} → ${slug}/${threadId} agent=${requestedAgent}: ${text.slice(0, 80)}`);

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
        if (requestedAgent && requestedAgent !== "sancho") contextLines.push(`requested_agent: ${requestedAgent}`);
        contextLines.push(`IMPORTANT: You are responding via MC Chat, NOT Discord. Do NOT use the message tool to reply. Just respond with text directly — your reply will be delivered to the user automatically via the MC Chat callback. Do NOT create Discord threads or send Discord messages for this conversation. Read files from disk (brand/${slug}/), never via HTTP/web_fetch to localhost.`);
        contextLines.push(`⚠️ EXECUTION GUARDRAIL: Aprobar un plan o crear proyectos NO es autorización para ejecutar tareas. Siempre preguntar "¿Ejecuto [tarea específica]?" y esperar confirmación explícita antes de generar deliverables. "Apruebo el plan" y "Ejecuta" son pasos DIFERENTES.`);
        contextLines.push(`💬 INTERACTIVE QUESTIONS: Cuando necesites una decisión del usuario entre opciones FINITAS y CONOCIDAS (ej. elegir un nicho de una lista, un tono, un pilar, un ICP), emite un bloque ":::ask" en vez de preguntar en texto libre. Formato:`);
        contextLines.push(`:::ask`);
        contextLines.push(`{"id":"q_<short>","prompt":"<pregunta>","mode":"single"|"multi","options":[{"id":"<key>","label":"<texto>"}]}`);
        contextLines.push(`:::`);
        contextLines.push(`Usa "single" para radios (1 opción) y "multi" para checkboxes. OBLIGATORIO: la ÚLTIMA opción debe ser SIEMPRE {"id":"other","label":"Otro (lo escribo)"} — no es opcional, es un requisito del componente para que el usuario pueda dar respuesta libre. Si la omites, el usuario queda encajonado. NO uses ":::ask" para preguntas abiertas (ej. "cuéntame sobre tu negocio") — solo para decisiones discretas. Puedes incluir VARIOS bloques ":::ask" en un mismo mensaje (ej. preguntar tono + formato + audiencia a la vez); el componente espera a que el usuario responda TODAS antes de devolverte un único mensaje con todas las respuestas en líneas separadas: "[ask:q1] respuesta: …\\n[ask:q2] respuesta: …". NO ejecutes nada hasta recibir ese mensaje completo. Si el usuario eligió "Otro" verás su texto literal en lugar de la etiqueta.`);
        contextLines.push(`[/MC Chat Context]`);

        const bodyForAgent = contextLines.join('\n') + '\n\n' + text;

        // Resolve sender identity based on admin/client role
        // This maps to toolsBySender keys in openclaw.json:
        //   "id:mc-admin" → alsoAllow: [gateway, exec, cron]
        //   clients get default deny
        const resolvedSenderId = isAdmin ? "mc-admin" : (userId || `mc-client-${slug}`);
        const resolvedSenderName = userName || (isAdmin ? "Admin" : `${slug} (client)`);

        // Always embed the agentId in the SessionKey using OpenClaw's canonical
        // agent-scoped format: "agent:<agentId>:<rest>". resolveSessionAgentIds()
        // (agent-scope.js) parses this and routes the dispatch to
        // workspace-<agentId>. Without this prefix the message lands on whatever
        // OpenClaw considers the default agent — which is no longer guaranteed
        // to be sancho once additional agents are registered.
        const sessionKey = `agent:${requestedAgent}:${chatId}`;

        // Build MsgContext for OpenClaw dispatch
        const msgCtx = finalizeInboundContext({
          Body: text,
          BodyForAgent: bodyForAgent,
          RawBody: text,
          CommandBody: text,
          From: chatId,
          To: chatId,
          SessionKey: sessionKey,
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
          // Default to Next.js (port 3000) — it owns chat thread writes since
          // the strangler-fig migration. mc-server.js's /webhook/mc-chat/response
          // is dead code but still proxied through Next's fallback rewrite.
          const mcUrl = channelCfg?.mcServerUrl || "http://localhost:3000";
          const callbackUrl = `${mcUrl}/api/chat/webhook`;
          const threadLinkUrlBase = `${mcUrl}/api/chat/thread`;
          const sendUrl = `${mcUrl}/api/chat/send`;
          const secret = channelCfg?.sharedSecret;
          // Retry with exponential backoff for transient Next.js outages
          // (dev server reloads, restarts). On permanent failure the message
          // is logged loudly — Sancho's trajectory still has it for recovery.
          const postWithRetry = async (url, body, label) => {
            const headers = { "Content-Type": "application/json", ...(secret ? { "X-MC-Secret": secret } : {}) };
            const delays = [0, 750, 2250]; // 3 attempts: immediate, +750ms, +2250ms
            let lastErr;
            for (let i = 0; i < delays.length; i++) {
              if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
              try {
                const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
                if (res.ok) return res;
                lastErr = new Error(`HTTP ${res.status}`);
                if (res.status >= 400 && res.status < 500) break; // don't retry 4xx
              } catch (e) {
                lastErr = e;
              }
            }
            logger.error(`[mc-chat] ${label} failed after ${delays.length} attempts: ${lastErr?.message || lastErr}`);
            return null;
          };

          await dispatchInboundMessageWithBufferedDispatcher({
            ctx: msgCtx,
            cfg,
            // OpenClaw's default sourceReplyDeliveryMode for chatType="channel"
            // is "message_tool_only", which suppresses auto-delivery and expects
            // the agent to call the message tool. The mc-chat system prompt
            // explicitly instructs the agent NOT to use that tool — its reply
            // is delivered via the `deliver` callback below. Force "automatic"
            // so deliver actually fires.
            replyOptions: { sourceReplyDeliveryMode: "automatic" },
            dispatcherOptions: {
              deliver: async (replyPayload, _info) => {
                // Diagnostic: log every deliver invocation so we can tell
                // "deliver fired but text empty" from "deliver never fired".
                logger.info(`[mc-chat] deliver called kind=${_info?.kind || '?'} thread=${threadId} hasText=${Boolean(replyPayload?.text)} hasParts=${Array.isArray(replyPayload?.parts) && replyPayload.parts.length > 0} textLen=${(replyPayload?.text || '').length}`);
                // Support multi-message: replyPayload can have text, body, or parts
                const texts = [];
                const replyText = scrubAngleWrappedUrls(replyPayload?.text || replyPayload?.body || "");
                if (replyText) texts.push(replyText);
                // Also check for parts/segments if available
                if (replyPayload?.parts && Array.isArray(replyPayload.parts)) {
                  for (const part of replyPayload.parts) {
                    const t = scrubAngleWrappedUrls(part?.text || part?.body || "");
                    if (t) texts.push(t);
                  }
                }
                // Drop tool-call narration parts ("Write: to…", "run python3
                // inline script") so they never persist as bubbles. The real
                // reply is Spanish prose and never matches.
                const beforeFilter = texts.length;
                const delivered = texts.filter((t) => !looksLikeToolEcho(t));
                if (delivered.length < beforeFilter) {
                  logger.info(`[mc-chat] dropped ${beforeFilter - delivered.length} tool-echo part(s) thread=${threadId}`);
                }
                texts.length = 0;
                texts.push(...delivered);
                if (texts.length === 0) return;

                // Detect which agent is responding
                const respondingAgent = replyPayload?.agentId || replyPayload?.agent || requestedAgent || "sancho";

                // Check if thread is linked to Discord
                let discordLink = null;
                try {
                  const threadRes = await fetch(`${threadLinkUrlBase}/${encodeURIComponent(chatId)}`);
                  if (threadRes.ok) {
                    const threadData = await threadRes.json();
                    if (threadData.discordThreadId && threadData.discordChannelId) {
                      discordLink = { threadId: threadData.discordThreadId, channelId: threadData.discordChannelId };
                    }
                  }
                } catch {}

                // Send each text as a separate message (MC + Discord if linked).
                // Each text is run through the error rewriter: if it matches a
                // known error pattern (rate_limit / auth / watchdog_abort / …)
                // the user-facing text is replaced with a clear Spanish summary
                // and the raw payload is surfaced as `errorDetail` for the UI
                // modal. Untouched otherwise.
                const authInfo = readCodexAuthInfo(respondingAgent) || {};
                for (const msgText of texts) {
                  const { text: rewritten, errorDetail: classified } = classifyAndRewriteError(msgText, authInfo);
                  let errorDetail = classified;
                  if (errorDetail?.category === "watchdog_abort") {
                    const prior = errorTracker.getRecent(respondingAgent);
                    if (prior) errorDetail = mergeWithPriorCategory(errorDetail, prior);
                  }
                  await postWithRetry(callbackUrl, {
                    slug,
                    threadId,
                    text: rewritten,
                    role: "bot",
                    agent: respondingAgent,
                    ts: new Date().toISOString(),
                    ...(errorDetail ? { errorDetail } : {}),
                  }, "Bot callback");
                  // Also relay to Discord if linked (skip if message came from Discord)
                  if (discordLink && _source !== "discord") {
                    try {
                      await tools.message.send({
                        action: "send",
                        target: `channel:${discordLink.threadId}`,
                        message: rewritten + "\n||[_mc_relay]||", // Hidden spoiler tag
                      });
                      logger.info(`[mc-chat] Relayed to Discord thread ${discordLink.threadId}`);
                    } catch (discordErr) {
                      logger.error(`[mc-chat] Discord relay error: ${discordErr?.message}`);
                    }
                  }
                }
              },
              onError: (err, info) => {
                logger.error(`[mc-chat] Dispatch error (${info.kind}): ${err?.message || err}`);
                // Record classified errors into the per-agent tracker so a
                // subsequent watchdog_abort delivery can correlate ("session
                // timed out — last seen rate_limit"). Best-effort only.
                try {
                  const respondingAgent = requestedAgent || "sancho";
                  const authInfo = readCodexAuthInfo(respondingAgent) || {};
                  const { errorDetail } = classifyAndRewriteError(err?.message || String(err), authInfo);
                  if (errorDetail) errorTracker.record(respondingAgent, errorDetail);
                } catch {}
              },
            },
            // Status updates: send intermediate state to MC typing indicator.
            // Two flavors per event:
            //   role: "status"   → ephemeral one-line indicator (legacy, pisa anterior)
            //   role: "progress" → granular timeline event accumulated and sealed
            //                      into the bot's final message (visible after reply)
            typingCallbacks: {
              onReplyStart: async () => {
                const headers = { "Content-Type": "application/json", ...(secret ? { "X-MC-Secret": secret } : {}) };
                const baseAgent = requestedAgent || "sancho";
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ slug, threadId, role: "status", text: "🔄 Sancho está pensando...", agent: baseAgent }),
                }).catch(() => {});
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    slug, threadId, role: "progress", agent: baseAgent,
                    event: { kind: "thinking", label: "Pensando…" },
                  }),
                }).catch(() => {});
              },
            },
            getReplyOptions: {
              onToolStart: async (payload) => {
                if (!payload?.name) return;
                const headers = { "Content-Type": "application/json", ...(secret ? { "X-MC-Secret": secret } : {}) };
                const baseAgent = requestedAgent || "sancho";
                const toolName = payload.name;
                const input = payload.input || {};
                // Slugs del equipo SanchoCMO — sólo emitimos el mensaje formal role=handoff
                // cuando la delegación va a uno de estos agentes (no para Explore/Plan/general-purpose).
                const TEAM_SLUGS = new Set([
                  "sancho", "cervantes", "hamete", "dulcinea",
                  "rocinante", "maese-pedro", "mambrino", "merlin",
                  "sanson", "alarife",
                ]);

                // Map tool name → label (legacy status text) + structured event
                const label = toolName === "Read" ? "📄 Leyendo"
                  : toolName === "Write" ? "✍️ Escribiendo"
                  : toolName === "Edit" ? "✏️ Editando"
                  : toolName === "Bash" ? "⚡ Ejecutando"
                  : toolName === "Grep" || toolName === "Glob" ? "🔍 Buscando"
                  : toolName === "WebFetch" || toolName === "WebSearch" ? "🌐 Buscando en web"
                  : toolName === "Agent" ? "🤖 Delegando a subagente"
                  : "🔧 " + toolName;

                let kind = "tool_call";
                if (toolName === "Read") kind = "read";
                else if (toolName === "Write" || toolName === "Edit") kind = "file_write";
                else if (toolName === "Grep" || toolName === "Glob") kind = "search";
                else if (toolName === "WebFetch" || toolName === "WebSearch") kind = "search";
                else if (toolName === "Agent") kind = "agent_handoff";

                const target = input.file_path
                  || input.path
                  || input.url
                  || input.pattern
                  || input.query
                  || input.subagent_type
                  || (typeof input.command === "string" ? input.command.slice(0, 80) : undefined)
                  || undefined;

                // Legacy status (ephemeral)
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ slug, threadId, role: "status", text: label + "...", agent: baseAgent }),
                }).catch(() => {});

                // Structured progress event (accumulated + sealed)
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    slug, threadId, role: "progress", agent: baseAgent,
                    event: { kind, label, target },
                  }),
                }).catch(() => {});

                // Formal handoff message: solo cuando se delega a un agente del equipo SanchoCMO
                // (no para subagentes genéricos de Claude SDK como Explore/Plan/general-purpose).
                if (toolName === "Agent" && typeof input.subagent_type === "string" && TEAM_SLUGS.has(input.subagent_type)) {
                  const reason = typeof input.description === "string" && input.description.length
                    ? input.description
                    : (typeof input.prompt === "string" ? input.prompt.slice(0, 200) : "");
                  fetch(callbackUrl, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                      slug, threadId, role: "handoff", agent: baseAgent,
                      text: reason,
                      from_agent: baseAgent,
                      to_agent: input.subagent_type,
                    }),
                  }).catch(() => {});
                }
              },
              onCompactionStart: async () => {
                const headers = { "Content-Type": "application/json", ...(secret ? { "X-MC-Secret": secret } : {}) };
                const baseAgent = requestedAgent || "sancho";
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ slug, threadId, role: "status", text: "📦 Compactando contexto...", agent: baseAgent }),
                }).catch(() => {});
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    slug, threadId, role: "progress", agent: baseAgent,
                    event: { kind: "tool_call", label: "📦 Compactando contexto" },
                  }),
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
    // NOTE: registerOutboundHook may not exist in all SDK versions — guard it
    if (typeof api.registerOutboundHook !== "function") {
      logger.warn("[mc-chat] api.registerOutboundHook not available in this SDK version — Discord↔MC relay disabled");
    } else {
    api.registerOutboundHook({
      provider: "discord",
      handler: async (msgCtx) => {
        // Only process messages from threads
        if (!msgCtx.ThreadId) return;
        const discordThreadId = msgCtx.ThreadId;
        // Check if this Discord thread is linked to an MC thread.
        // Routes migrated to Next.js (/api/chat/*) — single writer for chats.
        const mcUrl = channelCfg?.mcServerUrl || "http://localhost:3000";
        let mcThreadId = null;
        try {
          const searchRes = await fetch(`${mcUrl}/api/chat/find-by-discord/${encodeURIComponent(discordThreadId)}`);
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (searchData.ok && searchData.threadId) {
              mcThreadId = searchData.threadId;
            }
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
          await fetch(`${mcUrl}/api/chat/send`, {
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
    } // end registerOutboundHook guard

    logger.info("[mc-chat] Channel plugin registered — webhook at /mc-chat/inbound");
  },
});

export { mcChatPlugin };
