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
      body: JSON.stringify({
        ...message,
        text: textWithActiveOutboundWorkflow(message),
      }),
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
