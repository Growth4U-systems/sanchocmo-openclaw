import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { loadRecurringTasks, saveRecurringTasks } from "@/lib/data/recurring-tasks";
import { loadClients } from "@/lib/data/clients";
import { BASE } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";


// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectCronCategory(name: string, _prompt: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("metric") || n.includes("cost")) return "metrics";
  if (n.includes("pulse") || n.includes("intelligence") || n.includes("synthesis") || n.includes("thief") || n.includes("signal") || n.includes("idea")) return "intelligence";
  if (n.includes("outreach") || n.includes("lead") || n.includes("call prep") || n.includes("prospecting")) return "outreach";
  if (n.includes("content") || n.includes("blog") || n.includes("social") || n.includes("newsletter")) return "content";
  if (n.includes("health") || n.includes("backup") || n.includes("watchdog") || n.includes("memory") || n.includes("update") || n.includes("token") || n.includes("image-opt") || n.includes("compact") || n.includes("changelog") || n.includes("activity") || n.includes("mejora") || n.includes("skill-improvement") || n.includes("pattern") || n.includes("regenerar")) return "system";
  return "other";
}

function humanizeCron(schedule: Record<string, unknown>): string {
  if (!schedule) return "\u2014";
  if ((schedule as { kind?: string }).kind === "every") {
    const h = Math.round(((schedule as { everyMs?: number }).everyMs || 0) / 3600000);
    return h >= 24 ? `Cada ${Math.round(h / 24)}d` : `Cada ${h}h`;
  }
  const expr = ((schedule as { expr?: string }).expr || "");
  const parts = expr.split(/\s+/);
  if (parts.length < 5) return expr;
  const [min, hour, dom, , dow] = parts;
  const hStr = hour.includes(",")
    ? hour.split(",").map((h) => `${h}:${min.padStart(2, "0")}`).join(", ")
    : `${hour}:${min.padStart(2, "0")}`;
  const dowMap: Record<string, string> = { "0": "Dom", "1": "Lun", "2": "Mar", "3": "Mi\u00e9", "4": "Jue", "5": "Vie", "6": "S\u00e1b" };
  let dayStr = "";
  if (dow === "*" && dom === "*") dayStr = "Cada d\u00eda";
  else if (dow === "1-5") dayStr = "L-V";
  else if (dow === "0-4") dayStr = "D-J";
  else if (dow !== "*") {
    if (dow.includes("-")) {
      const [a, b] = dow.split("-");
      dayStr = (dowMap[a] || a) + "-" + (dowMap[b] || b);
    } else {
      dayStr = dow.split(",").map((d) => dowMap[d] || d).join(", ");
    }
  } else if (dom === "1") dayStr = "D\u00eda 1 del mes";
  else dayStr = `D\u00eda ${dom}`;
  return `${dayStr} ${hStr}`;
}

function extractSlugFromCron(cronName: string, clients: { slug: string; name: string }[]): string | null {
  const lower = (cronName || "").toLowerCase();
  for (const c of clients) {
    if (lower.includes(c.name.toLowerCase()) || lower.includes(c.slug.toLowerCase())) return c.slug;
  }
  return null;
}

function extractScripts(prompt: string): unknown[] {
  if (!prompt) return [];
  const scripts = new Set<string>();
  const invocations = Array.from(prompt.matchAll(/(?:node|python3|bash)\s+([^\s;|&"']+\.(?:js|py|sh))/g));
  for (const m of invocations) scripts.add(m[1]);
  const absPaths = Array.from(prompt.matchAll(/((?:~\/|\/)[^\s;|&"']+\.(?:js|py|sh))/g));
  for (const m of absPaths) scripts.add(m[1]);
  const relPaths = Array.from(prompt.matchAll(/((?:scripts|skills)\/[^\s;|&"']+\.(?:js|py|sh))/g));
  for (const m of relPaths) scripts.add(m[1]);

  const resolved: unknown[] = [];
  const seen = new Set<string>();
  for (const s of Array.from(scripts)) {
    if (s.includes("*") || s.includes("YYYY") || s.includes("config.js") || s.includes("state.js")) continue;
    let absPath = s;
    if (s.startsWith("~/")) absPath = s.replace("~", process.env.HOME || "/Users/ragi");
    else if (s.startsWith("scripts/") || s.startsWith("skills/")) absPath = path.join(BASE, s);
    else if (!s.startsWith("/")) absPath = path.join(BASE, s);
    try { absPath = fs.realpathSync(absPath); } catch { continue; }
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    const basename = path.basename(absPath);
    const relPath = absPath.startsWith(BASE) ? path.relative(BASE, absPath) : absPath;
    const lang = basename.endsWith(".py") ? "python" : basename.endsWith(".sh") ? "bash" : "javascript";
    let lines = 0;
    try { lines = fs.readFileSync(absPath, "utf-8").split("\n").length; } catch { /* empty */ }
    resolved.push({ path: relPath, absPath, name: basename, lang, lines });
  }
  return resolved;
}

function loadCronsFromOpenClaw(): unknown[] {
  const jobsFile = process.env.OPENCLAW_CRON_FILE
    || path.join(process.env.HOME || "/root", ".openclaw", "cron", "jobs.json");
  const data = readJSON<{ jobs?: unknown[] }>(jobsFile, { jobs: [] });
  return Array.isArray(data) ? data : (data.jobs || []);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const slugParam = (req.query.slug as string) || req.ctx?.clientSlug || null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: Record<string, any> = {};

    if (slugParam) {
      // Merge local JSON tasks with OpenClaw crons for this client
      const localTasks = loadRecurringTasks(slugParam);
      const allCrons = loadCronsFromOpenClaw();
      const clients = loadClients();
      const localIds = new Set(localTasks.map((t) => t.id));

      // Build enriched tasks from OpenClaw crons that match this client
      const openclawTasks: unknown[] = [];
      for (const cron of allCrons as Record<string, unknown>[]) {
        if (localIds.has(cron.id as string)) continue; // skip duplicates
        let cronSlug = extractSlugFromCron(cron.name as string, clients as { slug: string; name: string }[]);
        if (!cronSlug) {
          const payload = cron.payload as { message?: string } | undefined;
          const promptMatch = (payload?.message || "").match(/brand\/([a-z0-9_-]+)\//i);
          if (promptMatch && (clients as { slug: string }[]).some((c) => c.slug === promptMatch[1])) cronSlug = promptMatch[1];
        }
        if (cronSlug !== slugParam) continue;
        const payload = cron.payload as { message?: string; model?: string } | undefined;
        const state = cron.state as { lastRunAtMs?: number; nextRunAtMs?: number; lastStatus?: string; lastDurationMs?: number; consecutiveErrors?: number } | undefined;
        const sched = cron.schedule as Record<string, unknown> || {};
        openclawTasks.push({
          id: cron.id,
          name: cron.name || "\u2014",
          task_type: detectCronCategory(cron.name as string, payload?.message || ""),
          schedule: humanizeCron(sched),
          schedule_raw: sched,
          status: cron.enabled ? "active" : "paused",
          last_run_at: state?.lastRunAtMs ? new Date(state.lastRunAtMs).toISOString() : null,
          next_run_at: state?.nextRunAtMs ? new Date(state.nextRunAtMs).toISOString() : null,
          last_status: state?.lastStatus || null,
          last_duration_ms: state?.lastDurationMs || null,
          consecutive_errors: state?.consecutiveErrors || 0,
          ideas_generated: 0,
          agent: cron.agentId || "sancho",
          model: payload?.model || "\u2014",
          prompt: payload?.message || "",
          description: cron.description || "",
          scripts: extractScripts(payload?.message || ""),
          client_slug: slugParam,
          _source: "openclaw-cron",
          created_at: (cron as { createdAtMs?: number }).createdAtMs ? new Date((cron as { createdAtMs: number }).createdAtMs).toISOString() : null,
        });
      }

      result[slugParam] = [...openclawTasks, ...localTasks];

      // Also return available templates
      try {
        const templatesFile = path.join(BASE, "_system", "cron-templates.json");
        const templates = readJSON<Record<string, { auto_onboarding?: boolean; name_template?: string; description?: string; requires?: string; p00_task?: unknown }>>(templatesFile, {});
        const allTaskNames = [...openclawTasks, ...localTasks].map((c) => (((c as Record<string, unknown>).name as string) || "").toLowerCase());
        const available: unknown[] = [];
        for (const [key, tmpl] of Object.entries(templates)) {
          if (key === "$comment") continue;
          if (tmpl.auto_onboarding) continue;
          const cronName = (tmpl.name_template || "").replace("{NAME}", "").toLowerCase().trim().replace(/\s*[—–-]\s*$/, "");
          const isActive = allTaskNames.some((n: string) => n.toLowerCase().includes(cronName));
          if (!isActive) {
            available.push({
              template_key: key,
              name: tmpl.name_template || key,
              description: tmpl.description || "",
              requires: tmpl.requires || "",
              p00_task: tmpl.p00_task || null,
            });
          }
        }
        if (available.length > 0) result._available_templates = available;
      } catch { /* empty */ }
    } else {
      // Global view: group all crons by client
      const clients = loadClients();
      const crons = loadCronsFromOpenClaw();
      const grouped: Record<string, unknown[]> = {};
      for (const cron of crons as Record<string, unknown>[]) {
        let cronSlug = extractSlugFromCron(cron.name as string, clients as { slug: string; name: string }[]);
        if (!cronSlug) {
          const payload = cron.payload as { message?: string } | undefined;
          const promptMatch = (payload?.message || "").match(/brand\/([a-z0-9_-]+)\//i);
          if (promptMatch && (clients as { slug: string }[]).some((c) => c.slug === promptMatch[1])) cronSlug = promptMatch[1];
        }
        const key = cronSlug || "_system";
        if (!grouped[key]) grouped[key] = [];
        const payload = cron.payload as { message?: string; model?: string } | undefined;
        const state = cron.state as { lastRunAtMs?: number; nextRunAtMs?: number; lastStatus?: string; lastDurationMs?: number; consecutiveErrors?: number } | undefined;
        const sched = cron.schedule as Record<string, unknown> || {};
        grouped[key].push({
          id: cron.id,
          name: cron.name || "\u2014",
          task_type: detectCronCategory(cron.name as string, payload?.message || ""),
          schedule: humanizeCron(sched),
          schedule_raw: sched,
          status: cron.enabled ? "active" : "paused",
          last_run_at: state?.lastRunAtMs ? new Date(state.lastRunAtMs).toISOString() : null,
          next_run_at: state?.nextRunAtMs ? new Date(state.nextRunAtMs).toISOString() : null,
          last_status: state?.lastStatus || null,
          last_duration_ms: state?.lastDurationMs || null,
          consecutive_errors: state?.consecutiveErrors || 0,
          ideas_generated: 0,
          agent: cron.agentId || "sancho",
          model: payload?.model || "\u2014",
          prompt: payload?.message || "",
          description: cron.description || "",
          scripts: extractScripts(payload?.message || ""),
          client_slug: cronSlug || null,
          _source: "openclaw-cron",
          created_at: (cron as { createdAtMs?: number }).createdAtMs ? new Date((cron as { createdAtMs: number }).createdAtMs).toISOString() : null,
        });
      }
      result = grouped;
    }

    return res.status(200).json(result);
  }

  if (req.method === "POST") {
    const { slug, task } = req.body;
    if (!slug || !task) {
      return res.status(400).json({ error: "Missing slug or task" });
    }
    if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const tasks = loadRecurringTasks(slug);
    if (task.id) {
      const idx = tasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) {
        Object.assign(tasks[idx], task);
      } else {
        task.created_at = task.created_at || new Date().toISOString();
        tasks.push(task);
      }
    } else {
      task.id = crypto.randomUUID();
      task.created_at = new Date().toISOString();
      task.status = task.status || "active";
      task.ideas_generated = task.ideas_generated || 0;
      tasks.push(task);
    }
    saveRecurringTasks(slug, tasks);
    return res.status(200).json({ ok: true, task });
  }

  if (req.method === "DELETE") {
    const { slug, taskId } = req.body;
    if (!slug || !taskId) {
      return res.status(400).json({ error: "Missing slug or taskId" });
    }
    if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
      return res.status(403).json({ error: "Forbidden" });
    }
    let tasks = loadRecurringTasks(slug);
    const len = tasks.length;
    tasks = tasks.filter((t) => t.id !== taskId);
    if (tasks.length === len) {
      return res.status(404).json({ error: "Task not found" });
    }
    saveRecurringTasks(slug, tasks);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
