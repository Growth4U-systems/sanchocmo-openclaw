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
import { fetchContextPack, buildClientContextBlock, buildFoundationDirective } from "./context-pack.js";
import { parseDelegateMarkers, slugForThread } from "./delegate-marker.js";
import { sanitizeAgentThinkingHistory } from "./thinking-sanitizer.js";
import { buildAgentSessionKey, resolveAgentModel } from "./session-key.js";
import { hasRecentVisibleDelivery, markVisibleDelivery } from "./delivery-state.js";
import {
  enqueueSessionDispatch,
  hasActiveSessionDispatch,
  isStopCommand,
} from "./session-dispatch-state.js";

function normalizeOpenAiAuthMode(mode) {
  if (typeof mode !== "string") return null;
  const m = mode.toLowerCase();
  if (m === "subscription" || m === "chatgpt") return "chatgpt";
  if (m === "api_key" || m === "apikey") return "apikey";
  return null;
}

function emailFromProfile(profileId, profile) {
  if (typeof profile?.email === "string" && profile.email) return profile.email;
  if (typeof profile?.accountEmail === "string" && profile.accountEmail) return profile.accountEmail;
  const m = typeof profileId === "string"
    ? profileId.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
    : null;
  return m ? m[0] : null;
}

function readCodexAuthProfilesInfo(agentId) {
  const home = process.env.OPENCLAW_HOME;
  if (!home) return null;
  const candidates = [
    path.join(home, ".openclaw", "agents", agentId, "agent", "auth-profiles.json"),
    path.join(home, "agents", agentId, "agent", "auth-profiles.json"),
    path.join(home, ".openclaw", "shared", "auth-profiles.json"),
  ];
  for (const p of candidates) {
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      const profiles = data?.profiles && typeof data.profiles === "object" ? data.profiles : {};
      for (const [profileId, profile] of Object.entries(profiles)) {
        const provider = typeof profile?.provider === "string" ? profile.provider : "";
        if (provider !== "openai-codex" && !String(profileId).startsWith("openai-codex:")) continue;
        const type = typeof profile?.type === "string" ? profile.type
          : (typeof profile?.mode === "string" ? profile.mode : "");
        const authMode = /oauth|chatgpt/i.test(type) ? "chatgpt"
          : (/token|api.?key|apikey/i.test(type) ? "apikey" : null);
        return { authMode, authEmail: emailFromProfile(profileId, profile) };
      }
    } catch {
      // try next candidate path
    }
  }
  return null;
}

function readCodexHomeAuthInfo(agentId) {
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

// Best-effort lookup of an agent's current Codex auth mode + account email.
// Used to disambiguate real rate-limit errors. Prefer the configured deployment
// mode and OpenClaw's auth-profiles store over codex-home/auth.json: the latter
// can be a stale Codex CLI file left behind after switching to subscription
// mode, and should not decide user-facing billing copy.
function readCodexAuthInfo(agentId) {
  if (!agentId || typeof agentId !== "string") return null;
  const configuredMode = normalizeOpenAiAuthMode(process.env.OPENAI_AUTH_MODE);
  const profilesInfo = readCodexAuthProfilesInfo(agentId);
  const codexHomeInfo = readCodexHomeAuthInfo(agentId);
  if (configuredMode) {
    return {
      authMode: configuredMode,
      authEmail: profilesInfo?.authEmail || codexHomeInfo?.authEmail || undefined,
    };
  }
  if (profilesInfo?.authMode) return profilesInfo;
  return codexHomeInfo;
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
          skills,
          scope,
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

        if (isStopCommand(text)) {
          logger.info(`[mc-chat] stop command acknowledged without dispatch thread=${threadId} agent=${requestedAgent}`);
          res.statusCode = 200;
          res.end(JSON.stringify({
            ok: true,
            message: "Stop acknowledged",
          }));
          return true;
        }

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
        // SAN-327 — agent-scoped (broad) thread: tell the specialist its WHOLE
        // owned skill set is usable here and that the seed skill is just a
        // starting point. Narrow threads keep the single `skill:` line.
        if (scope === "agent" && Array.isArray(skills) && skills.length > 0) {
          const primary = skill || skills[0];
          contextLines.push(`skill: ${primary}  ← punto de partida sugerido, NO un límite`);
          contextLines.push(`Este es un hilo AMPLIO de tu dominio (${requestedAgent}). Puedes usar CUALQUIERA de tus skills en este MISMO hilo, sin abrir otro: ${skills.join(", ")}. Si el usuario pide algo que es tuyo (p.ej. una plantilla de outreach), cámbiate de skill y hazlo. NUNCA digas "no tengo esa skill" si está en tu set. Si de verdad es de otro agente (contenido, ads, datos), dilo y sugiere abrir su hilo.`);
        } else if (skill) {
          contextLines.push(`skill: ${skill}`);
        }
        if (requestedAgent && requestedAgent !== "sancho") contextLines.push(`requested_agent: ${requestedAgent}`);
        contextLines.push(`IMPORTANT: You are responding via MC Chat, NOT Discord. Do NOT use the message tool to reply. Just respond with text directly — your reply will be delivered to the user automatically via the MC Chat callback. Do NOT create Discord threads or send Discord messages for this conversation. Use the injected [Client Context] first. Read files from disk only when they are accessible in your workspace; if a file is missing, ask a short question instead of showing tool errors. For Sancho API endpoints explicitly required by the active skill, use the local MC API with the admin token; never browse localhost with web_fetch.`);
        contextLines.push(`⚠️ EXECUTION GUARDRAIL: Aprobar un plan o crear proyectos NO es autorización para ejecutar tareas. Siempre preguntar "¿Ejecuto [tarea específica]?" y esperar confirmación explícita antes de generar deliverables. "Apruebo el plan" y "Ejecuta" son pasos DIFERENTES.`);
        contextLines.push(`💬 INTERACTIVE QUESTIONS: Cuando necesites una decisión del usuario entre opciones FINITAS y CONOCIDAS (ej. elegir un nicho de una lista, un tono, un pilar, un ICP), emite un bloque ":::ask" en vez de preguntar en texto libre. Formato:`);
        contextLines.push(`:::ask`);
        contextLines.push(`{"id":"q_<short>","prompt":"<pregunta>","mode":"single"|"multi","options":[{"id":"<key>","label":"<texto>"}]}`);
        contextLines.push(`:::`);
        contextLines.push(`Modos: "single" para radios (1 opción), "multi" para checkboxes, "text" para CAMPOS ABIERTOS (nombre, handle, una URL…). Un bloque de texto se escribe SIN "options": {"id":"q_<short>","prompt":"<etiqueta>","mode":"text","placeholder":"<pista>","optional":true|false} → renderiza un input real, sin opciones ni "Otro" ("optional":true permite dejarlo vacío). SOLO para single/multi es OBLIGATORIO que la ÚLTIMA opción sea {"id":"other","label":"Otro (lo escribo)"} — es un requisito del componente para dar respuesta libre; en "text" NO va "Otro". En cualquier opción de single/multi puedes marcar "recommended":true: esa opción sale PRE-SELECCIONADA con un badge "recomendado" y el usuario puede cambiarla (útil para sugerir un valor por defecto, p.ej. una cadencia). NO uses ":::ask" para invitaciones a un monólogo largo ("cuéntame todo sobre tu negocio"); para datos concretos sí, aunque sean abiertos, usa "text". Puedes MEZCLAR bloques de choice y de text en un MISMO mensaje para construir UN solo formulario (p.ej. nombre[text] + red[single] + cadencia[single recommended] + handle[text]); el componente los pinta juntos con un único botón "Enviar" y espera a que el usuario responda TODOS antes de devolverte un único mensaje con las respuestas en líneas separadas: "[ask:q1] respuesta: …\\n[ask:q2] respuesta: …". NO ejecutes nada hasta recibir ese mensaje completo. En "text" verás el texto que escribió; si en single/multi eligió "Otro" verás su texto literal en lugar de la etiqueta.`);
        if (requestedAgent === "sancho") {
          contextLines.push(`🤝 DELEGAR (cesión real de turno): cuando la petición es el ENTREGABLE de un especialista (research, contenido, outreach, ads, datos, visual, QA, skills/docs), NO la ejecutes inline ni con Agent(subagent_type=…) — eso corre dentro de TU turno y vuelve a ti (narras en vez de ceder). Emite un bloque ":::delegate": el especialista arranca en SU PROPIO hilo, opera su sistema y habla en su voz. Formato:`);
          contextLines.push(`:::delegate`);
          contextLines.push(`{"agent":"hamete","name":"<título corto>","brief":"<briefing completo y autónomo: objetivo, contexto, qué entregable y dónde>"}`);
          contextLines.push(`:::`);
          contextLines.push(`Agentes válidos: cervantes (skills/docs), hamete (research/market intel), dulcinea (contenido), rocinante (outreach/prospecting), mambrino (ads), merlin (datos), sanson (QA/feedback), maese-pedro (visual). Puedes emitir VARIOS bloques. Acompaña el/los bloque(s) con UNA línea para el usuario ("Lo paso a Hamete; te aviso cuando vuelva."). Reserva Agent(subagent_type=…) SOLO para sub-consultas rápidas que vuelven a ti, nunca para un entregable.`);
        }
        contextLines.push(`[/MC Chat Context]`);

        // ─── Specialist grounding (SAN-246) ───
        // A thread dispatched DIRECTLY to a specialist (agent:dulcinea) gets no
        // client context — the agent starts blind (instance of SAN-218). Fetch
        // a bounded context pack from Next and prepend it to the user text, OR a
        // STOP directive when the client has no Foundation. Skip for sancho (the
        // orchestrator carries its own grounding). FAIL-SOFT: any failure logs a
        // warning and continues WITHOUT blocking the dispatch — never crash the
        // gateway over grounding.
        let groundedText = text;
        if (requestedAgent && requestedAgent !== "sancho") {
          try {
            const pack = await fetchContextPack(slug, skill || null, {
              contextPackUrl: channelCfg?.contextPackUrl,
              nextServerUrl: channelCfg?.nextServerUrl,
              secret: channelCfg?.sharedSecret,
              logger,
            });
            if (pack) {
              const prefix = pack.verdict === "missing" && pack.brandFound !== true
                ? buildFoundationDirective(pack)
                : buildClientContextBlock(pack);
              if (prefix) {
                groundedText = `${prefix}\n\n${text}`;
                logger.info(`[mc-chat] context-pack injected (agent=${requestedAgent} slug=${slug} verdict=${pack.verdict} docs=${Array.isArray(pack.docPaths) ? pack.docPaths.length : 0})`);
              }
            }
          } catch (e) {
            logger.warn(`[mc-chat] context-pack injection skipped: ${e?.message || e}`);
          }
        }

        const bodyForAgent = contextLines.join('\n') + '\n\n' + groundedText;

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
        //
        // Include the resolved model in the non-routing part of the key. OpenClaw
        // can keep per-session runtime state; if an admin changes Sancho from
        // OpenRouter to Fireworks, reusing `agent:sancho:<chat>` can keep the old
        // provider pinned for the next turn. Changing the model changes the key,
        // forcing a fresh runtime session while preserving agent routing.
        const resolvedModel = resolveAgentModel(cfg, requestedAgent);
        const sessionKey = buildAgentSessionKey(requestedAgent, chatId, cfg);
        logger.info(`[mc-chat] resolved agent=${requestedAgent} model=${resolvedModel || "default"} session=${sessionKey}`);

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

        const queuedBehindActive = hasActiveSessionDispatch(sessionKey);
        if (queuedBehindActive) {
          logger.warn(`[mc-chat] inbound queued behind active dispatch session=${sessionKey} thread=${threadId}`);
          const mcUrl = channelCfg?.mcServerUrl || "http://localhost:3000";
          const secret = channelCfg?.sharedSecret;
          fetch(`${mcUrl}/api/chat/webhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(secret ? { "X-MC-Secret": secret } : {}) },
            body: JSON.stringify({
              slug,
              threadId,
              role: "status",
              text: "⏳ Hay un turno en curso; puse tu mensaje en cola.",
              agent: requestedAgent || "sancho",
            }),
          }).catch(() => {});
        }

        await enqueueSessionDispatch(sessionKey, async ({ queued, waitedMs }) => {
        if (queued) {
          logger.warn(`[mc-chat] starting queued dispatch session=${sessionKey} thread=${threadId} waitedMs=${waitedMs}`);
        }

        // Dispatch to agent asynchronously
        let runtimeErrorPosted = false;
        let visibleReplyPosted = false;
        const turnStartedAt = Date.now();
        try {
          try {
            const result = sanitizeAgentThinkingHistory(requestedAgent, { home: process.env.OPENCLAW_HOME });
            if (result.removedBlocks > 0) {
              logger.warn(`[mc-chat] sanitized ${result.removedBlocks} thinking block(s) from ${result.filesChanged} ${requestedAgent} session file(s) before dispatch`);
            }
          } catch (e) {
            logger.warn(`[mc-chat] thinking-history sanitizer skipped: ${e?.message || e}`);
          }

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

          const postRuntimeError = async (rawError, respondingAgent = requestedAgent || "sancho") => {
            if (runtimeErrorPosted) return;
            runtimeErrorPosted = true;
            const raw = typeof rawError === "string" && rawError.trim()
              ? rawError
              : "El runtime terminó sin devolver respuesta visible.";
            const authInfo = {
              ...(readCodexAuthInfo(respondingAgent) || {}),
              anthropicAuthMode: process.env.ANTHROPIC_AUTH_MODE,
            };
            const { text: rewritten, errorDetail } = classifyAndRewriteError(raw, authInfo);
            await postWithRetry(callbackUrl, {
              slug,
              threadId,
              text: rewritten || "⚠️ El agente terminó sin devolver una respuesta visible. Reintentá en un hilo nuevo.",
              role: "bot",
              agent: respondingAgent,
              ts: new Date().toISOString(),
              ...(errorDetail ? { errorDetail } : {}),
            }, "Bot runtime-error callback");
          };

          const dispatchResult = await dispatchInboundMessageWithBufferedDispatcher({
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

                // ─── Real turn-cession (SAN-220, UI side) ───
                // Strip any :::delegate blocks Sancho emitted and collect the
                // delegations; each is dispatched to the specialist's own thread
                // AFTER this reply posts. Only the orchestrator (sancho) may cede.
                // FAIL-SOFT: a parse bug must never break the normal reply.
                let delegations = [];
                if (respondingAgent === "sancho") {
                  try {
                    const cleaned = [];
                    for (const t of texts) {
                      const parsed = parseDelegateMarkers(t);
                      if (parsed.delegations.length) delegations.push(...parsed.delegations);
                      if (parsed.malformed.length) {
                        logger.warn(`[mc-chat] ${parsed.malformed.length} malformed :::delegate block(s) thread=${threadId}`);
                      }
                      if (parsed.text) cleaned.push(parsed.text);
                    }
                    texts.length = 0;
                    texts.push(...cleaned);
                    if (delegations.length && texts.length === 0) {
                      texts.push(`🤝 Paso el trabajo a ${[...new Set(delegations.map((d) => d.agent))].join(", ")}.`);
                    }
                  } catch (e) {
                    logger.warn(`[mc-chat] :::delegate parse skipped: ${e?.message || e}`);
                    delegations = [];
                  }
                }

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
                const authInfo = {
                  ...(readCodexAuthInfo(respondingAgent) || {}),
                  anthropicAuthMode: process.env.ANTHROPIC_AUTH_MODE,
                };
                for (const msgText of texts) {
                  const { text: rewritten, errorDetail: classified } = classifyAndRewriteError(msgText, authInfo);
                  let errorDetail = classified;
                  if (errorDetail?.category === "watchdog_abort") {
                    const prior = errorTracker.getRecent(respondingAgent);
                    if (prior) errorDetail = mergeWithPriorCategory(errorDetail, prior);
                  }
                  const posted = await postWithRetry(callbackUrl, {
                    slug,
                    threadId,
                    text: rewritten,
                    role: "bot",
                    agent: respondingAgent,
                    ts: new Date().toISOString(),
                    ...(errorDetail ? { errorDetail } : {}),
                  }, "Bot callback");
                  if (posted) {
                    visibleReplyPosted = true;
                    markVisibleDelivery(slug, threadId);
                  }
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

                // Dispatch the collected delegations AFTER the reply is posted:
                // POST each brief to the specialist's own task thread →
                // /api/chat/send sets agentId → gateway routes to
                // workspace-<agent> (the by-thread cession rail). FAIL-LOUD if a
                // dispatch fails; never throw out of deliver.
                for (const d of delegations) {
                  const delegateThreadId = `${slug}:delegate-${d.agent}-${slugForThread(d.name || d.brief)}`;
                  const dispatched = await postWithRetry(sendUrl, {
                    slug,
                    threadId: delegateThreadId,
                    threadName: d.name || `${d.agent}: ${d.brief.slice(0, 48)}`,
                    text: d.brief,
                    agent: d.agent,
                    userName: "Sancho",
                    _source: "agent_delegate",
                  }, `Delegate→${d.agent}`);
                  if (dispatched) {
                    logger.info(`[mc-chat] delegated → ${d.agent} thread=${delegateThreadId}`);
                  } else {
                    await postWithRetry(callbackUrl, {
                      slug, threadId, role: "bot", agent: respondingAgent,
                      text: `⚠️ No pude arrancar a **${d.agent}** (fallo al despachar a su hilo). No se despachó nada — reinténtalo.`,
                      ts: new Date().toISOString(),
                    }, "Delegate fail-loud");
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
                  const authInfo = {
                    ...(readCodexAuthInfo(respondingAgent) || {}),
                    anthropicAuthMode: process.env.ANTHROPIC_AUTH_MODE,
                  };
                  const { errorDetail } = classifyAndRewriteError(err?.message || String(err), authInfo);
                  if (errorDetail) errorTracker.record(respondingAgent, errorDetail);
                } catch {}
                postRuntimeError(err?.message || String(err), requestedAgent || "sancho").catch((postErr) => {
                  logger.error(`[mc-chat] Runtime error callback failed: ${postErr?.message || postErr}`);
                });
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
          const deliveredFinal = dispatchResult?.queuedFinal === true || (dispatchResult?.counts?.final || 0) > 0;
          const deliveredBlock = (dispatchResult?.counts?.block || 0) > 0;
          const deliveredViaChannel = hasRecentVisibleDelivery(slug, threadId, turnStartedAt);
          if (!deliveredFinal && !deliveredBlock && !visibleReplyPosted && !deliveredViaChannel && !runtimeErrorPosted) {
            logger.warn(`[mc-chat] dispatch completed without visible reply thread=${threadId} result=${JSON.stringify(dispatchResult || {})}`);
            await postRuntimeError(
              "El agente terminó sin una respuesta final visible. El turno llegó al runtime, pero no devolvió texto de usuario; suele pasar cuando el modelo emitió solo llamadas a herramientas, una herramienta no entregó resultado, o la sesión quedó inconsistente tras cambiar de modelo. Reintenta en un hilo nuevo; si estabas lanzando discovery real, revisa que las herramientas de scraping estén configuradas.",
              requestedAgent || "sancho",
            );
          } else if (!deliveredFinal && !deliveredBlock && !runtimeErrorPosted) {
            logger.info(`[mc-chat] suppressing empty-dispatch fallback thread=${threadId} visibleReplyPosted=${visibleReplyPosted} deliveredViaChannel=${deliveredViaChannel} result=${JSON.stringify(dispatchResult || {})}`);
          }
        } catch (err) {
          logger.error(`[mc-chat] Dispatch error: ${err?.message}`);
          try {
            if (runtimeErrorPosted) return true;
            runtimeErrorPosted = true;
            const mcUrl = channelCfg?.mcServerUrl || "http://localhost:3000";
            const callbackUrl = `${mcUrl}/api/chat/webhook`;
            const secret = channelCfg?.sharedSecret;
            const headers = { "Content-Type": "application/json", ...(secret ? { "X-MC-Secret": secret } : {}) };
            const raw = err?.message || String(err);
            const authInfo = {
              ...(readCodexAuthInfo(requestedAgent || "sancho") || {}),
              anthropicAuthMode: process.env.ANTHROPIC_AUTH_MODE,
            };
            const { text: rewritten, errorDetail } = classifyAndRewriteError(raw, authInfo);
            await fetch(callbackUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({
                slug,
                threadId,
                role: "bot",
                agent: requestedAgent || "sancho",
                text: rewritten || "⚠️ El agente terminó sin devolver una respuesta visible. Reintentá en un hilo nuevo.",
                ts: new Date().toISOString(),
                ...(errorDetail ? { errorDetail } : {}),
              }),
            }).catch(() => {});
          } catch {}
        }
        }).promise;

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
