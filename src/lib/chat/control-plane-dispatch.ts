import { getAdminToken } from "@/lib/data/clients";
import type { InboundMessage } from "@/lib/runtime";

export type AdmittedChatTurn = InboundMessage & {
  idempotencyKey?: string;
  /** Optional human-facing card; the authoritative runtime text stays `text`. */
  displayText?: string;
};

export interface AdmittedChatDispatchResult {
  ok: boolean;
  status: number;
  raw: string;
  data: Record<string, unknown>;
  runId?: string;
  chatId?: string;
}

interface DispatchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

function controlPlaneBaseUrl(): string {
  return (
    process.env.SANCHO_INTERNAL_BASE_URL ||
    process.env.MC_NEXT_URL ||
    "http://127.0.0.1:3000"
  ).replace(/\/+$/, "");
}

function boundedText(value: string, maxBytes = 64 * 1024): string {
  return Buffer.byteLength(value) <= maxBytes
    ? value
    : Buffer.from(value).subarray(0, maxBytes).toString("utf8");
}

function safeForwardHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  const reserved = new Set([
    "authorization",
    "content-type",
    "x-mc-secret",
    "x-sancho-internal-dispatch",
  ]);
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(
      ([name]) => !reserved.has(name.toLowerCase()),
    ),
  );
}

/**
 * Server-side producers enter through the same admission and policy endpoint
 * as the dashboard. They authenticate as Mission Control itself, never as a
 * runtime transport: X-MC-Secret would require a parent run and is therefore
 * intentionally absent here.
 */
export async function dispatchAdmittedChatTurn(
  payload: AdmittedChatTurn,
  options: DispatchOptions = {},
): Promise<AdmittedChatDispatchResult> {
  const adminToken = getAdminToken() || process.env.MC_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error("Mission Control admin token is not configured");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${(options.baseUrl || controlPlaneBaseUrl()).replace(/\/+$/, "")}/api/chat/send`,
    {
      method: "POST",
      redirect: "error",
      headers: {
        ...safeForwardHeaders(options.headers),
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
        "X-Sancho-Internal-Dispatch": "1",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    },
  );
  const raw = boundedText(await response.text());
  let data: Record<string, unknown> = {};
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // Status + bounded raw body are returned to the producer for diagnostics.
  }
  return {
    ok: response.ok && data.ok === true,
    status: response.status,
    raw,
    data,
    ...(typeof data.runId === "string" ? { runId: data.runId } : {}),
    ...(typeof data.chatId === "string" ? { chatId: data.chatId } : {}),
  };
}
