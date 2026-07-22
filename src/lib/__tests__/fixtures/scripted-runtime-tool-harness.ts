import type {
  InboundMessage,
  RuntimeAdapter,
  RuntimeCapabilities,
  RuntimeControl,
  RuntimeJobEndedAt,
  RuntimeRunningCron,
  SendInboundOptions,
  SendInboundResult,
} from "@/lib/runtime/types";

const CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const LEASE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_.-]{1,95}$/;

const capabilities: RuntimeCapabilities = Object.freeze({
  chat: true,
  durableChatTurns: false,
  cron: false,
  modelPicker: false,
  agentRegistry: false,
  discord: false,
  slack: false,
});

export interface ScriptedRuntimeToolAuthority {
  parentRunId: string;
  dispatchRunId: string;
  dispatchLeaseToken: string;
  runtimeToolCapability: string;
}

export interface ScriptedRuntimeToolCall {
  toolName: string;
  input: unknown;
}

export interface ScriptedRuntimeToolResult {
  ok: boolean;
  status: number;
  code?: string;
  receipt?: unknown;
}

export interface ScriptedRuntimeTool {
  name: string;
  execute(
    input: unknown,
    context: {
      authority: ScriptedRuntimeToolAuthority;
      message: InboundMessage;
    },
  ): Promise<ScriptedRuntimeToolResult>;
}

export type ScriptedRuntimeSelection = (
  message: InboundMessage,
  availableTools: readonly string[],
) => readonly ScriptedRuntimeToolCall[];

export interface ScriptedRuntimeAdapterOptions {
  tools: readonly ScriptedRuntimeTool[];
  select: ScriptedRuntimeSelection;
}

function unsupported(method: string): never {
  throw new Error(`scripted runtime does not support ${method}`);
}

const control: RuntimeControl = {
  runCommand: async () => unsupported("runCommand"),
  getConfig: async () => unsupported("getConfig"),
  patchConfig: async () => unsupported("patchConfig"),
  ensureModelInAllowlist: async () => unsupported("ensureModelInAllowlist"),
  getDefaultModel: async () => unsupported("getDefaultModel"),
  getDefaultModelAssignment: async () =>
    unsupported("getDefaultModelAssignment"),
  setDefaultModel: async () => unsupported("setDefaultModel"),
  setDefaultModelAssignment: async () =>
    unsupported("setDefaultModelAssignment"),
  setCronModel: async () => unsupported("setCronModel"),
  listAgents: async () => unsupported("listAgents"),
  listAgentsRich: async () => unsupported("listAgentsRich"),
  getAgentEffectiveModel: async () => unsupported("getAgentEffectiveModel"),
  getAgentModelAssignment: async () => unsupported("getAgentModelAssignment"),
  setAgentModel: async () => unsupported("setAgentModel"),
  hasAnthropicSubscriptionToken: async () =>
    unsupported("hasAnthropicSubscriptionToken"),
  hasAnthropicApiKey: async () => unsupported("hasAnthropicApiKey"),
  setAnthropicAuthRoute: async () => unsupported("setAnthropicAuthRoute"),
};

function header(
  headers: Record<string, string> | undefined,
  name: string,
): string | undefined {
  const expected = name.toLowerCase();
  return Object.entries(headers ?? {}).find(
    ([candidate]) => candidate.toLowerCase() === expected,
  )?.[1];
}

function authorityFor(
  message: InboundMessage,
  options: SendInboundOptions | undefined,
): ScriptedRuntimeToolAuthority | null {
  const parentRunId = message.missionControlRunId;
  const runtimeToolCapability = message.runtimeToolCapability;
  const dispatchRunId = header(options?.headers, "x-sancho-dispatch-run-id");
  const dispatchLeaseToken = header(
    options?.headers,
    "x-sancho-dispatch-lease-token",
  );
  if (
    typeof parentRunId !== "string" ||
    !ID_PATTERN.test(parentRunId) ||
    typeof dispatchRunId !== "string" ||
    !ID_PATTERN.test(dispatchRunId) ||
    typeof dispatchLeaseToken !== "string" ||
    !LEASE_TOKEN_PATTERN.test(dispatchLeaseToken) ||
    typeof runtimeToolCapability !== "string" ||
    !CAPABILITY_PATTERN.test(runtimeToolCapability)
  ) {
    return null;
  }
  return {
    parentRunId,
    dispatchRunId,
    dispatchLeaseToken,
    runtimeToolCapability,
  };
}

function failed(
  status: number,
  code: string,
  message: InboundMessage,
): SendInboundResult {
  const raw = JSON.stringify({ ok: false, status, code });
  return {
    ok: false,
    status,
    chatId: `scripted:${message.threadId}`,
    raw,
    error: code,
  };
}

/**
 * Deterministic, zero-network RuntimeAdapter used to run the same tool
 * conformance story for any runtime transport. Product/tool names live in the
 * caller; this harness only understands the public runtime and authority
 * contracts.
 */
export class ScriptedRuntimeToolAdapter implements RuntimeAdapter {
  readonly id = "scripted";
  readonly displayName = "Scripted runtime conformance adapter";
  readonly capabilities = capabilities;
  readonly invocations: Array<{
    toolName: string;
    input: unknown;
    authority: ScriptedRuntimeToolAuthority;
  }> = [];
  readonly cancelledThreads: string[] = [];
  private readonly tools: ReadonlyMap<string, ScriptedRuntimeTool>;

  constructor(private readonly options: ScriptedRuntimeAdapterOptions) {
    const tools = new Map<string, ScriptedRuntimeTool>();
    for (const tool of options.tools) {
      if (!TOOL_NAME_PATTERN.test(tool.name) || tools.has(tool.name)) {
        throw new Error("scripted_runtime_tool_registry_invalid");
      }
      tools.set(tool.name, tool);
    }
    if (tools.size < 1) throw new Error("scripted_runtime_tool_registry_empty");
    this.tools = tools;
  }

  readonly messaging = {
    sendInbound: async (
      message: InboundMessage,
      sendOptions?: SendInboundOptions,
    ): Promise<SendInboundResult> => {
      const authority = authorityFor(message, sendOptions);
      if (!authority) {
        return failed(403, "runtime_tool_authority_invalid", message);
      }
      const selected = this.options.select(message, [...this.tools.keys()]);
      if (!Array.isArray(selected) || selected.length !== 1) {
        return failed(409, "runtime_tool_selection_not_singular", message);
      }
      const call = selected[0];
      const tool = this.tools.get(call.toolName);
      if (!tool) {
        return failed(400, "runtime_tool_unknown", message);
      }
      this.invocations.push({
        toolName: tool.name,
        input: call.input,
        authority,
      });
      const result = await tool.execute(call.input, { authority, message });
      const raw = JSON.stringify(result);
      return {
        ok: result.ok,
        status: result.status,
        chatId: `scripted:${message.threadId}`,
        raw,
        ...(result.ok ? { finalText: raw } : { error: result.code ?? raw }),
        finalAgent: message.agent ?? message.agentId ?? "sancho",
      };
    },
    cancel: async (threadId: string): Promise<void> => {
      this.cancelledThreads.push(threadId);
    },
  };

  readonly control = control;

  readonly state = {
    home: (): string => "/tmp/scripted-runtime-conformance",
    runtimeFile: (...segments: string[]): string =>
      [this.state.home(), ...segments].join("/"),
    cronJobsFile: (): string => `${this.state.home()}/cron/jobs.json`,
    cronJobsStateFile: (): string =>
      `${this.state.home()}/cron/jobs-state.json`,
    agentSessionsFile: (agent = "sancho"): string =>
      `${this.state.home()}/agents/${agent}/sessions.json`,
    loadAgentSessions: (): Record<string, unknown> => ({}),
    getRunningCronJobs: (
      _jobsEndedAt: Record<string, RuntimeJobEndedAt>,
    ): Map<string, RuntimeRunningCron> => new Map(),
  };

  readonly lifecycle = {
    healthcheck: async () => ({ ok: true, details: { mode: "scripted" } }),
    restart: async () => ({ ok: true, restarted: false }),
  };
}
