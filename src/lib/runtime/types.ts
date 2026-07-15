export type RuntimeCapability =
  | "chat"
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
  /** Request-facing correlation id, also forwarded as X-Request-Id. */
  traceId?: string;
  /** W3C propagation header for runtimes with tracing support. */
  traceparent?: string;
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
  sendInbound(message: InboundMessage, opts?: SendInboundOptions): Promise<SendInboundResult>;
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
  getAgentModelAssignment(agentId: string): Promise<RuntimeModelAssignment | null>;
  setAgentModel(agentId: string, model: RuntimeModelInput | null): Promise<{ updated: boolean }>;
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
