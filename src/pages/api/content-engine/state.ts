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

const CRON_FILE = path.join(process.env.HOME || "", ".openclaw", "cron", "jobs.json");
const STATE_FILE = path.join(process.env.HOME || "", ".openclaw", "cron", "jobs-state.json");

function readJSON<T>(p: string, fallback: T): T {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch { return fallback; }
}

function loadIdeas(slug: string): Idea[] {
  return readJSON<Idea[]>(path.join(BASE, "brand", slug, "content", "idea-queue.json"), []);
}

function loadPillars(slug: string): Pillar[] {
  // pillars stored as markdown — count P{N} occurrences as proxy
  const f = path.join(BASE, "brand", slug, "content", "content-pillars.md");
  if (!fs.existsSync(f)) return [];
  const txt = fs.readFileSync(f, "utf-8");
  const matches = Array.from(txt.matchAll(/^##\s+(P\d+)\b/gm));
  return matches.map((m) => ({ id: m[1] }));
}

function loadPovBank(slug: string): PovBank | null {
  return readJSON<PovBank | null>(path.join(BASE, "brand", slug, "content", "pov-bank.json"), null);
}

function loadJobs(): CronJob[] {
  const data = readJSON<{ jobs: CronJob[] }>(CRON_FILE, { jobs: [] });
  return data.jobs || [];
}

function loadJobsState(): JobsState["jobs"] {
  return readJSON<JobsState>(STATE_FILE, { jobs: {} }).jobs;
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
    return {
      date: data.runAtMs ? new Date(data.runAtMs).toISOString() : (data.date ? new Date(data.date).toISOString() : null),
      finding,
      count,
      status: data.status || null,
    };
  } catch {
    return { date: files[0].replace(".json", ""), finding: null, count: null, status: null };
  }
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
  const povBank = loadPovBank(slug);
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
    const baseName = j.name.replace(/^Content:\s*/, "").replace(/\s*—\s*.*$/, "").trim();
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

  // ─── Activity (last 24h) ──────────────────────────────────
  const activity24h = activity.filter((e) => {
    try { return Date.now() - new Date(e.ts).getTime() <= 86400000; }
    catch { return false; }
  });

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
    activity: activity24h,
    verifiedAt: new Date().toISOString(),
  });
}

export default withErrorHandler(handler);
