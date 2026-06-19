/**
 * YALC async-job callback handler (Sancho side).
 *
 * YALC returns `202 {jobId, statusUrl}` for long-running operations and, when
 * the job finishes, POSTs to a `callbackUrl` Sancho provided. The calling skill
 * stashes `{ slug, threadId, agent }` (the current Sancho chat thread) in the
 * job's opaque `callbackContext`. When the callback arrives we re-engage that
 * same agent on that same thread with a synthetic prompt summarizing the job,
 * so the agent can tell the user the result ("✅ YALC terminó: 132 leads…").
 *
 * Modeled on src/lib/data/feedback-triage-trigger.ts: addMessage a short system
 * note, then POST to `${getGatewayUrl()}/mc-chat/inbound` with `X-MC-Secret`,
 * `threadState:"continue"`, `isAdmin:true`, and the agent/slug/threadId taken
 * from the callbackContext (NOT hardcoded — the agent owns the thread).
 *
 * `dispatchJobResult` keeps its side-effecting deps injectable so the unit test
 * can stub fetch / gateway URL / chat secret / addMessage.
 */

import {
  addMessage as defaultAddMessage,
  getChatSecret as defaultGetChatSecret,
  getGatewayUrl as defaultGetGatewayUrl,
} from "@/lib/data/mc-chat";

/** Shape of the opaque context the YALC-calling skill set when starting the job. */
export interface JobCallbackContext {
  slug: string;
  threadId: string;
  agent: string;
}

export type JobCallbackEvent = "job.completed" | "job.failed";

/** The callback body YALC POSTs to Sancho when a job finishes. */
export interface JobCallbackPayload {
  event: JobCallbackEvent;
  jobId: string;
  tenantId: string;
  type: string;
  status: string;
  output?: unknown;
  errorMessage?: string;
  callbackContext: JobCallbackContext;
  timestamp?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate the raw callback body and return a typed payload, or throw with an
 * actionable message. Keeps validation pure/testable.
 */
export function parseCallback(body: unknown): JobCallbackPayload {
  if (!isRecord(body)) {
    throw new Error("Invalid job callback: body must be a JSON object");
  }

  const event = body.event;
  if (event !== "job.completed" && event !== "job.failed") {
    throw new Error(`Invalid job callback: event must be job.completed|job.failed (got ${String(event)})`);
  }

  const jobId = body.jobId;
  if (typeof jobId !== "string" || !jobId.trim()) {
    throw new Error("Invalid job callback: jobId is required");
  }

  const type = typeof body.type === "string" ? body.type : "";
  const status = typeof body.status === "string" ? body.status : event === "job.failed" ? "failed" : "completed";
  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";

  const ctx = body.callbackContext;
  if (!isRecord(ctx)) {
    throw new Error("Invalid job callback: callbackContext is required");
  }
  const { slug, threadId, agent } = ctx;
  if (typeof slug !== "string" || !slug.trim()) {
    throw new Error("Invalid job callback: callbackContext.slug is required");
  }
  if (typeof threadId !== "string" || !threadId.trim()) {
    throw new Error("Invalid job callback: callbackContext.threadId is required");
  }
  if (typeof agent !== "string" || !agent.trim()) {
    throw new Error("Invalid job callback: callbackContext.agent is required");
  }

  return {
    event,
    jobId,
    tenantId,
    type,
    status,
    output: body.output,
    errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : undefined,
    callbackContext: { slug, threadId, agent },
    timestamp: typeof body.timestamp === "string" ? body.timestamp : undefined,
  };
}

/** Compact, human-readable one-liner describing the job output for the prompt. */
export function summarizeOutput(output: unknown): string {
  if (output === undefined || output === null) return "(sin output)";
  if (typeof output === "string") return output.slice(0, 800);
  if (typeof output === "number" || typeof output === "boolean") return String(output);
  if (Array.isArray(output)) return `${output.length} elementos`;
  if (isRecord(output)) {
    // Surface the most common count-ish fields YALC returns, else a key list.
    const counts: string[] = [];
    for (const key of ["count", "total", "leads", "results", "rows", "sent", "enriched"]) {
      const v = output[key];
      if (typeof v === "number") counts.push(`${key}=${v}`);
      else if (Array.isArray(v)) counts.push(`${key}=${v.length}`);
    }
    if (counts.length > 0) return counts.join(", ");
    const summary = typeof output.summary === "string" ? output.summary : undefined;
    if (summary) return summary.slice(0, 800);
    const keys = Object.keys(output);
    return keys.length ? `keys: ${keys.slice(0, 12).join(", ")}` : "(objeto vacío)";
  }
  return String(output);
}

/** The gateway inbound payload shape we POST to re-engage the agent. */
export interface GatewayInboundPayload {
  slug: string;
  threadId: string;
  threadName: string;
  text: string;
  userId: string;
  userName: string;
  agent: string;
  threadState: "continue";
  isAdmin: true;
  senderRole: "admin";
}

/**
 * From the callbackContext + job result, build the synthetic `user` prompt and
 * the gateway inbound payload that re-engages the SAME agent on the SAME thread.
 * Pure function — no side effects, fully testable.
 */
export function buildReEngagePayload(payload: JobCallbackPayload): GatewayInboundPayload {
  const { slug, threadId, agent } = payload.callbackContext;
  const succeeded = payload.event === "job.completed";

  const lines = succeeded
    ? [
        `El trabajo asíncrono de YALC que lanzaste terminó. Informá al usuario del resultado en este hilo (en su idioma) y sugerí el siguiente paso si aplica.`,
        ``,
        `Resultado:`,
        `- estado: ${payload.status} (completado)`,
        `- tipo: ${payload.type || "(desconocido)"}`,
        `- jobId: ${payload.jobId}`,
        `- output: ${summarizeOutput(payload.output)}`,
      ]
    : [
        `El trabajo asíncrono de YALC que lanzaste FALLÓ. Informá al usuario en este hilo (en su idioma), explicá el error de forma clara y ofrecé reintentar o un siguiente paso.`,
        ``,
        `Resultado:`,
        `- estado: ${payload.status} (fallido)`,
        `- tipo: ${payload.type || "(desconocido)"}`,
        `- jobId: ${payload.jobId}`,
        `- error: ${payload.errorMessage || "(sin mensaje de error)"}`,
      ];

  const text = lines.join("\n");

  return {
    slug,
    threadId,
    threadName: `YALC job ${payload.type || payload.jobId}`,
    text,
    userId: "yalc-job-callback",
    userName: "YALC",
    agent,
    threadState: "continue",
    isAdmin: true,
    senderRole: "admin",
  };
}

/** Injectable dependencies so the orchestration is unit-testable. */
export interface DispatchDeps {
  fetch: typeof fetch;
  getGatewayUrl: () => string;
  getChatSecret: () => string | undefined;
  addMessage: typeof defaultAddMessage;
}

const defaultDeps: DispatchDeps = {
  fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  getGatewayUrl: defaultGetGatewayUrl,
  getChatSecret: defaultGetChatSecret,
  addMessage: defaultAddMessage,
};

export interface DispatchResult {
  forwardedToGateway: boolean;
  threadId: string;
  agent: string;
  jobId: string;
  error?: string;
}

/**
 * Orchestrate the re-engagement: add a short system note to the thread, then
 * POST the synthetic prompt to the gateway inbound so the agent replies in the
 * same thread. Mirrors triggerFeedbackTriage's addMessage + fetch flow.
 */
export async function dispatchJobResult(
  payload: JobCallbackPayload,
  deps: Partial<DispatchDeps> = {},
): Promise<DispatchResult> {
  const { fetch: fetchImpl, getGatewayUrl, getChatSecret, addMessage } = { ...defaultDeps, ...deps };
  const { slug, threadId, agent } = payload.callbackContext;
  const succeeded = payload.event === "job.completed";

  const note = succeeded
    ? `✅ YALC terminó el trabajo ${payload.type || payload.jobId}. Preparando el resumen...`
    : `⚠️ El trabajo de YALC ${payload.type || payload.jobId} falló. Informando...`;
  addMessage(threadId, "system", note);

  const inbound = buildReEngagePayload(payload);
  // Also record the synthetic user prompt on the thread so the conversation is
  // self-contained, exactly like the triage trigger does.
  addMessage(threadId, "user", inbound.text, agent);

  const secret = getChatSecret();
  try {
    const res = await fetchImpl(`${getGatewayUrl()}/mc-chat/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-MC-Secret": secret } : {}),
      },
      body: JSON.stringify(inbound),
      // Never hang the callback HTTP handler on a slow/down gateway (mirrors
      // the 15s timeout used by triggerFeedbackTriage).
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        forwardedToGateway: false,
        threadId,
        agent,
        jobId: payload.jobId,
        error: `gateway ${res.status}: ${text}`,
      };
    }
    return { forwardedToGateway: true, threadId, agent, jobId: payload.jobId };
  } catch (e) {
    return {
      forwardedToGateway: false,
      threadId,
      agent,
      jobId: payload.jobId,
      error: e instanceof Error ? e.message : "Gateway unreachable",
    };
  }
}
