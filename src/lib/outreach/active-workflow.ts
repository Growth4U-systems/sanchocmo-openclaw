import type { ThreadData } from "@/lib/data/mc-chat";

export interface ActiveOutboundWorkflowContext {
  campaignId: string;
  runId: string;
  status:
    | "queued"
    | "running"
    | "awaiting_approval"
    | "approved"
    | "executing"
    | "completed"
    | "completed_with_errors"
    | "failed";
  lastOperation: string;
  batch?: {
    itemCount: number;
    sample: Array<{ leadId?: string; messageBody: string }>;
  };
}

const WORKFLOW_STATUSES = new Set<ActiveOutboundWorkflowContext["status"]>([
  "queued",
  "running",
  "awaiting_approval",
  "approved",
  "executing",
  "completed",
  "completed_with_errors",
  "failed",
]);

function workflowStatus(job: NonNullable<ThreadData["messages"][number]["workflowJob"]>): ActiveOutboundWorkflowContext["status"] {
  if (job.workflowStatus && WORKFLOW_STATUSES.has(job.workflowStatus as ActiveOutboundWorkflowContext["status"])) {
    return job.workflowStatus as ActiveOutboundWorkflowContext["status"];
  }
  if (job.type === "campaign.workflow.execute") return "completed";
  if (job.type === "campaign.workflow.approve") return "approved";
  return "awaiting_approval";
}

export function resolveActiveOutboundWorkflow(
  thread: Pick<ThreadData, "messages">,
): ActiveOutboundWorkflowContext | undefined {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    const job = message.workflowJob;
    if (
      message.role !== "workflow"
      || job?.status !== "completed"
      || !job.type.startsWith("campaign.workflow.")
      || !job.campaignId
      || !job.runId
    ) {
      continue;
    }
    const sample = job.batch?.sample.slice(0, 3).map((item) => ({
      ...(item.leadId ? { leadId: item.leadId } : {}),
      messageBody: item.messageBody.slice(0, 500),
    }));
    return {
      campaignId: job.campaignId,
      runId: job.runId,
      status: workflowStatus(job),
      lastOperation: job.type,
      ...(job.batch ? {
        batch: {
          itemCount: job.batch.itemCount,
          sample: sample ?? [],
        },
      } : {}),
    };
  }
  return undefined;
}
