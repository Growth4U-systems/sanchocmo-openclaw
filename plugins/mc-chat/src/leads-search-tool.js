import fs from "node:fs";
import path from "node:path";
import { runtimeRunAuthorityFor } from "./runtime-run-state.js";

export const LEADS_SEARCH_START_TOOL = "leads_search_start";

const CHANNEL_KEY = "mc-chat";
const ADMIN_SENDER_ID = "mc-admin";
const TENANT_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const THREAD_ID_PATTERN = /^[a-z0-9][A-Za-z0-9:_-]{1,511}$/;
const SAFE_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const SAFE_ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{1,95}$/;
const RESPONSE_MAX_BYTES = 64 * 1024;
const REQUEST_MAX_BYTES = 8 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const RUN_ID_MAX_BYTES = 160;
const RUNTIME_CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;
const SEARCH_STATUSES = new Set([
  "queued",
  "running",
  "waiting_approval",
  "blocked",
  "completed",
  "partial",
  "failed",
  "cancelled",
]);
const SEARCH_FIELDS = new Set([
  "operation",
  "runId",
  "status",
  "completionBoundary",
  "created",
  "replayed",
]);

// Keep the model-facing schema deliberately conservative for GLM/OpenClaw
// compatibility. The execute boundary and the server API enforce every
// semantic, shape and byte limit below; the schema is only a generation hint.
const stringListHint = () => ({
  type: "array",
  items: { type: "string" },
});

export const leadsSearchStartParameters = Object.freeze({
  type: "object",
  required: ["criteria"],
  properties: {
    criteria: {
      type: "object",
      properties: {
        query: { type: "string" },
        titles: stringListHint(),
        seniorities: stringListHint(),
        personLocations: stringListHint(),
        organizationLocations: stringListHint(),
        organizationDomains: stringListHint(),
        employeeRanges: stringListHint(),
        emailStatuses: stringListHint(),
      },
    },
    limit: {
      type: "integer",
      description: "Maximum compact candidates from the first provider page.",
    },
  },
});

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPlainRecord(value) {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const CRITERIA_FIELD_MAX_BYTES = Object.freeze({
  titles: 160,
  seniorities: 48,
  personLocations: 160,
  organizationLocations: 160,
  organizationDomains: 253,
  employeeRanges: 32,
  emailStatuses: 48,
});
const CRITERIA_FIELDS = new Set([
  "query",
  ...Object.keys(CRITERIA_FIELD_MAX_BYTES),
]);
const APOLLO_SENIORITIES = new Set([
  "owner",
  "founder",
  "c_suite",
  "partner",
  "vp",
  "head",
  "director",
  "manager",
  "senior",
  "entry",
  "intern",
]);
const APOLLO_EMAIL_STATUSES = new Set([
  "verified",
  "unverified",
  "likely to engage",
  "unavailable",
]);

function canonicalInputText(value, maxBytes) {
  if (typeof value !== "string") return null;
  const parsed = value.trim();
  return parsed &&
    Buffer.byteLength(parsed, "utf8") <= maxBytes &&
    !/[\u0000-\u001f\u007f]/.test(parsed)
    ? parsed
    : null;
}

function canonicalInputDomain(value) {
  const domain = canonicalInputText(value, 253)
    ?.toLowerCase()
    .replace(/\.$/, "");
  const labels = domain?.split(".") ?? [];
  return labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
    ? domain
    : null;
}

function canonicalEmployeeRange(value) {
  const parsed = canonicalInputText(value, 32);
  if (!parsed || !/^\d{1,8},\d{1,8}$/.test(parsed)) return null;
  const [minimum, maximum] = parsed.split(",").map(Number);
  return Number.isSafeInteger(minimum) &&
    Number.isSafeInteger(maximum) &&
    minimum >= 0 &&
    maximum >= 1 &&
    minimum <= maximum
    ? `${minimum},${maximum}`
    : null;
}

function canonicalCriteriaList(field, value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    return null;
  }
  const parsed = value.map((item) => {
    if (field === "organizationDomains") return canonicalInputDomain(item);
    if (field === "employeeRanges") return canonicalEmployeeRange(item);
    const text = canonicalInputText(item, CRITERIA_FIELD_MAX_BYTES[field]);
    if (field === "seniorities") {
      const normalized = text?.toLowerCase();
      return normalized && APOLLO_SENIORITIES.has(normalized)
        ? normalized
        : null;
    }
    if (field === "emailStatuses") {
      const normalized = text?.toLowerCase();
      return normalized && APOLLO_EMAIL_STATUSES.has(normalized)
        ? normalized
        : null;
    }
    return text;
  });
  if (parsed.some((item) => !item)) return null;
  const identities = parsed.map((item) => item.toLowerCase());
  return new Set(identities).size === identities.length ? parsed : null;
}

function canonicalStartInput(value) {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).some((key) => key !== "criteria" && key !== "limit") ||
    !isPlainRecord(value.criteria)
  ) {
    return null;
  }
  const criteriaKeys = Object.keys(value.criteria);
  if (
    criteriaKeys.length < 1 ||
    criteriaKeys.some((key) => !CRITERIA_FIELDS.has(key))
  ) {
    return null;
  }
  const criteria = {};
  for (const field of criteriaKeys) {
    if (field === "query") {
      const query = canonicalInputText(value.criteria.query, 500);
      if (!query) return null;
      criteria.query = query;
      continue;
    }
    const list = canonicalCriteriaList(field, value.criteria[field]);
    if (!list) return null;
    criteria[field] = list;
  }
  const limit = value.limit === undefined ? 10 : value.limit;
  if (
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 10
  ) {
    return null;
  }
  return { criteria, limit };
}

function homeDirectory() {
  return process.env.OPENCLAW_HOME || process.cwd();
}

export function isKnownSanchoClient(slug, home = homeDirectory()) {
  const candidates = [
    path.join(home, "config", "clients.json"),
    path.join(home, "workspace-sancho", "clients.json"),
  ];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      const clients = Array.isArray(parsed?.clients) ? parsed.clients : [];
      return clients.some((client) => isRecord(client) && client.slug === slug);
    } catch {
      // Try the compatibility path. Missing or malformed state fails closed.
    }
  }
  return false;
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
  const missionControlRunId = authority?.missionControlRunId;
  const runtimeToolCapability = authority?.runtimeToolCapability;
  if (
    typeof missionControlRunId !== "string" ||
    Buffer.byteLength(missionControlRunId, "utf8") > RUN_ID_MAX_BYTES ||
    !SAFE_RUN_ID_PATTERN.test(missionControlRunId) ||
    typeof runtimeToolCapability !== "string" ||
    !RUNTIME_CAPABILITY_PATTERN.test(runtimeToolCapability) ||
    authority.allowExternalEffects !== true
  ) {
    return null;
  }
  return {
    tenantSlug,
    threadId,
    missionControlRunId,
    runtimeToolCapability,
    ...(authority.dispatchRunId && authority.dispatchLeaseToken
      ? {
          dispatchRunId: authority.dispatchRunId,
          dispatchLeaseToken: authority.dispatchLeaseToken,
        }
      : {}),
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
      "Los criterios no cumplen el contrato acotado de búsqueda. No inicié ninguna ejecución.",
      safeCode || "leads_search_request_invalid",
      status,
    );
  }
  if (status === 403) {
    return failedResult(
      safeCode === "leads_search_not_enabled"
        ? "La búsqueda nativa de leads no está habilitada para este cliente. No inicié ninguna ejecución."
        : "La búsqueda de leads no está autorizada para este cliente. No inicié ninguna ejecución.",
      safeCode || "leads_search_agent_unauthorized",
      status,
    );
  }
  if (status === 404) {
    return failedResult(
      "No existe una búsqueda con ese identificador dentro de este cliente.",
      safeCode || "leads_search_not_found",
      status,
    );
  }
  if (status === 409) {
    return failedResult(
      "Este turno ya está vinculado a otros criterios. No inicié una segunda búsqueda.",
      safeCode || "execution_command_conflict",
      status,
    );
  }
  if (status === 429) {
    return failedResult(
      "El límite de búsquedas está temporalmente alcanzado. Inténtalo de nuevo más tarde.",
      safeCode || "leads_search_rate_limited",
      status,
    );
  }
  return failedResult(
    "El servicio de búsqueda no está disponible temporalmente. No inicié una ejecución alternativa.",
    safeCode || "leads_search_unavailable",
    status >= 500 ? status : 503,
  );
}

function safeSearch(value) {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => !SEARCH_FIELDS.has(key))) return null;
  const runId = typeof value.runId === "string" ? value.runId : "";
  const status = typeof value.status === "string" ? value.status : "";
  const completionBoundary =
    typeof value.completionBoundary === "string"
      ? value.completionBoundary
      : "";
  if (
    value.operation !== "leads.search" ||
    !SAFE_RUN_ID_PATTERN.test(runId) ||
    !SEARCH_STATUSES.has(status) ||
    (completionBoundary !== "ledger_admitted" &&
      completionBoundary !== "search_completed")
  ) {
    return null;
  }
  return {
    operation: "leads.search",
    runId,
    status,
    completionBoundary,
    ...(typeof value.created === "boolean" ? { created: value.created } : {}),
    ...(typeof value.replayed === "boolean"
      ? { replayed: value.replayed }
      : {}),
  };
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
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > RESPONSE_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function requestSignal(signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
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

function successfulSearchResult(search) {
  // The closed response contract contains no provider rows or status URL. The
  // terminal projector, not another model-controlled request, publishes the
  // deterministic user result in the originating chat.
  const modelPayload = {
    ok: true,
    search,
    resultDelivery: "same_chat_thread",
  };
  return toolResult(JSON.stringify(modelPayload, null, 2), {
    status: "completed",
    search,
    resultDelivery: "same_chat_thread",
  });
}

async function callControlPlane(runtimeTarget, request, signal, dependencies) {
  const config = dependencies.loadConfig?.();
  const channel = config?.channels?.[CHANNEL_KEY];
  const baseUrl = validatedControlPlaneOrigin(channel?.mcServerUrl);
  const sharedSecret = validatedSharedSecret(channel?.sharedSecret);
  if (!baseUrl || !sharedSecret) {
    return failedResult(
      "La herramienta de búsqueda no está configurada de forma segura.",
      "leads_search_agent_bridge_unavailable",
      503,
    );
  }

  try {
    const serializedBody = request.body
      ? JSON.stringify(request.body)
      : undefined;
    if (
      serializedBody &&
      Buffer.byteLength(serializedBody, "utf8") > REQUEST_MAX_BYTES
    ) {
      return stableFailure(400, "leads_search_request_invalid");
    }
    const response = await (dependencies.fetchImpl ?? fetch)(
      `${baseUrl}/api/runtime/leads-search${request.query || ""}`,
      {
        method: request.method,
        headers: {
          "Content-Type": "application/json",
          "X-MC-Secret": sharedSecret,
          "X-Mission-Control-Run-Id": runtimeTarget.missionControlRunId,
          "X-Sancho-Run-Capability": runtimeTarget.runtimeToolCapability,
          ...(runtimeTarget.dispatchRunId && runtimeTarget.dispatchLeaseToken
            ? {
                "X-Sancho-Dispatch-Run-Id": runtimeTarget.dispatchRunId,
                "X-Sancho-Dispatch-Lease-Token":
                  runtimeTarget.dispatchLeaseToken,
              }
            : {}),
        },
        ...(serializedBody ? { body: serializedBody } : {}),
        redirect: "error",
        signal: requestSignal(signal),
      },
    );
    const raw = await boundedResponseText(response);
    if (raw === null) {
      return stableFailure(503, "leads_search_response_invalid");
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
    const search = isRecord(payload) ? safeSearch(payload.search) : null;
    if (!search) return stableFailure(503, "leads_search_response_invalid");
    return successfulSearchResult(search);
  } catch {
    return stableFailure(503, "leads_search_unavailable");
  }
}

export function createLeadsSearchToolsForContext(context, dependencies = {}) {
  const runtimeTarget = canonicalRuntimeTarget(context, dependencies);
  if (!runtimeTarget) return null;

  return [
    {
      name: LEADS_SEARCH_START_TOOL,
      label: "Start bounded Leads search",
      description:
        "Admit one bounded, first-page Leads search into Sancho's durable execution ledger. Tenant and idempotency come from the authenticated chat turn; never provide a tenant. Returns only the durable run receipt. The terminal result is published automatically in this same chat thread; call this tool once and do not wait, sleep, poll, or request status.",
      parameters: leadsSearchStartParameters,
      async execute(_toolCallId, params, signal) {
        const input = canonicalStartInput(params);
        if (!input) {
          return stableFailure(400, "leads_search_request_invalid");
        }
        return callControlPlane(
          runtimeTarget,
          {
            method: "POST",
            body: {
              criteria: input.criteria,
              limit: input.limit,
            },
          },
          signal,
          dependencies,
        );
      },
    },
  ];
}

export function registerLeadsSearchTools(api, dependencies = {}) {
  api.registerTool(
    (context) => createLeadsSearchToolsForContext(context, dependencies),
    { names: [LEADS_SEARCH_START_TOOL] },
  );
}
