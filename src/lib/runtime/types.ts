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
  threadName?: string;
  text: string;
  userId: string;
  userName: string;
  linkedTo?: string;
  skill?: string;
  skills?: string[];
  scope?: "agent";
  threadState?: unknown;
  docPath?: string;
  docKind?: string;
  attachments?: unknown[];
  isAdmin?: boolean;
  senderRole?: "admin" | "client";
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

export interface RuntimeControl {
  runCommand(
    args: string[],
    opts?: { timeoutMs?: number; stdin?: string; env?: Record<string, string> },
  ): Promise<string>;
  getConfig(path: string): Promise<unknown>;
  patchConfig(patch: unknown): Promise<void>;
  ensureModelInAllowlist(modelId: string): Promise<void>;
  getDefaultModel(): Promise<string | null>;
  setDefaultModel(modelId: string): Promise<void>;
  setCronModel(cronId: string, modelId: string): Promise<void>;
  listAgents(): Promise<unknown[]>;
  listAgentsRich(): Promise<unknown[]>;
  getAgentEffectiveModel(agentId: string): Promise<string | null>;
  setAgentModel(agentId: string, modelId: string | null): Promise<{ updated: boolean }>;
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
