/**
 * GET /api/content-engine/idea-redirect?slug=X&ideaId=Y
 *
 * Public redirect resolver used by the Slack "📝 Redactar en MC" link.
 * Reads idea-queue.json at click time and 302s to the most specific URL
 * the idea currently supports — solves the race between Slack message
 * update (right after Approve) and generate-drafts completion (~30-60s).
 *
 * Resolution order:
 *   1. content_task_id + project_task_id → draft page for that channel
 *   2. project_task_id only              → parent dispatch task page
 *   3. nothing                           → ideas tab fallback
 */
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";

interface QueueEntry {
  id: string;
  project_id?: string;
  project_task_id?: string;
  content_task_id?: string;
  target_channel?: string;
  content_task_channels?: string[];
}

function getMcBaseUrl(): string {
  return process.env.MC_PUBLIC_URL || "https://sancho-cmo.taild48df2.ts.net:8443";
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = (req.query.slug as string || "").trim();
  const ideaId = (req.query.ideaId as string || "").trim();
  const mcUrl = getMcBaseUrl();

  if (!slug || !ideaId) {
    return res.redirect(302, `${mcUrl}/dashboard`);
  }

  const ideasFallback = `${mcUrl}/dashboard/${slug}/content-creation?tab=ideas&idea=${encodeURIComponent(ideaId)}`;
  const queuePath = path.join(BASE, "brand", slug, "content", "idea-queue.json");

  let idea: QueueEntry | undefined;
  try {
    const queue = JSON.parse(fs.readFileSync(queuePath, "utf-8")) as QueueEntry[];
    idea = queue.find((i) => i.id === ideaId);
  } catch {
    return res.redirect(302, ideasFallback);
  }

  if (!idea || !idea.project_id || !idea.project_task_id) {
    return res.redirect(302, ideasFallback);
  }

  if (idea.content_task_id) {
    const channel = idea.content_task_channels?.[0] || idea.target_channel || "linkedin";
    return res.redirect(
      302,
      `${mcUrl}/dashboard/${slug}/tasks/${idea.project_id}/sub/${idea.project_task_id}/content/${idea.content_task_id}/draft/${channel}`,
    );
  }

  return res.redirect(
    302,
    `${mcUrl}/dashboard/${slug}/tasks/${idea.project_task_id}`,
  );
}
