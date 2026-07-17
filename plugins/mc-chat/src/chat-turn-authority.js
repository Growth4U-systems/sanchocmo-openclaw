import { timingSafeEqual } from "node:crypto";

const RESPONSE_MAX_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;
const LEASE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const AGENT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function matchesConfiguredSecret(provided, expected) {
  if (
    typeof provided !== "string" ||
    typeof expected !== "string" ||
    !provided ||
    !expected ||
    Buffer.byteLength(provided, "utf8") > 4_096 ||
    Buffer.byteLength(expected, "utf8") > 4_096
  ) {
    return false;
  }
  const supplied = Buffer.from(provided);
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

export function validatedControlPlaneOrigin(value) {
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

function claimsFromPayload(payload) {
  return {
    slug: payload.slug,
    threadId: payload.threadId,
    text: payload.text,
    runtimeAuthorityText: payload.runtimeAuthorityText,
    agent: payload.agent,
    agentId: payload.agentId,
    skill: payload.skill,
    skills: payload.skills,
    primarySkill: payload.primarySkill,
    scope: payload.scope,
    skillMode: payload.skillMode,
    temporaryAgent: payload.temporaryAgent === true,
    controlDepth: payload.controlDepth,
    isAdmin: payload.isAdmin,
    senderRole: payload.senderRole,
    readOnly: payload.readOnly,
    userId: payload.userId,
    userName: payload.userName,
    source: payload._source,
    activeOutboundWorkflow: payload.activeOutboundWorkflow,
    threadName: payload.threadName,
    linkedTo: payload.linkedTo,
    docPath: payload.docPath,
    docKind: payload.docKind,
    attachments: payload.attachments,
    channelMode: payload.channelMode,
    supportContext: payload.supportContext,
    priorThreadMessages: payload.priorThreadMessages,
    taskRouteProposal: payload.taskRouteProposal,
    threadState: payload.threadState,
    controlBaseUrl: payload.controlBaseUrl,
  };
}

function safeAuthority(value) {
  if (!isRecord(value)) return null;
  if (
    typeof value.slug !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,119}$/.test(value.slug) ||
    typeof value.threadId !== "string" ||
    !value.threadId.startsWith(`${value.slug}:`) ||
    Buffer.byteLength(value.threadId, "utf8") > 512 ||
    typeof value.agent !== "string" ||
    !AGENT_PATTERN.test(value.agent) ||
    (value.scope !== "agent" && value.scope !== "skill" && value.scope !== "task") ||
    (value.skillMode !== "auto" && value.skillMode !== "pinned") ||
    typeof value.temporaryAgent !== "boolean" ||
    (value.controlDepth !== 0 && value.controlDepth !== 1) ||
    typeof value.isAdmin !== "boolean" ||
    (value.senderRole !== "admin" && value.senderRole !== "client") ||
    typeof value.readOnly !== "boolean" ||
    typeof value.userId !== "string" ||
    (value.isAdmin
      ? value.senderRole !== "admin" || value.userId !== "mc-admin"
      : value.senderRole !== "client" || value.userId === "mc-admin") ||
    (value.skills !== undefined &&
      (!Array.isArray(value.skills) ||
        !value.skills.every((item) => typeof item === "string")))
  ) {
    return null;
  }
  return value;
}

export async function authorizeChatTurnWithControlPlane(
  payload,
  channelConfig,
  dependencies = {},
) {
  const origin = validatedControlPlaneOrigin(channelConfig?.mcServerUrl);
  const secret =
    typeof channelConfig?.sharedSecret === "string"
      ? channelConfig.sharedSecret.trim()
      : "";
  const runId = payload?.missionControlRunId;
  const capability = payload?.runtimeToolCapability;
  const dispatchRunId = dependencies.dispatchRunId;
  const dispatchLeaseToken = dependencies.dispatchLeaseToken;
  const hasDispatchRunId = dispatchRunId !== undefined;
  const hasDispatchLeaseToken = dispatchLeaseToken !== undefined;
  if (
    !origin ||
    !secret ||
    Buffer.byteLength(secret, "utf8") > 4_096 ||
    /[\u0000-\u001f\u007f]/.test(secret) ||
    typeof runId !== "string" ||
    !RUN_ID_PATTERN.test(runId) ||
    typeof capability !== "string" ||
    !CAPABILITY_PATTERN.test(capability) ||
    hasDispatchRunId !== hasDispatchLeaseToken ||
    (hasDispatchRunId &&
      (typeof dispatchRunId !== "string" ||
        !RUN_ID_PATTERN.test(dispatchRunId) ||
        typeof dispatchLeaseToken !== "string" ||
        !LEASE_TOKEN_PATTERN.test(dispatchLeaseToken)))
  ) {
    return null;
  }
  try {
    const response = await (dependencies.fetchImpl ?? fetch)(
      `${origin}/api/runtime/chat-turn-authority`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MC-Secret": secret,
          "X-Mission-Control-Run-Id": runId,
          "X-Sancho-Run-Capability": capability,
          ...(hasDispatchRunId
            ? {
                "X-Sancho-Dispatch-Run-Id": dispatchRunId,
                "X-Sancho-Dispatch-Lease-Token": dispatchLeaseToken,
              }
            : {}),
        },
        body: JSON.stringify(claimsFromPayload(payload)),
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const raw = await boundedResponseText(response);
    if (!response.ok || raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.ok !== true) return null;
    return safeAuthority(parsed.authority);
  } catch {
    return null;
  }
}
