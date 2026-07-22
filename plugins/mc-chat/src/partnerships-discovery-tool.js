import {
  parsePartnershipsDiscoveryStartInput,
  partnershipsDiscoveryStartParameters,
} from "../../../src/lib/runtime/partnerships-discovery-tool-contract.mjs";
import { isKnownSanchoClient } from "./leads-search-tool.js";
import { runtimeRunAuthorityFor } from "./runtime-run-state.js";

export const PARTNERSHIPS_DISCOVERY_START_TOOL = "partnerships_discovery_start";

const CHANNEL_KEY = "mc-chat";
const ADMIN_SENDER_ID = "mc-admin";
const TENANT_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const THREAD_ID_PATTERN = /^[a-z0-9][A-Za-z0-9:_-]{1,511}$/;
const SAFE_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const SAFE_ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{1,95}$/;
const LEASE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const RUNTIME_CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;
const RESPONSE_MAX_BYTES = 64 * 1024;
const REQUEST_MAX_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const RECEIPT_FIELDS = new Set([
  "operation",
  "runId",
  "setupRunId",
  "discoveryRunId",
  "searchId",
  "status",
  "completionBoundary",
  "created",
  "replayed",
]);
const RECEIPT_STATUSES = new Set(["queued", "running", "completed"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalRuntimeTarget(context, dependencies) {
  if (
    context?.messageChannel !== CHANNEL_KEY ||
    context?.deliveryContext?.channel !== CHANNEL_KEY ||
    context?.requesterSenderId !== ADMIN_SENDER_ID
  ) {
    return null;
  }
  const to = context.deliveryContext.to;
  const prefix = `channel:${CHANNEL_KEY}:`;
  if (typeof to !== "string" || !to.startsWith(prefix)) return null;
  const threadId = to.slice(prefix.length);
  if (
    Buffer.byteLength(threadId, "utf8") > 512 ||
    !THREAD_ID_PATTERN.test(threadId)
  ) {
    return null;
  }
  const separator = threadId.indexOf(":");
  if (separator <= 0) return null;
  const tenantSlug = threadId.slice(0, separator).toLowerCase();
  if (
    !TENANT_PATTERN.test(tenantSlug) ||
    !threadId.startsWith(`${tenantSlug}:`) ||
    !(dependencies.clientExists ?? isKnownSanchoClient)(tenantSlug)
  ) {
    return null;
  }
  const authority = (dependencies.runAuthorityFor ?? runtimeRunAuthorityFor)(
    tenantSlug,
    threadId,
    context.agentId,
  );
  if (
    !authority ||
    typeof authority.missionControlRunId !== "string" ||
    !SAFE_RUN_ID_PATTERN.test(authority.missionControlRunId) ||
    typeof authority.runtimeToolCapability !== "string" ||
    !RUNTIME_CAPABILITY_PATTERN.test(authority.runtimeToolCapability) ||
    typeof authority.dispatchRunId !== "string" ||
    !SAFE_RUN_ID_PATTERN.test(authority.dispatchRunId) ||
    typeof authority.dispatchLeaseToken !== "string" ||
    !LEASE_TOKEN_PATTERN.test(authority.dispatchLeaseToken) ||
    authority.allowExternalEffects !== true ||
    !authority.allowedExternalEffects?.includes(
      PARTNERSHIPS_DISCOVERY_START_TOOL,
    )
  ) {
    return null;
  }
  return {
    tenantSlug,
    threadId,
    missionControlRunId: authority.missionControlRunId,
    runtimeToolCapability: authority.runtimeToolCapability,
    dispatchRunId: authority.dispatchRunId,
    dispatchLeaseToken: authority.dispatchLeaseToken,
  };
}

function toolResult(text, details) {
  return { content: [{ type: "text", text }], details };
}

function failedResult(message, code, httpStatus) {
  return toolResult(message, {
    status: "failed",
    code,
    ...(httpStatus ? { httpStatus } : {}),
  });
}

function stableFailure(status, code) {
  const safeCode = SAFE_ERROR_CODE_PATTERN.test(code || "") ? code : undefined;
  if (status === 400) {
    return failedResult(
      "El plan no cumple el contrato acotado de búsqueda de partners. No inicié ninguna ejecución.",
      safeCode || "partnerships_discovery_request_invalid",
      status,
    );
  }
  if (status === 403) {
    return failedResult(
      safeCode === "partnerships_discovery_not_enabled"
        ? "La búsqueda nativa de partners no está habilitada para este cliente. No inicié ninguna ejecución."
        : "La búsqueda de partners no está autorizada para este turno. No inicié ninguna ejecución.",
      safeCode || "partnerships_discovery_agent_unauthorized",
      status,
    );
  }
  if (status === 409) {
    return failedResult(
      "Este turno ya está vinculado a otro plan. No inicié una segunda búsqueda.",
      safeCode || "execution_command_conflict",
      status,
    );
  }
  if (status === 429) {
    return failedResult(
      "El límite de búsquedas está temporalmente alcanzado. Inténtalo de nuevo más tarde.",
      safeCode || "partnerships_discovery_rate_limited",
      status,
    );
  }
  return failedResult(
    "El servicio de búsqueda de partners no está disponible temporalmente. No inicié una ejecución alternativa.",
    safeCode || "partnerships_discovery_unavailable",
    status >= 500 ? status : 503,
  );
}

function safeReceipt(value) {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !RECEIPT_FIELDS.has(key)) ||
    value.operation !== "partnerships.discovery" ||
    typeof value.runId !== "string" ||
    !SAFE_RUN_ID_PATTERN.test(value.runId) ||
    value.setupRunId !== value.runId ||
    typeof value.searchId !== "string" ||
    !SAFE_RUN_ID_PATTERN.test(value.searchId) ||
    !RECEIPT_STATUSES.has(value.status) ||
    (value.completionBoundary !== "ledger_admitted" &&
      value.completionBoundary !== "discovery_admitted") ||
    (value.discoveryRunId !== undefined &&
      (typeof value.discoveryRunId !== "string" ||
        !SAFE_RUN_ID_PATTERN.test(value.discoveryRunId)))
  ) {
    return null;
  }
  return {
    operation: "partnerships.discovery",
    runId: value.runId,
    setupRunId: value.setupRunId,
    ...(value.discoveryRunId ? { discoveryRunId: value.discoveryRunId } : {}),
    searchId: value.searchId,
    status: value.status,
    completionBoundary: value.completionBoundary,
    ...(typeof value.created === "boolean" ? { created: value.created } : {}),
    ...(typeof value.replayed === "boolean"
      ? { replayed: value.replayed }
      : {}),
  };
}

function validatedControlPlaneOrigin(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    /[\u0000-\u0020\u007f]/.test(value)
  ) {
    return null;
  }
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function validatedSharedSecret(value) {
  if (typeof value !== "string") return null;
  const secret = value.trim();
  return secret &&
    Buffer.byteLength(secret, "utf8") <= 4_096 &&
    !/[\u0000-\u001f\u007f]/.test(secret)
    ? secret
    : null;
}

async function boundedResponseText(response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > RESPONSE_MAX_BYTES) {
    return null;
  }
  if (!response.body?.getReader) {
    const raw = await response.text();
    return Buffer.byteLength(raw, "utf8") <= RESPONSE_MAX_BYTES ? raw : null;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > RESPONSE_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

function successfulResult(receipt) {
  const payload = {
    ok: true,
    discovery: receipt,
    resultDelivery: "same_chat_thread",
  };
  return toolResult(JSON.stringify(payload, null, 2), {
    status: "completed",
    discovery: receipt,
    resultDelivery: "same_chat_thread",
  });
}

async function callControlPlane(runtimeTarget, input, signal, dependencies) {
  const channel = dependencies.loadConfig?.()?.channels?.[CHANNEL_KEY];
  const baseUrl = validatedControlPlaneOrigin(channel?.mcServerUrl);
  const sharedSecret = validatedSharedSecret(channel?.sharedSecret);
  if (!baseUrl || !sharedSecret) {
    return failedResult(
      "La herramienta de búsqueda de partners no está configurada de forma segura.",
      "partnerships_discovery_agent_bridge_unavailable",
      503,
    );
  }
  const body = JSON.stringify(input);
  if (Buffer.byteLength(body, "utf8") > REQUEST_MAX_BYTES) {
    return stableFailure(400, "partnerships_discovery_request_invalid");
  }
  try {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const response = await (dependencies.fetchImpl ?? fetch)(
      `${baseUrl}/api/runtime/partnerships-discovery`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MC-Secret": sharedSecret,
          "X-Mission-Control-Run-Id": runtimeTarget.missionControlRunId,
          "X-Sancho-Run-Capability": runtimeTarget.runtimeToolCapability,
          "X-Sancho-Dispatch-Run-Id": runtimeTarget.dispatchRunId,
          "X-Sancho-Dispatch-Lease-Token": runtimeTarget.dispatchLeaseToken,
        },
        body,
        redirect: "error",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      },
    );
    const raw = await boundedResponseText(response);
    if (raw === null) {
      return stableFailure(503, "partnerships_discovery_response_invalid");
    }
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }
    const code =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : undefined;
    if (!response.ok) return stableFailure(response.status, code);
    const receipt = isRecord(payload) ? safeReceipt(payload.discovery) : null;
    return receipt
      ? successfulResult(receipt)
      : stableFailure(503, "partnerships_discovery_response_invalid");
  } catch {
    return stableFailure(503, "partnerships_discovery_unavailable");
  }
}

export function createPartnershipsDiscoveryToolsForContext(
  context,
  dependencies = {},
) {
  const runtimeTarget = canonicalRuntimeTarget(context, dependencies);
  if (!runtimeTarget) return null;
  return [
    {
      name: PARTNERSHIPS_DISCOVERY_START_TOOL,
      label: "Start bounded Partnerships discovery",
      description:
        "Admit one bounded Instagram Partnerships discovery into Sancho's durable execution ledger. Tenant, chat origin, execution mode and idempotency come from the authenticated durable turn. Returns only a durable receipt; the terminal result is published automatically in this same chat thread. Call once and do not wait, sleep, poll, use Bash/curl, or request status.",
      parameters: partnershipsDiscoveryStartParameters,
      async execute(_toolCallId, params, signal) {
        const input = parsePartnershipsDiscoveryStartInput(params);
        if (!input) {
          return stableFailure(400, "partnerships_discovery_request_invalid");
        }
        return callControlPlane(runtimeTarget, input, signal, dependencies);
      },
    },
  ];
}

export function registerPartnershipsDiscoveryTools(api, dependencies = {}) {
  api.registerTool(
    (context) =>
      createPartnershipsDiscoveryToolsForContext(context, dependencies),
    { names: [PARTNERSHIPS_DISCOVERY_START_TOOL] },
  );
}
