/**
 * YALC async-job callback handler (Sancho side).
 *
 * YALC returns `202 {jobId, statusUrl}` for long-running operations and, when
 * the job finishes, POSTs to a `callbackUrl` Sancho provided. The calling skill
 * stashes `{ slug, threadId, agent }` (the current Sancho chat thread) in the
 * job's opaque `callbackContext`. When the callback arrives we persist one
 * deterministic workflow update in that same thread. A callback never becomes
 * a user message and never starts another model turn.
 *
 * YALC owns workflow continuation and persists its state. Sancho only renders
 * the result, so provider callbacks cannot recurse, duplicate campaigns or
 * consume the chat model budget.
 */

import {
  upsertWorkflowJobMessage as defaultUpsertWorkflowJobMessage,
  type WorkflowJobEvent,
} from "@/lib/data/mc-chat";

/** Shape of the opaque context the YALC-calling skill set when starting the job. */
export interface JobCallbackContext {
  slug: string;
  threadId: string;
  agent: string;
  originalRequest?: string;
  command?: string;
  campaignId?: string;
  profileKind?: string;
  channel?: string;
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

  const optionalContext = (key: keyof JobCallbackContext): string | undefined => {
    const value = ctx[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  const originalRequest = optionalContext("originalRequest");
  const command = optionalContext("command");
  const campaignId = optionalContext("campaignId");
  const profileKind = optionalContext("profileKind");
  const channel = optionalContext("channel");

  return {
    event,
    jobId,
    tenantId,
    type,
    status,
    output: body.output,
    errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : undefined,
    callbackContext: {
      slug,
      threadId,
      agent,
      ...(originalRequest ? { originalRequest } : {}),
      ...(command ? { command } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(profileKind ? { profileKind } : {}),
      ...(channel ? { channel } : {}),
    },
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

export function formatJobResult(payload: JobCallbackPayload): string {
  const succeeded = payload.event === "job.completed";
  const type = payload.type || "trabajo de Outreach";
  const summary = summarizeOutput(payload.output);

  if (succeeded) {
    if (payload.type === "campaign.search") {
      return `Búsqueda completada: ${summary === "(sin output)" ? "resultado guardado" : summary}.`;
    }
    if (payload.type === "campaign.workflow.prepare") {
      const output = isRecord(payload.output) ? payload.output : {};
      const batch = isRecord(output.batch) ? output.batch : {};
      const source = isRecord(output.source) ? output.source : {};
      const enrichment = isRecord(output.enrichment) ? output.enrichment : {};
      const itemCount = typeof batch.itemCount === "number" ? batch.itemCount : null;
      if (itemCount === null) return "Campaña preparada y lista para revisar.";
      const counts = [
        typeof source.found === "number" ? `${source.found} encontrados` : null,
        typeof enrichment.enriched === "number" ? `${enrichment.enriched} enriquecidos` : null,
        `${itemCount} utilizables`,
      ].filter((value): value is string => Boolean(value));
      const truncated = source.hasMore === true
        ? typeof source.totalAvailable === "number"
          ? ` Apollo informó ${source.totalAvailable} disponibles; la siguiente tanda solo se prepara cuando la pidas.`
          : " Apollo informó más resultados; la siguiente tanda solo se prepara cuando la pidas."
        : "";
      return `Campaña lista para revisar: ${counts.join(", ")}.${truncated}`;
    }
    return `${type} completado: ${summary}.`;
  }

  const reason = payload.errorMessage?.trim() || "No se pudo completar este paso.";
  if (/no tiene linkedin como canal/i.test(reason)) {
    return "No se pudo preparar LinkedIn porque la campaña pertenece a otro canal. No se creó otra campaña ni se envió ningún contacto.";
  }
  if (/no_new_source_leads|apollo no devolvi[oó] contactos nuevos/i.test(reason)) {
    return "No encontramos personas con esos cargos dentro de las empresas seleccionadas. No se preparó ningún contacto ni se envió ningún mensaje.";
  }
  return `No se pudo completar ${type}: ${reason}`;
}

/** Injectable dependencies so the orchestration is unit-testable. */
export interface DispatchDeps {
  upsertWorkflowJobMessage: typeof defaultUpsertWorkflowJobMessage;
}

const defaultDeps: DispatchDeps = {
  upsertWorkflowJobMessage: defaultUpsertWorkflowJobMessage,
};

export interface DispatchResult {
  forwardedToGateway: boolean;
  recorded: boolean;
  threadId: string;
  agent: string;
  jobId: string;
  error?: string;
}

/**
 * Record a deterministic workflow update. Workflow progression happens in
 * YALC, not through a chain of model turns.
 */
export async function dispatchJobResult(
  payload: JobCallbackPayload,
  deps: Partial<DispatchDeps> = {},
): Promise<DispatchResult> {
  const { upsertWorkflowJobMessage } = { ...defaultDeps, ...deps };
  const { threadId, agent, command, campaignId } = payload.callbackContext;
  const succeeded = payload.event === "job.completed";
  const workflowJob: WorkflowJobEvent = {
    jobId: payload.jobId,
    type: payload.type,
    status: succeeded ? "completed" : "failed",
    ...(command ? { command } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(succeeded ? { summary: summarizeOutput(payload.output) } : {}),
    ...(!succeeded && payload.errorMessage ? { errorMessage: payload.errorMessage } : {}),
  };
  if (isRecord(payload.output)) {
    const runId = typeof payload.output.runId === "string" ? payload.output.runId : undefined;
    const workflowStatus = typeof payload.output.status === "string" ? payload.output.status : undefined;
    const batch = isRecord(payload.output.batch) ? payload.output.batch : null;
    const sample = Array.isArray(batch?.sample)
      ? batch.sample.flatMap((value) => {
          if (!isRecord(value) || typeof value.messageBody !== "string") return [];
          return [{
            ...(typeof value.leadId === "string" ? { leadId: value.leadId } : {}),
            messageBody: value.messageBody,
          }];
        }).slice(0, 3)
      : [];
    if (runId) workflowJob.runId = runId;
    if (workflowStatus) workflowJob.workflowStatus = workflowStatus;
    if (batch && typeof batch.itemCount === "number") {
      workflowJob.batch = { itemCount: batch.itemCount, sample };
    }
    const source = isRecord(payload.output.source) ? payload.output.source : {};
    const enrichment = isRecord(payload.output.enrichment) ? payload.output.enrichment : {};
    if (
      typeof source.found === "number"
      && typeof enrichment.enriched === "number"
      && batch
      && typeof batch.itemCount === "number"
    ) {
      workflowJob.stats = {
        found: source.found,
        enriched: enrichment.enriched,
        usable: batch.itemCount,
        totalAvailable: typeof source.totalAvailable === "number" ? source.totalAvailable : null,
        truncated: source.hasMore === true || source.truncated === true,
        hasMore: source.hasMore === true,
        nextPage: typeof source.nextPage === "number" ? source.nextPage : null,
      };
    }
  }
  upsertWorkflowJobMessage(threadId, formatJobResult(payload), workflowJob, agent);
  return {
    forwardedToGateway: false,
    recorded: true,
    threadId,
    agent,
    jobId: payload.jobId,
  };
}
