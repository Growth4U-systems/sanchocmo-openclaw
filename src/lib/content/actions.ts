import path from "path";
import { addMessage } from "@/lib/data/mc-chat";
import { loadDraft, snapshotDraft, updateDraft, type Draft } from "@/lib/data/drafts";
import {
  findContentTaskByIdAcrossProjects,
  setChannelPhase,
} from "@/lib/data/content-tasks";
import { triggerWriter } from "@/lib/data/writer-trigger";
import type { ContentTask } from "@/types";

export interface ContentTaskContext {
  ct: ContentTask;
  parentTaskId: string;
  projectId: string;
}

export interface WriterTriggerPreview {
  contentTaskId: string;
  parentTaskId: string;
  projectId: string;
  ideaId: string;
  channels: string[];
  skill: string;
  kind: "initial" | "iterate";
  channelScope?: string;
  instruction: string;
}

export interface DraftIterationPreview {
  ideaId: string;
  channel: string;
  currentIteration: number;
  nextIteration: number;
  snapshotPath: string;
  contentTaskId: string | null;
  threadIds: string[];
  instruction: string;
}

export function getContentTaskContext(slug: string, contentTaskId: string): ContentTaskContext {
  const found = findContentTaskByIdAcrossProjects(slug, contentTaskId);
  if (!found) throw new Error("ContentTask not found");
  return {
    ct: found.ct,
    parentTaskId: found.parentTaskId,
    projectId: path.basename(found.projectDir),
  };
}

export function previewRetriggerContentWriter(
  slug: string,
  contentTaskId: string,
  input: { channel?: string; instruction?: string } = {},
): WriterTriggerPreview {
  const { ct, parentTaskId, projectId } = getContentTaskContext(slug, contentTaskId);
  const channels = ct.target_channels || [];
  if (input.channel && channels.length > 0 && !channels.includes(input.channel)) {
    throw new Error(`Channel "${input.channel}" is not in ContentTask target_channels`);
  }
  const instruction = input.instruction || "";
  return {
    contentTaskId: ct.id,
    parentTaskId,
    projectId,
    ideaId: ct.idea_id,
    channels,
    skill: ct.skill || "social-writer",
    kind: instruction ? "iterate" : "initial",
    channelScope: input.channel,
    instruction,
  };
}

export async function retriggerContentWriter(
  slug: string,
  contentTaskId: string,
  input: { channel?: string; instruction?: string } = {},
) {
  const preview = previewRetriggerContentWriter(slug, contentTaskId, input);
  const trigger = await triggerWriter({
    slug,
    contentTaskId: preview.contentTaskId,
    parentTaskId: preview.parentTaskId,
    projectId: preview.projectId,
    ideaId: preview.ideaId,
    channels: preview.channels,
    skill: preview.skill,
    instruction: preview.instruction,
    kind: preview.kind,
    channelScope: preview.channelScope,
  });
  return {
    ok: true,
    ...preview,
    writerTriggered: trigger.forwardedToGateway,
    writerError: trigger.error,
    threadId: trigger.threadId,
  };
}

export function previewDraftIteration(
  slug: string,
  ideaId: string,
  channel: string,
  instruction: string,
): DraftIterationPreview {
  const draft = loadDraft(slug, ideaId, channel);
  if (!draft) throw new Error("Draft not found");
  const currentIteration = draft.meta.iteration ?? 0;
  const contentTaskId = draft.meta.content_task_id || null;
  return {
    ideaId,
    channel,
    currentIteration,
    nextIteration: currentIteration + 1,
    snapshotPath: `content/drafts/${ideaId}/${channel}.v${currentIteration}.md`,
    contentTaskId,
    threadIds: contentTaskId ? iterationThreadIds(slug, contentTaskId) : [],
    instruction,
  };
}

export function requestDraftIteration(
  slug: string,
  ideaId: string,
  channel: string,
  instruction: string,
) {
  const preview = previewDraftIteration(slug, ideaId, channel, instruction);
  const snapshotPath = snapshotDraft(slug, ideaId, channel);
  const draft = loadDraft(slug, ideaId, channel);
  if (!draft) throw new Error("Draft not found");

  const updated = updateDraft(slug, ideaId, channel, {
    meta: {
      iteration: preview.nextIteration,
      clarify_answers: {
        ...(draft.meta.clarify_answers || {}),
        iteration_request: instruction,
      },
    },
  });

  if (updated.meta.content_task_id) {
    const found = findContentTaskByIdAcrossProjects(slug, updated.meta.content_task_id);
    if (found?.parentTaskId) {
      setChannelPhase(slug, found.parentTaskId, updated.meta.content_task_id, channel, "drafting");
    }
  }

  const threadIds = updated.meta.content_task_id ? iterationThreadIds(slug, updated.meta.content_task_id) : [];
  for (const threadId of threadIds) {
    addMessage(
      threadId,
      "user",
      `Iteracion pedida en *${channel}* (v${preview.nextIteration}): ${instruction}`,
    );
  }

  return {
    ok: true,
    draft: updated,
    iteration: preview.nextIteration,
    snapshotPath,
    threadIds,
    threadNotified: threadIds.length > 0,
  };
}

export function serializeDraftIterationResult(draft: Draft, maxChars = 4000) {
  const truncated = draft.body.length > maxChars;
  return {
    relPath: draft.relPath,
    meta: draft.meta,
    content: truncated ? draft.body.slice(0, maxChars) : draft.body,
    truncated,
  };
}

function iterationThreadIds(slug: string, contentTaskId: string): string[] {
  const canonical = `${slug}:content:${contentTaskId.toLowerCase()}`;
  const legacy = `${slug}:task-${contentTaskId.toLowerCase()}`;
  return canonical === legacy ? [canonical] : [canonical, legacy];
}
