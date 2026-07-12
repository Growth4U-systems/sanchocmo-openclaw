import type { WorkflowJobEvent } from "@/lib/data/mc-chat";

interface SynchronousWorkflowMessage {
  threadId: string;
  agent: string;
  text: string;
  event: WorkflowJobEvent;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildSynchronousOutboundWorkflowMessage(
  slug: string,
  input: unknown,
  result: unknown,
): SynchronousWorkflowMessage | null {
  const request = record(input);
  if (text(request.command) !== "outbound.workflow.rewrite") return null;
  const context = record(request.callbackContext);
  const threadId = text(context.threadId);
  if (!threadId || !threadId.startsWith(`${slug}:`)) return null;
  const output = record(result);
  const campaignId = text(output.campaignId);
  const runId = text(output.runId);
  const batch = record(output.batch);
  const itemCount = typeof batch.itemCount === "number" ? batch.itemCount : 0;
  const contentHash = text(batch.contentHash);
  if (!campaignId || !runId || itemCount < 1 || !contentHash) return null;
  const sample = Array.isArray(batch.sample)
    ? batch.sample.flatMap((item) => {
        const value = record(item);
        const messageBody = text(value.messageBody);
        if (!messageBody) return [];
        const leadId = text(value.leadId);
        return [{ ...(leadId ? { leadId } : {}), messageBody }];
      }).slice(0, 3)
    : [];
  return {
    threadId,
    agent: text(context.agent) || "rocinante",
    text: `Actualicé ${itemCount} mensaje${itemCount === 1 ? "" : "s"} en la campaña. Siguen pendientes de tu aprobación antes de cualquier envío.`,
    event: {
      jobId: `sync-rewrite:${runId}`,
      type: "campaign.workflow.rewrite",
      status: "completed",
      workflowStatus: text(output.status) || "awaiting_approval",
      command: "outbound.workflow.rewrite",
      campaignId,
      runId,
      summary: `${itemCount} drafts rewritten`,
      batch: { itemCount, sample },
    },
  };
}
