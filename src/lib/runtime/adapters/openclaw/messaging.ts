import type {
  InboundMessage,
  SendInboundOptions,
  SendInboundResult,
} from "../../types";

export function getGatewayUrl(): string {
  return process.env.MC_CHAT_GATEWAY || "http://localhost:18789";
}

export function getChatSecret(): string | undefined {
  // Dedicated secret is preferred. Existing deployments always have the
  // gateway token, so it is a safe fail-closed migration fallback rather than
  // silently leaving the chat control plane unauthenticated.
  return process.env.MC_CHAT_SECRET || process.env.OPENCLAW_GATEWAY_TOKEN;
}

async function readGatewayResponse(res: Response): Promise<{ chatId?: string; raw: string }> {
  const raw = await res.text();
  if (!raw) return { raw };
  try {
    const data = JSON.parse(raw) as { chatId?: string };
    return { chatId: data.chatId, raw };
  } catch {
    return { raw };
  }
}

export async function sendOpenclawInbound(
  message: InboundMessage,
  opts?: SendInboundOptions,
): Promise<SendInboundResult> {
  const secret = getChatSecret();
  try {
    const res = await fetch(`${getGatewayUrl()}/mc-chat/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts?.headers ?? {}),
        ...(secret ? { "X-MC-Secret": secret } : {}),
      },
      body: JSON.stringify(message),
      ...(opts?.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
    });
    const data = await readGatewayResponse(res);
    return {
      ok: res.ok,
      status: res.status,
      chatId: data.chatId,
      raw: data.raw,
      error: res.ok ? undefined : data.raw,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 0,
      raw: message,
      error: message,
    };
  }
}

export async function createOpenclawChannelThread(input: unknown): Promise<unknown> {
  const res = await fetch(`${getGatewayUrl()}/mc-chat/create-discord-thread`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const raw = await res.text();
  if (!raw) return { ok: res.ok, status: res.status };
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { ok: res.ok, status: res.status, raw };
  }
}
