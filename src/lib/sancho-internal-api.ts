import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Client, Project, Task } from "@/types";
import { loadClient, loadClients } from "@/lib/data/clients";
import { readJSON, readText } from "@/lib/data/json-io";
import { BASE, brandDir } from "@/lib/data/paths";
import { assembleBrandBrainState } from "@/lib/data/brand-brain-assembler";

export type SanchoClientStatus = "active" | "paused" | "done" | "unknown";
export type SanchoWorkStatus =
  | "queued"
  | "in_progress"
  | "waiting_for_client"
  | "blocked"
  | "done"
  | "failed";
export type SanchoOutputStatus = "wip" | "review" | "final" | "archived";

export interface SanchoClientSummary {
  slug: string;
  name: string;
  status: SanchoClientStatus;
  last_activity_at: string | null;
}

export interface SanchoWorkItem {
  id: string;
  title: string;
  status: SanchoWorkStatus;
  owner?: string;
  updated_at: string;
}

export interface SanchoBlocker {
  id: string;
  title: string;
  source: string;
  severity: "low" | "medium" | "high";
}

export interface SanchoOutputSummary {
  id: string;
  title: string;
  type: string;
  status: SanchoOutputStatus;
  created_at: string;
  updated_at: string;
  markdown_url: string;
  brain_synced: boolean;
  brain_path?: string;
}

export interface SanchoClientLiveStatus {
  client: {
    slug: string;
    name: string;
  };
  status: SanchoClientStatus;
  summary: string;
  active_work: SanchoWorkItem[];
  blockers: SanchoBlocker[];
  recent_outputs: SanchoOutputSummary[];
  updated_at: string;
  metrics?: SanchoMetricSummary | null;
}

export interface SanchoMetricValue {
  name: string;
  value: number | string;
  date?: string;
}

export interface SanchoMetricSource {
  source: string;
  status: string;
  metrics: SanchoMetricValue[];
}

export interface SanchoMetricSummary {
  collected_at: string | null;
  date_range?: { from?: string; to?: string };
  sources: SanchoMetricSource[];
}

export interface SanchoOutputDetail extends SanchoOutputSummary {
  client: string;
  markdown: string;
  brain_sync: {
    eligible: boolean;
    synced: boolean;
    path?: string;
    synced_at?: string;
  };
}

interface FileHit {
  absolutePath: string;
  relativePath: string;
  stats: fs.Stats;
}

const OUTPUT_ID_SEPARATOR = "__";
const MAX_WALK_FILES = 2000;
const DEFAULT_OUTPUT_LIMIT = 20;

export function requireInternalAuth(
  req: NextApiRequest,
  res: NextApiResponse
): boolean {
  const expectedToken = process.env.SANCHO_INTERNAL_API_TOKEN;
  if (!expectedToken) {
    res.status(503).json({ error: "SANCHO_INTERNAL_API_TOKEN not configured" });
    return false;
  }

  const token = getBearerToken(req);
  if (!token || !safeEqual(token, expectedToken)) {
    res.status(403).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

export function withInternalAuth(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    if (!requireInternalAuth(req, res)) return;
    return handler(req, res);
  };
}

export function listInternalClients(): SanchoClientSummary[] {
  return loadClients().map((client) => ({
    slug: client.slug,
    name: client.name,
    status: getClientRuntimeStatus(client),
    last_activity_at: getLastActivityAt(client.slug),
  }));
}

export function getInternalClientStatus(
  slug: string
): SanchoClientLiveStatus | null {
  const client = loadClient(slug);
  if (!client) return null;

  const activeWork = collectActiveWork(slug);
  const blockers = collectBlockers(slug);
  const recentOutputs = listClientOutputs(slug, {
    limit: DEFAULT_OUTPUT_LIMIT,
  });
  const updatedAt =
    maxIso([
      getLastActivityAt(slug),
      ...activeWork.map((item) => item.updated_at),
      ...recentOutputs.map((output) => output.updated_at),
    ]) || new Date().toISOString();

  return {
    client: {
      slug: client.slug,
      name: client.name,
    },
    status: getClientRuntimeStatus(client),
    summary: buildClientSummary(client, activeWork, blockers),
    active_work: activeWork,
    blockers,
    recent_outputs: recentOutputs,
    updated_at: updatedAt,
    metrics: getClientMetricsSummary(slug),
  };
}

/**
 * Reads the latest metrics snapshot for a client (brand/{slug}/metrics/YYYY-MM-DD.json,
 * falling back to metrics-data.json) and returns a compact per-source summary so the
 * client status/report carries its KPIs. Returns null if no metrics collected yet.
 */
export function getClientMetricsSummary(slug: string): SanchoMetricSummary | null {
  const metricsDir = path.join(brandDir(slug), "metrics");
  let snapshotPath: string | null = null;
  try {
    const files = fs
      .readdirSync(metricsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    if (files.length > 0) {
      snapshotPath = path.join(metricsDir, files[files.length - 1]);
    } else if (fs.existsSync(path.join(metricsDir, "metrics-data.json"))) {
      snapshotPath = path.join(metricsDir, "metrics-data.json");
    }
  } catch {
    return null;
  }
  if (!snapshotPath) return null;

  const snap = pickLatestSnapshot(readJSON<unknown>(snapshotPath, null));
  if (!snap) return null;

  const sourcesRaw = snap.sources;
  if (!sourcesRaw || typeof sourcesRaw !== "object") return null;

  const sources: SanchoMetricSource[] = [];
  for (const [source, valUnknown] of Object.entries(
    sourcesRaw as Record<string, unknown>
  )) {
    if (!valUnknown || typeof valUnknown !== "object") continue;
    const val = valUnknown as Record<string, unknown>;
    const metricsArr = Array.isArray(val.metrics) ? (val.metrics as unknown[]) : [];
    const byName = new Map<string, SanchoMetricValue>();
    for (const mUnknown of metricsArr) {
      if (!mUnknown || typeof mUnknown !== "object") continue;
      const m = mUnknown as Record<string, unknown>;
      if (typeof m.name !== "string") continue;
      const value = m.value;
      if (typeof value !== "number" && typeof value !== "string") continue;
      const date = typeof m.date === "string" ? m.date : undefined;
      const prev = byName.get(m.name);
      if (!prev || (date && (!prev.date || date > prev.date))) {
        byName.set(m.name, { name: m.name, value, date });
      }
    }
    sources.push({
      source,
      status: typeof val.status === "string" ? val.status : "unknown",
      metrics: Array.from(byName.values()).slice(0, 20),
    });
  }

  const dr = snap.dateRange;
  const dateRange =
    dr && typeof dr === "object"
      ? {
          from:
            typeof (dr as Record<string, unknown>).from === "string"
              ? ((dr as Record<string, unknown>).from as string)
              : undefined,
          to:
            typeof (dr as Record<string, unknown>).to === "string"
              ? ((dr as Record<string, unknown>).to as string)
              : undefined,
        }
      : undefined;

  return {
    collected_at: typeof snap.collectedAt === "string" ? snap.collectedAt : null,
    date_range: dateRange,
    sources,
  };
}

function pickLatestSnapshot(raw: unknown): Record<string, unknown> | null {
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>).sources
  ) {
    return raw as Record<string, unknown>;
  }
  if (Array.isArray(raw)) {
    const snaps = raw.filter(
      (s): s is Record<string, unknown> =>
        !!s && typeof s === "object" && !!(s as Record<string, unknown>).sources
    );
    snaps.sort((a, b) =>
      String(a.collectedAt ?? "").localeCompare(String(b.collectedAt ?? ""))
    );
    return snaps[snaps.length - 1] ?? null;
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    for (let i = keys.length - 1; i >= 0; i--) {
      const v = obj[keys[i]];
      if (v && typeof v === "object" && (v as Record<string, unknown>).sources) {
        return v as Record<string, unknown>;
      }
    }
  }
  return null;
}

export function listClientOutputs(
  slug: string,
  options: { limit?: number; status?: SanchoOutputStatus } = {}
): SanchoOutputSummary[] {
  const client = loadClient(slug);
  if (!client) return [];

  const limit = clampLimit(options.limit);
  return walkMarkdownFiles(brandDir(slug), 8)
    .map((file) => outputSummaryFromFile(slug, file))
    .filter((output): output is SanchoOutputSummary => output !== null)
    .filter((output) => !options.status || output.status === options.status)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, limit);
}

export function getOutputDetail(id: string): SanchoOutputDetail | null {
  const decoded = decodeOutputId(id);
  if (!decoded) return null;

  const client = loadClient(decoded.slug);
  if (!client) return null;

  const base = brandDir(decoded.slug);
  const absolutePath = path.resolve(base, decoded.relativePath);
  if (!isInsideDir(base, absolutePath) || !absolutePath.endsWith(".md")) {
    return null;
  }

  const markdown = readText(absolutePath);
  if (markdown === null) return null;

  const stats = statSafe(absolutePath);
  if (!stats) return null;

  const summary = outputSummaryFromFile(decoded.slug, {
    absolutePath,
    relativePath: normalizePath(decoded.relativePath),
    stats,
  });
  if (!summary) return null;

  return {
    ...summary,
    client: decoded.slug,
    markdown,
    brain_sync: {
      eligible: summary.status === "final",
      synced: summary.brain_synced,
      path: summary.brain_path,
    },
  };
}

export function parseLimit(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return DEFAULT_OUTPUT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return clampLimit(Number.isFinite(parsed) ? parsed : DEFAULT_OUTPUT_LIMIT);
}

export function parseOutputStatus(
  value: string | string[] | undefined
): SanchoOutputStatus | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    raw === "wip" ||
    raw === "review" ||
    raw === "final" ||
    raw === "archived"
  ) {
    return raw;
  }
  return undefined;
}

function getBearerToken(req: NextApiRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function getClientRuntimeStatus(client: Client): SanchoClientStatus {
  if (client.active === true) return "active";
  if (client.active === false) return "paused";
  return "unknown";
}

function collectActiveWork(slug: string): SanchoWorkItem[] {
  const work = [...collectProjectWork(slug), ...collectFoundationWork(slug)];
  return work
    .filter((item) => item.status !== "done" && item.status !== "failed")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 25);
}

function collectProjectWork(slug: string): SanchoWorkItem[] {
  const projectsDir = path.join(brandDir(slug), "projects");
  const entries = readDirSafe(projectsDir);
  const work: SanchoWorkItem[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(projectsDir, entry.name);
    const project = readJSON<Partial<Project>>(
      path.join(dir, "project.json"),
      {}
    );
    const projectStatus = normalizeWorkStatus(project.status);
    const projectTitle = firstString(project.name, project.slug, entry.name);
    if (projectStatus && projectStatus !== "done") {
      work.push({
        id: String(project.id || entry.name),
        title: projectTitle,
        status: projectStatus,
        owner: "sancho",
        updated_at: firstString(project.created_at, statIso(dir)),
      });
    }

    const taskData = readJSON<{ tasks?: Task[] } | Task[]>(
      path.join(dir, "tasks.json"),
      []
    );
    const tasks = Array.isArray(taskData) ? taskData : taskData.tasks || [];
    for (const task of tasks) {
      const status = normalizeWorkStatus(task.status);
      if (!status || status === "done") continue;
      work.push({
        id: task.id,
        title: task.name || task.description || task.id,
        status,
        owner: normalizeOwner(task.owner),
        updated_at: firstString(task.completed, statIso(path.join(dir, "tasks.json"))),
      });
    }
  }

  return work;
}

function collectFoundationWork(slug: string): SanchoWorkItem[] {
  const state = assembleBrandBrainState(slug);
  const sections = state.sections || {};
  const updatedAt = firstString(state.updated_at);
  const work: SanchoWorkItem[] = [];

  for (const [sectionKey, section] of Object.entries(sections)) {
    const status = normalizeWorkStatus(section.status);
    if (!status || status === "done" || status === "queued") continue;
    work.push({
      id: `foundation:${sectionKey}`,
      title: sectionKey,
      status,
      owner: "sancho",
      updated_at: updatedAt,
    });
  }

  return work;
}

function collectBlockers(slug: string): SanchoBlocker[] {
  const blockers: SanchoBlocker[] = [];

  for (const item of [...collectProjectWork(slug), ...collectFoundationWork(slug)]) {
    if (item.status !== "blocked" && item.status !== "waiting_for_client") {
      continue;
    }
    blockers.push({
      id: `blocker:${item.id}`,
      title: item.title,
      source: "sancho",
      severity: item.status === "blocked" ? "high" : "medium",
    });
  }

  return blockers.slice(0, 20);
}

function buildClientSummary(
  client: Client,
  activeWork: SanchoWorkItem[],
  blockers: SanchoBlocker[]
): string {
  if (blockers.length > 0) {
    return `Sancho registra ${blockers.length} blocker(s) para ${client.name}.`;
  }
  if (activeWork.length > 0) {
    const titles = activeWork
      .slice(0, 3)
      .map((item) => item.title)
      .join(", ");
    return `Sancho registra ${activeWork.length} item(s) activos: ${titles}.`;
  }
  return `Sancho no registra trabajo activo para ${client.name}.`;
}

function normalizeWorkStatus(status: unknown): SanchoWorkStatus | null {
  if (typeof status !== "string") return null;
  switch (status) {
    case "todo":
    case "not-started":
    case "queued":
      return "queued";
    case "active":
    case "in-progress":
    case "in_progress":
    case "generated":
      return "in_progress";
    case "pending-review":
    case "waiting_for_client":
    case "review":
      return "waiting_for_client";
    case "blocked":
    case "request-refresh":
    case "request-changes":
      return "blocked";
    case "completed":
    case "approved":
    case "done":
      return "done";
    case "failed":
    case "cancelled":
    case "archived":
    case "discarded":
      return "failed";
    default:
      return null;
  }
}

function outputSummaryFromFile(
  slug: string,
  file: FileHit
): SanchoOutputSummary | null {
  if (file.relativePath.includes("/_archive/")) return null;
  const markdown = readText(file.absolutePath);
  if (markdown === null) return null;

  const status = inferOutputStatus(file.relativePath);
  const id = encodeOutputId(slug, file.relativePath);
  return {
    id,
    title: extractMarkdownTitle(markdown) || titleFromPath(file.relativePath),
    type: inferOutputType(file.relativePath),
    status,
    created_at: file.stats.birthtime.toISOString(),
    updated_at: file.stats.mtime.toISOString(),
    markdown_url: `sancho://outputs/${id}`,
    brain_synced: false,
  };
}

function inferOutputStatus(relativePath: string): SanchoOutputStatus {
  const lower = relativePath.toLowerCase();
  if (lower.includes("/draft") || lower.includes("draft") || lower.includes("wip")) {
    return "wip";
  }
  if (lower.includes("review")) return "review";
  if (lower.includes("/archive/") || lower.includes("/_archive/")) return "archived";
  return "final";
}

function inferOutputType(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.includes("company-brief") || lower.includes("foundation")) {
    return "foundation";
  }
  if (lower.includes("campaign")) return "campaign";
  if (lower.includes("meeting")) return "meeting-summary";
  if (lower.includes("decision")) return "decision";
  if (lower.includes("intelligence") || lower.includes("research")) return "research";
  if (lower.includes("go-to-market") || lower.includes("strategic-plan")) {
    return "strategy";
  }
  return "document";
}

function encodeOutputId(slug: string, relativePath: string): string {
  return `${slug}${OUTPUT_ID_SEPARATOR}${Buffer.from(
    normalizePath(relativePath)
  ).toString("base64url")}`;
}

function decodeOutputId(
  id: string
): { slug: string; relativePath: string } | null {
  const index = id.indexOf(OUTPUT_ID_SEPARATOR);
  if (index <= 0) return null;
  const slug = id.slice(0, index);
  const encoded = id.slice(index + OUTPUT_ID_SEPARATOR.length);
  try {
    const relativePath = normalizePath(
      Buffer.from(encoded, "base64url").toString("utf-8")
    );
    if (!relativePath || relativePath.startsWith("../")) return null;
    return { slug, relativePath };
  } catch {
    return null;
  }
}

function walkMarkdownFiles(rootDir: string, maxDepth: number): FileHit[] {
  const root = path.resolve(rootDir);
  const hits: FileHit[] = [];

  function walk(current: string, depth: number): void {
    if (depth > maxDepth || hits.length >= MAX_WALK_FILES) return;
    const entries = readDirSafe(current);
    for (const entry of entries) {
      if (hits.length >= MAX_WALK_FILES) return;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const stats = statSafe(absolutePath);
      if (!stats) continue;
      hits.push({
        absolutePath,
        relativePath: normalizePath(path.relative(root, absolutePath)),
        stats,
      });
    }
  }

  walk(root, 0);
  return hits;
}

function getLastActivityAt(slug: string): string | null {
  const files = walkMarkdownFiles(brandDir(slug), 8);
  const dates = files.map((file) => file.stats.mtime.toISOString());
  return maxIso(dates);
}

function maxIso(values: Array<string | null | undefined>): string | null {
  const filtered = values.filter((value): value is string => Boolean(value));
  if (filtered.length === 0) return null;
  return filtered.sort().at(-1) || null;
}

function extractMarkdownTitle(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/).slice(0, 40);
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match) return cleanTitle(match[1]);
  }
  return null;
}

function titleFromPath(relativePath: string): string {
  const basename = path.basename(relativePath, ".md");
  return cleanTitle(basename.replace(/[-_]+/g, " "));
}

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

function normalizeOwner(owner: string | undefined): string {
  if (!owner) return "sancho";
  return owner.toLowerCase() === "sancho" ? "sancho" : owner;
}

function firstString(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return new Date().toISOString();
}

function clampLimit(value: number | undefined): number {
  if (!value || value < 1) return DEFAULT_OUTPUT_LIMIT;
  return Math.min(value, 100);
}

function readDirSafe(dirPath: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function statSafe(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function statIso(filePath: string): string | null {
  const stats = statSafe(filePath);
  return stats ? stats.mtime.toISOString() : null;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function isInsideDir(parentDir: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentDir), path.resolve(childPath));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export { BASE };
