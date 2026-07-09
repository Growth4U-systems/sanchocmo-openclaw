/**
 * GET /api/content-engine/state?slug=X — Engine "Estado del motor" data
 *
 * Returns everything the Estado tab needs in one round-trip:
 *   - kpis: published, queue counts, approval rate, antenas active
 *   - config: POV count, pillars count, antenas count, POVs in bank
 *   - lastSignals: per-antena last_finding (timestamp + 1-2 sentence summary + count)
 *   - activity: last 24h events from activity-log.jsonl
 *   - verifiedAt: when this snapshot was computed
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { loadPovBankFromNeon } from "@/lib/data/pov-bank";
import { getRuntime } from "@/lib/runtime";

interface Idea {
  id: string;
  status?: string;
  created_at?: string;
  approved_at?: string;
  published_at?: string;
  pillar_id?: string;
  target_channel?: string;
}

interface Pillar {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

interface PovBank {
  global?: { one_liner?: string | null };
  pov_per_pillar?: Record<string, {
    core_belief?: string | null;
    we_say_yes_to?: string[];
    we_say_no_to?: string[];
    preferred_angles?: string[];
    evidence_we_cite?: string[];
  }>;
}

interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: { kind: string; expr: string; tz: string };
  payload: { kind: string; message: string; model: string };
}

interface JobsState {
  jobs: Record<string, { state?: { lastRunAtMs?: number; lastRunStatus?: string; lastError?: string } }>;
}

interface ActivityEvent {
  ts: string;
  type: "publish" | "approve" | "discard" | "edit" | "cron-run" | "idea-created";
  text: string;
  icon?: string;
  accent?: "sage" | "rust" | "navy" | "sun" | "brick";
  meta?: Record<string, unknown>;
}

interface Finding {
  cron: string;
  baseName: string;
  jobId: string;
  enabled: boolean;
  schedule: string;
  lastRunAt: string | null;
  finding: string | null;
  source: string | null;
  count: number | null;
  status: string | null;
}

function readJSON<T>(p: string, fallback: T): T {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch { return fallback; }
}

function loadIdeas(slug: string): Idea[] {
  // The canonical shape of `idea-queue.json` is a bare JSON array. Some
  // cron-driven skills (news-monitor, thief-marketers) have intermittently
  // written it as `{ "ideas": [...] }` — a single bad run there used to
  // 500 the Engine endpoint globally with "r.filter is not a function" and
  // hide the dashboard. Accept either shape so a malformed writer can't
  // take the UI down (writers should still be fixed; this is defense).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = readJSON<any>(path.join(BASE, "brand", slug, "content", "idea-queue.json"), []);
  if (Array.isArray(raw)) return raw as Idea[];
  if (raw && Array.isArray(raw.ideas)) return raw.ideas as Idea[];
  return [];
}

function loadPillars(slug: string): Pillar[] {
  // pillars stored as markdown — count P{N} occurrences as proxy
  const f = path.join(BASE, "brand", slug, "content", "content-pillars.md");
  if (!fs.existsSync(f)) return [];
  const txt = fs.readFileSync(f, "utf-8");
  const matches = Array.from(txt.matchAll(/^##\s+(P\d+)\b/gm));
  return matches.map((m) => ({ id: m[1] }));
}

async function loadPovBank(slug: string): Promise<PovBank | null> {
  try {
    const result = await loadPovBankFromNeon(slug);
    return result.povBank as PovBank | null;
  } catch (err) {
    console.warn(
      `[content-engine/state] POV Bank unavailable for ${slug}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

function loadJobs(): CronJob[] {
  const data = readJSON<{ jobs?: unknown }>(getRuntime().state.cronJobsFile(), { jobs: [] });
  return Array.isArray(data.jobs) ? data.jobs as CronJob[] : [];
}

function loadJobsState(): JobsState["jobs"] {
  const raw = readJSON<{ jobs?: unknown }>(getRuntime().state.cronJobsStateFile(), { jobs: {} }).jobs;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as JobsState["jobs"] : {};
}

function loadActivity(slug: string): ActivityEvent[] {
  const f = path.join(BASE, "brand", slug, "content", "activity-log.jsonl");
  if (!fs.existsSync(f)) return [];
  const lines = fs.readFileSync(f, "utf-8").split("\n").filter(Boolean);
  const events: ActivityEvent[] = [];
  for (const line of lines.reverse()) {
    try { events.push(JSON.parse(line)); }
    catch { /* skip malformed */ }
  }
  return events;
}

const ANTENA_FOLDERS: Record<string, string> = {
  "News Monitor": "content-news-monitor",
  "Competitor Monitor": "content-competitor-monitor",
  "Editorial Dispatch": "content-editorial-dispatch",
  "PAA Monitor": "content-paa-monitor",
  "Keyword Research": "content-keyword-research",
};

/** Pick the most useful 1-2 line preview out of a recurring-task `content` markdown blob. */
function previewFromContent(content: string): string {
  // Trim, strip leading emoji-only/heading-only lines, and grab the first content paragraph.
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  // Skip lines that are pure markdown bars/headers (e.g. ━━━ or ## heading or **bold-only-line**)
  const meaty = lines.filter((l) =>
    !/^[━─=─\-_]+$/.test(l) &&
    !/^#+\s/.test(l) &&
    !/^\*\*[^*]+\*\*$/.test(l)
  );
  const text = meaty.slice(0, 3).join(" ").replace(/\s+/g, " ");
  // Cap at ~240 chars
  return text.length > 240 ? text.slice(0, 237) + "…" : text;
}

/** Reads the latest YYYY-MM-DD.json from recurring-tasks/{folder}/ for one antena. */
function readLastFinding(slug: string, folder: string): { date: string | null; finding: string | null; count: number | null; status: string | null } {
  const dir = path.join(BASE, "brand", slug, "recurring-tasks", folder);
  if (!fs.existsSync(dir)) return { date: null, finding: null, count: null, status: null };
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
  if (files.length === 0) return { date: null, finding: null, count: null, status: null };
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf-8"));
    let finding: string | null = (data.last_finding as string) || (data.summary as string) || null;
    if (!finding && typeof data.content === "string" && data.content.trim()) {
      finding = previewFromContent(data.content);
    }
    const count: number | null = data.total_new_questions ?? data.candidates_sent ?? data.signals_count ?? null;
    // `date` (YYYY-MM-DD, matches the filename) is the source of truth. Use `runAtMs` only when its
    // day agrees with `date` — the cron writer agent has been known to hallucinate runAtMs values.
    const dateStr = typeof data.date === "string" ? data.date : files[0].replace(".json", "");
    let runDate: string | null = null;
    if (data.runAtMs && new Date(data.runAtMs).toISOString().slice(0, 10) === dateStr) {
      runDate = new Date(data.runAtMs).toISOString();
    } else if (dateStr) {
      runDate = new Date(dateStr + "T00:00:00Z").toISOString();
    }
    return {
      date: runDate,
      finding,
      count,
      status: data.status || null,
    };
  } catch {
    return { date: files[0].replace(".json", ""), finding: null, count: null, status: null };
  }
}

// Engine activity is scoped to the 4 content antennas — Editorial Dispatch sends
// and Slack approvals reach the feed via activity-log.jsonl instead.
const ANTENA_ACTIVITY_FOLDERS = new Set([
  "content-news-monitor",
  "content-competitor-monitor",
  "content-paa-monitor",
  "content-keyword-research",
]);

/** Reads recurring-tasks/{folder}/*.json for the slug and builds cron-run activity events. */
function loadCronActivity(slug: string): ActivityEvent[] {
  const rtRoot = path.join(BASE, "brand", slug, "recurring-tasks");
  if (!fs.existsSync(rtRoot)) return [];
  const events: ActivityEvent[] = [];
  for (const folder of fs.readdirSync(rtRoot)) {
    if (!ANTENA_ACTIVITY_FOLDERS.has(folder)) continue;
    const dir = path.join(rtRoot, folder);
    if (!fs.statSync(dir).isDirectory()) continue;
    // Take up to 60 most recent files per cron folder (≈2 months of daily runs).
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 60);
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
        const runAtMs = data.runAtMs || (data.date ? new Date(data.date).getTime() : null);
        if (!runAtMs) continue;
        const status = data.status || "ok";
        const finding: string =
          (typeof data.last_finding === "string" && data.last_finding.trim()) ||
          (typeof data.summary === "string" && data.summary.trim()) ||
          (typeof data.content === "string" && previewFromContent(data.content)) ||
          `Cron ${folder} (${status})`;
        events.push({
          ts: new Date(runAtMs).toISOString(),
          type: "cron-run",
          text: `<b>${folder}:</b> ${finding}`,
          icon: status === "error" ? "⚠️" : "⏰",
          accent: status === "error" ? "brick" : "navy",
          meta: { folder, status, file },
        });
      } catch { /* skip malformed */ }
    }
  }
  return events;
}

function inWindow(iso: string | undefined, days: number): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() <= days * 86400000;
}

function inCurrentMonth(iso: string | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const ideas = loadIdeas(slug);
  const pillars = loadPillars(slug);
  const povBank = await loadPovBank(slug);
  const jobs = loadJobs();
  const jobsState = loadJobsState();
  const activity = loadActivity(slug);

  // ─── Filter content jobs for this slug ────────────────────
  const contentJobs = jobs.filter((j) => {
    if (!j.name.startsWith("Content:")) return false;
    const msg = j.payload?.message || "";
    return msg.includes(`brand/${slug}/`)
      || msg.includes(`para ${slug}`)
      || j.name.toLowerCase().includes(slug.toLowerCase());
  });

  // ─── KPIs (canonical pipeline status — see content-engine/ideas.ts) ─────
  const queue = {
    total: ideas.length,
    new: ideas.filter((i) => i.status === "New").length,
    approved: ideas.filter((i) => i.status === "Approved").length,
    deferred: ideas.filter((i) => i.status === "Deferred").length,
    discarded: ideas.filter((i) => i.status === "Discarded").length,
    published: ideas.filter((i) => i.status === "Published").length,
  };

  // Posts published this month (approved counts as proxy if no published_at exists)
  const publishedThisMonth = ideas.filter((i) =>
    inCurrentMonth(i.published_at) ||
    (i.status === "Published" && inCurrentMonth(i.approved_at))
  ).length;

  // Approval rate (30d): of ideas created in last 30d, what % have been approved or published
  const created30d = ideas.filter((i) => inWindow(i.created_at, 30));
  const approved30d = created30d.filter((i) =>
    i.status === "Approved" || i.status === "Published"
  );
  const approvalRate30d = created30d.length === 0 ? 0 : approved30d.length / created30d.length;

  // Antenas active (enabled content crons, excluding Editorial Dispatch which is the publisher)
  const antenaCrons = contentJobs.filter((j) =>
    !j.name.includes("Editorial Dispatch") &&
    !j.name.includes("Classify + Ideas") &&
    !j.name.includes("POV Bank")
  );
  const antenasActive = antenaCrons.filter((j) => j.enabled).length;

  // ─── Config summary ───────────────────────────────────────
  const povPerPillar = povBank?.pov_per_pillar || {};
  const povCount = Object.values(povPerPillar).filter((p) => p.core_belief).length;
  const povBankEntries = Object.values(povPerPillar).reduce(
    (n, p) => n + (p.preferred_angles?.length || 0) + (p.we_say_yes_to?.length || 0),
    0
  );

  const config = {
    povCount,
    pillarsCount: pillars.length,
    antenasCount: antenaCrons.length,
    povBankCount: povBankEntries,
  };

  // ─── Last signals per antena ──────────────────────────────
  const lastSignals: Finding[] = antenaCrons.map((j) => {
    const baseName = j.name.replace(/^Content:\s*/, "").replace(/\s*[—-]\s*.*$/, "").trim();
    const folder = ANTENA_FOLDERS[baseName];
    const finding = folder ? readLastFinding(slug, folder) : { date: null, finding: null, count: null, status: null };
    const runtimeState = jobsState[j.id]?.state;
    const status = finding.status || runtimeState?.lastRunStatus || null;
    // When the cron failed (no recurring-tasks file written), surface the runtime error
    // as the finding so the UI explains *why* there's no signal data.
    let findingText: string | null = finding.finding;
    if (!findingText && status === "error" && runtimeState?.lastError) {
      const err = runtimeState.lastError.length > 240
        ? runtimeState.lastError.slice(0, 237) + "…"
        : runtimeState.lastError;
      findingText = `<b>Última corrida falló:</b> ${err}`;
    }
    return {
      cron: j.name,
      baseName,
      jobId: j.id,
      enabled: j.enabled,
      schedule: j.schedule.expr,
      lastRunAt: finding.date || (runtimeState?.lastRunAtMs ? new Date(runtimeState.lastRunAtMs).toISOString() : null),
      finding: findingText,
      source: folder ? `lee ${folder}/` : null,
      count: finding.count,
      status,
    };
  });

  // ─── Activity (paginated, full history) ───────────────────
  // Combine activity-log.jsonl (Slack approvals, dispatch sends) with cron-runs
  // read live from recurring-tasks/. Sorted by ts desc, capped at 300 to bound
  // payload size. UI handles pagination client-side.
  const cronActivity = loadCronActivity(slug);
  const allActivity = [...activity, ...cronActivity]
    .filter((e) => {
      try { return !isNaN(new Date(e.ts).getTime()); }
      catch { return false; }
    })
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 300);

  return res.status(200).json({
    ok: true,
    kpis: {
      publishedThisMonth,
      ideasInQueue: queue,
      approvalRate30d,
      antenasActive,
      antenasTotal: antenaCrons.length,
    },
    config,
    lastSignals,
    activity: allActivity,
    verifiedAt: new Date().toISOString(),
  });
}

export default withErrorHandler(handler);
