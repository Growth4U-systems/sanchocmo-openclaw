import {
  MANAGED_HERMES_CONNECTION,
  cancelHermesThread,
  getHermesBaseUrl,
  getHermesChatSecret,
  getHermesHealthPath,
  sendHermesInbound,
  type HermesConnectionConfig,
} from "./messaging";
import {
  agentSessionsFile,
  cronJobsFile,
  cronJobsStateFile,
  getRunningCronJobs,
  hermesHome,
  hermesRuntimeFile,
  loadAgentSessions,
} from "./state";
import type {
  InboundMessage,
  RuntimeAdapter,
  RuntimeCapabilities,
  RuntimeControl,
  SendInboundOptions,
} from "../../types";

const HERMES_CAPABILITIES: RuntimeCapabilities = {
  chat: true,
  durableChatTurns: false,
  cron: false,
  modelPicker: false,
  agentRegistry: false,
  discord: false,
  slack: false,
};

function unsupported(method: string): never {
  throw new Error(`Hermes runtime does not support ${method} through Sancho yet`);
}

const control: RuntimeControl = {
  runCommand: async () => unsupported("runCommand"),
  getConfig: async () => unsupported("getConfig"),
  patchConfig: async () => unsupported("patchConfig"),
  ensureModelInAllowlist: async () => unsupported("ensureModelInAllowlist"),
  getDefaultModel: async () => unsupported("getDefaultModel"),
  getDefaultModelAssignment: async () => unsupported("getDefaultModelAssignment"),
  setDefaultModel: async () => unsupported("setDefaultModel"),
  setDefaultModelAssignment: async () => unsupported("setDefaultModelAssignment"),
  setCronModel: async () => unsupported("setCronModel"),
  listAgents: async () => unsupported("listAgents"),
  listAgentsRich: async () => unsupported("listAgentsRich"),
  getAgentEffectiveModel: async () => unsupported("getAgentEffectiveModel"),
  getAgentModelAssignment: async () => unsupported("getAgentModelAssignment"),
  setAgentModel: async () => unsupported("setAgentModel"),
  hasAnthropicSubscriptionToken: async () => unsupported("hasAnthropicSubscriptionToken"),
  hasAnthropicApiKey: async () => unsupported("hasAnthropicApiKey"),
  setAnthropicAuthRoute: async () => unsupported("setAnthropicAuthRoute"),
};

export class HermesAdapter implements RuntimeAdapter {
  readonly id = "hermes";
  readonly displayName = "Hermes gestionado";
  readonly capabilities = HERMES_CAPABILITIES;
  private readonly connection: HermesConnectionConfig;

  constructor() {
    this.connection = MANAGED_HERMES_CONNECTION;
  }

  readonly messaging = {
    sendInbound: (message: InboundMessage, opts?: SendInboundOptions) => sendHermesInbound(message, opts, this.connection),
    cancel: cancelHermesThread,
    getSharedSecret: (): string | undefined => getHermesChatSecret(this.connection),
  };

  readonly control = control;

  readonly state = {
    home: (): string => hermesHome(),
    runtimeFile: (...segments: string[]): string => hermesRuntimeFile(...segments),
    cronJobsFile: (): string => cronJobsFile(),
    cronJobsStateFile: (): string => cronJobsStateFile(),
    agentSessionsFile: (agent?: string): string => agentSessionsFile(agent),
    loadAgentSessions: (agent?: string): Record<string, unknown> => loadAgentSessions(agent),
    getRunningCronJobs: (
      jobsEndedAt: Record<string, { lastRunAtMs?: number; lastDurationMs?: number }>,
      opts?: { agent?: string; freshnessMs?: number; now?: number },
    ) => getRunningCronJobs(jobsEndedAt, opts),
  };

  readonly lifecycle = {
    healthcheck: async (): Promise<{ ok: boolean; details?: Record<string, unknown> }> => {
      const baseUrl = getHermesBaseUrl(this.connection);
      if (!baseUrl) {
        return {
          ok: false,
          details: {
            error: `${this.displayName} no está configurado`,
            requiredEnv: this.connection.baseUrlEnv,
          },
        };
      }

      const controller = new AbortController();
      const timeoutMs = Number(process.env.HERMES_HEALTH_TIMEOUT_MS || 3000);
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const secret = getHermesChatSecret(this.connection);
        const res = await fetch(`${baseUrl}${getHermesHealthPath(this.connection)}`, {
          headers: secret ? { "X-MC-Secret": secret } : undefined,
          signal: controller.signal,
        });
        return {
          ok: res.ok,
          details: {
            status: res.status,
            baseUrl,
          },
        };
      } catch (e) {
        return {
          ok: false,
          details: {
            baseUrl,
            error: e instanceof Error ? e.message : String(e),
          },
        };
      } finally {
        clearTimeout(timer);
      }
    },
    restart: async (): Promise<unknown> => unsupported("restart"),
  };
}
