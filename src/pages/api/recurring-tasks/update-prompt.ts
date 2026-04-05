import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

const EXEC_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  const { taskId, prompt } = req.body;
  if (!taskId || !prompt) {
    return res.status(400).json({ error: "Missing taskId or prompt" });
  }

  // Write prompt to temp file to avoid shell escaping issues
  const tmpFile = path.join(BASE, "_system", ".tmp-cron-prompt-" + taskId.slice(0, 8) + ".txt");
  fs.writeFileSync(tmpFile, prompt);

  const ocBin = fs.existsSync("/opt/homebrew/bin/openclaw") ? "/opt/homebrew/bin/openclaw" : "openclaw";
  const envOpts = {
    timeout: 15000,
    encoding: "utf-8" as const,
    env: { ...process.env, PATH: EXEC_PATH },
  };

  try {
    execSync(`${ocBin} cron update ${taskId} --prompt-file "${tmpFile}" 2>/dev/null`, envOpts);
  } catch {
    try {
      execSync(`${ocBin} cron update ${taskId} --prompt "${tmpFile}" 2>/dev/null`, envOpts);
    } catch {
      try { fs.unlinkSync(tmpFile); } catch { /* empty */ }
      return res.status(500).json({
        error: "Failed to update cron prompt. Use `openclaw cron update` manually.",
      });
    }
  }

  try { fs.unlinkSync(tmpFile); } catch { /* empty */ }

  return res.status(200).json({ ok: true, taskId });
}

export default compose(withErrorHandler, withAuth)(handler);
