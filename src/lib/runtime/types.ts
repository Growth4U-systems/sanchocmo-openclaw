import type { GrowieThreadHistoryMessage } from "@/lib/support/growie";

export type RuntimeCapability =
  | "chat"
  | "durableChatTurns"
  | "cron"
  | "modelPicker"
  | "agentRegistry"
  | "discord"
  | "slack";

export type RuntimeCapabilities = Record<RuntimeCapability, boolean>;

export interface InboundMessage {
  slug: string;
  threadId: string;
  /** Mission Control ledger id echoed by every async runtime callback. */
  missionControlRunId?: string;
  /**
   * One-turn bearer capability for runtime-owned tools. Mission Control stores
   * only its SHA-256 digest; runtimes must keep the raw value out of prompts,
   * logs, environment variables and callbacks.
   */
  runtimeToolCapability?: string;
  /**
   * Signed, webhook-only authority for replaying the terminal callback after
   * the short-lived runtime/tool capability window. It must never be placed in
   * prompts, model context, logs or non-terminal callback headers.
   */
  runtimeTerminalCallbackGrant?: string;
  /** Absolute expiry for runtime-side fail-closed admission and outbox bounds. */
  runtimeTerminalCallbackGrantExpiresAt?: string;
  /** Exact spend-bearing effects authorized by the current human message. */
  runtimeEffectIntent?: Array<
    "leads_search_start" | "partnerships_discovery_start"
  >;
  /** Original user text used only for server-side runtime envelope binding. */
  runtimeAuthorityText?: string;
  /** Request-facing correlation id, also forwarded as X-Request-Id. */
  traceId?: string;
  /** W3C propagation header for runtimes with tracing support. */
  traceparent?: string;
  /**
   * Control-plane-only transport action. This is carried in a separate HTTP
   * header too; runtimes must require both signals and bind the request to the
   * exact active run before acting on it.
   */
  runtimeControlAction?: "stop";
  /** Authenticated control-plane hop count. Control actions stop at depth 1. */
  controlDepth?: 0 | 1;
  threadName?: string;
  text: string;
  userId: string;
  userName: string;
  linkedTo?: string;
  /** Seed playbook for this turn. Advisory when `skillMode` is `auto`. */
  skill?: string;
  /** Primary task workflow, distinct from an advisory per-turn skill hint. */
  primarySkill?: string;
  skills?: string[];
  /** agent=all owned skills; task=task allowlist only; skill=guided primary. */
  scope?: "agent" | "skill" | "task";
  /** `auto` selects within scope; `pinned` starts from the primary guided skill and its allowlist. */
  skillMode?: "auto" | "pinned";
  /** Trusted one-turn Sancho override. Never changes durable thread ownership. */
  temporaryAgent?: boolean;
  /** Server-issued, expiring proposal required before a task may be created. */
  taskRouteProposal?: {
    id: string;
    groupId: string;
    agent: string;
    skill?: string;
    skills?: string[];
    name: string;
    brief: string;
  };
  /** Server-derived state for conversational control of a persisted YALC workflow. */
  activeOutboundWorkflow?: {
    campaignId: string;
    runId: string;
    status:
      | "queued"
      | "running"
      | "awaiting_approval"
      | "approved"
      | "executing"
      | "completed"
      | "completed_with_errors"
      | "failed";
    lastOperation: string;
    batch?: {
      itemCount: number;
      sample: Array<{ leadId?: string; messageBody: string }>;
    };
  };
  /** Trusted Mission Control origin used by runtime-side command adapters. */
  controlBaseUrl?: string;
  threadState?: unknown;
  docPath?: string;
  docKind?: string;
  attachments?: unknown[];
  isAdmin?: boolean;
  senderRole?: "admin" | "client";
  /**
   * Server-authored portable agent contract. External runtimes must apply the
   * instructions as system/developer context and must never echo or persist it
   * as user-authored text.
   */
  runtimeContract?: {
    schemaVersion: 1;
    kind: "sancho.mc-chat-context";
    instructions: string;
  };
  /** A trusted channel may force a turn to analysis-only behavior. */
  readOnly?: boolean;
  /** Server-derived read-only experience. Browsers cannot select this mode. */
  channelMode?: "docs-review" | "support-diagnostic";
  /** Bounded deployment/page evidence attached by the trusted Sancho server. */
  supportContext?: {
    pagePath?: string;
    deployedCommit?: string;
    imageDigest?: string;
    environment?: string;
  };
  /** Server-derived visible history used to bootstrap a stateless runtime turn. */
  priorThreadMessages?: GrowieThreadHistoryMessage[];
  _source?: string;
  agentId?: string;
  agent?: string;
}

export interface SendInboundResult {
  ok: boolean;
  status: number;
  chatId?: string;
  raw: string;
  error?: string;
  finalText?: string;
  finalAgent?: string;
}

export interface SendInboundOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface RuntimeCancelOptions {
  slug?: string;
  agent?: string;
  agentId?: string;
  /** Exact Mission Control run to stop; prevents a stale cancel killing a newer turn. */
  missionControlRunId?: string;
}

export interface RuntimeRunningCron {
  jobId: string;
  sessionId: string | null;
  startedAtMs: number;
  lastTouchMs: number;
}

export interface RuntimeJobEndedAt {
  lastRunAtMs?: number;
  lastDurationMs?: number;
}

export interface RuntimeMessaging {
  /** Whether a successful turn returns inline or owns an async final callback. */
  terminalDeliveryMode(): "callback" | "inline";
  sendInbound(
    message: InboundMessage,
    opts?: SendInboundOptions,
  ): Promise<SendInboundResult>;
  cancel(threadId: string, opts?: RuntimeCancelOptions): Promise<void>;
  getSharedSecret?(): string | undefined;
  createChannelThread?(input: unknown): Promise<unknown>;
  relayChannelMention?(input: unknown): Promise<unknown>;
}

export interface RuntimeModelAssignment {
  primary: string;
  fallbacks: string[];
}

export type RuntimeModelInput = string | RuntimeModelAssignment;

export interface RuntimeControl {
  runCommand(
    args: string[],
    opts?: { timeoutMs?: number; stdin?: string; env?: Record<string, string> },
  ): Promise<string>;
  getConfig(path: string): Promise<unknown>;
  patchConfig(patch: unknown): Promise<void>;
  ensureModelInAllowlist(modelId: string): Promise<void>;
  getDefaultModel(): Promise<string | null>;
  getDefaultModelAssignment(): Promise<RuntimeModelAssignment | null>;
  setDefaultModel(modelId: string): Promise<void>;
  setDefaultModelAssignment(model: RuntimeModelInput): Promise<void>;
  setCronModel(cronId: string, modelId: string): Promise<void>;
  listAgents(): Promise<unknown[]>;
  listAgentsRich(): Promise<unknown[]>;
  getAgentEffectiveModel(agentId: string): Promise<string | null>;
  getAgentModelAssignment(
    agentId: string,
  ): Promise<RuntimeModelAssignment | null>;
  setAgentModel(
    agentId: string,
    model: RuntimeModelInput | null,
  ): Promise<{ updated: boolean }>;
  hasAnthropicSubscriptionToken(): Promise<boolean>;
  hasAnthropicApiKey(): Promise<boolean>;
  setAnthropicAuthRoute(route: "subscription" | "api"): Promise<void>;
}

export interface RuntimeState {
  home(): string;
  runtimeFile(...segments: string[]): string;
  cronJobsFile(): string;
  cronJobsStateFile(): string;
  agentSessionsFile(agent?: string): string;
  loadAgentSessions(agent?: string): Record<string, unknown>;
  getRunningCronJobs(
    jobsEndedAt: Record<string, RuntimeJobEndedAt>,
    opts?: { agent?: string; freshnessMs?: number; now?: number },
  ): Map<string, RuntimeRunningCron>;
}

export interface RuntimeLifecycle {
  bootstrap?(env?: NodeJS.ProcessEnv): Promise<void>;
  healthcheck(): Promise<{ ok: boolean; details?: Record<string, unknown> }>;
  restart(): Promise<unknown>;
}

export interface RuntimeAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: RuntimeCapabilities;
  readonly messaging: RuntimeMessaging;
  readonly control: RuntimeControl;
  readonly state: RuntimeState;
  readonly lifecycle: RuntimeLifecycle;
}
