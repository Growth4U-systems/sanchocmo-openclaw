export type CliBridgeProviderId = "hermes" | "claude-code" | "codex";

export interface CliBridgeProviderMeta {
  id: CliBridgeProviderId;
  label: string;
  defaultPort: number;
  scriptPath: string;
  bridgeSecretEnv: string;
  bridgePortEnv: string;
  bridgeHostEnv: string;
  runtimeTimeoutEnv: string;
  runtimeModelEnv?: string;
  defaultModel?: string;
}

export interface CliBridgeCommandOptions {
  sanchoBaseUrl: string;
  secret: string;
  host?: string;
  port?: number;
  model?: string;
}

export const CLI_BRIDGE_PROVIDERS: CliBridgeProviderMeta[] = [
  {
    id: "hermes",
    label: "Hermes",
    defaultPort: 18791,
    scriptPath: "docker/runtimes/hermes/bridge.mjs",
    bridgeSecretEnv: "HERMES_BRIDGE_SECRET",
    bridgePortEnv: "HERMES_BRIDGE_PORT",
    bridgeHostEnv: "HERMES_BRIDGE_HOST",
    runtimeTimeoutEnv: "HERMES_RUN_TIMEOUT_MS",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    defaultPort: 18792,
    scriptPath: "docker/runtimes/claude-code/bridge.mjs",
    bridgeSecretEnv: "CLAUDE_CODE_BRIDGE_SECRET",
    bridgePortEnv: "CLAUDE_CODE_BRIDGE_PORT",
    bridgeHostEnv: "CLAUDE_CODE_BRIDGE_HOST",
    runtimeTimeoutEnv: "CLAUDE_CODE_RUNTIME_TIMEOUT_MS",
    runtimeModelEnv: "CLAUDE_CODE_RUNTIME_MODEL",
    defaultModel: "haiku",
  },
  {
    id: "codex",
    label: "Codex",
    defaultPort: 18793,
    scriptPath: "docker/runtimes/codex/bridge.mjs",
    bridgeSecretEnv: "CODEX_BRIDGE_SECRET",
    bridgePortEnv: "CODEX_BRIDGE_PORT",
    bridgeHostEnv: "CODEX_BRIDGE_HOST",
    runtimeTimeoutEnv: "CODEX_RUNTIME_TIMEOUT_MS",
  },
];

export function isCliBridgeProviderId(value: unknown): value is CliBridgeProviderId {
  return value === "hermes" || value === "claude-code" || value === "codex";
}

export function cliBridgeProvider(id: CliBridgeProviderId): CliBridgeProviderMeta {
  const provider = CLI_BRIDGE_PROVIDERS.find((item) => item.id === id);
  if (!provider) throw new Error(`Unknown CLI bridge provider: ${id}`);
  return provider;
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function defaultGatewayUrl(providerId: CliBridgeProviderId): string {
  return `http://127.0.0.1:${cliBridgeProvider(providerId).defaultPort}`;
}

export function gatewayPortOrDefault(providerId: CliBridgeProviderId, gatewayUrl: string): number {
  try {
    const parsed = new URL(normalizeBaseUrl(gatewayUrl));
    if (parsed.port) {
      const port = Number(parsed.port);
      if (Number.isInteger(port) && port > 0 && port < 65536) return port;
    }
  } catch {
    // Fall through to the provider default. The caller still stores the URL so
    // the healthcheck surfaces the malformed value clearly.
  }
  return cliBridgeProvider(providerId).defaultPort;
}

export function gatewayListenHost(gatewayUrl: string): string {
  try {
    const hostname = new URL(normalizeBaseUrl(gatewayUrl)).hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return "127.0.0.1";
    }
  } catch {
    return "127.0.0.1";
  }
  return "0.0.0.0";
}

export function externalRuntimeVarsForCliBridge(
  providerId: CliBridgeProviderId,
  gatewayUrl: string,
  secret: string,
): Record<string, string> {
  return {
    SANCHO_EXTERNAL_RUNTIME_KIND: providerId,
    SANCHO_EXTERNAL_PROTOCOL: "sancho",
    SANCHO_EXTERNAL_GATEWAY_URL: normalizeBaseUrl(gatewayUrl),
    SANCHO_EXTERNAL_SECRET: secret,
    SANCHO_EXTERNAL_INBOUND_PATH: "/sancho/inbound",
    SANCHO_EXTERNAL_HEALTH_PATH: "/healthz",
  };
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function shellAssignment(key: string, value: string): string {
  return `${key}=${shellQuote(value)}`;
}

export function buildCliBridgeCommand(
  providerId: CliBridgeProviderId,
  options: CliBridgeCommandOptions,
): string {
  const provider = cliBridgeProvider(providerId);
  const env = buildCliBridgeEnv(providerId, options);
  return `${Object.entries(env).map(([key, value]) => shellAssignment(key, value)).join(" ")} node ${provider.scriptPath}`;
}

export function buildCliBridgeEnv(
  providerId: CliBridgeProviderId,
  options: CliBridgeCommandOptions,
): Record<string, string> {
  const provider = cliBridgeProvider(providerId);
  const sanchoBaseUrl = normalizeBaseUrl(options.sanchoBaseUrl);
  const host = options.host || "127.0.0.1";
  const port = options.port ?? provider.defaultPort;
  const env: Record<string, string> = {
    SANCHO_BASE_URL: sanchoBaseUrl,
    SANCHO_WEBHOOK_URL: `${sanchoBaseUrl}/api/chat/webhook`,
    SANCHO_CONTEXT_PACK_URL: `${sanchoBaseUrl}/api/chat/context-pack`,
    SANCHO_EXTERNAL_SECRET: options.secret,
    MC_CHAT_SECRET: options.secret,
    [provider.bridgeHostEnv]: host,
    [provider.bridgePortEnv]: String(port),
    [provider.bridgeSecretEnv]: options.secret,
    [provider.runtimeTimeoutEnv]: "900000",
  };

  if (providerId === "claude-code") {
    env.CLAUDE_CODE_SANCHO_MCP_ENABLED = "0";
  }
  if (providerId === "hermes") {
    env.HERMES_SANCHO_SECRET = options.secret;
  }
  if (provider.runtimeModelEnv && (options.model || provider.defaultModel)) {
    env[provider.runtimeModelEnv] = options.model || provider.defaultModel || "";
  }

  return env;
}

const cliRuntimeBridge = {
  CLI_BRIDGE_PROVIDERS,
  buildCliBridgeCommand,
  buildCliBridgeEnv,
  cliBridgeProvider,
  defaultGatewayUrl,
  externalRuntimeVarsForCliBridge,
  gatewayListenHost,
  gatewayPortOrDefault,
  isCliBridgeProviderId,
  normalizeBaseUrl,
};

export default cliRuntimeBridge;
