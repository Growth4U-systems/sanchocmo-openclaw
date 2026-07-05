import type {
  InboundMessage,
  SendInboundOptions,
  SendInboundResult,
} from "./types";

export interface HttpRuntimeConnectionConfig {
  baseUrlEnv: string[];
  inboundPathEnv: string[];
  healthPathEnv: string[];
  secretEnv: string[];
  label: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function firstEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getHttpRuntimeBaseUrl(config: HttpRuntimeConnectionConfig): string | undefined {
  const raw = firstEnv(config.baseUrlEnv);
  return raw ? trimTrailingSlash(raw) : undefined;
}

export function getHttpRuntimeInboundPath(config: HttpRuntimeConnectionConfig): string {
  return normalizePath(firstEnv(config.inboundPathEnv) || "/sancho/inbound");
}

export function getHttpRuntimeHealthPath(config: HttpRuntimeConnectionConfig): string {
  return normalizePath(firstEnv(config.healthPathEnv) || "/healthz");
}

export function getHttpRuntimeSecret(config: HttpRuntimeConnectionConfig): string | undefined {
  return firstEnv(config.secretEnv);
}

async function readHttpRuntimeResponse(res: Response): Promise<{ chatId?: string; raw: string }> {
  const raw = await res.text();
  if (!raw) return { raw };
  try {
    const data = JSON.parse(raw) as { chatId?: string; runId?: string; id?: string };
    return { chatId: data.chatId || data.runId || data.id, raw };
  } catch {
    return { raw };
  }
}

export async function sendHttpRuntimeInbound(
  message: InboundMessage,
  opts: SendInboundOptions | undefined,
  config: HttpRuntimeConnectionConfig,
): Promise<SendInboundResult> {
  const baseUrl = getHttpRuntimeBaseUrl(config);
  if (!baseUrl) {
    const error = `${config.label} runtime is not configured: set ${config.baseUrlEnv.join(" or ")}`;
    return { ok: false, status: 0, raw: error, error };
  }

  const secret = getHttpRuntimeSecret(config);
  try {
    const res = await fetch(`${baseUrl}${getHttpRuntimeInboundPath(config)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts?.headers ?? {}),
        ...(secret ? { "X-MC-Secret": secret } : {}),
      },
      body: JSON.stringify(message),
      ...(opts?.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
    });
    const data = await readHttpRuntimeResponse(res);
    return {
      ok: res.ok,
      status: res.status,
      chatId: data.chatId,
      raw: data.raw,
      error: res.ok ? undefined : data.raw,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, raw: error, error };
  }
}
