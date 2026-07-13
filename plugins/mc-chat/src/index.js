/**
 * MC Chat Channel Plugin — Entry point
 *
 * Registers the mc-chat channel + HTTP webhook endpoint for inbound messages
 * from Mission Control server.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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
import { isModelFallbackNotice } from "./delivery-filter.js";
import { fetchContextPack, buildClientContextBlock, buildFoundationDirective } from "./context-pack.js";
import { parseDelegateMarkers } from "./delegate-marker.js";
import { parseTaskRouteMarkers } from "./task-route-marker.js";
import { parseSanchoInterventionMarkers } from "./sancho-intervention-marker.js";
import { resolveChatUserId } from "./sender-identity.js";
import {
  buildMcChatContextBlock,
  groundingSkillForTurn,
} from "../../../src/lib/runtime/agent-contract/mc-chat-context.mjs";
import { sanitizeAgentThinkingHistory } from "./thinking-sanitizer.js";
import { buildAgentSessionKey, resolveAgentModel } from "./session-key.js";
import { resolveTurnModelOverride } from "./model-routing.js";
import { hasRecentVisibleDelivery, markVisibleDelivery } from "./delivery-state.js";
import { applyBrandEnvToProcess, applyRuntimeEnvToProcess } from "./brand-env.js";
import { mcChatCostGuard } from "./cost-guard.js";
import { buildAttachmentContextBlock } from "./attachments.js";
import {
  enqueueSessionDispatch,
  hasActiveSessionDispatch,
  isStopCommand,
  semanticSessionFamilyKey,
} from "./session-dispatch-state.js";
import { registerRuntimeRun } from "./runtime-run-state.js";

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
    const registerCostHook = (name, handler, opts = {}) => {
      if (typeof api.on === "function") {
        api.on(name, handler, opts);
      } else if (typeof api.registerHook === "function") {
        api.registerHook(name, handler, opts);
      } else {
        logger.warn(`[mc-chat] cost guard hook API unavailable; ${name} not registered`);
        return false;
      }
      return true;
    };

    registerCostHook(
      "before_agent_run",
      (event, ctx) => mcChatCostGuard.beforeAgentRun(event, ctx),
      { priority: 100, timeoutMs: 1000 },
    );
    registerCostHook(
      "model_call_started",
      (event, ctx) => mcChatCostGuard.modelCallStarted(event, ctx),
      { priority: 100, timeoutMs: 1000 },
    );
    registerCostHook(
      "llm_output",
      (event, ctx) => mcChatCostGuard.llmOutput(event, ctx),
      { priority: 100, timeoutMs: 1000 },
    );
    const beforeToolCallHookRegistered = registerCostHook(
      "before_tool_call",
      (event, ctx) => mcChatCostGuard.beforeToolCall(event, ctx),
      { priority: 100, timeoutMs: 1000 },
    );
    registerCostHook(
      "agent_end",
      (event, ctx) => mcChatCostGuard.agentEnd(event, ctx),
      { priority: 100, timeoutMs: 1000 },
    );

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
        if (!expectedSecret) {
          logger.error("[mc-chat] Refusing inbound traffic: sharedSecret is not configured");
          res.statusCode = 503;
          res.end(JSON.stringify({ error: "MC_CHAT_SECRET not configured" }));
          return true;
        }
        const providedSecret = req.headers["x-mc-secret"];
        if (providedSecret !== expectedSecret) {
          logger.warn("[mc-chat] Invalid shared secret from MC server");
          res.statusCode = 403;
          res.end(JSON.stringify({ error: "Forbidden" }));
          return true;
        }

        const {
          slug,
          threadId,
          missionControlRunId,
          threadName,
          text,
          userId,
          userName,
          linkedTo,
          docPath,
          docKind,
          skill,
          primarySkill,
          skills,
          scope,
          skillMode,
          agent,
          agentId,
          attachments,
          isAdmin,
          senderRole,
          readOnly,
          temporaryAgent,
          controlDepth,
          taskRouteProposal,
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
        const isTemporarySancho = temporaryAgent === true && requestedAgent === "sancho";
        const isReadOnly = readOnly === true;
        const isControlFollowup = controlDepth === 1 || isReadOnly;
        const turnModelOverride = resolveTurnModelOverride({
          readOnly: isReadOnly,
          source: _source,
          slug,
          userId,
        });

        logger.info(`[mc-chat] Inbound from ${userName || userId || "unknown"} → ${slug}/${threadId} agent=${requestedAgent}: ${text.slice(0, 80)}`);

        // threadId may already include slug prefix (e.g. "growth4u:self-intelligence")
        const chatId = threadId.startsWith(slug + ':')
          ? `channel:mc-chat:${threadId}`
          : `channel:mc-chat:${slug}:${threadId}`;

        if (isStopCommand(text)) {
          const stopSessionKey = buildAgentSessionKey(requestedAgent, chatId, cfg, turnModelOverride);
          const cancelled = mcChatCostGuard.cancelRun(
            stopSessionKey,
            "La ejecución fue detenida por el usuario.",
          );
          logger.info(`[mc-chat] stop command processed thread=${threadId} agent=${requestedAgent} cancelled=${cancelled}`);
          res.statusCode = 200;
          res.end(JSON.stringify({
            ok: true,
            cancelled,
            message: cancelled ? "Active turn cancelled" : "No active turn found",
          }));
          return true;
        }

        const mcChatContextBlock = buildMcChatContextBlock({
          slug,
          threadId,
          threadName,
          linkedTo,
          docPath,
          docKind,
          scope,
          skillMode,
          skills,
          skill,
          primarySkill,
          requestedAgent,
          canDelegate: !isTemporarySancho && !isControlFollowup,
          temporaryAgent: isTemporarySancho,
          controlDepth: isControlFollowup ? 1 : 0,
          taskRouteProposal,
          readOnly: isReadOnly,
        });

        // ─── Bounded grounding (SAN-246/SAN-382 follow-up) ───
        // Fetch a compact context manifest from Next and prepend it to the user
        // text. The manifest is summary + file paths only; it tells agents to
        // read selectively instead of shoving full Foundation docs into the
        // prompt. FAIL-SOFT: any failure logs a warning and continues WITHOUT
        // blocking the dispatch — never crash the gateway over grounding.
        let groundedText = text;
        if (requestedAgent) {
          try {
            const groundingSkill = groundingSkillForTurn({ scope, skillMode, skill });
            const pack = await fetchContextPack(slug, groundingSkill, {
              contextPackUrl: channelCfg?.contextPackUrl,
              nextServerUrl: channelCfg?.nextServerUrl,
              secret: channelCfg?.sharedSecret,
              logger,
            });
            if (pack) {
              const prefix = pack.verdict === "missing"
                ? buildFoundationDirective(pack)
                : buildClientContextBlock(pack);
              if (prefix) {
                groundedText = `${prefix}\n\n${text}`;
                logger.info(`[mc-chat] context-pack injected (agent=${requestedAgent} slug=${slug} skillMode=${skillMode || scope || "legacy"} verdict=${pack.verdict} docs=${Array.isArray(pack.docPaths) ? pack.docPaths.length : 0})`);
              }
            }
          } catch (e) {
            logger.warn(`[mc-chat] context-pack injection skipped: ${e?.message || e}`);
          }
        }

        const attachmentContextBlock = buildAttachmentContextBlock(attachments);
        if (attachmentContextBlock) {
          groundedText = `${groundedText}\n\n${attachmentContextBlock}`;
          logger.info(`[mc-chat] user attachments injected (agent=${requestedAgent} slug=${slug} count=${Array.isArray(attachments) ? attachments.length : 0})`);
        }

        const bodyForAgent = mcChatContextBlock + '\n\n' + groundedText;

        // Resolve sender identity based on admin/client role
        // This maps to toolsBySender keys in openclaw.json:
        //   "id:mc-admin" → alsoAllow: [gateway, exec, cron]
        //   clients get default deny
        const resolvedSenderId = resolveChatUserId({
          trustedRuntimeRequest: true,
          isAdmin: isAdmin === true,
          slug,
          claimedUserId: userId,
        });
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
        const resolvedModel = turnModelOverride || resolveAgentModel(cfg, requestedAgent);
        const sessionKey = buildAgentSessionKey(requestedAgent, chatId, cfg, turnModelOverride);
        const dispatchFamilyKey = semanticSessionFamilyKey(sessionKey);
        logger.info(`[mc-chat] resolved agent=${requestedAgent} model=${resolvedModel || "default"} session=${sessionKey} dispatchFamily=${dispatchFamilyKey}`);
        const guardRunId = `mc-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        const abortController = new AbortController();
        const guardLimits = mcChatCostGuard.limits();
        mcChatCostGuard.registerActiveTurn({
          runId: guardRunId,
          sessionKey,
          abortController,
          startedAt: Date.now(),
        });

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

        const queuedBehindActive = hasActiveSessionDispatch(sessionKey, { familyKey: dispatchFamilyKey });
        if (queuedBehindActive) {
          logger.warn(`[mc-chat] inbound queued behind active dispatch session=${sessionKey} family=${dispatchFamilyKey} thread=${threadId}`);
          const mcUrl = channelCfg?.mcServerUrl || "http://localhost:3000";
          const secret = channelCfg?.sharedSecret;
          fetch(`${mcUrl}/api/chat/webhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(secret ? { "X-MC-Secret": secret } : {}) },
            body: JSON.stringify({
              slug,
              threadId,
              ...(missionControlRunId ? { missionControlRunId } : {}),
              role: "status",
              text: "⏳ Hay un turno en curso; puse tu mensaje en cola.",
              agent: requestedAgent || "sancho",
            }),
          }).catch(() => {});
        }

        await enqueueSessionDispatch(sessionKey, async ({ queued, waitedMs, dispatchKey }) => {
        const releaseRuntimeRun = registerRuntimeRun({
          slug,
          threadId,
          agent: requestedAgent,
          missionControlRunId,
        });
        if (queued) {
          logger.warn(`[mc-chat] starting queued dispatch session=${sessionKey} family=${dispatchKey} thread=${threadId} waitedMs=${waitedMs}`);
        }

        // Dispatch to agent asynchronously
        let runtimeErrorPosted = false;
        let visibleReplyPosted = false;
        let turnControlAction = null;
        let temporaryInterventionDispatched = false;
        const turnSeenRouteRequests = new Set();
        const turnStartedAt = Date.now();
        const turnTimer = guardLimits.enabled
          ? setTimeout(() => {
              mcChatCostGuard.abortRun(
                guardRunId,
                sessionKey,
                "La ejecución superó el tiempo máximo permitido.",
              );
            }, guardLimits.maxWallClockMs)
          : null;
        try {
          if (turnModelOverride) {
            logger.info(`[mc-chat] skipping global thinking-history scan for isolated read-only docs session=${sessionKey}`);
          } else {
            try {
              const result = sanitizeAgentThinkingHistory(requestedAgent, { home: process.env.OPENCLAW_HOME });
              if (result.removedBlocks > 0) {
                logger.warn(`[mc-chat] sanitized ${result.removedBlocks} thinking block(s) from ${result.filesChanged} ${requestedAgent} session file(s) before dispatch`);
              }
            } catch (e) {
              logger.warn(`[mc-chat] thinking-history sanitizer skipped: ${e?.message || e}`);
            }
          }

          // Default to Next.js (port 3000) — it owns chat thread writes since
          // the strangler-fig migration. mc-server.js's /webhook/mc-chat/response
          // is dead code but still proxied through Next's fallback rewrite.
          const mcUrl = channelCfg?.mcServerUrl || "http://localhost:3000";
          const callbackUrl = `${mcUrl}/api/chat/webhook`;
          const threadLinkUrlBase = `${mcUrl}/api/chat/thread`;
          const sendUrl = `${mcUrl}/api/chat/send`;
          const taskRouteUrl = `${mcUrl}/api/tasks/resolve-route`;
          const secret = channelCfg?.sharedSecret;
          const callbackIdentity = missionControlRunId ? { missionControlRunId } : {};
          const controlRunId = missionControlRunId || guardRunId;
          const controlIdempotencyKey = (kind, value) => {
            const digest = createHash("sha256")
              .update(JSON.stringify(value))
              .digest("hex")
              .slice(0, 24);
            return `mc-control:${controlRunId}:${kind}:${digest}`;
          };
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
              ...callbackIdentity,
              text: rewritten || "⚠️ El agente terminó sin devolver una respuesta visible. Reintentá en un hilo nuevo.",
              role: "bot",
              agent: respondingAgent,
              ts: new Date().toISOString(),
              ...(errorDetail ? { errorDetail } : {}),
            }, "Bot runtime-error callback");
          };

          const restoreBrandEnv = applyBrandEnvToProcess(slug);
          const restoreChatEnv = applyRuntimeEnvToProcess({
            SANCHO_CHAT_SLUG: slug,
            SANCHO_CHAT_THREAD_ID: threadId,
            SANCHO_CHAT_AGENT: requestedAgent || "sancho",
            SANCHO_CHAT_REQUEST: text,
          });
          let dispatchResult;
          try {
            dispatchResult = await dispatchInboundMessageWithBufferedDispatcher({
              ctx: msgCtx,
              cfg,
            // OpenClaw's default sourceReplyDeliveryMode for chatType="channel"
            // is "message_tool_only", which suppresses auto-delivery and expects
            // the agent to call the message tool. The mc-chat system prompt
            // explicitly instructs the agent NOT to use that tool — its reply
            // is delivered via the `deliver` callback below. Force "automatic"
            // so deliver actually fires.
            replyOptions: {
              sourceReplyDeliveryMode: "automatic",
              runId: guardRunId,
              abortSignal: abortController.signal,
              ...(turnModelOverride ? { modelOverride: turnModelOverride } : {}),
              timeoutOverrideSeconds: guardLimits.enabled
                ? Math.ceil(guardLimits.maxWallClockMs / 1000)
                : undefined,
            },
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
                const visibleDeliveries = isReadOnly
                  ? delivered.filter((item) => !isModelFallbackNotice(item))
                  : delivered;
                if (visibleDeliveries.length < delivered.length) {
                  logger.info(`[mc-chat] suppressed ${delivered.length - visibleDeliveries.length} model fallback notice(s) for read-only thread=${threadId}`);
                }
                texts.push(...visibleDeliveries);
                if (texts.length === 0) return;

                // Detect which agent is responding
                const respondingAgent = replyPayload?.agentId || replyPayload?.agent || requestedAgent || "sancho";

                // ─── Real turn-cession (SAN-220, UI side) ───
                // Strip any :::delegate blocks Sancho emitted and collect the
                // delegations; each is dispatched to the specialist's own thread
                // AFTER this reply posts. Only the orchestrator (sancho) may cede.
                // FAIL-SOFT: a parse bug must never break the normal reply.
                let delegations = [];
                let taskRoutes = [];
                let sanchoInterventions = [];
                let malformedControlBlocks = 0;
                let blockedControlBlocks = 0;
                try {
                  const cleaned = [];
                  for (const rawText of texts) {
                    let visibleText = rawText;
                    const parsedDelegate = parseDelegateMarkers(visibleText);
                    if (parsedDelegate.delegations.length) {
                      if (respondingAgent !== "sancho" || isTemporarySancho || isControlFollowup) {
                        blockedControlBlocks += parsedDelegate.delegations.length;
                        logger.warn(`[mc-chat] ignored unauthorized delegation agent=${respondingAgent} temporary=${isTemporarySancho} thread=${threadId}`);
                      } else {
                        delegations.push(...parsedDelegate.delegations);
                      }
                    }
                    if (parsedDelegate.malformed.length) {
                      malformedControlBlocks += parsedDelegate.malformed.length;
                      logger.warn(`[mc-chat] ${parsedDelegate.malformed.length} malformed :::delegate block(s) thread=${threadId}`);
                    }
                    visibleText = parsedDelegate.text;

                    const parsedRoute = parseTaskRouteMarkers(visibleText);
                    if (parsedRoute.routes.length) {
                      if (isTemporarySancho || isControlFollowup) {
                        blockedControlBlocks += parsedRoute.routes.length;
                        logger.warn(`[mc-chat] ignored task route from temporary Sancho thread=${threadId}`);
                      } else {
                        taskRoutes.push(...parsedRoute.routes);
                      }
                    }
                    if (parsedRoute.malformed.length) {
                      malformedControlBlocks += parsedRoute.malformed.length;
                      logger.warn(`[mc-chat] ${parsedRoute.malformed.length} malformed :::task-route block(s) thread=${threadId}`);
                    }
                    visibleText = parsedRoute.text;

                    const parsedIntervention = parseSanchoInterventionMarkers(visibleText);
                    if (parsedIntervention.interventions.length) {
                      if (respondingAgent === "sancho" || isTemporarySancho || isControlFollowup) {
                        blockedControlBlocks += parsedIntervention.interventions.length;
                        logger.warn(`[mc-chat] ignored self-requested Sancho intervention thread=${threadId}`);
                      } else {
                        sanchoInterventions.push(...parsedIntervention.interventions);
                      }
                    }
                    if (parsedIntervention.malformed.length) {
                      malformedControlBlocks += parsedIntervention.malformed.length;
                      logger.warn(`[mc-chat] ${parsedIntervention.malformed.length} malformed :::sancho-intervene block(s) thread=${threadId}`);
                    }
                    if (parsedIntervention.text) cleaned.push(parsedIntervention.text);
                  }
                  // The four-way policy is exclusive. When a model emits both
                  // a temporary intervention and a task/agent change, choose
                  // the reversible same-task intervention and refuse the more
                  // expansive route for this turn.
                  if (sanchoInterventions.length && (delegations.length || taskRoutes.length)) {
                    logger.warn(`[mc-chat] conflicting intervention + task route; keeping temporary Sancho only thread=${threadId}`);
                    blockedControlBlocks += delegations.length + taskRoutes.length;
                    delegations = [];
                    taskRoutes = [];
                  }
                  if (sanchoInterventions.length > 1) {
                    logger.warn(`[mc-chat] multiple Sancho interventions requested; keeping the first only thread=${threadId}`);
                    blockedControlBlocks += sanchoInterventions.length - 1;
                    sanchoInterventions = sanchoInterventions.slice(0, 1);
                  }
                  if (temporaryInterventionDispatched && sanchoInterventions.length) {
                    logger.warn(`[mc-chat] ignored repeated Sancho intervention in later delivery thread=${threadId}`);
                    blockedControlBlocks += sanchoInterventions.length;
                    sanchoInterventions = [];
                  }
                  const hasRouteAction = delegations.length > 0 || taskRoutes.length > 0;
                  if (sanchoInterventions.length) {
                    if (turnControlAction === "route") {
                      logger.warn(`[mc-chat] ignored late Sancho intervention after route action thread=${threadId}`);
                      blockedControlBlocks += sanchoInterventions.length;
                      sanchoInterventions = [];
                    } else {
                      turnControlAction = "intervention";
                      delegations = [];
                      taskRoutes = [];
                    }
                  } else if (hasRouteAction) {
                    if (turnControlAction === "intervention") {
                      logger.warn(`[mc-chat] ignored late route after Sancho intervention thread=${threadId}`);
                      blockedControlBlocks += delegations.length + taskRoutes.length;
                      delegations = [];
                      taskRoutes = [];
                    } else {
                      turnControlAction = "route";
                    }
                  }
                  texts.length = 0;
                  texts.push(...cleaned);
                  if (sanchoInterventions.length && texts.length === 0) {
                    texts.push("🛡️ Pido una intervención puntual de Sancho en esta misma tarea.");
                  } else if ((delegations.length || taskRoutes.length) && texts.length === 0) {
                    texts.push("🧭 Voy a ubicar la tarea correcta dentro de este grupo.");
                  }
                  if (blockedControlBlocks > 0) {
                    texts.push("⚠️ Bloqueé una instrucción de control no autorizada o incompatible. El harness original sigue intacto.");
                  }
                  if (malformedControlBlocks > 0) {
                    texts.push("⚠️ El agente devolvió una instrucción de routing inválida. No cambié la tarea ni el agente por esa instrucción.");
                  }
                } catch (e) {
                  logger.warn(`[mc-chat] task route marker parse skipped: ${e?.message || e}`);
                  delegations = [];
                  taskRoutes = [];
                  sanchoInterventions = [];
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

                // A runtime run has one terminal result. Join multipart output
                // before persistence so later parts cannot look like separate
                // assistant turns. The result is run through the error rewriter:
                // if it matches a
                // known error pattern (rate_limit / auth / watchdog_abort / …)
                // the user-facing text is replaced with a clear Spanish summary
                // and the raw payload is surfaced as `errorDetail` for the UI
                // modal. Untouched otherwise.
                const authInfo = {
                  ...(readCodexAuthInfo(respondingAgent) || {}),
                  anthropicAuthMode: process.env.ANTHROPIC_AUTH_MODE,
                };
                const msgText = texts.map((part) => String(part || "").trim()).filter(Boolean).join("\n\n");
                if (msgText) {
                  const { text: rewritten, errorDetail: classified } = classifyAndRewriteError(msgText, authInfo);
                  let errorDetail = classified;
                  if (errorDetail?.category === "watchdog_abort") {
                    const prior = errorTracker.getRecent(respondingAgent);
                    if (prior) errorDetail = mergeWithPriorCategory(errorDetail, prior);
                  }
                  const posted = await postWithRetry(callbackUrl, {
                    slug,
                    threadId,
                    ...callbackIdentity,
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

                // Same task, same thread, one-turn Sancho override. send.ts
                // deliberately does not persist this route, so the next user
                // turn returns to the original owning agent and skill harness.
                for (const intervention of sanchoInterventions) {
                  // Exactly one intervention may be launched by an owning turn,
                  // including when the runtime delivers multiple response parts.
                  if (temporaryInterventionDispatched) break;
                  temporaryInterventionDispatched = true;
                  const dispatched = await postWithRetry(sendUrl, {
                    slug,
                    threadId,
                    threadName,
                    text: intervention.brief,
                    agent: "sancho",
                    scope: "agent",
                    skillMode: "auto",
                    temporaryAgent: true,
                    controlDepth: 1,
                    idempotencyKey: controlIdempotencyKey("temporary-sancho", intervention),
                    userId,
                    userName,
                    isAdmin: isAdmin === true,
                    senderRole: senderRole === "admin" ? "admin" : "client",
                    linkedTo,
                    docPath,
                    docKind,
                    attachments,
                    _source,
                  }, "Temporary Sancho intervention");
                  if (dispatched) {
                    logger.info(`[mc-chat] temporary Sancho intervention dispatched in-place owner=${respondingAgent} thread=${threadId}`);
                  } else {
                    await postWithRetry(callbackUrl, {
                      slug,
                      threadId,
                      ...callbackIdentity,
                      role: "bot",
                      agent: respondingAgent,
                      text: "⚠️ No pude iniciar la intervención temporal de Sancho. La tarea y su agente original no cambiaron.",
                      ts: new Date().toISOString(),
                    }, "Temporary Sancho intervention fail-loud");
                  }
                }

                // Every cession/task switch resolves through the same-group task
                // router first. It may reuse one canonical task, ask the user to
                // choose, or suggest a confirmed creation. It never fabricates a
                // free-floating specialist thread.
                const routeRequests = [
                  ...delegations.map((item) => ({ ...item, routeSource: "delegate" })),
                  ...taskRoutes.map((item) => ({
                    ...item,
                    agent: item.agent || respondingAgent || "sancho",
                    routeSource: "task-route",
                  })),
                ];
                for (const routeRequest of routeRequests) {
                  const routeAgent = routeRequest.agent || respondingAgent || "sancho";
                  const routeName = routeRequest.name || `${routeAgent}: ${routeRequest.brief.slice(0, 64)}`;
                  const dedupeKey = JSON.stringify([
                    routeAgent,
                    routeName,
                    routeRequest.brief,
                    routeRequest.taskId || "",
                    routeRequest.proposalId || "",
                  ]);
                  if (turnSeenRouteRequests.has(dedupeKey)) continue;
                  turnSeenRouteRequests.add(dedupeKey);

                  const routeResponse = await postWithRetry(taskRouteUrl, {
                    slug,
                    sourceThreadId: threadId,
                    groupId: routeRequest.groupId,
                    targetTaskId: routeRequest.taskId,
                    proposalId: routeRequest.proposalId,
                    agent: routeAgent,
                    skill: routeRequest.skill,
                    name: routeName,
                    brief: routeRequest.brief,
                    confirmCreate: routeRequest.confirmCreate === true,
                    confirmationText: routeRequest.confirmCreate === true ? text : undefined,
                  }, `Task route→${routeAgent}`);
                  let routeData = null;
                  if (routeResponse) {
                    try {
                      routeData = await routeResponse.json();
                    } catch (e) {
                      logger.error(`[mc-chat] invalid task route response for ${routeAgent}: ${e?.message || e}`);
                    }
                  }

                  const targetThreadId = typeof routeData?.threadId === "string"
                    ? routeData.threadId
                    : null;
                  if ((routeData?.action === "reuse" || routeData?.action === "created") && targetThreadId) {
                    const dispatched = await postWithRetry(sendUrl, {
                      slug,
                      threadId: targetThreadId,
                      threadName: routeData.threadName || routeName,
                      text: routeRequest.brief,
                      agent: routeAgent,
                      skill: routeRequest.skill,
                      controlDepth: 1,
                      idempotencyKey: controlIdempotencyKey("task-dispatch", {
                        routeAgent,
                        targetThreadId,
                        brief: routeRequest.brief,
                        proposalId: routeRequest.proposalId,
                      }),
                      userId,
                      userName,
                      isAdmin: isAdmin === true,
                      senderRole: senderRole === "admin" ? "admin" : "client",
                      attachments,
                      _source,
                    }, `Task dispatch→${routeAgent}`);
                    if (dispatched) {
                      logger.info(`[mc-chat] task routed → ${routeAgent} task=${routeData.taskId || "unknown"} thread=${targetThreadId} action=${routeData.action}`);
                      continue;
                    }
                  }

                  const routeMessage = typeof routeData?.message === "string" && routeData.message.trim()
                    ? routeData.message
                    : `⚠️ No pude resolver una tarea segura para **${routeAgent}** dentro de este grupo. No se despachó nada.`;
                  await postWithRetry(callbackUrl, {
                    slug,
                    threadId,
                    ...callbackIdentity,
                    role: "bot",
                    agent: respondingAgent,
                    text: routeMessage,
                    ts: new Date().toISOString(),
                  }, "Task route feedback");
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
                  body: JSON.stringify({ slug, threadId, ...callbackIdentity, role: "status", text: "🔄 Sancho está pensando...", agent: baseAgent }),
                }).catch(() => {});
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    slug, threadId, ...callbackIdentity, role: "progress", agent: baseAgent,
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

                if (!beforeToolCallHookRegistered) {
                  const blocked = mcChatCostGuard.beforeToolCall(
                    { name: toolName, input },
                    { runId: guardRunId, sessionKey },
                  );
                  if (blocked?.block) {
                    logger.warn(`[mc-chat] cost guard requested abort on tool start: ${blocked.blockReason}`);
                  }
                }

                // Legacy status (ephemeral)
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ slug, threadId, ...callbackIdentity, role: "status", text: label + "...", agent: baseAgent }),
                }).catch(() => {});

                // Structured progress event (accumulated + sealed)
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    slug, threadId, ...callbackIdentity, role: "progress", agent: baseAgent,
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
                      slug, threadId, ...callbackIdentity, role: "handoff", agent: baseAgent,
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
                  body: JSON.stringify({ slug, threadId, ...callbackIdentity, role: "status", text: "📦 Compactando contexto...", agent: baseAgent }),
                }).catch(() => {});
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    slug, threadId, ...callbackIdentity, role: "progress", agent: baseAgent,
                    event: { kind: "tool_call", label: "📦 Compactando contexto" },
                  }),
                }).catch(() => {});
              },
            },
            });
          } finally {
            restoreChatEnv();
            restoreBrandEnv();
          }
          const deliveredFinal = dispatchResult?.queuedFinal === true || (dispatchResult?.counts?.final || 0) > 0;
          const deliveredBlock = (dispatchResult?.counts?.block || 0) > 0;
          const deliveredViaChannel = hasRecentVisibleDelivery(slug, threadId, turnStartedAt);
          if (!deliveredFinal && !deliveredBlock && !visibleReplyPosted && !deliveredViaChannel && !runtimeErrorPosted) {
            logger.warn(`[mc-chat] dispatch completed without visible reply thread=${threadId} result=${JSON.stringify(dispatchResult || {})}`);
            const guardMessage = mcChatCostGuard.abortMessageFor(guardRunId, sessionKey);
            await postRuntimeError(
              guardMessage || "El runtime terminó sin devolver respuesta visible. Esto suele pasar cuando el proveedor/modelo falla antes de generar texto o cuando la sesión quedó obsoleta tras un cambio de modelo.",
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
            const raw =
              mcChatCostGuard.abortMessageFor(guardRunId, sessionKey) ||
              err?.message ||
              String(err);
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
                ...(missionControlRunId ? { missionControlRunId } : {}),
                role: "bot",
                agent: requestedAgent || "sancho",
                text: rewritten || "⚠️ El agente terminó sin devolver una respuesta visible. Reintentá en un hilo nuevo.",
                ts: new Date().toISOString(),
                ...(errorDetail ? { errorDetail } : {}),
              }),
            }).catch(() => {});
          } catch {}
        } finally {
          if (turnTimer) clearTimeout(turnTimer);
          mcChatCostGuard.clearActiveTurn(guardRunId, sessionKey);
          releaseRuntimeRun();
        }
        }, { familyKey: dispatchFamilyKey }).promise;

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
