import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { loadClients } from "@/lib/data/clients";
import {
  ensureMeetingIntelligenceSetupTask,
  getMeetingIntelligenceSetupTask,
  MEETING_INTELLIGENCE_SETUP_TASK_NAME,
} from "@/lib/data/meeting-intelligence-setup";

function serializeInfo(info: ReturnType<typeof getMeetingIntelligenceSetupTask>) {
  if (!info) return null;
  return {
    project: info.project,
    task: info.task,
    projectDirName: info.projectDirName,
    legacyTaskCount: info.legacyTaskCount,
    created: info.created,
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug as string) || req.body?.slug || req.ctx?.clientSlug;

  if (req.method === "GET") {
    if (!slug) return res.status(400).json({ error: "Missing slug" });
    if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const setupTask = getMeetingIntelligenceSetupTask(slug);
    return res.status(200).json({
      ok: true,
      exists: Boolean(setupTask),
      taskName: MEETING_INTELLIGENCE_SETUP_TASK_NAME,
      setupTask: serializeInfo(setupTask),
    });
  }

  if (req.method === "POST") {
    if (req.body?.allActive) {
      if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin required" });
      const clients = loadClients().filter((client) => client.active !== false);
      const results = clients.map((client) => ({
        slug: client.slug,
        setupTask: serializeInfo(ensureMeetingIntelligenceSetupTask(client.slug)),
      }));
      return res.status(200).json({ ok: true, allActive: true, results });
    }

    if (!slug) return res.status(400).json({ error: "Missing slug" });
    if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const setupTask = ensureMeetingIntelligenceSetupTask(slug);
    return res.status(200).json({ ok: true, exists: true, setupTask: serializeInfo(setupTask) });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
