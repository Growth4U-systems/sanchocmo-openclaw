/**
 * /api/content-engine/retrigger-writer
 *
 *   POST { slug, contentTaskId }            → re-fire kind="initial" trigger
 *   POST { slug, contentTaskId, channel,    → re-fire kind="iterate"
 *          instruction }
 *
 * Used when the gateway was down (or the previous trigger failed) and the
 * user clicks "Reintentar" in the chat sidebar. Looks up the ContentTask
 * + parent + linked idea and re-invokes `triggerWriter` with the same shape
 * `generate-drafts.ts` uses for new approvals.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import { triggerWriter } from "@/lib/data/writer-trigger";
import type { ContentTask } from "@/types";

interface ParentTask {
  id: string;
  type?: string;
  content_tasks?: ContentTask[];
}

function findContentTaskAcrossProjects(
  slug: string,
  contentTaskId: string,
): { ct: ContentTask; parentTaskId: string; projectId: string } | null {
  const root = path.join(BASE, "brand", slug, "projects");
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const tasksPath = path.join(root, entry.name, "tasks.json");
    if (!fs.existsSync(tasksPath)) continue;
    let tasks: ParentTask[];
    try {
      tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
    } catch { continue; }
    for (const t of tasks) {
      const cts = t.content_tasks || [];
      const match = cts.find((c) => c.id === contentTaskId);
      if (match) return { ct: match, parentTaskId: t.id, projectId: entry.name };
    }
  }
  return null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug, contentTaskId, channel, instruction } = req.body || {};
  if (!slug || !contentTaskId) {
    return res.status(400).json({ error: "Missing slug or contentTaskId" });
  }

  const found = findContentTaskAcrossProjects(slug, contentTaskId);
  if (!found) return res.status(404).json({ error: "ContentTask not found" });
  const { ct, parentTaskId, projectId } = found;

  const kind: "initial" | "iterate" = instruction ? "iterate" : "initial";
  const trigger = await triggerWriter({
    slug,
    contentTaskId: ct.id,
    parentTaskId,
    projectId,
    ideaId: ct.idea_id,
    channels: ct.target_channels || [],
    skill: ct.skill || "social-writer",
    instruction: instruction || "",
    kind,
    channelScope: channel,
  });

  return res.status(200).json({
    ok: true,
    contentTaskId: ct.id,
    parentTaskId,
    writerTriggered: trigger.forwardedToGateway,
    writerError: trigger.error,
  });
}

export default withErrorHandler(handler);
