/**
 * POST /api/content-engine/iterate-draft
 *
 * Records a user iteration request against an existing draft. The actual
 * regeneration runs out-of-band: Dulcinea picks up drafts whose
 * `clarify_answers.iteration_request` is non-empty and produces a new
 * version.
 *
 * What this endpoint does today:
 *   1. Snapshots the current draft to `{channel}.v{N}.md`.
 *   2. Increments `iteration` on the live draft and stamps the request
 *      as a `clarify_answers.iteration_request` field for the writer to
 *      consume on its next run.
 *   3. Posts a marker message to the ContentTask's chat thread so the
 *      iteration is visible in the conversation history.
 *
 * Body: { slug: string, ideaId: string, channel: string, instruction: string }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { loadDraft, snapshotDraft, updateDraft } from "@/lib/data/drafts";
import { findContentTaskByIdAcrossProjects, setChannelPhase } from "@/lib/data/content-tasks";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  text: string;
  ts: string;
  meta?: Record<string, unknown>;
}

function appendChatMessage(slug: string, threadId: string, message: ChatMessage): void {
  const chatDir = path.join(BASE, "brand", slug, "chat");
  fs.mkdirSync(chatDir, { recursive: true });
  const chatFile = path.join(chatDir, `${threadId}.json`);
  let payload: { messages: ChatMessage[]; createdAt?: string };
  if (fs.existsSync(chatFile)) {
    try {
      payload = JSON.parse(fs.readFileSync(chatFile, "utf-8")) as { messages: ChatMessage[]; createdAt?: string };
    } catch {
      payload = { messages: [], createdAt: new Date().toISOString() };
    }
  } else {
    payload = { messages: [], createdAt: new Date().toISOString() };
  }
  payload.messages = [...(payload.messages || []), message];
  fs.writeFileSync(chatFile, JSON.stringify(payload, null, 2));
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug, ideaId, channel, instruction } = req.body || {};
  if (!slug || !ideaId || !channel || !instruction) {
    return res.status(400).json({ error: "Missing slug, ideaId, channel, or instruction" });
  }

  const draft = loadDraft(slug, ideaId, channel);
  if (!draft) return res.status(404).json({ error: "Draft not found" });

  const snapshotPath = snapshotDraft(slug, ideaId, channel);

  const newIteration = (draft.meta.iteration ?? 0) + 1;
  const updated = updateDraft(slug, ideaId, channel, {
    meta: {
      iteration: newIteration,
      clarify_answers: {
        ...(draft.meta.clarify_answers || {}),
        iteration_request: instruction,
      },
    },
  });

  // Move this channel back to "drafting" on the CT. setChannelPhase only
  // ratchets forward, so if the CT was in "Draft" / "Pending Media" the
  // channel_phases entry is updated but ct.status stays put — re-iterating
  // a single channel must NOT silently demote the whole CT. Re-iteration
  // is a per-channel concern; the human triggers status moves explicitly.
  if (updated.meta.content_task_id) {
    try {
      const found = findContentTaskByIdAcrossProjects(slug, updated.meta.content_task_id);
      if (found?.parentTaskId) {
        setChannelPhase(slug, found.parentTaskId, updated.meta.content_task_id, channel, "drafting");
      }
    } catch { /* non-fatal */ }
  }

  // Mirror the request in the parent ContentTask's chat thread so a human
  // can read the conversation in MC. The writer skill will respond there
  // when it finishes the new version.
  const threadId = draft.meta.content_task_id ? `task-${draft.meta.content_task_id.toLowerCase()}` : null;
  if (threadId) {
    appendChatMessage(slug, threadId, {
      role: "user",
      text: `🔄 Iteración pedida en *${channel}* (v${newIteration}): ${instruction}`,
      ts: new Date().toISOString(),
      meta: { kind: "draft_iteration", channel, idea_id: ideaId },
    });
  }

  return res.status(200).json({
    ok: true,
    draft: updated,
    iteration: newIteration,
    snapshotPath,
    threadNotified: !!threadId,
  });
}

export default withErrorHandler(handler);
