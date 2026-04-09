import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { loadClients } from "@/lib/data/clients";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/cron-runs?limit=20&slug=hospital-capilar
 * Returns latest cron run outputs — ported from mc-server.js:6708
 */

let _cronCache: CronJob[] | null = null;
let _cronCacheTs = 0;
const CRON_CACHE_TTL = 5_000;

interface CronJob {
  id: string;
  name: string;
  payload?: { message?: string };
  schedule?: { kind?: string; expr?: string; everyMs?: number; tz?: string };
}

interface CronRun {
  jobId: string;
  jobName: string;
  status: string;
  summary: string;
  durationMs: number | null;
  model: string | null;
  runAtMs: number | null;
  sessionId: string | null;
  client_slug: string | null;
  category: string;
  hasOutput: boolean;
}

/** Read crons directly from jobs.json — avoids 11s execSync */
function loadCronsFromOpenClaw(): CronJob[] {
  const now = Date.now();
  if (_cronCache && (now - _cronCacheTs) < CRON_CACHE_TTL) return _cronCache;
  try {
    const jobsFile = path.join(process.env.HOME || "/tmp", ".openclaw", "cron", "jobs.json");
    const data = JSON.parse(fs.readFileSync(jobsFile, "utf-8"));
    _cronCache = data.jobs || [];
    _cronCacheTs = now;
    return _cronCache!;
  } catch {
    return _cronCache || [];
  }
}

function extractSlugFromCron(cronName: string, clients: { slug: string; name: string }[]): string | null {
  const lower = (cronName || "").toLowerCase();
  for (const c of clients) {
    if (lower.includes(c.name.toLowerCase()) || lower.includes(c.slug.toLowerCase())) return c.slug;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectCronCategory(name: string, _prompt?: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("metric") || n.includes("cost") || n.includes("dashboard") || n.includes("regenerar")) return "metrics";
  if (n.includes("pulse") || n.includes("intelligence") || n.includes("synthesis") || n.includes("thief") || n.includes("signal") || n.includes("idea")) return "intelligence";
  if (n.includes("outreach") || n.includes("lead") || n.includes("call prep") || n.includes("prospecting")) return "outreach";
  if (n.includes("content") || n.includes("blog") || n.includes("social") || n.includes("newsletter")) return "content";
  if (n.includes("health") || n.includes("backup") || n.includes("watchdog") || n.includes("memory") || n.includes("update") || n.includes("token") || n.includes("image-opt") || n.includes("compact") || n.includes("changelog") || n.includes("activity") || n.includes("mejora") || n.includes("skill-improvement") || n.includes("pattern")) return "system";
  return "other";
}

function slugifyCronName(name: string, clientSlug: string | null): string {
  let s = (name || "").toLowerCase();
  s = s.replace(/\s*[—–-]\s*(multi-client|system|global)$/i, "");
  if (clientSlug) {
    const clients = loadClients();
    const client = clients.find((c) => c.slug === clientSlug);
    if (client) s = s.replace(new RegExp("\\s*[—–-]\\s*" + client.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"), "");
    s = s.replace(new RegExp("\\s*[—–-]\\s*" + clientSlug.replace(/-/g, "[- ]?") + "$", "i"), "");
  }
  return s.trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slugParam = (req.query.slug as string) || null;
  const limitParam = Math.max(1, Math.min(parseInt(req.query.limit as string || "3", 10), 50));

  const clients = loadClients();
  const crons = loadCronsFromOpenClaw();
  const runsDir = path.join(process.env.HOME || "/tmp", ".openclaw", "cron", "runs");
  const runs: CronRun[] = [];

  for (const cron of crons) {
    const cronSlug = extractSlugFromCron(cron.name, clients);
    if (slugParam) {
      const prompt = (cron.payload?.message || "").toLowerCase();
      const nameMatch = cronSlug === slugParam;
      const promptMentions = prompt.includes(slugParam.toLowerCase());
      const brandPathMatch = prompt.includes("brand/" + slugParam);
      if (!nameMatch && !promptMentions && !brandPathMatch) continue;
    }

    const runFile = path.join(runsDir, cron.id + ".jsonl");
    if (!fs.existsSync(runFile)) continue;

    try {
      const content = fs.readFileSync(runFile, "utf-8").trim();
      const lines = content.split("\n").filter(Boolean);
      const lastN = lines.slice(-limitParam).reverse();
      for (const line of lastN) {
        try {
          const d = JSON.parse(line);
          if (d.action !== "finished") continue;
          runs.push({
            jobId: cron.id,
            jobName: cron.name || "—",
            status: d.status || "unknown",
            summary: d.summary || "",
            durationMs: d.durationMs || null,
            model: d.model || null,
            runAtMs: d.runAtMs || d.ts || null,
            sessionId: d.sessionId || null,
            client_slug: cronSlug || null,
            category: detectCronCategory(cron.name, cron.payload?.message || ""),
            hasOutput: false,
          });
        } catch { /* skip malformed lines */ }
      }
    } catch { /* skip missing files */ }
  }

  // Enrich with recurring-tasks output files
  for (const run of runs) {
    const targetSlug = run.client_slug || slugParam;
    if (!targetSlug) continue;
    const taskName = slugifyCronName(run.jobName, targetSlug);
    if (!taskName) continue;
    const taskDir = path.join(BASE, "brand", targetSlug, "recurring-tasks", taskName);

    const date = run.runAtMs ? new Date(run.runAtMs).toISOString().slice(0, 10) : null;
    if (date) {
      const outFile = path.join(taskDir, date + ".json");
      try {
        if (fs.existsSync(outFile)) {
          const saved = JSON.parse(fs.readFileSync(outFile, "utf-8"));
          if (saved.content) { run.summary = saved.content; run.hasOutput = true; continue; }
        }
      } catch { /* skip */ }
    }

    // Fallback: most recent output
    try {
      if (!fs.existsSync(taskDir)) continue;
      const files = fs.readdirSync(taskDir).filter((f) => f.endsWith(".json")).sort().reverse();
      for (const f of files) {
        try {
          const saved = JSON.parse(fs.readFileSync(path.join(taskDir, f), "utf-8"));
          if (saved.content) {
            run.summary = saved.content;
            run.hasOutput = true;
            if (saved.runAtMs) run.runAtMs = saved.runAtMs;
            break;
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  // Also scan recurring-tasks/ for outputs not covered by cron runs
  if (slugParam) {
    const rtDir = path.join(BASE, "brand", slugParam, "recurring-tasks");
    try {
      if (fs.existsSync(rtDir)) {
        const taskDirs = fs.readdirSync(rtDir).filter((d) => {
          try { return fs.statSync(path.join(rtDir, d)).isDirectory(); } catch { return false; }
        });
        for (const taskName of taskDirs) {
          const alreadyCovered = runs.some((r) => slugifyCronName(r.jobName, slugParam) === taskName && r.hasOutput);
          if (alreadyCovered) continue;

          const taskDirPath = path.join(rtDir, taskName);
          const files = fs.readdirSync(taskDirPath).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limitParam);
          for (const f of files) {
            try {
              const saved = JSON.parse(fs.readFileSync(path.join(taskDirPath, f), "utf-8"));
              if (!saved.content) continue;
              const date = f.replace(".json", "");
              const alreadyHasDate = runs.some((r) => r.hasOutput && slugifyCronName(r.jobName, slugParam) === taskName && r.runAtMs && new Date(r.runAtMs).toISOString().slice(0, 10) === date);
              if (alreadyHasDate) continue;

              runs.push({
                jobId: saved.cronId || taskName,
                jobName: saved.cronName || taskName.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
                status: saved.status || "ok",
                summary: saved.content,
                durationMs: saved.durationMs || null,
                model: saved.model || null,
                runAtMs: saved.runAtMs || new Date(date + "T08:00:00").getTime(),
                sessionId: null,
                client_slug: slugParam,
                category: detectCronCategory(saved.cronName || taskName, ""),
                hasOutput: true,
              });
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* skip */ }
  }

  runs.sort((a, b) => (b.runAtMs || 0) - (a.runAtMs || 0));
  res.status(200).json(runs);
}

export default compose(withErrorHandler, withAuth)(handler);
