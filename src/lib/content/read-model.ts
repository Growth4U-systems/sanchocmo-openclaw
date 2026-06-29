import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { BASE, brandDir } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";
import { cronJobsFile, cronJobsStateFile } from "@/lib/data/openclaw-paths";
import { loadIdeas } from "@/lib/data/ideas";
import { loadUnifiedContentTasks } from "@/lib/data/content-tasks-flat";
import { loadDraft, type MediaAsset, type PostMetricsSnapshot } from "@/lib/data/drafts";
import { getMetricsTimeSeries, type SeriesPoint } from "@/lib/data/metrics";
import { loadPovBankFromNeon } from "@/lib/data/pov-bank";
import { buildPersonaLoops } from "@/lib/data/persona-loops";
import { listAllCarouselTemplates, listCarouselTemplates } from "@/lib/carousel/templates";
import {
  normalizeCadenceChannels,
  toChannelList,
  type NormalizedCadenceChannel,
} from "@/lib/content/channel-loop-inputs";
import type {
  ChannelLoopAntenna,
  ChannelLoopsPayload,
  ChannelLoopState,
  ContentTask,
  Idea,
  PersonaProfile,
  RepurposeEntry,
} from "@/types";

export interface ContentCalendarEvent {
  ideaId: string;
  contentTaskId: string;
  parentTaskId: string;
  channel: string;
  scheduled_at: string;
  status: "scheduled" | "publishing" | "published" | "failed" | "canceled";
  provider: string;
  external_url?: string | null;
  external_job_id?: string;
  title: string;
  hero_media_url?: string;
  body: string;
  bodyTruncated?: boolean;
  media: MediaAsset[];
  metrics?: PostMetricsSnapshot;
  unconfirmed_drift?: boolean;
}

export interface ContentCalendarReadyDraft {
  ideaId: string;
  contentTaskId: string;
  parentTaskId: string;
  channel: string;
  title: string;
  pillar_id?: string;
  ready_at: string;
  hero_media_url?: string;
  has_media: boolean;
  body: string;
  bodyTruncated?: boolean;
  media: MediaAsset[];
  media_policy?: "required" | "optional";
}

export interface ContentCalendarPayload {
  ok: true;
  scheduled: ContentCalendarEvent[];
  ready_queue: ContentCalendarReadyDraft[];
}

export interface DispatchChannelConfig {
  transport: "slack" | "discord";
  channel_id: string;
  channel_name?: string;
  configured_at: string;
  configured_by?: string;
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

const ANTENA_FOLDERS: Record<string, string> = {
  "News Monitor": "content-news-monitor",
  "Competitor Monitor": "content-competitor-monitor",
  "PAA Monitor": "content-paa-monitor",
  "Keyword Research": "content-keyword-research",
};

const SEARCH_ANTENNAS = ["Keyword Research", "PAA Monitor"];
const SOCIAL_ANTENNAS = ["News Monitor", "Competitor Monitor"];
const DOW_LABELS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
const DAY_ALIASES: Record<string, number> = {
  sunday: 0, domingo: 0, sun: 0, dom: 0,
  monday: 1, lunes: 1, mon: 1, lun: 1, l: 1,
  tuesday: 2, martes: 2, tue: 2, mar: 2, m: 2,
  wednesday: 3, miercoles: 3, wed: 3, mie: 3, x: 3,
  thursday: 4, jueves: 4, thu: 4, jue: 4, j: 4,
  friday: 5, viernes: 5, fri: 5, vie: 5, v: 5,
  saturday: 6, sabado: 6, sat: 6, sab: 6, s: 6,
};

export function getContentCalendar(
  slug: string,
  opts: { from?: string; to?: string; maxBodyChars?: number } = {},
): ContentCalendarPayload {
  const ideas = loadIdeas(slug);
  const ideaById = new Map<string, Idea>(ideas.map((idea) => [idea.id, idea]));
  const scheduled: ContentCalendarEvent[] = [];
  const readyQueue: ContentCalendarReadyDraft[] = [];
  const maxBodyChars = opts.maxBodyChars ?? 4000;

  const root = path.join(brandDir(slug), "projects");
  if (!fs.existsSync(root)) {
    return { ok: true, scheduled, ready_queue: readyQueue };
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const tasksPath = path.join(root, entry.name, "tasks.json");
    if (!fs.existsSync(tasksPath)) continue;

    let tasks: Array<{ id?: string; content_tasks?: ContentTask[] }> = [];
    try {
      const raw = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
      tasks = Array.isArray(raw) ? raw : Array.isArray(raw?.tasks) ? raw.tasks : [];
    } catch {
      continue;
    }

    for (const task of tasks) {
      if (!task.id || !Array.isArray(task.content_tasks)) continue;
      for (const ct of task.content_tasks) {
        if (ct.status === "Discarded" || ct.status === "Deferred") continue;
        for (const channel of toChannelList(ct.target_channel, ct.target_channels)) {
          const draft = loadDraft(slug, ct.idea_id, channel);
          if (!draft) continue;

          const idea = ideaById.get(ct.idea_id);
          const mediaList: MediaAsset[] = Array.isArray(draft.meta.media) ? draft.meta.media : [];
          const body = truncateBody(draft.body, maxBodyChars);
          const heroUrl = pickHeroMediaUrl(draft.meta.media);
          const baseTitle = pickTitle(idea, draft.body, ct.name || ct.id);
          const pub = draft.meta.publishing;
          const scheduledAt = pub?.scheduled_at;

          if (scheduledAt && inRange(scheduledAt, opts.from, opts.to)) {
            const isPublished = ct.channel_phases?.[channel] === "published";
            const effectiveStatus: ContentCalendarEvent["status"] = isPublished
              ? "published"
              : pub?.status ?? "scheduled";
            const driftMs = Date.now() - Date.parse(scheduledAt);
            const unconfirmedDrift =
              effectiveStatus === "scheduled" && !Number.isNaN(driftMs) && driftMs > 2 * 60 * 60 * 1000;
            scheduled.push({
              ideaId: ct.idea_id,
              contentTaskId: ct.id,
              parentTaskId: ct.parent_task_id ?? task.id,
              channel,
              scheduled_at: scheduledAt,
              status: effectiveStatus,
              provider: pub?.provider ?? "",
              external_url: pub?.external_url ?? null,
              external_job_id: pub?.external_job_id,
              title: baseTitle,
              hero_media_url: heroUrl,
              body: body.value,
              bodyTruncated: body.truncated || undefined,
              media: mediaList,
              metrics: pub?.metrics,
              unconfirmed_drift: unconfirmedDrift || undefined,
            });
            continue;
          }

          if (ct.status === "Ready" && !scheduledAt) {
            readyQueue.push({
              ideaId: ct.idea_id,
              contentTaskId: ct.id,
              parentTaskId: ct.parent_task_id ?? task.id,
              channel,
              title: baseTitle,
              pillar_id: ideaPillarId(idea),
              ready_at: ct.updated_at || ct.approved_at || ct.created_at,
              hero_media_url: heroUrl,
              has_media: mediaList.length > 0,
              body: body.value,
              bodyTruncated: body.truncated || undefined,
              media: mediaList,
              media_policy: ct.media_policy?.[channel] ?? draft.meta.media_policy,
            });
          }
        }
      }
    }
  }

  scheduled.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  readyQueue.sort((a, b) => b.ready_at.localeCompare(a.ready_at));
  return { ok: true, scheduled, ready_queue: readyQueue };
}

export function listContentSignals(
  slug: string,
  opts: { date?: string; days?: number; limit?: number } = {},
) {
  const signalsDir = path.join(brandDir(slug), "content", "research-signals");
  if (!fs.existsSync(signalsDir)) {
    return { ok: true, signals: [], dates: [], fileCount: 0 };
  }

  const days = opts.days ?? 1;
  const files = fs.readdirSync(signalsDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .reverse();
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const relevantFiles = opts.date
    ? files.filter((file) => file.startsWith(opts.date!))
    : files.filter((file) => file.slice(0, 10) >= cutoff);
  const maxFiles = Math.min(opts.limit ?? 50, 200);

  const signals: unknown[] = [];
  const dates = new Set<string>();
  for (const file of relevantFiles.slice(0, maxFiles)) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(signalsDir, file), "utf-8"));
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        signals.push(isRecord(item) ? { ...item, _file: file } : { value: item, _file: file });
      }
      dates.add(file.slice(0, 10));
    } catch {
      // Skip corrupt signal files; the UI endpoint does the same.
    }
  }

  return {
    ok: true,
    signals,
    dates: Array.from(dates).sort().reverse(),
    fileCount: relevantFiles.length,
    limit: maxFiles,
  };
}

export function getContentPillars(slug: string) {
  const filePath = path.join(brandDir(slug), "content", "content-pillars.md");
  if (!fs.existsSync(filePath)) {
    return { ok: true, exists: false, content: null, pillars: [] };
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return {
    ok: true,
    exists: true,
    content,
    pillars: parsePillarsFromMarkdown(content),
  };
}

export async function getContentPovBank(slug: string) {
  const result = await loadPovBankFromNeon(slug);
  return {
    ok: result.configured,
    provider: "neon",
    configured: result.configured,
    seededFromLegacyJson: result.seededFromLegacyJson,
    povBank: result.povBank,
    error: result.error || null,
  };
}

export function getContentDispatchConfig(slug: string) {
  const filePath = dispatchConfigPath(slug);
  if (!fs.existsSync(filePath)) {
    return { ok: true, exists: false, config: null };
  }
  try {
    const config = yaml.load(fs.readFileSync(filePath, "utf-8")) as DispatchChannelConfig;
    return { ok: true, exists: true, config };
  } catch (err) {
    return {
      ok: false,
      exists: true,
      error: `parse error: ${err instanceof Error ? err.message : "unknown"}`,
      config: null,
    };
  }
}

export function listContentCarouselTemplates(
  slug: string,
  opts: { channel?: string; includeDisabled?: boolean } = {},
) {
  const enabledList = listCarouselTemplates({ slug, channel: opts.channel });
  const enabledIds = new Set(enabledList.map((template) => template.id));
  const source = opts.includeDisabled ? listAllCarouselTemplates(opts.channel, slug) : enabledList;
  const templates = source.map((template) => ({
    id: template.id,
    name: template.name,
    channel: template.channel,
    description: template.description,
    slideCount: template.slideCount,
    width: template.width,
    height: template.height,
    slots: template.slots,
    preview: template.preview ?? null,
    enabled: enabledIds.has(template.id),
  }));
  return { ok: true, templates, count: templates.length, includeDisabled: !!opts.includeDisabled };
}

export async function getContentChannelLoops(slug: string): Promise<ChannelLoopsPayload> {
  const cadenceChannels = readCadenceChannels(slug);
  const cts = loadUnifiedContentTasks(slug);
  const jobs = loadContentJobs(slug);
  const jobsState = loadJobsState();
  const gscConnected = isGscConnected(slug);
  const gscData = gscConnected ? await safeGscAggregates(slug) : null;

  const channelKeys = Object.keys(cadenceChannels);
  if (channelKeys.length === 0) {
    const seen = new Set<string>();
    for (const ct of cts) {
      for (const channel of toChannelList(ct.target_channel, ct.target_channels)) seen.add(channel);
    }
    channelKeys.push(...seen);
  }

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
    const personaProfiles: PersonaProfile[] = ch.profiles.map((profile) => ({
      id: profile.id || "",
      name: profile.name,
      role: profile.role,
      handle: profile.handle,
      pillars_slant: profile.pillars_slant,
      voice_doc: profile.voice_doc,
      owner: profile.owner,
      metricool_profile_id: profile.metricool_profile_id,
      primary_kpi: profile.primary_kpi,
    }));
    const { personas, unassignedPool } = buildPersonaLoops(mine, personaProfiles);

    const newCount = mine.filter((ct) => ct.status === "New").length;
    const approvedCount = mine.filter((ct) => ct.status === "Approved").length;
    const draftingCts = mine.filter((ct) => ct.status === "Draft" || ct.status === "Approved");
    const clarifyCount = mine.filter(
      (ct) =>
        ct.channel_phases?.[key] === "clarify-needed" ||
        (ct.clarify_status === "pending" && (ct.status === "Draft" || ct.status === "Approved")),
    ).length;
    const draftingCount = draftingCts.filter((ct) => ct.status === "Draft").length;
    const readyCount = mine.filter((ct) => ct.status === "Ready").length;
    const pendingMediaCount = mine.filter((ct) => ct.status === "Pending Media").length;
    const publishedCts = mine.filter((ct) => ct.status === "Published");
    let publishedThisMonth = publishedCts.filter(
      (ct) => inCurrentMonth(ct.published_at) || inCurrentMonth(ct.approved_at),
    ).length;
    if (key === "blog") publishedThisMonth = Math.max(publishedThisMonth, countBlogArticlesThisMonth(slug));

    const antennas = buildAntennas(slug, key, jobs, jobsState);
    const antennasEnabled = antennas.filter((antenna) => antenna.enabled).length;
    const antennasLastRun = antennas
      .map((antenna) => antenna.lastRunAt)
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;

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
    const strategyDocExists = fs.existsSync(path.join(brandDir(slug), strategyDoc));
    const active = ch.active ?? mine.length > 0;

    let nextAction: ChannelLoopState["nextAction"] = null;
    if (clarifyCount > 0) {
      nextAction = { label: `${clarifyCount} clarify pendiente`, tab: "ideas", focusStatus: "Draft" };
    } else if (newCount > 0) {
      nextAction = { label: `${newCount} idea pendiente de aprobacion`, tab: "ideas", focusStatus: "New" };
    } else if (readyCount > 0) {
      nextAction = { label: `${readyCount} pieza lista para programar`, tab: "calendar" };
    } else if (active && !strategyDocExists) {
      nextAction = { label: "Falta la estrategia del canal", tab: "setup" };
    }

    return {
      channel: key,
      label: ch.label || DEFAULT_LABELS[key] || key,
      active,
      mode: ch.mode === "always-on" ? "always-on" : "scheduled",
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
        antennas: {
          enabled: antennasEnabled,
          total: antennas.length,
          hasError: antennas.some((antenna) => antenna.status === "error"),
          lastRunAt: antennasLastRun,
        },
        ideation: { newCount, approvedCount },
        creation: { draftingCount, clarifyCount, readyCount, pendingMediaCount },
        published: { thisMonth: publishedThisMonth, nextSlot: nextSlotLabel(ch.best_days, ch.best_times) },
        metrics: { provider: metricsProvider, ...metrics },
      },
      nextAction,
      repurposing: {
        incoming: repurposing.filter((entry) => entry.toChannel === key).length,
        outgoing: repurposing.filter((entry) => entry.fromChannel === key).length,
      },
      antennas,
      personas,
      unassignedPool,
    };
  });

  channels.sort((a, b) => Number(b.active) - Number(a.active));
  return {
    ok: true,
    channels,
    repurposing,
    connections: { gsc: gscConnected },
    verifiedAt: new Date().toISOString(),
  };
}

function dispatchConfigPath(slug: string): string {
  return path.join(brandDir(slug), "content", "configs", "dispatch-channel.yml");
}

function readCadenceChannels(slug: string): Record<string, NormalizedCadenceChannel> {
  const configDir = path.join(brandDir(slug), "content", "configs");
  const filePath = ["cadence-config.yml", "cadence-config.yaml"]
    .map((name) => path.join(configDir, name))
    .find((candidate) => fs.existsSync(candidate));
  if (!filePath) return {};
  try {
    return normalizeCadenceChannels(yaml.load(fs.readFileSync(filePath, "utf-8")));
  } catch {
    return {};
  }
}

function loadContentJobs(slug: string): CronJob[] {
  const rawJobs = readJSON<{ jobs?: unknown }>(cronJobsFile(), { jobs: [] }).jobs;
  const jobs = Array.isArray(rawJobs) ? rawJobs : [];
  return jobs.filter((job) => {
    if (!job || typeof job !== "object") return false;
    const candidate = job as Partial<CronJob>;
    if (typeof candidate.name !== "string") return false;
    if (!candidate.name.startsWith("Content:")) return false;
    const message = typeof candidate.payload?.message === "string" ? candidate.payload.message : "";
    return message.includes(`brand/${slug}/`)
      || message.includes(`para ${slug}`)
      || candidate.name.toLowerCase().includes(slug.toLowerCase());
  }) as CronJob[];
}

function loadJobsState(): JobsState["jobs"] {
  const raw = readJSON<{ jobs?: unknown }>(cronJobsStateFile(), { jobs: {} }).jobs;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as JobsState["jobs"] : {};
}

function antennasForChannel(channel: string): string[] {
  return channel === "blog" ? SEARCH_ANTENNAS : SOCIAL_ANTENNAS;
}

function buildAntennas(
  slug: string,
  channel: string,
  jobs: CronJob[],
  jobsState: JobsState["jobs"],
): ChannelLoopAntenna[] {
  return antennasForChannel(channel).map((baseName) => {
    const job = jobs.find((candidate) => {
      const base = candidate.name.replace(/^Content:\s*/, "").replace(/\s*[—-]\s*.*$/, "").trim();
      return base === baseName;
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

function readLastFinding(
  slug: string,
  folder: string,
): { date: string | null; finding: string | null; count: number | null; status: string | null } {
  const dir = path.join(brandDir(slug), "recurring-tasks", folder);
  if (!fs.existsSync(dir)) return { date: null, finding: null, count: null, status: null };
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".json")).sort().reverse();
  if (files.length === 0) return { date: null, finding: null, count: null, status: null };
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf-8"));
    const dateStr = typeof data.date === "string" ? data.date : files[0].replace(".json", "");
    return {
      date: dateStr ? new Date(`${dateStr}T00:00:00Z`).toISOString() : null,
      finding: data.last_finding || data.summary || null,
      count: data.total_new_questions ?? data.candidates_sent ?? data.signals_count ?? null,
      status: data.status || null,
    };
  } catch {
    return { date: null, finding: null, count: null, status: null };
  }
}

function ctMatchesChannel(ct: ContentTask, channel: string): boolean {
  return toChannelList(ct.target_channel, ct.target_channels).includes(channel);
}

function inCurrentMonth(iso?: string): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function countBlogArticlesThisMonth(slug: string): number {
  const candidates = [
    path.join(brandDir(slug), "campaigns", "content"),
    path.join(BASE, "campaigns", slug, "content"),
  ];
  const now = new Date();
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    try {
      return fs.readdirSync(dir).filter((file) => {
        if (!file.endsWith(".md")) return false;
        const stat = fs.statSync(path.join(dir, file));
        return stat.mtime.getFullYear() === now.getFullYear() && stat.mtime.getMonth() === now.getMonth();
      }).length;
    } catch {
      return 0;
    }
  }
  return 0;
}

function isGscConnected(slug: string): boolean {
  const integrations = readJSON<{ dataSources?: Record<string, { status?: string }> }>(
    path.join(brandDir(slug), "integrations.json"),
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
      `[content/read-model] GSC metrics unavailable for ${slug}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

function nextSlotLabel(bestDays: string[], bestTimes: string[]): string | null {
  const dows = bestDays
    .map((day) => DAY_ALIASES[String(day).trim().toLowerCase()])
    .filter((day): day is number => typeof day === "number");
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
    const metrics = draft?.meta?.publishing?.metrics;
    if (!metrics) continue;
    const measured = metrics.measured_at ? new Date(metrics.measured_at).getTime() : Date.now();
    if (measured < cutoff) continue;
    if (typeof metrics.engagement_pct === "number") {
      engagementSum += metrics.engagement_pct;
      engagementN++;
    }
    if (typeof metrics.impressions === "number") impressions += metrics.impressions;
  }
  return {
    engagementPct: engagementN > 0 ? Math.round((engagementSum / engagementN) * 10) / 10 : null,
    impressions30d: engagementN > 0 || impressions > 0 ? impressions : null,
    postsWithMetrics: engagementN,
  };
}

function inRange(iso: string, fromIso?: string, toIso?: string): boolean {
  if (!fromIso && !toIso) return true;
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return false;
  if (fromIso) {
    const from = Date.parse(fromIso);
    if (!Number.isNaN(from) && timestamp < from) return false;
  }
  if (toIso) {
    const to = Date.parse(toIso);
    if (!Number.isNaN(to) && timestamp > to + 24 * 60 * 60 * 1000 - 1) return false;
  }
  return true;
}

function pickTitle(idea: Idea | undefined, body: string, fallback: string): string {
  if (idea?.title?.trim()) return idea.title.trim();
  for (const raw of body.split("\n")) {
    const line = raw.trim().replace(/^#+\s*/, "");
    if (line.length >= 8) return line.length > 140 ? `${line.slice(0, 137)}...` : line;
  }
  return fallback;
}

function pickHeroMediaUrl(media: Array<{ url?: string }> | undefined): string | undefined {
  if (!Array.isArray(media)) return undefined;
  const first = media.find((item) => typeof item?.url === "string" && item.url);
  return first?.url;
}

function ideaPillarId(idea: Idea | undefined): string | undefined {
  const sourceData = idea?.source_data;
  if (sourceData && typeof sourceData === "object" && "pillar_id" in sourceData) {
    const value = (sourceData as { pillar_id?: unknown }).pillar_id;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function truncateBody(body: string, maxChars: number): { value: string; truncated: boolean } {
  if (body.length <= maxChars) return { value: body, truncated: false };
  return { value: body.slice(0, maxChars), truncated: true };
}

function parsePillarsFromMarkdown(content: string): unknown[] {
  const yamlMatch = content.match(/```yaml\n([\s\S]*?)```/);
  if (!yamlMatch) return [];
  const yamlText = yamlMatch[1];
  const pillarBlocks = yamlText.split(/\n  - id:/);
  return pillarBlocks.slice(1).map((block) => {
    const lines = (`  - id:${block}`).split("\n");
    const obj: Record<string, unknown> = {};
    for (const line of lines) {
      const idMatch = line.match(/^\s{2}- id:\s*"?(.+?)"?\s*$/);
      if (idMatch) {
        obj.id = idMatch[1];
        continue;
      }
      const match = line.match(/^\s{4}(\w+):\s*"?(.+?)"?\s*$/);
      if (match) obj[match[1]] = match[2];
    }
    return obj;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
