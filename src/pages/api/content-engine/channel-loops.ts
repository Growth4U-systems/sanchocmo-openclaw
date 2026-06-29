/**
 * GET /api/content-engine/channel-loops?slug=X — per-channel loop state (SAN-141)
 *
 * Aggregates, per channel declared in cadence-config.yml, the five loop
 * stages the 📡 Canales view renders:
 *   antennas → ideation → creation → published → metrics
 *
 * Everything is derived at request time from the existing sources of truth
 * (idea-queue + nested ContentTasks, cadence-config.yml, crons, drafts
 * frontmatter). Nothing is persisted — see ChannelLoopState in @/types.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { cronJobsFile, cronJobsStateFile } from "@/lib/data/openclaw-paths";
import { loadUnifiedContentTasks } from "@/lib/data/content-tasks-flat";
import { loadDraft } from "@/lib/data/drafts";
import { getMetricsTimeSeries, type SeriesPoint } from "@/lib/data/metrics";
import {
  normalizeCadenceChannels,
  toChannelList,
  type NormalizedCadenceChannel,
} from "@/lib/content/channel-loop-inputs";
import type {
  ChannelLoopAntenna,
  ChannelLoopState,
  ChannelLoopsPayload,
  ChannelMode,
  ContentTask,
  PersonaProfile,
  RepurposeEntry,
} from "@/types";
import { buildPersonaLoops } from "@/lib/data/persona-loops";

// ── cadence-config ──────────────────────────────────────────────

const DEFAULT_LABELS: Record<string, string> = {
  linkedin: "Founder-Led Content",
  twitter: "X / Twitter",
  x: "X / Twitter",
  blog: "SEO / Blog",
  instagram: "Instagram",
  newsletter: "Newsletter",
  tiktok: "TikTok",
  youtube: "YouTube",
};

function readCadenceChannels(slug: string): Record<string, NormalizedCadenceChannel> {
  const configDir = path.join(BASE, "brand", slug, "content", "configs");
  const f = ["cadence-config.yml", "cadence-config.yaml"]
    .map((name) => path.join(configDir, name))
    .find((candidate) => fs.existsSync(candidate));
  if (!f) return {};
  try {
    return normalizeCadenceChannels(yaml.load(fs.readFileSync(f, "utf-8")));
  } catch {
    return {};
  }
}

// ── crons (antennas) ────────────────────────────────────────────
// Same folder conventions as /api/content-engine/state — kept as slim local
// copies because those helpers are private to that route.

interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: { kind: string; expr: string; tz: string };
  payload: { kind: string; message: string; model: string };
}

const ANTENA_FOLDERS: Record<string, string> = {
  "News Monitor": "content-news-monitor",
  "Competitor Monitor": "content-competitor-monitor",
  "PAA Monitor": "content-paa-monitor",
  "Keyword Research": "content-keyword-research",
};

/** Which antenna crons feed each channel's ideation. Blog listens to search
 *  demand (keywords + PAA); social channels listen to news + competitors. */
const SEARCH_ANTENNAS = ["Keyword Research", "PAA Monitor"];
const SOCIAL_ANTENNAS = ["News Monitor", "Competitor Monitor"];

function antennasForChannel(channel: string): string[] {
  return channel === "blog" ? SEARCH_ANTENNAS : SOCIAL_ANTENNAS;
}

function readJSON<T>(p: string, fallback: T): T {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch { return fallback; }
}

function loadContentJobs(slug: string): CronJob[] {
  const rawJobs = readJSON<{ jobs?: unknown }>(cronJobsFile(), { jobs: [] }).jobs;
  const jobs = Array.isArray(rawJobs) ? rawJobs : [];
  return jobs.filter((j) => {
    if (!j || typeof j !== "object") return false;
    const job = j as Partial<CronJob>;
    if (typeof job.name !== "string") return false;
    if (!job.name.startsWith("Content:")) return false;
    const msg = typeof job.payload?.message === "string" ? job.payload.message : "";
    return msg.includes(`brand/${slug}/`)
      || msg.includes(`para ${slug}`)
      || job.name.toLowerCase().includes(slug.toLowerCase());
  }) as CronJob[];
}

function loadJobsState(): JobsState["jobs"] {
  const raw = readJSON<{ jobs?: unknown }>(cronJobsStateFile(), { jobs: {} }).jobs;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as JobsState["jobs"] : {};
}

interface JobsState {
  jobs: Record<string, { state?: { lastRunAtMs?: number; lastRunStatus?: string; lastError?: string } }>;
}

function readLastFinding(slug: string, folder: string): { date: string | null; finding: string | null; count: number | null; status: string | null } {
  const dir = path.join(BASE, "brand", slug, "recurring-tasks", folder);
  if (!fs.existsSync(dir)) return { date: null, finding: null, count: null, status: null };
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
  if (files.length === 0) return { date: null, finding: null, count: null, status: null };
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf-8"));
    const dateStr = typeof data.date === "string" ? data.date : files[0].replace(".json", "");
    return {
      date: dateStr ? new Date(dateStr + "T00:00:00Z").toISOString() : null,
      finding: (data.last_finding as string) || (data.summary as string) || null,
      count: data.total_new_questions ?? data.candidates_sent ?? data.signals_count ?? null,
      status: data.status || null,
    };
  } catch {
    return { date: null, finding: null, count: null, status: null };
  }
}

function buildAntennas(slug: string, channel: string, jobs: CronJob[], jobsState: JobsState["jobs"]): ChannelLoopAntenna[] {
  const wanted = antennasForChannel(channel);
  return wanted.map((baseName) => {
    const job = jobs.find((j) => {
      const b = j.name.replace(/^Content:\s*/, "").replace(/\s*[—-]\s*.*$/, "").trim();
      return b === baseName;
    });
    const folder = ANTENA_FOLDERS[baseName];
    const finding = folder ? readLastFinding(slug, folder) : { date: null, finding: null, count: null, status: null };
    const runtime = job ? jobsState[job.id]?.state : undefined;
    return {
      baseName,
      jobId: job?.id ?? null,
      enabled: job?.enabled ?? false,
      schedule: job?.schedule?.expr ?? null,
      lastRunAt: finding.date || (runtime?.lastRunAtMs ? new Date(runtime.lastRunAtMs).toISOString() : null),
      finding: finding.finding,
      count: finding.count,
      status: finding.status || runtime?.lastRunStatus || null,
    };
  });
}

// ── stage helpers ───────────────────────────────────────────────

function ctMatchesChannel(ct: ContentTask, channel: string): boolean {
  return toChannelList(ct.target_channel, ct.target_channels).includes(channel);
}

function inCurrentMonth(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** Published SEO articles live in campaigns/content/*.md (seo-content skill),
 *  outside the idea-queue pipeline. Count this month's files so the blog loop
 *  reflects reality without migrating that pipeline. */
function countBlogArticlesThisMonth(slug: string): number {
  const candidates = [
    path.join(BASE, "brand", slug, "campaigns", "content"),
    path.join(BASE, "campaigns", slug, "content"),
  ];
  const now = new Date();
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    try {
      return fs.readdirSync(dir).filter((f) => {
        if (!f.endsWith(".md")) return false;
        const st = fs.statSync(path.join(dir, f));
        return st.mtime.getFullYear() === now.getFullYear() && st.mtime.getMonth() === now.getMonth();
      }).length;
    } catch {
      return 0;
    }
  }
  return 0;
}

// ── Search Console (SAN-161) ────────────────────────────────────
// Connection state lives in integrations.json → dataSources.gsc.status. Metrics
// history lives in metric_snapshots; no live Google calls from this route.

function isGscConnected(slug: string): boolean {
  const integrations = readJSON<{ dataSources?: Record<string, { status?: string }> }>(
    path.join(BASE, "brand", slug, "integrations.json"),
    {},
  );
  return integrations.dataSources?.gsc?.status === "connected";
}

function sumPoints(points: SeriesPoint[], from: string, to?: string): { value: number; days: number } {
  const selected = points.filter((point) => point.date >= from && (!to || point.date < to));
  return {
    value: selected.reduce((sum, point) => sum + point.value, 0),
    days: selected.length,
  };
}

async function gscAggregates(slug: string): Promise<NonNullable<ChannelLoopState["stages"]["metrics"]["gsc"]> | null> {
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [clicks, impressions, position] = await Promise.all([
    getMetricsTimeSeries(slug, { source: "gsc", metric: "clicks", from, to: today }),
    getMetricsTimeSeries(slug, { source: "gsc", metric: "impressions", from, to: today }),
    getMetricsTimeSeries(slug, { source: "gsc", metric: "position", from: cutoff, to: today }),
  ]);
  if (!clicks.configured && !impressions.configured && !position.configured) return null;

  const clicks30 = sumPoints(clicks.points, cutoff);
  const impressions30 = sumPoints(impressions.points, cutoff);
  const prevClicks30 = sumPoints(clicks.points, from, cutoff);
  const prevImpressions30 = sumPoints(impressions.points, from, cutoff);
  const positions = position.points.map((point) => point.value).filter((value) => value > 0);

  if (clicks30.days === 0 && impressions30.days === 0 && prevClicks30.days === 0 && prevImpressions30.days === 0) return null;
  return {
    clicks30d: clicks30.value,
    impressions30d: impressions30.value,
    avgPosition: positions.length > 0 ? Math.round((positions.reduce((sum, value) => sum + value, 0) / positions.length) * 10) / 10 : null,
    prevClicks30d: prevClicks30.days > 0 ? prevClicks30.value : null,
    prevImpressions30d: prevImpressions30.days > 0 ? prevImpressions30.value : null,
  };
}

async function safeGscAggregates(slug: string): Promise<NonNullable<ChannelLoopState["stages"]["metrics"]["gsc"]> | null> {
  try {
    return await gscAggregates(slug);
  } catch (err) {
    console.warn(
      `[content-engine/channel-loops] GSC metrics unavailable for ${slug}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

const DOW_LABELS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DAY_ALIASES: Record<string, number> = {
  sunday: 0, domingo: 0, sun: 0, dom: 0,
  monday: 1, lunes: 1, mon: 1, lun: 1, l: 1,
  tuesday: 2, martes: 2, tue: 2, mar: 2, m: 2,
  wednesday: 3, miercoles: 3, "miércoles": 3, wed: 3, mie: 3, "mié": 3, x: 3,
  thursday: 4, jueves: 4, thu: 4, jue: 4, j: 4,
  friday: 5, viernes: 5, fri: 5, vie: 5, v: 5,
  saturday: 6, sabado: 6, "sábado": 6, sat: 6, sab: 6, s: 6,
};

/** "jue 09:00"-style label for the next cadence slot, derived from
 *  best_days/best_times. Null when the cadence doesn't define days. */
function nextSlotLabel(bestDays: string[], bestTimes: string[]): string | null {
  const dows = bestDays
    .map((d) => DAY_ALIASES[String(d).trim().toLowerCase()])
    .filter((n): n is number => typeof n === "number");
  if (dows.length === 0) return null;
  const time = bestTimes[0] || "09:00";
  const today = new Date().getDay();
  for (let offset = 0; offset <= 7; offset++) {
    const dow = (today + offset) % 7;
    if (dows.includes(dow)) return `${DOW_LABELS[dow]} ${time}`;
  }
  return null;
}

function channelMetrics(slug: string, channel: string, publishedCts: ContentTask[]) {
  let engagementSum = 0;
  let engagementN = 0;
  let impressions = 0;
  const cutoff = Date.now() - 30 * 86400000;
  for (const ct of publishedCts.slice(0, 30)) {
    const draft = loadDraft(slug, ct.idea_id, channel);
    const m = draft?.meta?.publishing?.metrics;
    if (!m) continue;
    const measured = m.measured_at ? new Date(m.measured_at).getTime() : Date.now();
    if (measured < cutoff) continue;
    if (typeof m.engagement_pct === "number") { engagementSum += m.engagement_pct; engagementN++; }
    if (typeof m.impressions === "number") impressions += m.impressions;
  }
  return {
    engagementPct: engagementN > 0 ? Math.round((engagementSum / engagementN) * 10) / 10 : null,
    impressions30d: engagementN > 0 || impressions > 0 ? impressions : null,
    postsWithMetrics: engagementN,
  };
}

// ── handler ─────────────────────────────────────────────────────

async function handler(req: NextApiRequest, res: NextApiResponse<ChannelLoopsPayload | { error: string }>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const cadenceChannels = readCadenceChannels(slug);
  const cts = loadUnifiedContentTasks(slug);
  const jobs = loadContentJobs(slug);
  const jobsState = loadJobsState();
  const gscConnected = isGscConnected(slug);
  const gscData = gscConnected ? await safeGscAggregates(slug) : null;

  // Channel registry = cadence-config keys; fall back to channels seen in CTs
  // so a brand without cadence still gets a usable view.
  const channelKeys = Object.keys(cadenceChannels);
  if (channelKeys.length === 0) {
    const seen = new Set<string>();
    for (const ct of cts) {
      for (const c of toChannelList(ct.target_channel, ct.target_channels)) seen.add(c);
    }
    channelKeys.push(...seen);
  }

  // Repurposing lineage across ALL channels (derived_from is written by
  // content-atomizer — SAN-141 F3).
  const repurposing: RepurposeEntry[] = cts
    .filter((ct) => ct.derived_from?.channel)
    .map((ct) => ({
      fromChannel: ct.derived_from!.channel,
      fromTitle: ct.derived_from!.title || ct.derived_from!.idea_id,
      toChannel: toChannelList(ct.target_channel, ct.target_channels)[0] || "",
      toTitle: ct.title || ct.name || ct.id,
      toStatus: ct.status,
      toId: ct.id,
    }))
    .slice(0, 12);

  const channels: ChannelLoopState[] = channelKeys.map((key) => {
    const ch = cadenceChannels[key] || {};
    const mine = cts.filter((ct) => ctMatchesChannel(ct, key));

    // SAN-163 — split into per-persona sub-loops when the channel declares voices.
    const personaProfiles: PersonaProfile[] = ch.profiles.map((p) => ({
      id: p.id || "",
      name: p.name,
      role: p.role,
      handle: p.handle,
      pillars_slant: p.pillars_slant,
      voice_doc: p.voice_doc,
      owner: p.owner,
      metricool_profile_id: p.metricool_profile_id,
      primary_kpi: p.primary_kpi,
    }));
    const { personas, unassignedPool } = buildPersonaLoops(mine, personaProfiles);

    const newCount = mine.filter((c) => c.status === "New").length;
    const approvedCount = mine.filter((c) => c.status === "Approved").length;
    const draftingCts = mine.filter((c) => c.status === "Draft" || c.status === "Approved");
    const clarifyCount = mine.filter(
      (c) =>
        c.channel_phases?.[key] === "clarify-needed" ||
        (c.clarify_status === "pending" && (c.status === "Draft" || c.status === "Approved"))
    ).length;
    const draftingCount = draftingCts.filter((c) => c.status === "Draft").length;
    const readyCount = mine.filter((c) => c.status === "Ready").length;
    const pendingMediaCount = mine.filter((c) => c.status === "Pending Media").length;

    const publishedCts = mine.filter((c) => c.status === "Published");
    let publishedThisMonth = publishedCts.filter(
      (c) => inCurrentMonth(c.published_at) || inCurrentMonth(c.approved_at)
    ).length;
    if (key === "blog") {
      publishedThisMonth = Math.max(publishedThisMonth, countBlogArticlesThisMonth(slug));
    }

    const antennas = buildAntennas(slug, key, jobs, jobsState);
    const antennasEnabled = antennas.filter((a) => a.enabled).length;
    const antennasError = antennas.some((a) => a.status === "error");
    const antennasLastRun = antennas
      .map((a) => a.lastRunAt)
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;

    // Blog graduates from "gsc-pending" to "gsc" the moment the data source
    // is connected — the yaml default was a placeholder, not a choice. An
    // explicit metrics_provider other than gsc-pending still wins.
    let metricsProvider = ch.metrics_provider || (key === "blog" ? "gsc-pending" : "metricool");
    if (key === "blog" && gscConnected && (!ch.metrics_provider || ch.metrics_provider === "gsc-pending")) {
      metricsProvider = "gsc";
    }
    const metrics = metricsProvider === "gsc"
      ? { engagementPct: null, impressions30d: null, postsWithMetrics: 0, gsc: gscData }
      : metricsProvider === "gsc-pending" || metricsProvider === "none"
        ? { engagementPct: null, impressions30d: null, postsWithMetrics: 0 }
        : channelMetrics(slug, key, publishedCts);

    const strategyDoc = ch.strategy_doc
      ? path.posix.join("content", ch.strategy_doc)
      : `content/strategy/${key}-strategy.md`;
    const strategyDocExists = fs.existsSync(path.join(BASE, "brand", slug, strategyDoc));

    const active = ch.active ?? mine.length > 0;
    const mode: ChannelMode = ch.mode === "always-on" ? "always-on" : "scheduled";

    let nextAction: ChannelLoopState["nextAction"] = null;
    if (clarifyCount > 0) {
      nextAction = { label: `${clarifyCount} clarify pendiente${clarifyCount > 1 ? "s" : ""} — responde a Dulcinea`, tab: "ideas", focusStatus: "Draft" };
    } else if (newCount > 0) {
      nextAction = { label: `${newCount} idea${newCount > 1 ? "s" : ""} espera${newCount > 1 ? "n" : ""} tu aprobación`, tab: "ideas", focusStatus: "New" };
    } else if (readyCount > 0) {
      nextAction = { label: `${readyCount} pieza${readyCount > 1 ? "s" : ""} lista${readyCount > 1 ? "s" : ""} para programar`, tab: "calendar" };
    } else if (active && !strategyDocExists) {
      nextAction = { label: "Falta la estrategia del canal — créala en Setup", tab: "setup" };
    }

    return {
      channel: key,
      label: ch.label || DEFAULT_LABELS[key] || key,
      active,
      mode,
      cadence: {
        frequency: ch.frequency || "",
        bestDays: ch.best_days,
        bestTimes: ch.best_times,
      },
      strategyDoc,
      strategyDocExists,
      metricsProvider,
      primaryKpi: ch.primary_kpi || null,
      stages: {
        antennas: { enabled: antennasEnabled, total: antennas.length, hasError: antennasError, lastRunAt: antennasLastRun },
        ideation: { newCount, approvedCount },
        creation: { draftingCount, clarifyCount, readyCount, pendingMediaCount },
        published: { thisMonth: publishedThisMonth, nextSlot: nextSlotLabel(ch.best_days, ch.best_times) },
        metrics: { provider: metricsProvider, ...metrics },
      },
      nextAction,
      repurposing: {
        incoming: repurposing.filter((r) => r.toChannel === key).length,
        outgoing: repurposing.filter((r) => r.fromChannel === key).length,
      },
      antennas,
      personas,
      unassignedPool,
    };
  });

  // Active channels first, stable within each group.
  channels.sort((a, b) => Number(b.active) - Number(a.active));

  return res.status(200).json({
    ok: true,
    channels,
    repurposing,
    connections: { gsc: gscConnected },
    verifiedAt: new Date().toISOString(),
  });
}

export default withErrorHandler(handler);
