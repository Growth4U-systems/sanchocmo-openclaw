import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { upsertWorkflowJobMessage } from "@/lib/data/mc-chat";
import {
  dispatchOutboundCommand,
  outboundCommandErrorResponse,
} from "@/lib/yalc/outbound-command";
import { resolveYalcConfig, yalcErrorResponse } from "@/lib/yalc/client";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function statusLabel(status: string): string {
  if (status === "queued") return "en cola";
  if (status === "running") return "preparando contactos";
  if (status === "awaiting_approval") return "pendiente de revisión";
  if (status === "approved") return "aprobada, sin enviar";
  if (status === "executing") return "enviando";
  if (status === "completed") return "completada";
  if (status === "completed_with_errors") return "completada con incidencias";
  if (status === "failed") return "con error";
  return "actualizada";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const campaignId = text(req.body?.campaignId);
  if (!campaignId) return res.status(400).json({ error: "campaignId is required" });

  try {
    const { httpStatus: _httpStatus, ...payload } = await dispatchOutboundCommand(
      resolveYalcConfig(slug),
      { command: "outbound.workflow.status", campaignId, limit: 3 },
    );
    const run = record(payload.run);
    const batch = record(payload.batch);
    const runId = text(run.id);
    if (!runId) return res.status(404).json({ error: "workflow_not_found" });
    const workflowStatus = text(run.status) || "running";
    const itemCount = typeof batch.itemCount === "number" ? batch.itemCount : 0;
    const sample = Array.isArray(batch.items)
      ? batch.items.flatMap((item) => {
          const value = record(item);
          const messageBody = text(value.messageBody);
          if (!messageBody) return [];
          const leadId = text(value.leadId);
          return [{ ...(leadId ? { leadId } : {}), messageBody }];
        }).slice(0, 3)
      : [];
    const threadId = `${slug}:b2b-campaign-${campaignId}`;
    const visibleStatus = statusLabel(workflowStatus);
    upsertWorkflowJobMessage(
      threadId,
      itemCount > 0
        ? `Campaña cargada: ${itemCount} mensaje${itemCount === 1 ? "" : "s"}, ${visibleStatus}.`
        : `Campaña cargada: ${visibleStatus}.`,
      {
        jobId: `campaign-context:${runId}`,
        type: "campaign.workflow.status",
        status: "completed",
        workflowStatus,
        command: "outbound.workflow.status",
        campaignId,
        runId,
        summary: `workflow ${workflowStatus}`,
        ...(itemCount > 0 ? { batch: { itemCount, sample } } : {}),
      },
      "rocinante",
    );
    return res.status(200).json({ ok: true, threadId, campaignId, runId, workflowStatus, itemCount });
  } catch (error) {
    const command = outboundCommandErrorResponse(error);
    if (command) return res.status(command.status).json(command.body);
    const yalc = yalcErrorResponse(error);
    return res.status(yalc.status).json(yalc.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
