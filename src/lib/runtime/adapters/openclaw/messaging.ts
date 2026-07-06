import { markCancelled } from "@/lib/data/mc-chat";
import type {
  InboundMessage,
  RuntimeCancelOptions,
  SendInboundOptions,
  SendInboundResult,
} from "../../types";

export function getGatewayUrl(): string {
  return process.env.MC_CHAT_GATEWAY || "http://localhost:18789";
}

export function getChatSecret(): string | undefined {
  return process.env.MC_CHAT_SECRET;
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

export async function cancelOpenclawThread(
  threadId: string,
  opts: RuntimeCancelOptions = {},
): Promise<void> {
  markCancelled(threadId);
  const secret = getChatSecret();
  const slug = opts.slug || threadId.split(":")[0] || threadId;
  const requestedAgent = opts.agentId || opts.agent;
  try {
    await fetch(`${getGatewayUrl()}/mc-chat/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-MC-Secret": secret } : {}),
      },
      body: JSON.stringify({
        slug,
        threadId,
        text: "/stop",
        userName: "Admin",
        userId: "mc-admin",
        isAdmin: true,
        ...(requestedAgent ? { agent: requestedAgent, agentId: requestedAgent } : {}),
      }),
    });
  } catch (err) {
    console.error(`[mc-chat] Gateway /stop failed: ${err instanceof Error ? err.message : err}`);
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
