import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { validatedControlPlaneOrigin } from "./chat-turn-authority.js";

export const DURABLE_TURN_POLL_MS = 2_000;
export const DURABLE_TURN_HEARTBEAT_MS = 5_000;

const RESPONSE_MAX_BYTES = 64 * 1024;
const CONTROL_TIMEOUT_MS = 8_000;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const LEASE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;
const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const CONTROL_ACTIONS = new Set(["heartbeat", "started", "complete", "requeue"]);
const REQUEUE_REASONS = new Set([
  "runtime_session_busy",
  "runtime_dispatch_unavailable",
]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function boundedJson(response) {
  const declaredLength = Number(response?.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > RESPONSE_MAX_BYTES) {
    return null;
  }
  const raw = await response.text();
  if (Buffer.byteLength(raw, "utf8") > RESPONSE_MAX_BYTES) return null;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

function configuredChannel(loadConfig) {
  const cfg = loadConfig?.();
  return cfg?.channels?.["mc-chat"];
}

function workerIdFor(env = process.env) {
  const configured = env.CHAT_AGENT_TURN_WORKER_ID?.trim();
  if (configured && WORKER_ID_PATTERN.test(configured)) return configured;
  const host = hostname()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return `openclaw-${host || "worker"}-${process.pid}`.slice(0, 160);
}

function sharedConfig(channelConfig) {
  const controlPlaneOrigin = validatedControlPlaneOrigin(
    channelConfig?.mcServerUrl,
  );
  const sharedSecret =
    typeof channelConfig?.sharedSecret === "string"
      ? channelConfig.sharedSecret.trim()
      : "";
  return controlPlaneOrigin &&
    sharedSecret &&
    Buffer.byteLength(sharedSecret, "utf8") <= 4_096 &&
    !/[\u0000-\u001f\u007f]/.test(sharedSecret)
    ? { controlPlaneOrigin, sharedSecret }
    : null;
}

function dispatchHeaders(claim, sharedSecret) {
  return {
    "Content-Type": "application/json",
    "X-MC-Secret": sharedSecret,
    "X-Mission-Control-Run-Id": claim.parentAgentRunId,
    "X-Sancho-Run-Capability": claim.runtimeToolCapability,
    "X-Sancho-Dispatch-Run-Id": claim.dispatchRunId,
    "X-Sancho-Dispatch-Lease-Token": claim.leaseToken,
  };
}

function derivedCapability(claim) {
  return createHash("sha256")
    .update(
      [
        "sancho-runtime-tool-dispatch-lease-v1",
        claim.parentAgentRunId,
        claim.dispatchRunId,
        claim.leaseToken,
      ].join("\0"),
      "utf8",
    )
    .digest("hex");
}

export function safeDurableTurnClaim(value) {
  if (!isRecord(value) || !isRecord(value.envelope)) return null;
  if (
    typeof value.dispatchRunId !== "string" ||
    !RUN_ID_PATTERN.test(value.dispatchRunId) ||
    typeof value.parentAgentRunId !== "string" ||
    !RUN_ID_PATTERN.test(value.parentAgentRunId) ||
    typeof value.leaseToken !== "string" ||
    !LEASE_TOKEN_PATTERN.test(value.leaseToken) ||
    typeof value.leaseExpiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.leaseExpiresAt)) ||
    typeof value.runtimeToolCapability !== "string" ||
    !CAPABILITY_PATTERN.test(value.runtimeToolCapability) ||
    value.runtimeToolCapability !== derivedCapability(value) ||
    value.envelope.missionControlRunId !== value.parentAgentRunId ||
    value.envelope.runtimeToolCapability !== value.runtimeToolCapability
  ) {
    return null;
  }
  return value;
}

export function durableTurnWorkerEnabled(env = process.env) {
  return env.CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED === "1";
}

export async function claimDurableTurn(
  channelConfig,
  dependencies = {},
) {
  const shared = sharedConfig(channelConfig);
  const workerId = workerIdFor(dependencies.env);
  if (!shared || !WORKER_ID_PATTERN.test(workerId)) return null;
  try {
    const response = await (dependencies.fetchImpl ?? fetch)(
      `${shared.controlPlaneOrigin}/api/runtime/chat-agent-turn-dispatch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MC-Secret": shared.sharedSecret,
        },
        body: JSON.stringify({ action: "claim", workerId }),
        redirect: "error",
        signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
      },
    );
    const body = await boundedJson(response);
    if (!response.ok || !isRecord(body) || body.ok !== true) return null;
    return body.claim === null ? null : safeDurableTurnClaim(body.claim);
  } catch {
    return null;
  }
}

export async function postDurableTurnAction(
  action,
  claim,
  channelConfig,
  dependencies = {},
) {
  const safeClaim = safeDurableTurnClaim(claim);
  const shared = sharedConfig(channelConfig);
  if (
    !safeClaim ||
    !shared ||
    !CONTROL_ACTIONS.has(action) ||
    (action === "requeue" && !REQUEUE_REASONS.has(dependencies.reason))
  ) {
    return { ok: false, status: 0 };
  }
  const body =
    action === "requeue"
      ? { action, reason: dependencies.reason }
      : { action };
  try {
    const response = await (dependencies.fetchImpl ?? fetch)(
      `${shared.controlPlaneOrigin}/api/runtime/chat-agent-turn-dispatch`,
      {
        method: "POST",
        headers: dispatchHeaders(safeClaim, shared.sharedSecret),
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
      },
    );
    const responseBody = await boundedJson(response);
    return {
      ok: response.ok,
      status: response.status,
      code:
        isRecord(responseBody) && typeof responseBody.error === "string"
          ? responseBody.error
          : undefined,
      cancellationRequested:
        isRecord(responseBody) &&
        responseBody.cancellationRequested === true,
    };
  } catch {
    return { ok: false, status: 0 };
  }
}

export function startDurableTurnHeartbeat(
  claim,
  channelConfig,
  dependencies = {},
) {
  let stopped = false;
  let inFlight = false;
  const interval = (dependencies.setIntervalImpl ?? setInterval)(async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    const result = await postDurableTurnAction(
      "heartbeat",
      claim,
      channelConfig,
      dependencies,
    );
    inFlight = false;
    if (result.ok && result.cancellationRequested) {
      stopped = true;
      (dependencies.clearIntervalImpl ?? clearInterval)(interval);
      dependencies.onCancellationRequested?.();
      return;
    }
    if (!result.ok && result.status === 409) {
      stopped = true;
      (dependencies.clearIntervalImpl ?? clearInterval)(interval);
      dependencies.onClaimLost?.();
    }
  }, DURABLE_TURN_HEARTBEAT_MS);
  interval?.unref?.();
  return () => {
    if (stopped) return;
    stopped = true;
    (dependencies.clearIntervalImpl ?? clearInterval)(interval);
  };
}

export function startDurableTurnWorker(options) {
  const env = options.env ?? process.env;
  if (!durableTurnWorkerEnabled(env)) return () => {};
  let stopped = false;
  let timer;
  let pumping = false;
  const active = new Set();
  const controllers = new Set();
  const maxConcurrency = Math.max(
    1,
    Math.min(2, Number(options.maxConcurrency) || 2),
  );
  const schedule = (delay = DURABLE_TURN_POLL_MS) => {
    if (stopped) return;
    if (timer) (options.clearTimeoutImpl ?? clearTimeout)(timer);
    timer = (options.setTimeoutImpl ?? setTimeout)(pump, delay);
    timer?.unref?.();
  };
  const execute = (claim, channelConfig) => {
    const controller = new AbortController();
    controllers.add(controller);
    const task = (async () => {
      let result = { ok: false, status: 0 };
      try {
        result = await options.executeClaim(claim, channelConfig, {
          signal: controller.signal,
        });
      } catch {
        result = { ok: false, status: 0 };
      }
      if (!result?.ok && result?.dispatchInvoked !== true) {
        await postDurableTurnAction("requeue", claim, channelConfig, {
          fetchImpl: options.fetchImpl,
          env,
          reason:
            result?.status === 409 && result?.code === "runtime_session_busy"
              ? "runtime_session_busy"
              : "runtime_dispatch_unavailable",
        });
      }
    })();
    active.add(task);
    void task.finally(() => {
      active.delete(task);
      controllers.delete(controller);
      schedule(0);
    });
  };
  const pump = async () => {
    if (stopped || pumping) return;
    pumping = true;
    try {
      while (!stopped && active.size < maxConcurrency) {
        const channelConfig = configuredChannel(options.loadConfig);
        const claim = await claimDurableTurn(channelConfig, {
          fetchImpl: options.fetchImpl,
          env,
        });
        if (!claim) break;
        execute(claim, channelConfig);
      }
    } catch {
      options.logger?.warn?.(
        "[mc-chat] durable turn poll failed; retrying without exposing claim data",
      );
    } finally {
      pumping = false;
      schedule();
    }
  };
  void pump();
  return async () => {
    stopped = true;
    if (timer) (options.clearTimeoutImpl ?? clearTimeout)(timer);
    for (const controller of controllers) controller.abort();
    await Promise.allSettled([...active]);
  };
}
