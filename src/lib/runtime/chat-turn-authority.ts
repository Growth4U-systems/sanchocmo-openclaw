import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { AgentRun } from "@/lib/data/agent-runs";
import { textWithActiveOutboundWorkflow } from "@/lib/runtime/adapters/openclaw/messaging";
import { canonicalThreadId, parseThreadId } from "@/lib/thread-id";
import { isFreshRuntimeToolCapability } from "@/lib/runtime/runtime-tool-capability";

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;

export interface RuntimeChatTurnClaims {
  slug?: unknown;
  threadId?: unknown;
  text?: unknown;
  runtimeAuthorityText?: unknown;
  agent?: unknown;
  agentId?: unknown;
  skill?: unknown;
  skills?: unknown;
  primarySkill?: unknown;
  scope?: unknown;
  skillMode?: unknown;
  temporaryAgent?: unknown;
  controlDepth?: unknown;
  isAdmin?: unknown;
  senderRole?: unknown;
  readOnly?: unknown;
  userId?: unknown;
  userName?: unknown;
  source?: unknown;
  activeOutboundWorkflow?: unknown;
  threadName?: unknown;
  linkedTo?: unknown;
  docPath?: unknown;
  docKind?: unknown;
  attachments?: unknown;
  channelMode?: unknown;
  supportContext?: unknown;
  priorThreadMessages?: unknown;
  taskRouteProposal?: unknown;
  threadState?: unknown;
  controlBaseUrl?: unknown;
}

export interface RuntimeChatTurnAuthority {
  slug: string;
  threadId: string;
  agent: string;
  skill?: string;
  skills?: string[];
  primarySkill?: string;
  scope: "agent" | "skill" | "task";
  skillMode: "auto" | "pinned";
  temporaryAgent: boolean;
  controlDepth: 0 | 1;
  isAdmin: boolean;
  senderRole: "admin" | "client";
  readOnly: boolean;
  userId: string;
  userName?: string;
  source?: string;
  activeOutboundWorkflow?: unknown;
}

export interface RuntimeChatTurnAuthorityDependencies {
  resolveAgentRun(runId: string): Promise<AgentRun | null>;
  authorizeDispatchLease?: (input: {
    parentAgentRunId: unknown;
    dispatchRunId: unknown;
    leaseToken: unknown;
    runtimeToolCapability: unknown;
    allowTerminalParent?: boolean;
    allowCancellationRequested?: boolean;
  }) => Promise<{ parentRun: AgentRun } | null>;
  clientExists(slug: string): boolean;
  now?: () => Date;
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

function capabilityMatches(raw: string, digest: unknown): boolean {
  if (
    !CAPABILITY_PATTERN.test(raw) ||
    typeof digest !== "string" ||
    !CAPABILITY_PATTERN.test(digest)
  ) {
    return false;
  }
  const actual = crypto.createHash("sha256").update(raw).digest();
  const expected = Buffer.from(digest, "hex");
  return (
    expected.length === actual.length && crypto.timingSafeEqual(actual, expected)
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

export async function authorizeRuntimeChatTurn(
  input: {
    runId: unknown;
    capability: unknown;
    dispatchRunId?: unknown;
    dispatchLeaseToken?: unknown;
    claims: RuntimeChatTurnClaims;
  },
  dependencies: RuntimeChatTurnAuthorityDependencies,
): Promise<RuntimeChatTurnAuthority | null> {
  if (
    typeof input.runId !== "string" ||
    !RUN_ID_PATTERN.test(input.runId) ||
    typeof input.capability !== "string" ||
    !CAPABILITY_PATTERN.test(input.capability) ||
    !plainRecord(input.claims)
  ) {
    return null;
  }
  const hasDispatchRunId = input.dispatchRunId !== undefined;
  const hasDispatchLeaseToken = input.dispatchLeaseToken !== undefined;
  if (hasDispatchRunId !== hasDispatchLeaseToken) return null;
  let run: AgentRun | null;
  let dispatchAuthorized = false;
  if (hasDispatchRunId) {
    if (!dependencies.authorizeDispatchLease) return null;
    const authority = await dependencies.authorizeDispatchLease({
      parentAgentRunId: input.runId,
      dispatchRunId: input.dispatchRunId,
      leaseToken: input.dispatchLeaseToken,
      runtimeToolCapability: input.capability,
      allowTerminalParent: false,
    });
    if (!authority) return null;
    run = authority.parentRun;
    dispatchAuthorized = true;
  } else {
    run = await dependencies.resolveAgentRun(input.runId);
  }
  const persisted = plainRecord(run?.input);
  const parsedThread = parseThreadId(run?.threadId);
  if (
    !run ||
    run.id !== input.runId ||
    (run.status !== "queued" && run.status !== "running") ||
    run.runtime !== "openclaw" ||
    (!dispatchAuthorized &&
      !isFreshRuntimeToolCapability(
        run,
        (dependencies.now?.() ?? new Date()).getTime(),
      )) ||
    !persisted ||
    !parsedThread ||
    parsedThread.slug !== parsedThread.slug.toLowerCase() ||
    canonicalThreadId(run.threadId) !== run.threadId ||
    persisted.slug !== parsedThread.slug ||
    persisted.threadId !== run.threadId ||
    !dependencies.clientExists(parsedThread.slug) ||
    (!dispatchAuthorized &&
      !capabilityMatches(
        input.capability,
        persisted.runtimeToolCapabilitySha256,
      ))
  ) {
    return null;
  }

  const agent = optionalString(run.agent);
  const scope = persisted.scope;
  const skillMode = run.skillMode;
  const isAdmin = persisted.isAdmin;
  const senderRole = persisted.senderRole;
  const readOnly = persisted.readOnly;
  const controlDepth = persisted.controlDepth;
  const userId = persisted.userId;
  if (
    !agent ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(agent) ||
    (scope !== "agent" && scope !== "skill" && scope !== "task") ||
    (skillMode !== "auto" && skillMode !== "pinned") ||
    typeof isAdmin !== "boolean" ||
    (senderRole !== "admin" && senderRole !== "client") ||
    typeof readOnly !== "boolean" ||
    (controlDepth !== 0 && controlDepth !== 1) ||
    typeof userId !== "string" ||
    (isAdmin
      ? senderRole !== "admin" || userId !== "mc-admin"
      : senderRole !== "client" || userId === "mc-admin")
  ) {
    return null;
  }

  const expected = {
    slug: parsedThread.slug,
    threadId: run.threadId,
    runtimeAuthorityText: persisted.text,
    text: textWithActiveOutboundWorkflow({
      slug: parsedThread.slug,
      threadId: run.threadId,
      missionControlRunId: run.id,
      text: persisted.text as string,
      userId,
      userName:
        typeof persisted.userName === "string" ? persisted.userName : userId,
      skill: optionalString(run.skill),
      skills: stringArray(run.skills),
      primarySkill: optionalString(persisted.primarySkill),
      scope,
      skillMode,
      temporaryAgent: persisted.temporaryAgent === true,
      activeOutboundWorkflow:
        persisted.activeOutboundWorkflow as never,
      controlBaseUrl: optionalString(persisted.controlBaseUrl),
      isAdmin,
      senderRole,
      readOnly,
      agent,
      agentId: agent,
    }),
    agent,
    agentId: agent,
    skill: run.skill,
    skills: run.skills,
    primarySkill: persisted.primarySkill,
    scope,
    skillMode,
    temporaryAgent: persisted.temporaryAgent === true,
    controlDepth,
    isAdmin,
    senderRole,
    readOnly,
    userId,
    userName: persisted.userName,
    source: persisted.source,
    activeOutboundWorkflow: persisted.activeOutboundWorkflow,
    threadName: persisted.threadName,
    linkedTo: persisted.linkedTo,
    docPath: persisted.docPath,
    docKind: persisted.docKind,
    attachments: persisted.attachments,
    channelMode: persisted.channelMode,
    supportContext: persisted.supportContext,
    priorThreadMessages: persisted.priorThreadMessages,
    taskRouteProposal: persisted.taskRouteProposal,
    threadState: persisted.threadState,
    controlBaseUrl: persisted.controlBaseUrl,
  };
  const claimed = {
    slug: input.claims.slug,
    threadId: input.claims.threadId,
    runtimeAuthorityText: input.claims.runtimeAuthorityText,
    text: input.claims.text,
    agent: input.claims.agent,
    agentId: input.claims.agentId,
    skill: input.claims.skill,
    skills: input.claims.skills,
    primarySkill: input.claims.primarySkill,
    scope: input.claims.scope,
    skillMode: input.claims.skillMode,
    temporaryAgent: input.claims.temporaryAgent === true,
    controlDepth: input.claims.controlDepth,
    isAdmin: input.claims.isAdmin,
    senderRole: input.claims.senderRole,
    readOnly: input.claims.readOnly,
    userId: input.claims.userId,
    userName: input.claims.userName,
    source: input.claims.source,
    activeOutboundWorkflow: input.claims.activeOutboundWorkflow,
    threadName: input.claims.threadName,
    linkedTo: input.claims.linkedTo,
    docPath: input.claims.docPath,
    docKind: input.claims.docKind,
    attachments: input.claims.attachments,
    channelMode: input.claims.channelMode,
    supportContext: input.claims.supportContext,
    priorThreadMessages: input.claims.priorThreadMessages,
    taskRouteProposal: input.claims.taskRouteProposal,
    threadState: input.claims.threadState,
    controlBaseUrl: input.claims.controlBaseUrl,
  };
  if (!isDeepStrictEqual(claimed, expected)) return null;

  const skill = optionalString(run.skill);
  const skills = stringArray(run.skills);
  const primarySkill = optionalString(persisted.primarySkill);
  const userName = optionalString(persisted.userName);
  const source = optionalString(persisted.source);
  return {
    slug: parsedThread.slug,
    threadId: run.threadId,
    agent,
    ...(skill ? { skill } : {}),
    ...(skills ? { skills } : {}),
    ...(primarySkill ? { primarySkill } : {}),
    scope,
    skillMode,
    temporaryAgent: persisted.temporaryAgent === true,
    controlDepth,
    isAdmin,
    senderRole,
    readOnly,
    userId,
    ...(userName ? { userName } : {}),
    ...(source ? { source } : {}),
    ...(persisted.activeOutboundWorkflow === undefined
      ? {}
      : { activeOutboundWorkflow: persisted.activeOutboundWorkflow }),
  };
}
