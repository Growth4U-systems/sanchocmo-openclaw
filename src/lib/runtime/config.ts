import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";

export const PUBLIC_RUNTIME_IDS = ["openclaw", "hermes", "external-http"] as const;
export const RUNTIME_IDS = [...PUBLIC_RUNTIME_IDS, "fake"] as const;
export type RuntimeId = (typeof RUNTIME_IDS)[number];
export type PublicRuntimeId = (typeof PUBLIC_RUNTIME_IDS)[number];
export type RuntimeSelectionSource = "ui" | "env" | "default";

export interface RuntimeOptionMeta {
  id: PublicRuntimeId;
  label: string;
  description: string;
  note: string;
  requiredEnv?: string[];
}

export interface RuntimeSelection {
  runtime: RuntimeId;
  source: RuntimeSelectionSource;
  envRuntime: string | null;
  updatedAt?: string;
  updatedBy?: string;
}

interface PersistedRuntimeConfig {
  runtime?: unknown;
  updatedAt?: unknown;
  updatedBy?: unknown;
}

export const RUNTIME_OPTIONS: RuntimeOptionMeta[] = [
  {
    id: "openclaw",
    label: "OpenClaw",
    description: "Runtime actual de Sancho, con chat, crons, agentes, modelos e integraciones.",
    note: "Es el modo completo y el fallback mientras terminamos el desacople.",
  },
  {
    id: "hermes",
    label: "Hermes gestionado",
    description: "Runtime Hermes gestionado por nuestro despliegue de Sancho.",
    note: "Cubre chat vía adapter/bridge; crons, registro de agentes e integraciones siguen desacoplándose por fases.",
    requiredEnv: ["HERMES_GATEWAY_URL", "HERMES_BASE_URL", "HERMES_URL"],
  },
  {
    id: "external-http",
    label: "Runtime externo HTTP",
    description: "Runtime propio compatible con Sancho HTTP o con un bridge /chat: Hermes, Codex CLI, Claude Code u otro gateway.",
    note: "BYO runtime: Sancho mantiene chats/contexto/ledger y delega la ejecución al endpoint externo.",
    requiredEnv: ["SANCHO_EXTERNAL_GATEWAY_URL", "HERMES_EXTERNAL_GATEWAY_URL"],
  },
];

const RUNTIME_ALIASES: Record<string, RuntimeId> = {
  "hermes-external": "external-http",
};

function isFakeRuntimeAllowed(): boolean {
  return process.env.NODE_ENV === "test";
}

export function resolveRuntimeId(value: unknown): RuntimeId | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (PUBLIC_RUNTIME_IDS.includes(trimmed as PublicRuntimeId)) return trimmed as PublicRuntimeId;
  if (trimmed === "fake" && isFakeRuntimeAllowed()) return "fake";
  return RUNTIME_ALIASES[trimmed] ?? null;
}

export function isRuntimeId(value: unknown): value is RuntimeId {
  return resolveRuntimeId(value) !== null;
}

export function runtimeConfigFile(): string {
  return process.env.SANCHO_RUNTIME_CONFIG_FILE || path.join(BASE, "_system", "runtime-config.json");
}

function readPersistedRuntimeConfig(): PersistedRuntimeConfig | null {
  const file = runtimeConfigFile();
  if (!fs.existsSync(file)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as PersistedRuntimeConfig;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function readRuntimeSelection(): RuntimeSelection {
  const persisted = readPersistedRuntimeConfig();
  const envRuntime = process.env.SANCHO_RUNTIME?.trim() || null;
  const persistedRuntime = resolveRuntimeId(persisted?.runtime);

  if (persistedRuntime && isRuntimeConfigured(persistedRuntime)) {
    return {
      runtime: persistedRuntime,
      source: "ui",
      envRuntime,
      updatedAt: typeof persisted?.updatedAt === "string" ? persisted.updatedAt : undefined,
      updatedBy: typeof persisted?.updatedBy === "string" ? persisted.updatedBy : undefined,
    };
  }

  if (envRuntime) {
    const resolvedEnvRuntime = resolveRuntimeId(envRuntime);
    if (!resolvedEnvRuntime) {
      throw new Error(`Unknown SANCHO_RUNTIME: ${envRuntime}`);
    }
    return { runtime: resolvedEnvRuntime, source: "env", envRuntime };
  }

  return { runtime: "openclaw", source: "default", envRuntime };
}

export function writeRuntimeSelection(runtime: RuntimeId, updatedBy?: string): RuntimeSelection {
  const file = runtimeConfigFile();
  const payload = {
    runtime,
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy } : {}),
  };

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);

  return readRuntimeSelection();
}

export function isRuntimeConfigured(runtime: RuntimeId): boolean {
  if (runtime === "openclaw") return true;
  if (runtime === "fake") return isFakeRuntimeAllowed();
  if (runtime === "hermes") {
    const endpoint =
      process.env.HERMES_GATEWAY_URL ||
      process.env.HERMES_BASE_URL ||
      process.env.HERMES_URL;
    const callbackSecret =
      process.env.HERMES_BRIDGE_SECRET ||
      process.env.HERMES_CHAT_SECRET ||
      process.env.HERMES_SHARED_SECRET ||
      process.env.MC_CHAT_SECRET;
    // Hermes is asynchronous: a URL without callback authority can pass a
    // superficial healthcheck but every terminal webhook will be rejected.
    return Boolean(endpoint && callbackSecret);
  }
  const endpoint =
    process.env.SANCHO_EXTERNAL_GATEWAY_URL ||
    process.env.SANCHO_EXTERNAL_RUNTIME_URL ||
    process.env.HERMES_EXTERNAL_GATEWAY_URL ||
    process.env.HERMES_EXTERNAL_BASE_URL ||
    process.env.HERMES_EXTERNAL_URL;
  if (!endpoint) return false;
  const protocol = (
    process.env.SANCHO_EXTERNAL_PROTOCOL ||
    process.env.SANCHO_EXTERNAL_RUNTIME_PROTOCOL ||
    process.env.HERMES_EXTERNAL_PROTOCOL ||
    "sancho"
  ).trim().toLowerCase();
  // mc-bridge returns its final response synchronously. The default Sancho
  // protocol is async and therefore requires a shared callback credential.
  if (["mc-bridge", "mission-control-bridge", "bridge"].includes(protocol)) {
    return true;
  }
  const callbackSecret =
    process.env.SANCHO_EXTERNAL_SECRET ||
    process.env.SANCHO_EXTERNAL_RUNTIME_SECRET ||
    process.env.HERMES_EXTERNAL_SECRET ||
    process.env.HERMES_EXTERNAL_API_KEY ||
    process.env.HERMES_EXTERNAL_CHAT_SECRET;
  return Boolean(callbackSecret);
}
