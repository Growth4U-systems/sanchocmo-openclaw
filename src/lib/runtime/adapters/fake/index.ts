import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import type {
  InboundMessage,
  RuntimeAdapter,
  RuntimeCapabilities,
  RuntimeCancelOptions,
  RuntimeControl,
  RuntimeJobEndedAt,
  RuntimeRunningCron,
  SendInboundOptions,
  SendInboundResult,
} from "../../types";

const FAKE_CAPABILITIES: RuntimeCapabilities = {
  chat: true,
  durableChatTurns: false,
  cron: false,
  modelPicker: false,
  agentRegistry: false,
  discord: false,
  slack: false,
};

const cancelledThreads = new Map<string, RuntimeCancelOptions | undefined>();

function unsupported(method: string): never {
  throw new Error(`Fake runtime does not support ${method}`);
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

function fakeRuntimeHome(): string {
  return process.env.SANCHO_FAKE_RUNTIME_HOME || path.join(BASE, "_runtime", "fake");
}

function fakeRuntimeFile(...segments: string[]): string {
  return path.join(fakeRuntimeHome(), ...segments);
}

function loadAgentSessions(agent = "sancho"): Record<string, unknown> {
  const file = fakeRuntimeFile("agents", agent, "sessions", "sessions.json");
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function fakeFinalText(message: InboundMessage): string {
  const template = process.env.SANCHO_FAKE_RUNTIME_RESPONSE;
  if (!template) return `fake-runtime:${message.text}`;
  return template
    .replaceAll("{{text}}", message.text)
    .replaceAll("{{threadId}}", message.threadId)
    .replaceAll("{{slug}}", message.slug);
}

export function getFakeRuntimeCancelledThreads(): Map<string, RuntimeCancelOptions | undefined> {
  return new Map(cancelledThreads);
}

export function resetFakeRuntimeState(): void {
  cancelledThreads.clear();
}

export class FakeRuntimeAdapter implements RuntimeAdapter {
  readonly id = "fake";
  readonly displayName = "Fake runtime";
  readonly capabilities = FAKE_CAPABILITIES;

  readonly messaging = {
    sendInbound: async (
      message: InboundMessage,
      _opts?: SendInboundOptions,
    ): Promise<SendInboundResult> => {
      const finalText = fakeFinalText(message);
      const raw = JSON.stringify({
        chatId: `fake:${message.threadId}`,
        text: finalText,
      });
      return {
        ok: true,
        status: 200,
        chatId: `fake:${message.threadId}`,
        raw,
        finalText,
        finalAgent: message.agent || message.agentId || "sancho",
      };
    },
    cancel: async (threadId: string, opts?: RuntimeCancelOptions): Promise<void> => {
      cancelledThreads.set(threadId, opts);
    },
    getSharedSecret: (): string | undefined => process.env.SANCHO_FAKE_RUNTIME_SECRET,
  };

  readonly control = control;

  readonly state = {
    home: (): string => fakeRuntimeHome(),
    runtimeFile: (...segments: string[]): string => fakeRuntimeFile(...segments),
    cronJobsFile: (): string => fakeRuntimeFile("cron", "jobs.json"),
    cronJobsStateFile: (): string => fakeRuntimeFile("cron", "jobs-state.json"),
    agentSessionsFile: (agent = "sancho"): string =>
      fakeRuntimeFile("agents", agent, "sessions", "sessions.json"),
    loadAgentSessions,
    getRunningCronJobs: (
      _jobsEndedAt: Record<string, RuntimeJobEndedAt>,
      _opts?: { agent?: string; freshnessMs?: number; now?: number },
    ): Map<string, RuntimeRunningCron> => new Map(),
  };

  readonly lifecycle = {
    healthcheck: async (): Promise<{ ok: boolean; details?: Record<string, unknown> }> => ({
      ok: true,
      details: {
        home: this.state.home(),
        mode: "test",
      },
    }),
    restart: async (): Promise<unknown> => ({ ok: true, restarted: false }),
  };
}
