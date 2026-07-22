/**
 * MC Chat Channel Plugin — Entry point
 *
 * Registers the mc-chat channel + HTTP webhook endpoint for inbound messages
 * from Mission Control server.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
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
import { parseRuntimeEffectMarkers } from "../../../src/lib/runtime/agent-contract/runtime-effect-marker.mjs";
import { createRuntimeEffectTurnArbitrator } from "./runtime-effect-turn.js";
import { resolveChatUserId } from "./sender-identity.js";
import {
  buildMcChatContextBlock,
  groundingSkillForTurn,
} from "../../../src/lib/runtime/agent-contract/mc-chat-context.mjs";
import { sanitizeAgentThinkingHistory } from "./thinking-sanitizer.js";
import { buildAgentSessionKey, resolveAgentModel } from "./session-key.js";
import { buildTurnReplyOptions, resolveTurnModelOverride } from "./model-routing.js";
import { hasRecentVisibleDelivery, markVisibleDelivery } from "./delivery-state.js";
import {
  enqueueOpenClawTerminalCallback,
  initializeOpenClawCallbackDelivery,
  isTerminalCallbackDeliveryError,
} from "./callback-delivery.js";
import {
  shouldRetryTransportAbort,
  TRANSPORT_ABORT_RETRY_DELAY_MS,
} from "./transport-abort.js";
import { applyBrandEnvToProcess, applyRuntimeEnvToProcess } from "./brand-env.js";
import { mcChatCostGuard } from "./cost-guard.js";
import { buildAttachmentContextBlock } from "./attachments.js";
import {
  isStopCommand,
  semanticSessionFamilyKey,
  tryStartSessionDispatch,
} from "./session-dispatch-state.js";
import {
  acceptRuntimeInbound,
  claimRuntimeInbound,
  registerRuntimeRun,
  releaseRuntimeInbound,
  safeTerminalCallbackGrantEnvelope,
} from "./runtime-run-state.js";
import { processRuntimeStopControl } from "./runtime-stop-control.js";
import { buildCanonicalHistoryBootstrapIfNeeded } from "./canonical-history.js";
import { createTerminalDeliveryBuffer } from "./terminal-delivery-buffer.js";
import {
  LEADS_SEARCH_START_TOOL,
  registerLeadsSearchTools,
} from "./leads-search-tool.js";
import {
  PARTNERSHIPS_DISCOVERY_START_TOOL,
  registerPartnershipsDiscoveryTools,
} from "./partnerships-discovery-tool.js";
import { createDurableToolBoundary } from "./durable-tool-boundary.js";
import {
  authorizeChatTurnWithControlPlane,
  matchesConfiguredSecret,
  validatedControlPlaneOrigin,
} from "./chat-turn-authority.js";
import {
  postDurableTurnAction,
  safeDurableTurnClaim,
  startDurableTurnHeartbeat,
  startDurableTurnWorker,
} from "./durable-turn-worker.js";

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

function singleRequestHeader(req, name) {
  const value = req?.headers?.[name];
  return Array.isArray(value) ? undefined : value;
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

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
    const callbackDelivery = initializeOpenClawCallbackDelivery({
      logger(event) {
        const detail = [
          `event=${event?.event || "unknown"}`,
          event?.callbackId ? `callbackId=${event.callbackId}` : "",
          Number.isInteger(event?.attempts)
            ? `attempts=${event.attempts}`
            : "",
          Number.isInteger(event?.status) ? `status=${event.status}` : "",
          Number.isFinite(event?.delayMs) ? `delayMs=${event.delayMs}` : "",
        ]
          .filter(Boolean)
          .join(" ");
        if (
          event?.event === "retry_scheduled" ||
          event?.event === "retry_state_persist_failed" ||
          event?.event === "expired" ||
          event?.event === "pruned_invalid"
        ) {
          logger.warn(`[mc-chat] terminal callback outbox ${detail}`);
        } else {
          logger.info(`[mc-chat] terminal callback outbox ${detail}`);
        }
      },
    });
    registerLeadsSearchTools(api, { loadConfig });
    registerPartnershipsDiscoveryTools(api, { loadConfig });
    const durableToolBoundary = createDurableToolBoundary({
      ledgerAdmissionTools: [
        LEADS_SEARCH_START_TOOL,
        PARTNERSHIPS_DISCOVERY_START_TOOL,
      ],
    });
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
      (event, ctx) =>
        durableToolBoundary.beforeToolCall(event, ctx) ??
        mcChatCostGuard.beforeToolCall(event, ctx),
      { priority: 100, timeoutMs: 1000 },
    );
    registerCostHook(
      "agent_end",
      (event, ctx) => mcChatCostGuard.agentEnd(event, ctx),
      { priority: 100, timeoutMs: 1000 },
    );

    // ─── HTTP Route: Inbound webhook from MC Server ───
    const handleInboundRequest = async (req, res) => {
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
        const controlPlaneOrigin = validatedControlPlaneOrigin(
          channelCfg?.mcServerUrl,
        );
        if (!controlPlaneOrigin) {
          logger.error(
            "[mc-chat] Refusing inbound traffic: mcServerUrl is not a valid control-plane origin",
          );
          res.statusCode = 503;
          res.end(JSON.stringify({ error: "MC control-plane URL unavailable" }));
          return true;
        }
        const providedSecret = req.headers["x-mc-secret"];
        if (!matchesConfiguredSecret(providedSecret, expectedSecret)) {
          logger.warn("[mc-chat] Invalid shared secret from MC server");
          res.statusCode = 403;
          res.end(JSON.stringify({ error: "Forbidden" }));
          return true;
        }

        // `/api/chat/cancel` tombstones the parent before contacting the
        // runtime, so an ordinary chat-turn preflight must reject it. It also
        // reuses the already-admitted run id. Give Stop its own narrow rail:
        // authenticated transport + explicit action + exact active run binding.
        const runtimeStop = processRuntimeStopControl({
          controlAction: singleRequestHeader(
            req,
            "x-sancho-control-action",
          ),
          payload,
          cancelRun: (sessionKey, reason) =>
            mcChatCostGuard.cancelRun(sessionKey, reason),
        });
        if (runtimeStop.handled) {
          if (runtimeStop.status !== 200) {
            logger.warn(
              "[mc-chat] Rejected Stop without exact active-run authority",
            );
          } else {
            logger.info(
              `[mc-chat] control-plane Stop processed run=${payload.missionControlRunId} cancelled=${runtimeStop.body.cancelled}`,
            );
          }
          res.statusCode = runtimeStop.status;
          res.end(JSON.stringify(runtimeStop.body));
          return true;
        }

        const dispatchRunId = singleRequestHeader(
          req,
          "x-sancho-dispatch-run-id",
        );
        const dispatchLeaseToken = singleRequestHeader(
          req,
          "x-sancho-dispatch-lease-token",
        );
        const hasDispatchRunId = dispatchRunId !== undefined;
        const hasDispatchLeaseToken = dispatchLeaseToken !== undefined;
        const durableTurnClaim = safeDurableTurnClaim(req.durableTurnClaim);
        if (
          hasDispatchRunId !== hasDispatchLeaseToken ||
          Boolean(durableTurnClaim) !== hasDispatchRunId ||
          (durableTurnClaim &&
            (durableTurnClaim.dispatchRunId !== dispatchRunId ||
              durableTurnClaim.leaseToken !== dispatchLeaseToken ||
              durableTurnClaim.parentAgentRunId !== payload.missionControlRunId ||
              durableTurnClaim.runtimeToolCapability !==
                payload.runtimeToolCapability))
        ) {
          logger.warn(
            "[mc-chat] Rejected partial or non-local durable dispatch authority",
          );
          res.statusCode = 403;
          res.end(
            JSON.stringify({ error: "Invalid durable dispatch authority" }),
          );
          return true;
        }

        const adapterTerminalCallbackAuthority = durableTurnClaim
          ? null
          : safeTerminalCallbackGrantEnvelope(
              payload.runtimeTerminalCallbackGrant,
              payload.runtimeTerminalCallbackGrantExpiresAt,
            );
        if (!durableTurnClaim && !adapterTerminalCallbackAuthority) {
          logger.warn(
            "[mc-chat] Rejected turn without durable terminal callback authority",
          );
          res.statusCode = 403;
          res.end(
            JSON.stringify({ error: "Invalid terminal callback authority" }),
          );
          return true;
        }

        const trustedTurn = await authorizeChatTurnWithControlPlane(
          payload,
          channelCfg,
          {
            ...(durableTurnClaim ? { dispatchRunId, dispatchLeaseToken } : {}),
          },
        );
        if (!trustedTurn) {
          logger.warn(
            "[mc-chat] Rejected inbound turn without matching active run authority",
          );
          res.statusCode = 403;
          res.end(
            JSON.stringify({ error: "Invalid Mission Control turn authority" }),
          );
          return true;
        }

        const inboundAdmission = claimRuntimeInbound(payload.missionControlRunId);
        if (inboundAdmission === "duplicate_accepted") {
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              ok: true,
              duplicate: true,
              message: "Mission Control turn already admitted",
            }),
          );
          return true;
        }
        if (inboundAdmission === "duplicate_pending") {
          res.statusCode = 409;
          res.end(
            JSON.stringify({
              error: "Mission Control turn admission is still pending",
              code: "runtime_inbound_pending",
              retryable: true,
              retryAfterMs: 2_000,
            }),
          );
          return true;
        }
        if (inboundAdmission !== "claimed") {
          res.statusCode = 503;
          res.end(
            JSON.stringify({ error: "Runtime inbound admission unavailable" }),
          );
          return true;
        }

        const {
          missionControlRunId,
          runtimeToolCapability,
          threadName,
          text,
          linkedTo,
          docPath,
          docKind,
          attachments,
          channelMode,
          supportContext,
          priorThreadMessages,
          taskRouteProposal,
          runtimeEffectIntent,
        } = payload;
        const {
          slug,
          threadId,
          agent,
          skill,
          skills,
          primarySkill,
          scope,
          skillMode,
          temporaryAgent,
          controlDepth,
          isAdmin,
          senderRole,
          readOnly,
          runtimeEffectIntent: authorizedRuntimeEffectIntent,
          userId,
          userName,
          source: _source,
        } = trustedTurn;

        if (!slug || !threadId || !text) {
          releaseRuntimeInbound(missionControlRunId);
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Missing required fields: slug, threadId, text" }));
          return true;
        }

        const requestedAgent = agent;
        const isTemporarySancho = temporaryAgent === true && requestedAgent === "sancho";
        const isReadOnly = readOnly === true;
        const isControlFollowup = controlDepth === 1 || isReadOnly;
        const turnModelOverride = resolveTurnModelOverride({
          readOnly: isReadOnly,
          source: _source,
          slug,
          userId,
          threadId,
          channelMode,
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
          acceptRuntimeInbound(missionControlRunId);
          const finalText = cancelled
            ? "Ejecución detenida."
            : "No había ninguna ejecución activa que detener.";
          res.statusCode = 200;
          res.end(JSON.stringify({
            ok: true,
            cancelled,
            chatId,
            finalText,
            finalAgent: requestedAgent,
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
          runtimeId: "openclaw",
          requestedAgent,
          canDelegate: !isTemporarySancho && !isControlFollowup,
          temporaryAgent: isTemporarySancho,
          controlDepth: controlDepth === 1 ? 1 : 0,
          isAdmin: isAdmin === true,
          senderRole: senderRole === "admin" ? "admin" : "client",
          nativeEffectTools: Boolean(durableTurnClaim),
          runtimeEffectIntent: authorizedRuntimeEffectIntent,
          taskRouteProposal,
          readOnly: isReadOnly,
          channelMode,
          supportContext,
        });

        // ─── Bounded grounding (SAN-246/SAN-382 follow-up) ───
        // Fetch a compact context manifest from Next and prepend it to the user
        // text. The manifest includes portable skill instructions plus bounded
        // client context. FAIL-SOFT: any failure logs a warning and continues WITHOUT
        // blocking the dispatch — never crash the gateway over grounding.
        let groundedText = text;
        if (requestedAgent) {
          try {
            const groundingSkill = groundingSkillForTurn({ scope, skillMode, skill });
            const pack = await fetchContextPack(slug, groundingSkill, {
              contextPackUrl: channelCfg?.contextPackUrl,
              nextServerUrl: channelCfg?.nextServerUrl,
              secret: channelCfg?.sharedSecret,
              runId: missionControlRunId,
              capability: runtimeToolCapability,
              dispatchRunId: durableTurnClaim?.dispatchRunId,
              dispatchLeaseToken: durableTurnClaim?.leaseToken,
              logger,
            });
            if (pack) {
              const prefix = pack.verdict === "missing"
                ? buildFoundationDirective(pack)
                : buildClientContextBlock(pack, {
                    includeDocuments: Boolean(turnModelOverride),
                    maxInlineDocumentChars: 10_000,
                  });
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

        // Resolve sender identity based on admin/client role
        // This maps to toolsBySender keys in openclaw.json:
        //   "id:mc-admin" → alsoAllow: [gateway, exec, cron]
        //   clients get default deny
        // Read-only channels must never inherit the privileged mc-admin tool
        // grant. The client principal is the programmatic deny boundary; the
        // prompt is an additional behavioural instruction, not the sandbox.
        const resolvedSenderId = resolveChatUserId({
          trustedRuntimeRequest: true,
          isAdmin: !isReadOnly && isAdmin === true,
          slug,
          claimedUserId: isReadOnly ? undefined : userId,
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
        if (req.durableAbortSignal) {
          if (req.durableAbortSignal.aborted) {
            abortController.abort(new Error("Durable worker is stopping"));
          } else {
            req.durableAbortSignal.addEventListener(
              "abort",
              () =>
                abortController.abort(new Error("Durable worker is stopping")),
              { once: true },
            );
          }
        }
        const guardLimits = mcChatCostGuard.limits();

        const admissionBoundary = deferred();
        let durableHeartbeatStop = () => {};
        let durableStarted = false;
        const runTurn = async () => {
        if (durableTurnClaim && !beforeToolCallHookRegistered) {
          admissionBoundary.resolve({
            ok: false,
            status: 503,
            code: "durable_tool_boundary_unavailable",
          });
          return;
        }
        const releaseDurableToolBoundary = durableTurnClaim
          ? durableToolBoundary.registerTurn({
              runId: guardRunId,
              sessionKey,
              readOnly: isReadOnly,
              allowedLedgerAdmissions:
                authorizedRuntimeEffectIntent ?? [],
            })
          : () => {};
        if (durableTurnClaim && !releaseDurableToolBoundary) {
          admissionBoundary.resolve({
            ok: false,
            status: 503,
            code: "durable_tool_boundary_unavailable",
          });
          return;
        }
        if (durableTurnClaim) {
          const started = await postDurableTurnAction(
            "started",
            durableTurnClaim,
            channelCfg,
          );
          if (!started.ok) {
            admissionBoundary.resolve({
              ok: false,
              status: started.status || 409,
              code: started.code || "chat_agent_turn_claim_lost",
            });
            releaseDurableToolBoundary();
            return;
          }
          durableStarted = true;
          durableHeartbeatStop = startDurableTurnHeartbeat(
            durableTurnClaim,
            channelCfg,
            {
              onCancellationRequested: () => {
                abortController.abort(
                  new Error("Durable chat turn cancellation was requested"),
                );
              },
              onClaimLost: () => {
                abortController.abort(
                  new Error("Durable chat turn lease was lost"),
                );
              },
            },
          );
        }

        // Decide history hydration only after this session reaches the front of
        // its queue. A previous turn may have planted the durable marker while
        // this request waited; deciding before enqueue would replay the same
        // canonical history into both turns.
        let canonicalHistoryBootstrap = null;
        try {
          canonicalHistoryBootstrap = buildCanonicalHistoryBootstrapIfNeeded({
            readOnly: isReadOnly,
            source: _source,
            channelMode,
            slug,
            threadId,
            agentId: requestedAgent,
            sessionKey,
            priorThreadMessages,
            home: process.env.OPENCLAW_HOME,
            onError: (error) => logger.warn(`[mc-chat] canonical-history marker lookup failed: ${error?.message || error}`),
          });
        } catch (error) {
          // History hydration is contextual enrichment. Never block the user's
          // current request if a malformed registry or transcript cannot be read.
          logger.warn(`[mc-chat] canonical-history bootstrap skipped: ${error?.message || error}`);
        }
        if (canonicalHistoryBootstrap) {
          logger.info(`[mc-chat] canonical thread history bootstrapped session=${sessionKey} messages=${Array.isArray(priorThreadMessages) ? priorThreadMessages.length : 0}`);
        }
        const bodyForAgent = [mcChatContextBlock, canonicalHistoryBootstrap, groundedText]
          .filter(Boolean)
          .join("\n\n");
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
        const releaseRuntimeRun = registerRuntimeRun({
          slug,
          threadId,
          agent: requestedAgent,
          missionControlRunId,
          sessionKey,
          runtimeToolCapability,
          runtimeTerminalCallbackGrant:
            durableTurnClaim?.runtimeTerminalCallbackGrant ??
            adapterTerminalCallbackAuthority?.token,
          dispatchRunId: durableTurnClaim?.dispatchRunId,
          dispatchLeaseToken: durableTurnClaim?.leaseToken,
          allowExternalEffects:
            resolvedSenderId === "mc-admin" &&
            !isReadOnly &&
            !isTemporarySancho &&
            !isControlFollowup &&
            Boolean(durableTurnClaim) &&
            Boolean(authorizedRuntimeEffectIntent?.length),
          allowedExternalEffects: authorizedRuntimeEffectIntent ?? [],
        });

        // Dispatch to agent asynchronously
        let runtimeErrorPosted = false;
        let runtimeErrorPromise = null;
        let visibleReplyPosted = false;
        const terminalDeliveryBuffer = createTerminalDeliveryBuffer();
        const runtimeEffectTurn = createRuntimeEffectTurnArbitrator();
        let turnControlAction = null;
        let temporaryInterventionDispatched = false;
        const turnSeenRouteRequests = new Set();
        const turnStartedAt = Date.now();
        // Register only after this session reaches the front of the serialized
        // queue. Registering before enqueue let a follow-up share counters with
        // the active turn and replace its AbortController.
        mcChatCostGuard.registerActiveTurn({
          runId: guardRunId,
          sessionKey,
          abortController,
          startedAt: turnStartedAt,
        });
        const turnTimer = guardLimits.enabled
          ? setTimeout(() => {
              mcChatCostGuard.abortRun(
                guardRunId,
                sessionKey,
                "La ejecución superó el tiempo máximo permitido.",
              );
            }, guardLimits.maxWallClockMs)
          : null;
        const callbackUrl = `${controlPlaneOrigin}/api/chat/webhook`;
        const secret = channelCfg?.sharedSecret;
        const callbackIdentity = missionControlRunId
          ? { missionControlRunId }
          : {};
        const callbackRunAuthorityHeaders = {
          "X-Mission-Control-Run-Id": missionControlRunId,
          "X-Sancho-Run-Capability": runtimeToolCapability,
          ...(durableTurnClaim
            ? {
                "X-Sancho-Dispatch-Run-Id":
                  durableTurnClaim.dispatchRunId,
                "X-Sancho-Dispatch-Lease-Token":
                  durableTurnClaim.leaseToken,
              }
            : {}),
        };
        const terminalCallbackAuthorityHeaders = {
          ...callbackRunAuthorityHeaders,
          ...(durableTurnClaim?.runtimeTerminalCallbackGrant ||
          adapterTerminalCallbackAuthority?.token
            ? {
                "X-Sancho-Terminal-Callback-Grant":
                  durableTurnClaim?.runtimeTerminalCallbackGrant ??
                  adapterTerminalCallbackAuthority.token,
              }
            : {}),
        };
        const postTerminalDurably = async (payload, label) => {
          let queued;
          try {
            queued = enqueueOpenClawTerminalCallback({
              deliveryId: missionControlRunId,
              url: callbackUrl,
              headers: {
                "Content-Type": "application/json",
                ...(secret ? { "X-MC-Secret": secret } : {}),
                ...terminalCallbackAuthorityHeaders,
              },
              payload,
            });
          } catch (error) {
            logger.error(
              `[mc-chat] ${label} persistence failed code=${error?.code || "unknown"}`,
            );
            throw error;
          }
          // Persistence is the local ownership boundary; acknowledgement is
          // still awaited so the durable dispatch cannot complete first.
          visibleReplyPosted = true;
          markVisibleDelivery(slug, threadId);
          try {
            await queued.delivery;
            return queued;
          } catch (error) {
            logger.error(
              `[mc-chat] ${label} delivery failed code=${error?.code || "unknown"}`,
            );
            throw error;
          }
        };
        try {
          if (turnModelOverride) {
            logger.info(`[mc-chat] skipping global thinking-history scan for isolated model override session=${sessionKey}`);
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
          const mcUrl = controlPlaneOrigin;
          const threadLinkUrlBase = `${mcUrl}/api/chat/thread`;
          const sendUrl = `${mcUrl}/api/chat/send`;
          const taskRouteUrl = `${mcUrl}/api/tasks/resolve-route`;
          const parentRunAuthorityHeaders = {
            "X-Mission-Control-Parent-Run-Id": missionControlRunId,
            "X-Sancho-Parent-Run-Capability": runtimeToolCapability,
            ...(durableTurnClaim
              ? {
                  "X-Sancho-Dispatch-Run-Id": durableTurnClaim.dispatchRunId,
                  "X-Sancho-Dispatch-Lease-Token": durableTurnClaim.leaseToken,
                }
              : {}),
          };
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
          const postWithRetry = async (url, body, label, extraHeaders = {}) => {
            const headers = {
              "Content-Type": "application/json",
              ...(secret ? { "X-MC-Secret": secret } : {}),
              ...callbackRunAuthorityHeaders,
              ...extraHeaders,
            };
            const delays = [0, 750, 2250]; // 3 attempts: immediate, +750ms, +2250ms
            let lastErr;
            for (let i = 0; i < delays.length; i++) {
              if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
              try {
                const res = await fetch(url, {
                  method: "POST",
                  headers,
                  body: JSON.stringify(body),
                  redirect: "error",
                  signal: AbortSignal.timeout(8_000),
                });
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
            if (runtimeErrorPromise) return runtimeErrorPromise;
            runtimeErrorPosted = true;
            runtimeErrorPromise = (async () => {
              const raw = typeof rawError === "string" && rawError.trim()
                ? rawError
                : "El runtime terminó sin devolver respuesta visible.";
              const authInfo = {
                ...(readCodexAuthInfo(respondingAgent) || {}),
                anthropicAuthMode: process.env.ANTHROPIC_AUTH_MODE,
              };
              const { text: rewritten, errorDetail } = classifyAndRewriteError(raw, authInfo);
              await postTerminalDurably({
                slug,
                threadId,
                ...callbackIdentity,
                text: rewritten || "⚠️ El agente terminó sin devolver una respuesta visible. Reintentá en un hilo nuevo.",
                role: "bot",
                agent: respondingAgent,
                ts: new Date().toISOString(),
                ...(errorDetail ? { errorDetail } : {}),
              }, "Bot runtime-error callback");
            })();
            return runtimeErrorPromise;
          };

          if (turnModelOverride && _source === "growie-support") {
            await postWithRetry(callbackUrl, {
              slug,
              threadId,
              ...callbackIdentity,
              role: "progress",
              agent: requestedAgent || "sancho",
              event: {
                kind: "thinking",
                label: canonicalHistoryBootstrap
                  ? "🧠 Recuperando el contexto del caso"
                  : "🔎 Analizando el caso",
              },
            }, "Growie initial progress callback");
          }

          const restoreBrandEnv = applyBrandEnvToProcess(slug);
          const restoreChatEnv = applyRuntimeEnvToProcess({
            SANCHO_CHAT_SLUG: slug,
            SANCHO_CHAT_THREAD_ID: threadId,
            SANCHO_CHAT_AGENT: requestedAgent || "sancho",
            SANCHO_CHAT_REQUEST: text,
          });
          // ─── Transport-abort retry (SAN-479) ───
          // GLM/Fireworks sometimes drops the streaming request mid-turn; the
          // runtime surfaces a bare "Request was aborted." (reason=none) and
          // gives up. When that happens BEFORE anything visible reached the
          // thread, re-dispatch the same message once instead of surfacing the
          // raw literal. See transport-abort.js for the double-delivery
          // reasoning (the buffered dispatcher only posts via `deliver`).
          let transportAbortRetryUsed = false;
          let pendingTransportAbortRaw = null;
          const canRetryTransportAbort = (raw) =>
            shouldRetryTransportAbort({
              raw,
              retryUsed: transportAbortRetryUsed,
              visibleReplyPosted:
                visibleReplyPosted || terminalDeliveryBuffer.hasVisible(),
              channelDeliveryObserved: hasRecentVisibleDelivery(slug, threadId, turnStartedAt),
              guardAbortMessage: mcChatCostGuard.abortMessageFor(guardRunId, sessionKey),
              signalAborted: abortController.signal.aborted,
            });
          let dispatchResult;
          try {
            const startDispatch = () => dispatchInboundMessageWithBufferedDispatcher({
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
              ...buildTurnReplyOptions({ modelOverride: turnModelOverride, source: _source }),
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
                let malformedEffectBlocks = 0;
                let blockedControlBlocks = 0;
                let deliveryEffects = [];
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
                    const parsedEffects = parseRuntimeEffectMarkers(parsedIntervention.text);
                    deliveryEffects.push(...parsedEffects.effects);
                    if (parsedEffects.malformed.length) {
                      malformedEffectBlocks += parsedEffects.malformed.length;
                      logger.warn(`[mc-chat] ${parsedEffects.malformed.length} malformed :::sancho-effect block(s) thread=${threadId}`);
                    }
                    if (parsedEffects.text) cleaned.push(parsedEffects.text);
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
                  const effectDecision = runtimeEffectTurn.observe({
                    effects: deliveryEffects,
                    controlAction: Boolean(turnControlAction),
                  });
                  blockedControlBlocks += effectDecision.blockedCount;
                  texts.length = 0;
                  texts.push(...cleaned);
                  if (sanchoInterventions.length && texts.length === 0) {
                    texts.push("🛡️ Pido una intervención puntual de Sancho en esta misma tarea.");
                  } else if ((delegations.length || taskRoutes.length) && texts.length === 0) {
                    texts.push("🧭 Voy a ubicar la tarea correcta dentro de este grupo.");
                  } else if (effectDecision.acceptedCount > 0 && texts.length === 0) {
                    texts.push("He preparado la solicitud para la ejecución durable de Sancho.");
                  }
                  if (blockedControlBlocks > 0) {
                    texts.push("⚠️ Bloqueé una instrucción de control no autorizada o incompatible. El harness original sigue intacto.");
                  }
                  if (malformedControlBlocks > 0) {
                    texts.push("⚠️ El agente devolvió una instrucción de routing inválida. No cambié la tarea ni el agente por esa instrucción.");
                  }
                  if (malformedEffectBlocks > 0) {
                    texts.push("⚠️ El agente devolvió una solicitud de operación inválida. No inicié ningún efecto externo por esa instrucción.");
                  }
                } catch (e) {
                  logger.warn(`[mc-chat] task route marker parse skipped: ${e?.message || e}`);
                  delegations = [];
                  taskRoutes = [];
                  sanchoInterventions = [];
                  deliveryEffects = [];
                }

                // Check if thread is linked to Discord
                let discordLink = null;
                try {
                  const threadRes = await fetch(
                    `${threadLinkUrlBase}/${encodeURIComponent(chatId)}`,
                    { headers: secret ? { "X-MC-Secret": secret } : {} },
                  );
                  if (threadRes.ok) {
                    const threadData = await threadRes.json();
                    if (threadData.discordThreadId && threadData.discordChannelId) {
                      discordLink = { threadId: threadData.discordThreadId, channelId: threadData.discordChannelId };
                    }
                  }
                } catch {}

                // Same task, same thread, one-turn Sancho override. send.ts
                // deliberately does not persist this route, so the next user
                // turn returns to the original owning agent and skill harness.
                const controlFeedback = [];
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
                  }, "Temporary Sancho intervention", parentRunAuthorityHeaders);
                  if (dispatched) {
                    logger.info(`[mc-chat] temporary Sancho intervention dispatched in-place owner=${respondingAgent} thread=${threadId}`);
                  } else {
                    controlFeedback.push("⚠️ No pude iniciar la intervención temporal de Sancho. La tarea y su agente original no cambiaron.");
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
                  }, `Task route→${routeAgent}`, parentRunAuthorityHeaders);
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
                  const dispatchGrant = typeof routeData?.dispatchGrant === "string"
                    ? routeData.dispatchGrant
                    : null;
                  const dispatchIdempotencyKey = typeof routeData?.dispatchIdempotencyKey === "string"
                    ? routeData.dispatchIdempotencyKey
                    : null;
                  if (
                    (routeData?.action === "reuse" || routeData?.action === "created")
                    && targetThreadId
                    && dispatchGrant
                    && dispatchIdempotencyKey
                  ) {
                    const dispatched = await postWithRetry(sendUrl, {
                      slug,
                      threadId: targetThreadId,
                      threadName: routeData.threadName || routeName,
                      text: routeRequest.brief,
                      agent: routeAgent,
                      skill: routeRequest.skill,
                      controlDepth: 1,
                      idempotencyKey: dispatchIdempotencyKey,
                      userId,
                      userName,
                      isAdmin: isAdmin === true,
                      senderRole: senderRole === "admin" ? "admin" : "client",
                      attachments,
                      _source,
                    }, `Task dispatch→${routeAgent}`, {
                      ...parentRunAuthorityHeaders,
                      ...(dispatchGrant
                        ? { "X-Sancho-Route-Dispatch-Grant": dispatchGrant }
                        : {}),
                    });
                    if (dispatched) {
                      logger.info(`[mc-chat] task routed → ${routeAgent} task=${routeData.taskId || "unknown"} thread=${targetThreadId} action=${routeData.action}`);
                      continue;
                    }
                  }

                  const routeMessage = typeof routeData?.message === "string" && routeData.message.trim()
                    ? routeData.message
                    : `⚠️ No pude resolver una tarea segura para **${routeAgent}** dentro de este grupo. No se despachó nada.`;
                  controlFeedback.push(routeMessage);
                }

                // A runtime run has one terminal result. Execute every child
                // control action while its parent authority is still active,
                // then buffer every visible part until OpenClaw's dispatcher
                // has finished all deliver calls.
                const msgText = [...texts, ...controlFeedback]
                  .map((part) => String(part || "").trim())
                  .filter(Boolean)
                  .join("\n\n");
                if (msgText) {
                  terminalDeliveryBuffer.append({
                    text: msgText,
                    agent: respondingAgent,
                    discordLink,
                  });
                }
              },
              onError: (err, info) => {
                const rawError = err?.message || String(err);
                logger.error(`[mc-chat] Dispatch error (${info.kind}): ${rawError}`);
                // Record classified errors into the per-agent tracker so a
                // subsequent watchdog_abort delivery can correlate ("session
                // timed out — last seen rate_limit"). Best-effort only.
                try {
                  const respondingAgent = requestedAgent || "sancho";
                  const authInfo = {
                    ...(readCodexAuthInfo(respondingAgent) || {}),
                    anthropicAuthMode: process.env.ANTHROPIC_AUTH_MODE,
                  };
                  const { errorDetail } = classifyAndRewriteError(rawError, authInfo);
                  if (errorDetail) errorTracker.record(respondingAgent, errorDetail);
                } catch {}
                // Mid-turn transport abort with nothing visible posted yet:
                // don't surface the raw literal — defer, and let the turn loop
                // re-dispatch this same message once (SAN-479). If the retry
                // fails too, this path runs again with retryUsed=true and the
                // error surfaces through the transport_abort classifier.
                if (canRetryTransportAbort(rawError)) {
                  pendingTransportAbortRaw = rawError;
                  logger.warn(`[mc-chat] transport abort deferred for one retry thread=${threadId}`);
                  return;
                }
                if (terminalDeliveryBuffer.hasVisible()) {
                  logger.warn(`[mc-chat] runtime error arrived after a visible buffered delivery; preserving the complete buffered reply thread=${threadId}`);
                  return;
                }
                postRuntimeError(rawError, requestedAgent || "sancho").catch((postErr) => {
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
                const headers = {
                  "Content-Type": "application/json",
                  ...(secret ? { "X-MC-Secret": secret } : {}),
                  ...callbackRunAuthorityHeaders,
                };
                const baseAgent = requestedAgent || "sancho";
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ slug, threadId, ...callbackIdentity, role: "status", text: "🔄 Sancho está pensando...", agent: baseAgent }),
                  redirect: "error",
                  signal: AbortSignal.timeout(8_000),
                }).catch(() => {});
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    slug, threadId, ...callbackIdentity, role: "progress", agent: baseAgent,
                    event: { kind: "thinking", label: "Pensando…" },
                  }),
                  redirect: "error",
                  signal: AbortSignal.timeout(8_000),
                }).catch(() => {});
              },
            },
            getReplyOptions: {
              onToolStart: async (payload) => {
                if (!payload?.name) return;
                const headers = {
                  "Content-Type": "application/json",
                  ...(secret ? { "X-MC-Secret": secret } : {}),
                  ...callbackRunAuthorityHeaders,
                };
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
                  redirect: "error",
                  signal: AbortSignal.timeout(8_000),
                }).catch(() => {});

                // Structured progress event (accumulated + sealed)
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    slug, threadId, ...callbackIdentity, role: "progress", agent: baseAgent,
                    event: { kind, label, target },
                  }),
                  redirect: "error",
                  signal: AbortSignal.timeout(8_000),
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
                    redirect: "error",
                    signal: AbortSignal.timeout(8_000),
                  }).catch(() => {});
                }
              },
              onCompactionStart: async () => {
                const headers = {
                  "Content-Type": "application/json",
                  ...(secret ? { "X-MC-Secret": secret } : {}),
                  ...callbackRunAuthorityHeaders,
                };
                const baseAgent = requestedAgent || "sancho";
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ slug, threadId, ...callbackIdentity, role: "status", text: "📦 Compactando contexto...", agent: baseAgent }),
                  redirect: "error",
                  signal: AbortSignal.timeout(8_000),
                }).catch(() => {});
                fetch(callbackUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    slug, threadId, ...callbackIdentity, role: "progress", agent: baseAgent,
                    event: { kind: "tool_call", label: "📦 Compactando contexto" },
                  }),
                  redirect: "error",
                  signal: AbortSignal.timeout(8_000),
                }).catch(() => {});
              },
            },
            });
            const dispatchPromise = startDispatch();
            admissionBoundary.resolve({
              ok: true,
              status: 200,
              dispatchInvoked: true,
            });
            try {
              dispatchResult = await dispatchPromise;
            } catch (dispatchErr) {
              const raw = dispatchErr?.message || String(dispatchErr);
              if (canRetryTransportAbort(raw)) {
                pendingTransportAbortRaw = raw;
              } else if (terminalDeliveryBuffer.hasVisible()) {
                logger.warn(`[mc-chat] dispatcher ended after a visible buffered delivery; preserving partial result thread=${threadId}`);
              } else {
                throw dispatchErr;
              }
            }
            if (pendingTransportAbortRaw) {
              const raw = pendingTransportAbortRaw;
              pendingTransportAbortRaw = null;
              if (canRetryTransportAbort(raw)) {
                // Same message, same session — one retry. Marked BEFORE the
                // second dispatch so its own failure can never re-enter here.
                transportAbortRetryUsed = true;
                logger.warn(`[mc-chat] transport abort ("${raw.slice(0, 120)}"); retrying dispatch once in ${TRANSPORT_ABORT_RETRY_DELAY_MS}ms thread=${threadId}`);
                await new Promise((resolve) => setTimeout(resolve, TRANSPORT_ABORT_RETRY_DELAY_MS));
                try {
                  dispatchResult = await startDispatch();
                } catch (retryErr) {
                  if (!terminalDeliveryBuffer.hasVisible()) throw retryErr;
                  logger.warn(`[mc-chat] retry ended after a visible buffered delivery; preserving partial result thread=${threadId}`);
                }
              } else {
                // Conditions changed between the deferred onError and now
                // (e.g. a partial reply became visible) — surface the original
                // error instead of risking a double delivery.
                await postRuntimeError(raw, requestedAgent || "sancho");
              }
            }
          } finally {
            restoreChatEnv();
            restoreBrandEnv();
          }
          const terminalDelivery = terminalDeliveryBuffer.drain();
          if (terminalDelivery && !runtimeErrorPosted) {
            const respondingAgent = terminalDelivery.agent;
            const authInfo = {
              ...(readCodexAuthInfo(respondingAgent) || {}),
              anthropicAuthMode: process.env.ANTHROPIC_AUTH_MODE,
            };
            const { text: rewritten, errorDetail: classified } =
              classifyAndRewriteError(terminalDelivery.text, authInfo);
            const callbackText = runtimeEffectTurn.appendToCallback(rewritten);
            let errorDetail = classified;
            if (errorDetail?.category === "watchdog_abort") {
              const prior = errorTracker.getRecent(respondingAgent);
              if (prior) errorDetail = mergeWithPriorCategory(errorDetail, prior);
            }
            const posted = await postTerminalDurably({
              slug,
              threadId,
              ...callbackIdentity,
              text: callbackText,
              role: "bot",
              agent: respondingAgent,
              ts: new Date().toISOString(),
              ...(errorDetail ? { errorDetail } : {}),
            }, "Bot callback");
            if (posted) {
              visibleReplyPosted = true;
              markVisibleDelivery(slug, threadId);
            }
            const discordLink = terminalDelivery.discordLink;
            if (discordLink && _source !== "discord") {
              try {
                await tools.message.send({
                  action: "send",
                  target: `channel:${discordLink.threadId}`,
                  message: rewritten + "\n||[_mc_relay]||",
                });
                logger.info(`[mc-chat] Relayed to Discord thread ${discordLink.threadId}`);
              } catch (discordErr) {
                logger.error(`[mc-chat] Discord relay error: ${discordErr?.message}`);
              }
            }
            logger.info(`[mc-chat] published ${terminalDelivery.deliveryCount} buffered delivery part(s) as one terminal result thread=${threadId}`);
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
          if (runtimeErrorPromise) await runtimeErrorPromise;
        } catch (err) {
          admissionBoundary.resolve({
            ok: durableStarted,
            status: durableStarted ? 200 : 503,
            dispatchInvoked: false,
            code: durableStarted
              ? "runtime_committed_not_invoked"
              : "runtime_dispatch_unavailable",
          });
          logger.error(`[mc-chat] Dispatch error: ${err?.message}`);
          // A terminal transport failure must keep the durable parent open;
          // replacing it with another callback under the same delivery id
          // would either overwrite intent or falsely complete the dispatch.
          if (isTerminalCallbackDeliveryError(err)) throw err;
          if (runtimeErrorPromise) {
            await runtimeErrorPromise;
            return true;
          }
          runtimeErrorPosted = true;
          const raw =
            mcChatCostGuard.abortMessageFor(guardRunId, sessionKey) ||
            err?.message ||
            String(err);
          const authInfo = {
            ...(readCodexAuthInfo(requestedAgent || "sancho") || {}),
            anthropicAuthMode: process.env.ANTHROPIC_AUTH_MODE,
          };
          const { text: rewritten, errorDetail } = classifyAndRewriteError(raw, authInfo);
          await postTerminalDurably({
            slug,
            threadId,
            ...callbackIdentity,
            role: "bot",
            agent: requestedAgent || "sancho",
            text: rewritten || "⚠️ El agente terminó sin devolver una respuesta visible. Reintentá en un hilo nuevo.",
            ts: new Date().toISOString(),
            ...(errorDetail ? { errorDetail } : {}),
          }, "Dispatch-error callback");
        } finally {
          admissionBoundary.resolve({
            ok: durableStarted,
            status: durableStarted ? 200 : 503,
            dispatchInvoked: false,
          });
          if (turnTimer) clearTimeout(turnTimer);
          mcChatCostGuard.clearActiveTurn(guardRunId, sessionKey);
          releaseDurableToolBoundary();
          releaseRuntimeRun();
        }
      };

      let dispatchReceipt;
      try {
        dispatchReceipt = tryStartSessionDispatch(sessionKey, runTurn, {
          familyKey: dispatchFamilyKey,
        });
      } catch (error) {
        releaseRuntimeInbound(missionControlRunId);
        logger.error(
          `[mc-chat] failed to reserve dispatch lane: ${error?.message || error}`,
        );
        res.statusCode = 503;
        res.end(
          JSON.stringify({
            error: "Runtime dispatch unavailable",
            code: "runtime_dispatch_unavailable",
            retryable: true,
          }),
        );
        return true;
      }
      if (!dispatchReceipt.started) {
        releaseRuntimeInbound(missionControlRunId);
        res.statusCode = 409;
        res.end(
          JSON.stringify({
            error: "Another turn is active for this session",
            code: "runtime_session_busy",
            retryable: true,
            retryAfterMs: 2_000,
          }),
        );
        return true;
      }
      void dispatchReceipt.promise.catch(() => {
        admissionBoundary.resolve({
          ok: durableStarted,
          status: durableStarted ? 200 : 503,
          dispatchInvoked: false,
          code: durableStarted
            ? "runtime_committed_not_invoked"
            : "runtime_dispatch_unavailable",
        });
      });

      const admission = await admissionBoundary.promise;
      if (!admission.ok) {
        await dispatchReceipt.promise.catch(() => {});
        releaseRuntimeInbound(missionControlRunId);
        res.statusCode = admission.status === 409 ? 409 : 503;
        res.end(
          JSON.stringify({
            error: "Runtime dispatch was not admitted",
            code: admission.code || "runtime_dispatch_unavailable",
            retryable: true,
          }),
        );
        return true;
      }

      acceptRuntimeInbound(missionControlRunId);
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ok: true,
          chatId,
          dispatchInvoked: admission.dispatchInvoked === true,
          message: "Message dispatched to agent",
        }),
      );

      try {
        await dispatchReceipt.promise;
        if (durableTurnClaim) {
          const completionDelays = [0, 250, 750];
          let cancellationWaitExtended = false;
          for (
            let attempt = 0;
            attempt < completionDelays.length;
            attempt += 1
          ) {
            const delay = completionDelays[attempt];
            if (delay) {
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
            const completed = await postDurableTurnAction(
              "complete",
              durableTurnClaim,
              channelCfg,
            );
            if (completed.ok || completed.status !== 409) break;
            if (
              completed.code === "chat_agent_turn_cancellation_pending" &&
              !cancellationWaitExtended
            ) {
              cancellationWaitExtended = true;
              completionDelays.push(...[2_000, 4_000, 8_000]);
            }
          }
        }
      } catch (error) {
        logger.error(
          `[mc-chat] reserved dispatch failed: ${error?.message || error}`,
        );
      } finally {
        durableHeartbeatStop();
      }

      return true;
    };
    api.registerHttpRoute({
      path: "/mc-chat/inbound",
      auth: "plugin",
      handler: handleInboundRequest,
    });

    const executeDurableClaim = async (claim, channelConfig, options = {}) => {
      const request = Readable.from([
        Buffer.from(JSON.stringify(claim.envelope), "utf8"),
      ]);
      request.method = "POST";
      request.headers = {
        "x-mc-secret": channelConfig.sharedSecret,
        "x-mission-control-run-id": claim.parentAgentRunId,
        "x-sancho-run-capability": claim.runtimeToolCapability,
        "x-sancho-dispatch-run-id": claim.dispatchRunId,
        "x-sancho-dispatch-lease-token": claim.leaseToken,
      };
      request.durableTurnClaim = claim;
      request.durableAbortSignal = options.signal;
      let responseBody = "";
      let responseEnded = false;
      const response = {
        statusCode: 200,
        setHeader() {},
        end(value = "") {
          responseBody = typeof value === "string" ? value : String(value);
          responseEnded = true;
        },
      };
      try {
        await handleInboundRequest(request, response);
      } catch (error) {
        logger.error(
          `[mc-chat] durable in-process dispatch failed: ${error?.message || error}`,
        );
      }
      let parsed = {};
      try {
        parsed = responseBody ? JSON.parse(responseBody) : {};
      } catch {
        parsed = {};
      }
      return {
        ok:
          responseEnded &&
          response.statusCode >= 200 &&
          response.statusCode < 300,
        status: responseEnded ? response.statusCode : 0,
        code: typeof parsed?.code === "string" ? parsed.code : undefined,
        dispatchInvoked: parsed?.dispatchInvoked === true,
      };
    };

    if (
      api.registrationMode === "full" &&
      typeof api.registerService === "function"
    ) {
      let stopDurableWorker = async () => {};
      api.registerService({
        id: "mc-chat-agent-turn-worker",
        start() {
          callbackDelivery.start();
          stopDurableWorker = startDurableTurnWorker({
            loadConfig,
            logger,
            executeClaim: executeDurableClaim,
            maxConcurrency: 2,
          });
        },
        async stop() {
          // Release any active durable turn that is waiting for a webhook ACK
          // before waiting for the worker itself. The fsynced callback record
          // remains in the outbox and is replayed on the next service start.
          callbackDelivery.stop();
          await stopDurableWorker();
        },
      });
    }

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

    // Discord thread creation remains disabled until the route can receive a
    // caller-scoped authority proof rather than relying on a shared gateway secret.
    api.registerHttpRoute({
      path: "/mc-chat/create-discord-thread",
      auth: "plugin",
      handler: async (_req, res) => {
        res.statusCode = 503;
        res.end(
          JSON.stringify({
            error:
              "Discord thread creation disabled until scoped authority is implemented",
          }),
        );
        return true;
      },
    });

    logger.warn(
      "[mc-chat] Discord→MC outbound relay disabled: scoped ingress authority is not implemented",
    );

    logger.info("[mc-chat] Channel plugin registered — webhook at /mc-chat/inbound");
  },
});

export { mcChatPlugin };
