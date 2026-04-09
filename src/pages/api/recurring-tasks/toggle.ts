import type { NextApiRequest, NextApiResponse } from "next";
import { execSync } from "child_process";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { loadRecurringTasks, saveRecurringTasks } from "@/lib/data/recurring-tasks";

const EXEC_PATH = process.env.PATH || "/usr/local/bin:/usr/bin:/bin";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, taskId } = req.body;
  if (!slug || !taskId) {
    return res.status(400).json({ error: "Missing slug or taskId" });
  }
  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const tasks = loadRecurringTasks(slug);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  const newStatus = task.status === "active" ? "paused" : "active";

  // If this is an OpenClaw cron, toggle it via CLI
  if (task._source === "openclaw-cron") {
    try {
      const cmd = newStatus === "active" ? "enable" : "disable";
      execSync(`openclaw cron ${cmd} ${taskId} 2>/dev/null`, {
        timeout: 10000,
        encoding: "utf-8",
        env: { ...process.env, PATH: EXEC_PATH },
      });
    } catch (e) {
      return res.status(500).json({
        error: "Failed to toggle cron: " + (e instanceof Error ? e.message : String(e)),
      });
    }
  } else {
    task.status = newStatus;
    saveRecurringTasks(slug, tasks);
  }

  return res.status(200).json({ ok: true, taskId, newStatus });
}

export default compose(withErrorHandler, withAuth)(handler);
