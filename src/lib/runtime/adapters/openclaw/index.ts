import {
  getOpenclawConfig,
  ensureModelInAllowlist,
  getAgentEffectiveModel,
  getDefaultPrimaryModel,
  hasAnthropicApiKey,
  hasAnthropicSubscriptionToken,
  listAgents,
  listAgentsRich,
  patchOpenclawConfig,
  restartGateway,
  runOpenclaw,
  setAgentModel,
  setAnthropicAuthRoute,
  setCronModel,
  setDefaultPrimaryModel,
} from "./control";
import {
  agentSessionsFile,
  cronJobsFile,
  cronJobsStateFile,
  getRunningCronJobs,
  loadAgentSessions,
  openclawHome,
  openclawRuntimeFile,
} from "./state";
import {
  cancelOpenclawThread,
  createOpenclawChannelThread,
  getChatSecret,
  getGatewayUrl,
  sendOpenclawInbound,
} from "./messaging";
import type {
  RuntimeAdapter,
  RuntimeCapabilities,
} from "../../types";

const OPENCLAW_CAPABILITIES: RuntimeCapabilities = {
  chat: true,
  cron: true,
  modelPicker: true,
  agentRegistry: true,
  discord: true,
  slack: true,
};

export class OpenclawAdapter implements RuntimeAdapter {
  readonly id = "openclaw";
  readonly displayName = "OpenClaw";
  readonly capabilities = OPENCLAW_CAPABILITIES;

  readonly messaging = {
    sendInbound: sendOpenclawInbound,
    cancel: cancelOpenclawThread,
    getSharedSecret: (): string | undefined => getChatSecret(),
    createChannelThread: createOpenclawChannelThread,
  };

  readonly control = {
    runCommand: async (
      args: string[],
      opts?: { timeoutMs?: number; stdin?: string; env?: Record<string, string> },
    ): Promise<string> => runOpenclaw(args, opts),
    getConfig: async (configPath: string): Promise<unknown> => getOpenclawConfig(configPath),
    patchConfig: async (patch: unknown): Promise<void> => {
      patchOpenclawConfig(patch);
    },
    ensureModelInAllowlist: async (modelId: string): Promise<void> => {
      ensureModelInAllowlist(modelId);
    },
    getDefaultModel: async (): Promise<string | null> => getDefaultPrimaryModel(),
    setDefaultModel: async (modelId: string): Promise<void> => {
      setDefaultPrimaryModel(modelId);
    },
    setCronModel: async (cronId: string, modelId: string): Promise<void> => {
      setCronModel(cronId, modelId);
    },
    listAgents: async (): Promise<unknown[]> => listAgents(),
    listAgentsRich: async (): Promise<unknown[]> => listAgentsRich(),
    getAgentEffectiveModel: async (agentId: string): Promise<string | null> =>
      getAgentEffectiveModel(agentId),
    setAgentModel: async (agentId: string, modelId: string | null): Promise<{ updated: boolean }> =>
      setAgentModel(agentId, modelId),
    hasAnthropicSubscriptionToken: async (): Promise<boolean> => hasAnthropicSubscriptionToken(),
    hasAnthropicApiKey: async (): Promise<boolean> => hasAnthropicApiKey(),
    setAnthropicAuthRoute: async (route: "subscription" | "api"): Promise<void> => {
      setAnthropicAuthRoute(route);
    },
  };

  readonly state = {
    home: (): string => openclawHome(),
    runtimeFile: (...segments: string[]): string => openclawRuntimeFile(...segments),
    cronJobsFile: (): string => cronJobsFile(),
    cronJobsStateFile: (): string => cronJobsStateFile(),
    agentSessionsFile: (agent?: string): string => agentSessionsFile(agent),
    loadAgentSessions: (agent?: string): Record<string, unknown> =>
      loadAgentSessions(agent),
    getRunningCronJobs: (
      jobsEndedAt: Record<string, { lastRunAtMs?: number; lastDurationMs?: number }>,
      opts?: { agent?: string; freshnessMs?: number; now?: number },
    ) => getRunningCronJobs(jobsEndedAt, opts),
  };

  readonly lifecycle = {
    healthcheck: async (): Promise<{ ok: boolean; details?: Record<string, unknown> }> => ({
      ok: true,
      details: {
        gatewayUrl: getGatewayUrl(),
        home: this.state.home(),
      },
    }),
    restart: async (): Promise<unknown> => restartGateway(),
  };
}
