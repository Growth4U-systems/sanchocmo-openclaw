import { parseRuntimeControlReply } from "./agent-contract/control-reply.mjs";
import { createHash } from "node:crypto";

export interface RuntimeControlTurnContext {
  slug: string;
  threadId: string;
  missionControlRunId?: string;
  /** Raw one-turn capability used only as authority for child control turns. */
  parentCapability?: string;
  parentDispatchRunId?: string;
  parentDispatchLeaseToken?: string;
  controlDepth?: number;
  threadName?: string;
  respondingAgent: string;
  temporaryAgent?: boolean;
  userText: string;
  userId?: string;
  userName?: string;
  isAdmin: boolean;
  senderRole: "admin" | "client";
  source?: string;
  linkedTo?: string;
  docPath?: string;
  docKind?: string;
  attachments?: unknown[];
}

export interface RuntimeControlResult {
  text: string;
  followupMessages: string[];
  actionsDispatched: number;
}

interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<FetchResponseLike>;

function baseUrl(): string {
  const value = process.env.MC_NEXT_URL
    || process.env.BASE_URL
    || process.env.NEXTAUTH_URL
    || "http://localhost:3000";
  return value.replace(/\/+$/, "");
}

async function postJson(
  fetchImpl: FetchLike,
  url: string,
  secret: string,
  body: unknown,
  context: RuntimeControlTurnContext,
  extraHeaders: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MC-Secret": secret,
        "X-Mission-Control-Parent-Run-Id": context.missionControlRunId || "",
        "X-Sancho-Parent-Run-Capability": context.parentCapability || "",
        ...(context.parentDispatchRunId && context.parentDispatchLeaseToken
          ? {
              "X-Sancho-Dispatch-Run-Id": context.parentDispatchRunId,
              "X-Sancho-Dispatch-Lease-Token": context.parentDispatchLeaseToken,
            }
          : {}),
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> | null = null;
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      // The caller turns a non-JSON response into an explicit follow-up.
    }
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function commonDispatchBody(context: RuntimeControlTurnContext) {
  return {
    slug: context.slug,
    userId: context.userId,
    userName: context.userName,
    isAdmin: context.isAdmin,
    senderRole: context.senderRole,
    attachments: context.attachments,
    _source: context.source,
  };
}

function actionIdempotencyKey(
  context: RuntimeControlTurnContext,
  action: string,
  value: unknown,
): string | undefined {
  if (!context.missionControlRunId) return undefined;
  const digest = createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
  return `mc-control:${context.missionControlRunId}:${action}:${digest}`;
}

/**
 * Execute parsed control actions through Sancho's authenticated Next control
 * plane. This makes the behavior independent of the selected model/runtime as
 * long as that runtime returns its final text to `/api/chat/send` or webhook.
 */
export async function processRuntimeControlReply(
  rawText: string,
  context: RuntimeControlTurnContext,
  options: { secret?: string; fetchImpl?: FetchLike; nextBaseUrl?: string } = {},
): Promise<RuntimeControlResult> {
  const parsed = parseRuntimeControlReply(rawText, {
    respondingAgent: context.respondingAgent,
    temporaryAgent: context.temporaryAgent,
  });
  return dispatchRuntimeControlActions(parsed, context, options);
}

export async function dispatchRuntimeControlActions(
  parsed: ReturnType<typeof parseRuntimeControlReply>,
  context: RuntimeControlTurnContext,
  options: { secret?: string; fetchImpl?: FetchLike; nextBaseUrl?: string } = {},
): Promise<RuntimeControlResult> {
  const result: RuntimeControlResult = {
    text: parsed.text,
    followupMessages: [],
    actionsDispatched: 0,
  };
  const hasActions = Boolean(parsed.intervention || parsed.routeRequests.length);
  if (!hasActions) return result;
  if ((context.controlDepth ?? 0) >= 1) {
    result.followupMessages.push("⚠️ Bloqueé un encadenamiento de control. Este turno ya fue originado por una intervención o cambio de tarea.");
    return result;
  }

  const secret = options.secret;
  if (!secret) {
    result.followupMessages.push("⚠️ No ejecuté el cambio solicitado porque el control plane no tiene MC_CHAT_SECRET configurado.");
    return result;
  }
  if (!context.missionControlRunId || !context.parentCapability) {
    result.followupMessages.push(
      "⚠️ No ejecuté el cambio solicitado porque falta la autoridad del turno padre.",
    );
    return result;
  }
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const nextBaseUrl = (options.nextBaseUrl || baseUrl()).replace(/\/+$/, "");

  if (parsed.intervention) {
    const dispatch = await postJson(fetchImpl, `${nextBaseUrl}/api/chat/send`, secret, {
      ...commonDispatchBody(context),
      threadId: context.threadId,
      threadName: context.threadName,
      text: parsed.intervention.brief,
      agent: "sancho",
      scope: "agent",
      skillMode: "auto",
      temporaryAgent: true,
      controlDepth: 1,
      idempotencyKey: actionIdempotencyKey(context, "temporary-sancho", parsed.intervention),
      linkedTo: context.linkedTo,
      docPath: context.docPath,
      docKind: context.docKind,
    }, context);
    if (dispatch.ok) result.actionsDispatched += 1;
    else result.followupMessages.push("⚠️ No pude iniciar la intervención temporal de Sancho. La tarea y su agente original no cambiaron.");
    return result;
  }

  const seen = new Set<string>();
  for (const routeRequest of parsed.routeRequests) {
    const routeAgent = routeRequest.agent || context.respondingAgent;
    const routeName = routeRequest.name || `${routeAgent}: ${routeRequest.brief.slice(0, 64)}`;
    const dedupe = JSON.stringify([
      routeAgent,
      routeName,
      routeRequest.brief,
      routeRequest.taskId || "",
      routeRequest.proposalId || "",
    ]);
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const route = await postJson(fetchImpl, `${nextBaseUrl}/api/tasks/resolve-route`, secret, {
      slug: context.slug,
      sourceThreadId: context.threadId,
      groupId: routeRequest.groupId,
      targetTaskId: routeRequest.taskId,
      proposalId: routeRequest.proposalId,
      agent: routeAgent,
      skill: routeRequest.skill,
      name: routeName,
      brief: routeRequest.brief,
      confirmCreate: routeRequest.confirmCreate === true,
      confirmationText: routeRequest.confirmCreate === true ? context.userText : undefined,
    }, context);
    const routeData = route.data;
    const action = typeof routeData?.action === "string" ? routeData.action : "";
    const targetThreadId = typeof routeData?.threadId === "string" ? routeData.threadId : "";
    const dispatchGrant = typeof routeData?.dispatchGrant === "string"
      ? routeData.dispatchGrant
      : "";
    const dispatchIdempotencyKey =
      typeof routeData?.dispatchIdempotencyKey === "string"
        ? routeData.dispatchIdempotencyKey
        : "";
    if (
      route.ok &&
      (action === "reuse" || action === "created") &&
      targetThreadId &&
      dispatchGrant &&
      dispatchIdempotencyKey
    ) {
      const dispatch = await postJson(fetchImpl, `${nextBaseUrl}/api/chat/send`, secret, {
        ...commonDispatchBody(context),
        threadId: targetThreadId,
        threadName: typeof routeData?.threadName === "string" ? routeData.threadName : routeName,
        text: routeRequest.brief,
        agent: routeAgent,
        skill: routeRequest.skill,
        controlDepth: 1,
        idempotencyKey: dispatchIdempotencyKey,
      }, context, {
        "X-Sancho-Route-Dispatch-Grant": dispatchGrant,
      });
      if (dispatch.ok) {
        result.actionsDispatched += 1;
        continue;
      }
    }

    result.followupMessages.push(
      typeof routeData?.message === "string" && routeData.message.trim()
        ? routeData.message
        : `⚠️ No pude resolver una tarea segura para **${routeAgent}** dentro de este grupo. No se despachó nada.`,
    );
  }
  return result;
}
