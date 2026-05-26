import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { loadRecurringTasks, saveRecurringTasks } from "@/lib/data/recurring-tasks";
import { loadClients } from "@/lib/data/clients";
import { BASE } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";
import {
  enrichCrons,
  humanizeSchedule,
  type EnrichedCron,
} from "@/lib/data/openclaw-crons";


/** Resolve script references inside a cron prompt to {path, name, lang, lines}.
 *  Kept here (not in openclaw-crons) because it's specific to this endpoint's
 *  payload shape and noisy enough to dilute the shared helper. */
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

/** Shape returned to the UI for each cron — keeps backward-compatible field
 *  names while adding the new `running` and `last_finding` payload. */
function toApiShape(c: EnrichedCron, slug: string | null) {
  return {
    id: c.id,
    name: c.name,
    task_type: c.category,
    schedule: humanizeSchedule(c.schedule_raw || undefined),
    schedule_raw: c.schedule_raw,
    status: c.enabled ? "active" : "paused",
    last_run_at: c.last_run_at,
    next_run_at: c.next_run_at,
    last_status: c.last_status,
    last_duration_ms: c.last_duration_ms,
    consecutive_errors: c.consecutive_errors,
    last_diagnostic_summary: c.last_diagnostic_summary,
    last_error: c.last_error,
    last_error_reason: c.last_error_reason,
    last_finding: c.last_finding,
    diagnostics: c.diagnostics,
    running: c.running,
    ideas_generated: 0,
    agent: c.agent,
    model: c.model,
    prompt: c.prompt,
    description: c.description,
    scripts: extractScripts(c.prompt),
    client_slug: c.client_slug ?? slug ?? null,
    _source: "openclaw-cron",
    _shared: c.client_slug === null,
    created_at: null as string | null,
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const slugParam = (req.query.slug as string) || req.ctx?.clientSlug || null;
    const includeSystem = req.query.includeSystem === "1" && !!req.ctx?.isAdmin;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: Record<string, any> = {};

    if (slugParam) {
      const clients = loadClients() as { slug: string; name: string }[];
      const localTasks = loadRecurringTasks(slugParam);
      const localIds = new Set(localTasks.map((t) => t.id));

      const { crons: brandCrons, systemCrons } = enrichCrons({
        slug: slugParam,
        includeSystem,
        clients,
      });

      const openclawTasks = brandCrons
        .filter((c) => !localIds.has(c.id))
        .map((c) => toApiShape(c, slugParam));

      result[slugParam] = [...openclawTasks, ...localTasks];

      if (includeSystem) {
        result._system = systemCrons.map((c) => toApiShape(c, null));
      }

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
      // Global admin view: every brand's crons grouped by slug + _system
      // bucket for shared crons. Admin-only (server-side gate).
      if (!req.ctx?.isAdmin) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const clients = loadClients() as { slug: string; name: string }[];

      const { crons: brandEnriched, systemCrons: systemEnriched } = enrichCrons({
        slug: null,
        includeSystem: true,
        clients,
      });

      const grouped: Record<string, unknown[]> = {};
      for (const c of brandEnriched) {
        const key = c.client_slug as string;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(toApiShape(c, key));
      }

      // Merge any locally-defined recurring tasks (kept in
      // brand/<slug>/recurring-tasks.json) so the admin view matches
      // feature parity with the per-brand panel.
      for (const client of clients) {
        const localTasks = loadRecurringTasks(client.slug);
        if (localTasks.length === 0) continue;
        if (!grouped[client.slug]) grouped[client.slug] = [];
        grouped[client.slug].push(...localTasks);
      }

      grouped._system = systemEnriched.map((c) => toApiShape(c, null));
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
