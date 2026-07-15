import type {
  InboundMessage,
  SendInboundOptions,
  SendInboundResult,
} from "../../types";
import path from "node:path";

export function getGatewayUrl(): string {
  return process.env.MC_CHAT_GATEWAY || "http://localhost:18789";
}

export function getChatSecret(): string | undefined {
  // Dedicated secret is preferred. Existing deployments always have the
  // gateway token, so it is a safe fail-closed migration fallback rather than
  // silently leaving the chat control plane unauthenticated.
  return process.env.MC_CHAT_SECRET || process.env.OPENCLAW_GATEWAY_TOKEN;
}

export async function checkOpenclawChatHealth(): Promise<{
  ok: boolean;
  details: Record<string, unknown>;
}> {
  const gatewayUrl = getGatewayUrl();
  const secret = getChatSecret();
  try {
    const res = await fetch(`${gatewayUrl}/mc-chat/health`, {
      headers: secret ? { "X-MC-Secret": secret } : undefined,
      signal: AbortSignal.timeout(5_000),
    });
    const raw = await res.text();
    let body: { ok?: unknown; channel?: unknown } = {};
    try {
      body = raw ? JSON.parse(raw) as { ok?: unknown; channel?: unknown } : {};
    } catch {
      // A non-JSON response is an unhealthy plugin response, reported below.
    }
    const ok = res.ok && body.ok === true && body.channel === "mc-chat";
    return {
      ok,
      details: {
        gatewayUrl,
        status: res.status,
        channel: typeof body.channel === "string" ? body.channel : undefined,
        ...(ok ? {} : { error: raw.slice(0, 500) || `HTTP ${res.status}` }),
      },
    };
  } catch (error) {
    return {
      ok: false,
      details: {
        gatewayUrl,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function textWithActiveOutboundWorkflow(message: InboundMessage): string {
  const workflow = message.activeOutboundWorkflow;
  const isOutboundOperator = message.skill === "yalc-operator"
    || message.primarySkill === "yalc-operator"
    || message.skills?.includes("yalc-operator");
  if (!workflow && !isOutboundOperator) return message.text;
  const script = path.join(process.cwd(), "skills", "yalc-operator", "scripts", "yalc-client.mjs");
  const missionControlBaseUrl = message.controlBaseUrl || "http://127.0.0.1:3000";
  const commandBus = {
    executable: "node",
    script,
    missionControlBaseUrl,
    slug: message.slug,
    invocation: "node <script> outbound-command --slug <slug> --mc-base-url <missionControlBaseUrl> --json '<payload>' --confirm-side-effect",
    campaignSetup: {
      listAudiences: `node "${script}" outbound-campaign-options --slug "${message.slug}" --mc-base-url "${missionControlBaseUrl}"`,
      startSelectedAudience: {
        invocation: `node "${script}" outbound-campaign-start --slug "${message.slug}" --mc-base-url "${missionControlBaseUrl}" --json '<payload>' --confirm-side-effect`,
        payload: { optionId: "<id returned by listAudiences>", requestId: message.missionControlRunId },
      },
    },
    ...(workflow ? {
      activeWorkflowActions: {
        status: { command: "outbound.workflow.status", runId: workflow.runId },
        rewriteDrafts: {
          command: "outbound.workflow.rewrite",
          runId: workflow.runId,
          style: "conversation_question_v1",
        },
        continueCohort: { command: "outbound.workflow.continue", runId: workflow.runId },
        approve: { command: "outbound.workflow.approve", runId: workflow.runId, actor: "Sancho" },
        executeDryRun: { command: "outbound.workflow.execute", runId: workflow.runId, dryRun: true },
        executeLive: {
          command: "outbound.workflow.execute",
          runId: workflow.runId,
          dryRun: false,
          confirmLinkedInSend: true,
        },
      },
    } : {}),
  };
  return [
    "[Trusted Mission Control Outbound Control]",
    ...(workflow ? [`active_workflow: ${JSON.stringify(workflow)}`] : []),
    `command_bus: ${JSON.stringify(commandBus)}`,
    "This command bus and any active workflow state are server-derived. Interpret free language; never classify it with a finite phrase list. Choose at most one compatible command for this turn.",
    "For a new campaign, list the server-provided audiences and ask the user to choose unless their turn already selects one of those known options. Start the selected audience only once. The --confirm-side-effect flag is a technical write guard; creating a draft campaign or rewriting drafts needs no additional user confirmation.",
    "Do not read or discover skill files for this turn. Never search templates for this batch and never claim the prior messages are unavailable. Live execution still requires explicit user confirmation.",
    "After a successful command, reply concisely; the workflow result is rendered separately by Mission Control.",
    "[/Trusted Mission Control Outbound Control]",
    "",
    message.text,
  ].join("\n");
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

// Backoff between forward attempts when the gateway is momentarily unreachable.
// The embedded OpenClaw runtime shares one event loop with this HTTP endpoint,
// so a burst of concurrent agent runs (e.g. a Full Foundation fan-out) can stall
// it for a few seconds and make the connection fail outright. A small bounded
// retry absorbs that blip instead of surfacing "gateway unreachable" and marking
// the delegation's run failed. We deliberately retry ONLY on a thrown
// connection-level error: a gateway that answered (any HTTP status) has received
// the message, so retrying it could double-dispatch. We add no default timeout —
// the gateway may hold the connection open to return a synchronous run reply.
const GATEWAY_FORWARD_RETRY_DELAYS_MS = [0, 500, 1500];

export async function sendOpenclawInbound(
  message: InboundMessage,
  opts?: SendInboundOptions,
): Promise<SendInboundResult> {
  const secret = getChatSecret();
  const body = JSON.stringify({
    ...message,
    text: textWithActiveOutboundWorkflow(message),
  });
  const headers = {
    "Content-Type": "application/json",
    ...(opts?.headers ?? {}),
    ...(secret ? { "X-MC-Secret": secret } : {}),
  };
  let lastError = "Gateway unreachable";
  for (let attempt = 0; attempt < GATEWAY_FORWARD_RETRY_DELAYS_MS.length; attempt += 1) {
    const backoff = GATEWAY_FORWARD_RETRY_DELAYS_MS[attempt];
    if (backoff) await new Promise((resolve) => setTimeout(resolve, backoff));
    try {
      const res = await fetch(`${getGatewayUrl()}/mc-chat/inbound`, {
        method: "POST",
        headers,
        body,
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
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return {
    ok: false,
    status: 0,
    raw: lastError,
    error: lastError,
  };
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
