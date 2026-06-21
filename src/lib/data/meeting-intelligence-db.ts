import crypto from "crypto";
import fs from "fs";
import path from "path";
import { and, desc, eq, sql as drizzleSql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import {
  miDocumentImpacts,
  miInsights,
  miMeetingArtifacts,
  miMeetings,
  miRecommendations,
  miRuns,
  miSettings,
  miSources,
} from "@/db/schema";
import { BASE, brandDir, meetingIntelligenceConfigFile, meetingIntelligenceDir } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";
import { createTask } from "@/lib/data/tasks";

export type MeetingStatus = "needs_raw_sync" | "raw_available" | "processed" | "needs_review" | "failed";
export type InsightStatus = "draft" | "reviewable" | "accepted" | "rejected" | "converted";
export type RecommendationStatus = "recommended" | "approved" | "rejected" | "converted";
export type RecommendationAction = "approve" | "reject" | "convert";

type RawRecord = Record<string, unknown>;

export interface SourceScope {
  id: string;
  name: string;
  url?: string;
  notes?: string;
  filter?: {
    property?: string;
    propertyId?: string;
    propertyType?: string;
    operator?: string;
    value?: string;
  };
}

export interface MeetingIntelligenceConfig {
  slug: string;
  enabled: boolean;
  updatedAt: string | null;
  sync: {
    enabled: boolean;
    time: string;
    timezone: string;
    cronExpr: string;
    limit: number;
    cronJobId: string | null;
  };
  sources: {
    googleDrive: { enabled: boolean; includeSubfolders: boolean; folders: SourceScope[] };
    notion: { enabled: boolean; databases: SourceScope[]; pages: SourceScope[] };
    slack: { enabled: boolean; channels: SourceScope[]; includeThreads: boolean };
    discord: { enabled: boolean; channels: SourceScope[]; includeThreads: boolean };
    manualUpload: { enabled: boolean };
  };
  routing: {
    publishChannel: string;
    reviewOwner: string;
    defaultTimezone: string;
  };
}

interface ClientConfig {
  channels?: Record<string, string>;
  crons?: {
    meeting_intelligence?: {
      enabled?: boolean;
      publish_channel?: string;
      google_drive_folder_id?: string;
      tz?: string;
    };
    daily_pulse?: {
      tz?: string;
    };
  };
}

export interface MeetingStateRecord {
  id: string;
  title: string;
  date: string;
  time: string;
  source: string;
  status: MeetingStatus;
  rawStatus: string;
  hasRaw: boolean;
  hasSummary: boolean;
  type: string;
  participants: string[];
  decisions: number;
  actions: number;
  sourceId?: string;
  sourceUrl?: string;
  fetchedAt?: string | null;
}

export interface IntelligenceItem {
  id: string;
  type: "Decision" | "Action" | "Insight" | "Quote" | "Risk" | "Run";
  title: string;
  source: string;
  date: string;
  confidence: string;
  confidenceValue?: number | null;
  status: InsightStatus;
  evidenceRaw: boolean;
  meetingId?: string | null;
  owner?: string | null;
  body?: string | null;
  rationale?: string | null;
  evidence?: Record<string, unknown> | null;
  tone: "ok" | "warn" | "critical" | "proposal";
}

export interface DecisionEntry {
  id: string;
  date: string;
  decision: string;
  rationale: string;
  owner: string;
  source: string;
  documents: string[];
  status: "Logged" | "Linked" | "Proposal pending" | "Applied" | "Rejected";
  evidenceRaw: boolean;
  meetingId?: string | null;
}

export interface DocumentRecord {
  name: string;
  area: string;
  health: string;
  status: "no impact" | "possible update" | "conflict" | "proposal ready";
  proposals: number;
  conflicts: number;
  critical?: boolean;
  lastDecision?: string;
  severity?: string;
}

export interface ProposalEntry {
  id: string;
  title: string;
  description?: string | null;
  priority: "high" | "medium" | "low";
  doc: string;
  source: string;
  status: RecommendationStatus;
  taskStatus: string;
  meetingId?: string | null;
  insightId?: string | null;
  taskId?: string | null;
}

export interface MeetingDetailRecord {
  meeting: MeetingStateRecord;
  artifact: {
    rawText: string | null;
    summaryText: string | null;
    sourcePayload: Record<string, unknown> | null;
    checksum: string | null;
    fetchedAt: string | null;
  } | null;
  insights: IntelligenceItem[];
  decisions: DecisionEntry[];
  impacts: Array<{
    id: string;
    documentName: string;
    status: string;
    severity: string;
    reason: string | null;
    proposedChange: string | null;
  }>;
  recommendations: ProposalEntry[];
}

interface MeetingIntelligenceReadOptions {
  prepareStorage?: boolean;
  backfillLegacy?: boolean;
}

const STORAGE_NOT_CONFIGURED = {
  configured: false,
  provider: "neon",
  message: "DATABASE_URL is not configured. Meeting Intelligence will not read JSON or show placeholder data as processed.",
};

let ensurePromise: Promise<void> | null = null;

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" ? value as RawRecord : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function emptyScope(): SourceScope {
  return { id: "", name: "", url: "", notes: "" };
}

function stableId(...parts: Array<string | number | null | undefined>) {
  return crypto.createHash("sha1").update(parts.filter(Boolean).join(":")).digest("hex").slice(0, 24);
}

function checksum(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

function clampTitle(value: string, fallback: string) {
  const text = value.replace(/\s+/g, " ").trim() || fallback;
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function titleFromFileName(name: string) {
  return name
    .replace(/\.(md|txt)$/i, "")
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || name;
}

function dateFromText(value: string) {
  const iso = value.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const months: Record<string, string> = {
    ene: "01",
    enero: "01",
    feb: "02",
    febrero: "02",
    mar: "03",
    marzo: "03",
    abr: "04",
    abril: "04",
    may: "05",
    mayo: "05",
    jun: "06",
    junio: "06",
    jul: "07",
    julio: "07",
    ago: "08",
    agosto: "08",
    sep: "09",
    sept: "09",
    septiembre: "09",
    oct: "10",
    octubre: "10",
    nov: "11",
    noviembre: "11",
    dic: "12",
    diciembre: "12",
  };
  const spanish = value.toLowerCase().match(/\b(\d{1,2})\s+(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:tiembre)?|sept(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)\s+(\d{4})\b/);
  if (!spanish) return "";
  const [, day, month, year] = spanish;
  return `${year}-${months[month]}-${day.padStart(2, "0")}`;
}

function timeFromText(value: string) {
  const explicit = value.match(/(?:Fecha|Date):.*?T(\d{1,2}:\d{2})/i)?.[1]
    || value.match(/(?:Fecha|Date):.*?\b(\d{1,2}:\d{2})(?!:)/i)?.[1]
    || value.match(/\b(\d{1,2}:\d{2})\s*(?:CET|CEST)\b/i)?.[1]
    || value.match(/(?:^|[^\d:])(\d{1,2}:\d{2})(?!:)/)?.[1];
  return explicit || "";
}

function headingFromContent(content: string, fallback: string) {
  const h1 = content.match(/^#\s+(.+)$/m)?.[1];
  return clampTitle(h1 || fallback, fallback);
}

function participantsFromContent(content: string) {
  const line = content.match(/^\*\*Asistentes:\*\*\s+(.+)$/m)?.[1] || content.match(/^Asistentes:\s+(.+)$/m)?.[1];
  if (!line) return [];
  return line.split(/·|,|;/).map((item) => item.trim()).filter(Boolean);
}

function sourceFromContent(content: string, fallback = "Workspace") {
  return content.match(/^\*\*Fuente:\*\*\s+(.+)$/m)?.[1]?.trim() || fallback;
}

function normalizeSource(source: string) {
  const lower = source.toLowerCase();
  if (lower.includes("drive")) return "Google Drive";
  if (lower.includes("notion")) return "Notion";
  if (lower.includes("slack")) return "Slack";
  if (lower.includes("discord")) return "Discord";
  if (lower.includes("workspace")) return "Workspace";
  return source || "Manual";
}

function normalizePriority(value: unknown): "high" | "medium" | "low" {
  const priority = asString(value).toLowerCase();
  if (priority === "high" || priority === "low") return priority;
  return "medium";
}

function normalizeInsightKind(kind: string): IntelligenceItem["type"] {
  if (kind === "decision") return "Decision";
  if (kind === "action") return "Action";
  if (kind === "quote") return "Quote";
  if (kind === "risk") return "Risk";
  if (kind === "run") return "Run";
  return "Insight";
}

function insightTone(kind: string, status: string, evidenceRaw: boolean): IntelligenceItem["tone"] {
  if (status === "rejected") return "warn";
  if (!evidenceRaw || status === "draft") return "proposal";
  if (kind === "risk") return "critical";
  if (kind === "action") return "warn";
  return "ok";
}

function mapDecisionStatus(status: string): DecisionEntry["status"] {
  if (status === "accepted") return "Linked";
  if (status === "converted") return "Applied";
  if (status === "rejected") return "Rejected";
  if (status === "reviewable") return "Proposal pending";
  return "Logged";
}

function emptyConfig(slug: string): MeetingIntelligenceConfig {
  return {
    slug,
    enabled: true,
    updatedAt: null,
    sync: {
      enabled: false,
      time: "18:00",
      timezone: "Europe/Madrid",
      cronExpr: "0 18 * * *",
      limit: 60,
      cronJobId: null,
    },
    sources: {
      googleDrive: { enabled: false, includeSubfolders: true, folders: [emptyScope()] },
      notion: { enabled: false, databases: [emptyScope()], pages: [] },
      slack: { enabled: false, channels: [], includeThreads: true },
      discord: { enabled: false, channels: [], includeThreads: true },
      manualUpload: { enabled: true },
    },
    routing: {
      publishChannel: "intelligence",
      reviewOwner: "Alfonso",
      defaultTimezone: "Europe/Madrid",
    },
  };
}

function legacySeedConfig(slug: string): MeetingIntelligenceConfig {
  const base = emptyConfig(slug);
  const clientConfig = readJSON<ClientConfig>(path.join(brandDir(slug), "client-config.json"), {});
  const meetingCron = clientConfig.crons?.meeting_intelligence || {};
  const publishChannel = meetingCron.publish_channel || "intelligence";
  const driveFolderId = meetingCron.google_drive_folder_id || "";
  return {
    ...base,
    enabled: Boolean(meetingCron.enabled ?? true),
    sync: {
      ...base.sync,
      enabled: Boolean(meetingCron.enabled ?? true),
      timezone: meetingCron.tz || clientConfig.crons?.daily_pulse?.tz || base.sync.timezone,
    },
    sources: {
      ...base.sources,
      googleDrive: {
        enabled: Boolean(driveFolderId),
        includeSubfolders: true,
        folders: driveFolderId
          ? [{ id: driveFolderId, name: "Meeting notes folder", url: "", notes: "Seeded from client-config.json" }]
          : [],
      },
      discord: {
        enabled: Boolean(clientConfig.channels?.[publishChannel]),
        channels: clientConfig.channels?.[publishChannel]
          ? [{ id: clientConfig.channels[publishChannel], name: publishChannel, notes: "Publish/review channel" }]
          : [],
        includeThreads: true,
      },
    },
    routing: {
      publishChannel,
      reviewOwner: "Alfonso",
      defaultTimezone: meetingCron.tz || clientConfig.crons?.daily_pulse?.tz || "Europe/Madrid",
    },
  };
}

function normalizeSyncTime(value: unknown, fallback = "18:00") {
  const raw = asString(value, fallback).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function cronExprFromTime(time: string) {
  const [hour = "18", minute = "0"] = time.split(":");
  return `${Number(minute)} ${Number(hour)} * * *`;
}

function normalizeSyncConfig(input: unknown, base: MeetingIntelligenceConfig["sync"]) {
  const raw = asRecord(input);
  const time = normalizeSyncTime(raw.time, base.time);
  const timezone = asString(raw.timezone) || asString(raw.tz) || base.timezone;
  const limit = Math.max(1, Math.min(Number(raw.limit || base.limit) || base.limit, 60));
  return {
    enabled: asBoolean(raw.enabled, base.enabled),
    time,
    timezone,
    cronExpr: asString(raw.cronExpr) || asString(raw.cron_expr) || cronExprFromTime(time),
    limit,
    cronJobId: asString(raw.cronJobId) || asString(raw.cron_job_id) || base.cronJobId,
  };
}

function normalizeScope(input: unknown): SourceScope {
  if (!input || typeof input !== "object") return emptyScope();
  const scope = input as RawRecord;
  const id = asString(scope.id_dashed) || asString(scope.id);
  const notes = asString(scope.notes) || asString(scope.description);
  return {
    id,
    name: asString(scope.name),
    url: asString(scope.url),
    notes,
    filter: scope.filter && typeof scope.filter === "object" ? scope.filter as SourceScope["filter"] : undefined,
  };
}

function normalizeScopeList(input: unknown, fallback: SourceScope[], keepEmpty = true) {
  const scopes = Array.isArray(input) ? input.map(normalizeScope) : fallback;
  if (scopes.length) return scopes;
  return keepEmpty ? [emptyScope()] : [];
}

export function normalizeMeetingIntelligenceConfig(slug: string, input: Partial<MeetingIntelligenceConfig> & RawRecord): MeetingIntelligenceConfig {
  const base = emptyConfig(slug);
  const rawSources = asRecord(input.sources);
  const legacyDrive = asRecord(rawSources.google_drive);
  const rawGoogleDrive = asRecord(rawSources.googleDrive);
  const rawNotion = asRecord(rawSources.notion);
  const rawSlack = asRecord(rawSources.slack);
  const rawDiscord = asRecord(rawSources.discord);
  const rawManualUpload = asRecord(rawSources.manualUpload);
  const rawRouting = asRecord(input.routing);

  return {
    ...base,
    ...input,
    slug,
    enabled: asBoolean(input.enabled, base.enabled),
    updatedAt: asString(input.updatedAt) || base.updatedAt,
    sync: normalizeSyncConfig(input.sync, base.sync),
    sources: {
      googleDrive: {
        enabled: asBoolean(rawGoogleDrive.enabled ?? legacyDrive.enabled, base.sources.googleDrive.enabled),
        includeSubfolders: asBoolean(rawGoogleDrive.includeSubfolders, base.sources.googleDrive.includeSubfolders),
        folders: normalizeScopeList(rawGoogleDrive.folders ?? legacyDrive.folders, base.sources.googleDrive.folders),
      },
      notion: {
        enabled: asBoolean(rawNotion.enabled, base.sources.notion.enabled),
        databases: normalizeScopeList(rawNotion.databases, base.sources.notion.databases),
        pages: normalizeScopeList(rawNotion.pages, [], false),
      },
      slack: {
        enabled: asBoolean(rawSlack.enabled, base.sources.slack.enabled),
        channels: normalizeScopeList(rawSlack.channels, [], false).filter((scope) => scope.id || scope.name || scope.url),
        includeThreads: asBoolean(rawSlack.includeThreads, base.sources.slack.includeThreads),
      },
      discord: {
        enabled: asBoolean(rawDiscord.enabled, base.sources.discord.enabled),
        channels: normalizeScopeList(rawDiscord.channels, [], false).filter((scope) => scope.id || scope.name || scope.url),
        includeThreads: asBoolean(rawDiscord.includeThreads, base.sources.discord.includeThreads),
      },
      manualUpload: {
        enabled: asBoolean(rawManualUpload.enabled, base.sources.manualUpload.enabled),
      },
    },
    routing: {
      publishChannel: asString(rawRouting.publishChannel) || asString(rawRouting.target) || base.routing.publishChannel,
      reviewOwner: asString(rawRouting.reviewOwner) || asString(rawRouting.review_owner) || base.routing.reviewOwner,
      defaultTimezone: asString(rawRouting.defaultTimezone) || asString(rawRouting.timezone) || base.routing.defaultTimezone,
    },
  };
}

export async function ensureMeetingIntelligenceStorage() {
  if (!hasDatabase) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const database = getDb();
      const statements = [
        `CREATE TABLE IF NOT EXISTS "mi_sources" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "kind" text NOT NULL, "name" text NOT NULL, "source_id" text, "url" text, "enabled" boolean DEFAULT true NOT NULL, "scope" jsonb, "filter" jsonb, "status" text DEFAULT 'active' NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS "mi_settings" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "enabled" boolean DEFAULT true NOT NULL, "sync_enabled" boolean DEFAULT false NOT NULL, "sync_time" text DEFAULT '18:00' NOT NULL, "sync_timezone" text DEFAULT 'Europe/Madrid' NOT NULL, "sync_cron_expr" text DEFAULT '0 18 * * *' NOT NULL, "sync_limit" integer DEFAULT 60 NOT NULL, "cron_job_id" text, "routing" jsonb, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS "mi_runs" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "status" text DEFAULT 'queued' NOT NULL, "trigger" text DEFAULT 'agent' NOT NULL, "sources_scanned" jsonb, "metrics" jsonb, "errors" jsonb, "started_at" timestamp DEFAULT now() NOT NULL, "finished_at" timestamp, "created_at" timestamp DEFAULT now() NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS "mi_meetings" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "source_id" text, "run_id" text REFERENCES "mi_runs"("id") ON DELETE SET NULL, "external_id" text, "title" text NOT NULL, "meeting_date" text NOT NULL, "meeting_time" text, "source_label" text DEFAULT 'Manual' NOT NULL, "status" text DEFAULT 'needs_raw_sync' NOT NULL, "raw_status" text DEFAULT 'missing' NOT NULL, "meeting_type" text DEFAULT 'meeting' NOT NULL, "participants" jsonb, "source_url" text, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS "mi_meeting_artifacts" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "meeting_id" text NOT NULL REFERENCES "mi_meetings"("id") ON DELETE CASCADE, "raw_text" text, "summary_text" text, "source_payload" jsonb, "checksum" text, "fetched_at" timestamp, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS "mi_insights" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "meeting_id" text REFERENCES "mi_meetings"("id") ON DELETE CASCADE, "run_id" text REFERENCES "mi_runs"("id") ON DELETE SET NULL, "kind" text NOT NULL, "title" text NOT NULL, "body" text, "rationale" text, "owner" text, "confidence" real, "evidence" jsonb, "status" text DEFAULT 'draft' NOT NULL, "source_label" text, "event_date" text, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS "mi_document_impacts" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "meeting_id" text REFERENCES "mi_meetings"("id") ON DELETE CASCADE, "insight_id" text REFERENCES "mi_insights"("id") ON DELETE SET NULL, "document_name" text NOT NULL, "document_path" text, "impact_type" text DEFAULT 'possible_update' NOT NULL, "status" text DEFAULT 'possible_update' NOT NULL, "severity" text DEFAULT 'medium' NOT NULL, "reason" text, "proposed_change" text, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS "mi_recommendations" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "meeting_id" text REFERENCES "mi_meetings"("id") ON DELETE CASCADE, "insight_id" text REFERENCES "mi_insights"("id") ON DELETE SET NULL, "impact_id" text REFERENCES "mi_document_impacts"("id") ON DELETE SET NULL, "title" text NOT NULL, "description" text, "priority" text DEFAULT 'medium' NOT NULL, "target_type" text DEFAULT 'task' NOT NULL, "target_id" text, "document_name" text, "status" text DEFAULT 'recommended' NOT NULL, "task_id" text, "task_status" text DEFAULT 'recommended' NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL, "approved_at" timestamp, "rejected_at" timestamp, "converted_at" timestamp)`,
        `CREATE INDEX IF NOT EXISTS "mi_sources_slug_idx" ON "mi_sources" ("slug")`,
        `CREATE INDEX IF NOT EXISTS "mi_sources_slug_kind_idx" ON "mi_sources" ("slug", "kind")`,
        `CREATE INDEX IF NOT EXISTS "mi_settings_slug_idx" ON "mi_settings" ("slug")`,
        `CREATE INDEX IF NOT EXISTS "mi_runs_slug_idx" ON "mi_runs" ("slug")`,
        `CREATE INDEX IF NOT EXISTS "mi_runs_slug_status_idx" ON "mi_runs" ("slug", "status")`,
        `CREATE INDEX IF NOT EXISTS "mi_meetings_slug_idx" ON "mi_meetings" ("slug")`,
        `CREATE INDEX IF NOT EXISTS "mi_meetings_slug_date_idx" ON "mi_meetings" ("slug", "meeting_date")`,
        `CREATE INDEX IF NOT EXISTS "mi_meetings_source_idx" ON "mi_meetings" ("source_id")`,
        `CREATE INDEX IF NOT EXISTS "mi_artifacts_slug_idx" ON "mi_meeting_artifacts" ("slug")`,
        `CREATE INDEX IF NOT EXISTS "mi_artifacts_meeting_idx" ON "mi_meeting_artifacts" ("meeting_id")`,
        `CREATE INDEX IF NOT EXISTS "mi_insights_slug_idx" ON "mi_insights" ("slug")`,
        `CREATE INDEX IF NOT EXISTS "mi_insights_meeting_idx" ON "mi_insights" ("meeting_id")`,
        `CREATE INDEX IF NOT EXISTS "mi_insights_slug_kind_idx" ON "mi_insights" ("slug", "kind")`,
        `CREATE INDEX IF NOT EXISTS "mi_insights_slug_status_idx" ON "mi_insights" ("slug", "status")`,
        `CREATE INDEX IF NOT EXISTS "mi_impacts_slug_idx" ON "mi_document_impacts" ("slug")`,
        `CREATE INDEX IF NOT EXISTS "mi_impacts_meeting_idx" ON "mi_document_impacts" ("meeting_id")`,
        `CREATE INDEX IF NOT EXISTS "mi_impacts_document_idx" ON "mi_document_impacts" ("slug", "document_name")`,
        `CREATE INDEX IF NOT EXISTS "mi_recommendations_slug_idx" ON "mi_recommendations" ("slug")`,
        `CREATE INDEX IF NOT EXISTS "mi_recommendations_meeting_idx" ON "mi_recommendations" ("meeting_id")`,
        `CREATE INDEX IF NOT EXISTS "mi_recommendations_slug_status_idx" ON "mi_recommendations" ("slug", "status")`,
      ];
      for (const statement of statements) {
        await database.execute(drizzleSql.raw(statement));
      }
    })();
  }
  await ensurePromise;
}

function applySettingsToConfig(config: MeetingIntelligenceConfig, settings: typeof miSettings.$inferSelect | null) {
  if (!settings) return config;
  return {
    ...config,
    enabled: settings.enabled,
    updatedAt: iso(settings.updatedAt) || config.updatedAt,
    sync: {
      enabled: settings.syncEnabled,
      time: settings.syncTime || config.sync.time,
      timezone: settings.syncTimezone || config.sync.timezone,
      cronExpr: settings.syncCronExpr || config.sync.cronExpr,
      limit: settings.syncLimit || config.sync.limit,
      cronJobId: settings.cronJobId || null,
    },
    routing: {
      ...config.routing,
      ...asRecord(settings.routing),
    },
  };
}

function rowsToConfig(slug: string, rows: Array<typeof miSources.$inferSelect>, settings: typeof miSettings.$inferSelect | null = null): MeetingIntelligenceConfig {
  const config = emptyConfig(slug);
  if (rows.length === 0) return applySettingsToConfig(config, settings);
  const updatedAt = rows.map((row) => iso(row.updatedAt)).filter(Boolean).sort().pop() || null;
  config.updatedAt = updatedAt;
  config.sources.googleDrive.folders = [];
  config.sources.notion.databases = [];
  config.sources.notion.pages = [];

  for (const row of rows) {
    const scope = asRecord(row.scope);
    const sourceScope: SourceScope = {
      id: row.sourceId || "",
      name: row.name,
      url: row.url || "",
      notes: asString(scope.notes),
      filter: row.filter as SourceScope["filter"] | undefined,
    };

    if (row.kind === "google_drive") {
      config.sources.googleDrive.enabled = config.sources.googleDrive.enabled || row.enabled;
      config.sources.googleDrive.includeSubfolders = asBoolean(scope.includeSubfolders, true);
      config.sources.googleDrive.folders.push(sourceScope);
    } else if (row.kind === "notion_database") {
      config.sources.notion.enabled = config.sources.notion.enabled || row.enabled;
      config.sources.notion.databases.push(sourceScope);
    } else if (row.kind === "notion_page") {
      config.sources.notion.enabled = config.sources.notion.enabled || row.enabled;
      config.sources.notion.pages.push(sourceScope);
    } else if (row.kind === "slack") {
      config.sources.slack.enabled = config.sources.slack.enabled || row.enabled;
      config.sources.slack.includeThreads = asBoolean(scope.includeThreads, true);
      config.sources.slack.channels.push(sourceScope);
    } else if (row.kind === "discord") {
      config.sources.discord.enabled = config.sources.discord.enabled || row.enabled;
      config.sources.discord.includeThreads = asBoolean(scope.includeThreads, true);
      config.sources.discord.channels.push(sourceScope);
    } else if (row.kind === "manual_upload") {
      config.sources.manualUpload.enabled = row.enabled;
    }
  }

  if (config.sources.googleDrive.folders.length === 0) config.sources.googleDrive.folders = [emptyScope()];
  if (config.sources.notion.databases.length === 0) config.sources.notion.databases = [emptyScope()];
  return applySettingsToConfig(config, settings);
}

function sourceRowsFromConfig(config: MeetingIntelligenceConfig) {
  const now = new Date();
  const rows: Array<typeof miSources.$inferInsert> = [];
  const addScope = (kind: string, scope: SourceScope, enabled: boolean, extraScope: RawRecord = {}) => {
    if (!scope.id && !scope.url && !scope.name) return;
    rows.push({
      id: `mis_${stableId(config.slug, kind, scope.id || scope.url || scope.name)}`,
      slug: config.slug,
      kind,
      name: scope.name || scope.id || scope.url || "Approved source",
      sourceId: scope.id || null,
      url: scope.url || null,
      enabled,
      scope: { notes: scope.notes || "", ...extraScope },
      filter: scope.filter || null,
      status: enabled ? "active" : "disabled",
      createdAt: now,
      updatedAt: now,
    });
  };

  config.sources.googleDrive.folders.forEach((scope) => addScope("google_drive", scope, config.sources.googleDrive.enabled, {
    includeSubfolders: config.sources.googleDrive.includeSubfolders,
  }));
  config.sources.notion.databases.forEach((scope) => addScope("notion_database", scope, config.sources.notion.enabled));
  config.sources.notion.pages.forEach((scope) => addScope("notion_page", scope, config.sources.notion.enabled));
  config.sources.slack.channels.forEach((scope) => addScope("slack", scope, config.sources.slack.enabled, {
    includeThreads: config.sources.slack.includeThreads,
  }));
  config.sources.discord.channels.forEach((scope) => addScope("discord", scope, config.sources.discord.enabled, {
    includeThreads: config.sources.discord.includeThreads,
  }));
  rows.push({
    id: `mis_${stableId(config.slug, "manual_upload")}`,
    slug: config.slug,
    kind: "manual_upload",
    name: "Manual upload",
    enabled: config.sources.manualUpload.enabled,
    status: config.sources.manualUpload.enabled ? "active" : "disabled",
    createdAt: now,
    updatedAt: now,
  });
  return rows;
}

function configuredSourceCount(config: MeetingIntelligenceConfig) {
  const drive = config.sources.googleDrive.enabled
    ? config.sources.googleDrive.folders.filter((scope) => scope.id || scope.url).length
    : 0;
  const notion = config.sources.notion.enabled
    ? [...config.sources.notion.databases, ...config.sources.notion.pages].filter((scope) => scope.id || scope.url).length
    : 0;
  const slack = config.sources.slack.enabled ? config.sources.slack.channels.length : 0;
  const discord = config.sources.discord.enabled ? config.sources.discord.channels.length : 0;
  return drive + notion + slack + discord;
}

async function seedSourcesIfEmpty(slug: string) {
  const database = getDb();
  const rows = await database.select().from(miSources).where(eq(miSources.slug, slug)).limit(1);
  if (rows.length) return;
  const legacyFileConfig = normalizeMeetingIntelligenceConfig(
    slug,
    readJSON<Partial<MeetingIntelligenceConfig> & RawRecord>(meetingIntelligenceConfigFile(slug), legacySeedConfig(slug) as Partial<MeetingIntelligenceConfig> & RawRecord)
  );
  const sourceRows = sourceRowsFromConfig(legacyFileConfig);
  if (sourceRows.length) {
    await database.insert(miSources).values(sourceRows).onConflictDoNothing();
  }
}

async function seedSettingsIfEmpty(slug: string) {
  const database = getDb();
  const rows = await database.select().from(miSettings).where(eq(miSettings.slug, slug)).limit(1);
  if (rows.length) return;
  const legacyFileConfig = normalizeMeetingIntelligenceConfig(
    slug,
    readJSON<Partial<MeetingIntelligenceConfig> & RawRecord>(meetingIntelligenceConfigFile(slug), legacySeedConfig(slug) as Partial<MeetingIntelligenceConfig> & RawRecord)
  );
  const now = new Date();
  await database.insert(miSettings).values({
    id: `mist_${stableId(slug, "settings")}`,
    slug,
    enabled: legacyFileConfig.enabled,
    syncEnabled: legacyFileConfig.sync.enabled && configuredSourceCount(legacyFileConfig) > 0,
    syncTime: legacyFileConfig.sync.time,
    syncTimezone: legacyFileConfig.sync.timezone,
    syncCronExpr: legacyFileConfig.sync.cronExpr,
    syncLimit: legacyFileConfig.sync.limit,
    cronJobId: legacyFileConfig.sync.cronJobId,
    routing: legacyFileConfig.routing,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
}

function latestJsonFromDir(dir: string) {
  if (!fs.existsSync(dir)) return null;
  const file = fs.readdirSync(dir)
    .filter((item) => /^\d{4}-\d{2}-\d{2}\.json$/.test(item))
    .sort()
    .reverse()[0];
  if (!file) return null;
  return {
    file: path.join(dir, file),
    date: file.replace(".json", ""),
    data: readJSON<RawRecord>(path.join(dir, file), {}),
  };
}

function loadLatestLegacyRun(slug: string) {
  const direct = latestJsonFromDir(meetingIntelligenceDir(slug));
  const recurring = latestJsonFromDir(path.join(BASE, "brand", slug, "recurring-tasks", "meeting-intelligence"));
  if (!direct) return recurring;
  if (!recurring) return direct;
  return direct.date >= recurring.date ? direct : recurring;
}

async function seedMeetingsIfEmpty(slug: string) {
  const database = getDb();
  const existing = await database.select({ id: miMeetings.id }).from(miMeetings).where(eq(miMeetings.slug, slug)).limit(1);
  if (existing.length) return;

  const meetingsDir = path.join(meetingIntelligenceDir(slug), "meetings");
  if (!fs.existsSync(meetingsDir)) return;
  const entries = fs.readdirSync(meetingsDir).filter((entry) => !entry.startsWith(".") && entry !== "meetings.json");
  const now = new Date();
  const meetingRows: Array<typeof miMeetings.$inferInsert> = [];
  const artifactRows: Array<typeof miMeetingArtifacts.$inferInsert> = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const fullPath = path.join(meetingsDir, entry);
    const stat = fs.statSync(fullPath);
    const filePath = stat.isDirectory()
      ? fs.existsSync(path.join(fullPath, "transcript.md"))
        ? path.join(fullPath, "transcript.md")
        : fs.existsSync(path.join(fullPath, "summary.md"))
          ? path.join(fullPath, "summary.md")
          : ""
      : fullPath;
    if (!filePath || !fs.existsSync(filePath) || !/\.(md|txt)$/i.test(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    const entryId = stat.isDirectory() ? entry : entry.replace(/\.(md|txt)$/i, "");
    const meetingDate = dateFromText(entryId) || dateFromText(content) || "";
    const id = `mim_${stableId(slug, entryId, meetingDate)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const title = headingFromContent(content, titleFromFileName(entryId));
    const sourceLabel = normalizeSource(sourceFromContent(content));
    meetingRows.push({
      id,
      slug,
      externalId: entryId,
      title,
      meetingDate,
      meetingTime: timeFromText(content),
      sourceLabel,
      status: "needs_raw_sync",
      rawStatus: "source_notes_only",
      meetingType: "meeting",
      participants: participantsFromContent(content),
      sourceUrl: null,
      createdAt: now,
      updatedAt: now,
    });
    artifactRows.push({
      id: `mia_${stableId(slug, id)}`,
      slug,
      meetingId: id,
      rawText: null,
      summaryText: content,
      sourcePayload: {
        legacySeed: true,
        legacyPath: path.relative(BASE, filePath),
        rawMissing: true,
        note: "Legacy transcript/summary files were seeded as summary_text only. A real connector run must fetch raw_text before processing.",
      },
      checksum: checksum(content),
      fetchedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (meetingRows.length) {
    await database.insert(miMeetings).values(meetingRows).onConflictDoNothing();
    await database.insert(miMeetingArtifacts).values(artifactRows).onConflictDoNothing();
  }
}

function normalizedTokens(value: string) {
  const stopwords = new Set([
    "notion",
    "drive",
    "llamada",
    "meeting",
    "growth4u",
    "general",
    "source",
    "fuente",
    "mayo",
    "abril",
    "abr",
    "may",
  ]);
  return new Set(
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 3 && !stopwords.has(token))
  );
}

function sourceToMeetingId(source: string, eventDate: string, meetings: Array<typeof miMeetings.$inferSelect>) {
  const lowerSource = source.toLowerCase();
  const sourceDate = dateFromText(source) || eventDate;
  const sourceTokens = normalizedTokens(source);
  const ranked = meetings.map((meeting) => {
    const title = meeting.title.toLowerCase();
    const meetingTokens = normalizedTokens(meeting.title);
    let score = 0;
    if (sourceDate && meeting.meetingDate === sourceDate) score += 4;
    if (lowerSource.includes(title.slice(0, Math.min(title.length, 24)))) score += 3;
    meetingTokens.forEach((token) => {
      if (sourceTokens.has(token)) score += 1;
    });
    return { meeting, score };
  }).sort((a, b) => b.score - a.score);
  return ranked[0]?.score ? ranked[0].meeting.id : null;
}

async function seedInsightsIfEmpty(slug: string) {
  const database = getDb();
  const existing = await database.select({ id: miInsights.id }).from(miInsights).where(eq(miInsights.slug, slug)).limit(1);
  if (existing.length) return;
  const legacyRun = loadLatestLegacyRun(slug);
  if (!legacyRun) return;

  const data = legacyRun.data;
  const runId = `mir_${stableId(slug, legacyRun.date, legacyRun.file)}`;
  await database.insert(miRuns).values({
    id: runId,
    slug,
    status: asString(data.status, "legacy_seed"),
    trigger: "legacy_seed",
    sourcesScanned: asRecord(data.sources_scanned),
    metrics: {
      meetingsProcessed: Array.isArray(data.meetings_processed) ? data.meetings_processed.length : 0,
      legacyFile: path.relative(BASE, legacyRun.file),
    },
    errors: null,
    startedAt: new Date(),
    finishedAt: new Date(),
  }).onConflictDoNothing();

  const meetings = await database.select().from(miMeetings).where(eq(miMeetings.slug, slug));
  const intelligence = asRecord(data.intelligence);
  const now = new Date();
  const rows: Array<typeof miInsights.$inferInsert> = [];
  const addInsight = (kind: string, sourceItem: RawRecord, titleValue: string, bodyValue = "") => {
    const source = asString(sourceItem.source, "Meeting Intelligence run");
    const eventDate = asString(sourceItem.date) || dateFromText(source) || legacyRun.date;
    rows.push({
      id: `mii_${stableId(slug, kind, source, eventDate, titleValue)}`,
      slug,
      meetingId: sourceToMeetingId(source, eventDate, meetings),
      runId,
      kind,
      title: clampTitle(titleValue, `${kind} detected`),
      body: bodyValue || null,
      rationale: asString(sourceItem.rationale) || asString(sourceItem.context) || null,
      owner: asString(sourceItem.owner) || asString(sourceItem.mentioned_by) || asString(sourceItem.speaker) || null,
      confidence: null,
      evidence: {
        legacySeed: true,
        rawMissing: true,
        source,
        legacyRun: path.relative(BASE, legacyRun.file),
      },
      status: "draft",
      sourceLabel: source,
      eventDate,
      createdAt: now,
      updatedAt: now,
    });
  };

  (Array.isArray(intelligence.decisions) ? intelligence.decisions : []).map(asRecord).forEach((item) => {
    addInsight("decision", item, asString(item.decision, "Decision detected"));
  });
  (Array.isArray(intelligence.action_items) ? intelligence.action_items : []).map(asRecord).forEach((item) => {
    addInsight("action", item, asString(item.task, "Action item detected"), asString(item.context));
  });
  (Array.isArray(intelligence.insights) ? intelligence.insights : []).map(asRecord).forEach((item) => {
    addInsight("insight", item, asString(item.insight, "Insight detected"), asString(item.context));
  });
  (Array.isArray(intelligence.quotes) ? intelligence.quotes : []).map(asRecord).forEach((item) => {
    addInsight("quote", item, asString(item.quote, "Quote detected"), asString(item.context));
  });
  (Array.isArray(intelligence.risks) ? intelligence.risks : []).map(asRecord).forEach((item) => {
    addInsight("risk", item, asString(item.description, "Risk detected"), asString(item.impact));
  });

  if (rows.length) {
    await database.insert(miInsights).values(rows).onConflictDoNothing();
  }
}

async function seedLegacyIfEmpty(slug: string) {
  await seedSourcesIfEmpty(slug);
  await seedMeetingsIfEmpty(slug);
  await seedInsightsIfEmpty(slug);
}

async function relinkLegacyDraftInsights(slug: string) {
  const database = getDb();
  const [meetings, insights] = await Promise.all([
    database.select().from(miMeetings).where(eq(miMeetings.slug, slug)),
    database.select().from(miInsights).where(eq(miInsights.slug, slug)),
  ]);
  for (const insight of insights) {
    const evidence = asRecord(insight.evidence);
    if (evidence.legacySeed !== true || !insight.sourceLabel) continue;
    const eventDate = dateFromText(insight.sourceLabel) || insight.eventDate || "";
    const nextMeetingId = sourceToMeetingId(insight.sourceLabel, eventDate, meetings);
    if (!nextMeetingId) continue;
    if (nextMeetingId !== insight.meetingId || (eventDate && eventDate !== insight.eventDate)) {
      await database
        .update(miInsights)
        .set({
          meetingId: nextMeetingId,
          eventDate: eventDate || insight.eventDate,
          updatedAt: new Date(),
        })
        .where(eq(miInsights.id, insight.id));
    }
  }
}

function mapMeeting(
  meeting: typeof miMeetings.$inferSelect,
  artifactsByMeeting: Map<string, typeof miMeetingArtifacts.$inferSelect>,
  countsByMeeting: Map<string, { decisions: number; actions: number }>
): MeetingStateRecord {
  const artifact = artifactsByMeeting.get(meeting.id);
  const hasRaw = Boolean(artifact?.rawText?.trim());
  const hasSummary = Boolean(artifact?.summaryText?.trim());
  const counts = countsByMeeting.get(meeting.id) || { decisions: 0, actions: 0 };
  const status = (meeting.status || (hasRaw ? "raw_available" : "needs_raw_sync")) as MeetingStatus;
  return {
    id: meeting.id,
    title: meeting.title,
    date: meeting.meetingDate,
    time: meeting.meetingTime || "",
    source: meeting.sourceLabel,
    status: hasRaw ? status : "needs_raw_sync",
    rawStatus: hasRaw ? meeting.rawStatus || "available" : meeting.rawStatus || "missing",
    hasRaw,
    hasSummary,
    type: meeting.meetingType,
    participants: Array.isArray(meeting.participants) ? meeting.participants : [],
    decisions: counts.decisions,
    actions: counts.actions,
    sourceId: meeting.sourceId || undefined,
    sourceUrl: meeting.sourceUrl || undefined,
    fetchedAt: iso(artifact?.fetchedAt),
  };
}

function mapInsight(
  row: typeof miInsights.$inferSelect,
  artifactsByMeeting: Map<string, typeof miMeetingArtifacts.$inferSelect>
): IntelligenceItem {
  const evidence = asRecord(row.evidence);
  const hasRaw = Boolean(row.meetingId && artifactsByMeeting.get(row.meetingId)?.rawText?.trim()) && evidence.rawMissing !== true;
  const status = row.status as InsightStatus;
  const kind = row.kind;
  return {
    id: row.id,
    type: normalizeInsightKind(kind),
    title: row.title,
    source: row.sourceLabel || "Meeting Intelligence",
    date: row.eventDate || "",
    confidence: typeof row.confidence === "number" ? `${Math.round(row.confidence * 100)}%` : hasRaw ? "traceable" : "raw missing",
    confidenceValue: row.confidence,
    status,
    evidenceRaw: hasRaw,
    meetingId: row.meetingId,
    owner: row.owner,
    body: row.body,
    rationale: row.rationale,
    evidence,
    tone: insightTone(kind, status, hasRaw),
  };
}

function mapDecision(
  row: typeof miInsights.$inferSelect,
  artifactsByMeeting: Map<string, typeof miMeetingArtifacts.$inferSelect>,
  impactsByInsight: Map<string, Array<typeof miDocumentImpacts.$inferSelect>>
): DecisionEntry {
  const evidenceRaw = Boolean(row.meetingId && artifactsByMeeting.get(row.meetingId)?.rawText?.trim());
  const documents = impactsByInsight.get(row.id)?.map((impact) => impact.documentName) || [];
  return {
    id: row.id,
    date: row.eventDate || "",
    decision: row.title,
    rationale: row.rationale || (evidenceRaw ? "Traceable to raw meeting artifact." : "Draft imported without raw transcript; needs raw sync before it can become important."),
    owner: row.owner || "TBD",
    source: row.sourceLabel || "Meeting Intelligence",
    documents,
    status: mapDecisionStatus(row.status),
    evidenceRaw,
    meetingId: row.meetingId,
  };
}

function mapRecommendation(row: typeof miRecommendations.$inferSelect, meetingTitle = "Meeting Intelligence"): ProposalEntry {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: normalizePriority(row.priority),
    doc: row.documentName || row.targetType || "Task draft",
    source: meetingTitle,
    status: row.status as RecommendationStatus,
    taskStatus: row.taskStatus,
    meetingId: row.meetingId,
    insightId: row.insightId,
    taskId: row.taskId,
  };
}

function aggregateDocuments(
  impacts: Array<typeof miDocumentImpacts.$inferSelect>,
  recommendations: Array<typeof miRecommendations.$inferSelect>,
  decisions: DecisionEntry[]
): DocumentRecord[] {
  const byDoc = new Map<string, DocumentRecord>();
  const recsByDoc = new Map<string, number>();
  recommendations.forEach((rec) => {
    const doc = rec.documentName || "Task draft";
    recsByDoc.set(doc, (recsByDoc.get(doc) || 0) + (rec.status === "recommended" ? 1 : 0));
  });
  impacts.forEach((impact) => {
    const doc = impact.documentName;
    const current = byDoc.get(doc) || {
      name: doc,
      area: impact.reason || "Impact detected from meeting intelligence.",
      health: "Stable",
      status: "no impact" as const,
      proposals: 0,
      conflicts: 0,
      critical: doc === "StrategyPlan",
      severity: impact.severity,
    };
    const isConflict = impact.status === "conflict" || impact.impactType === "conflict";
    current.conflicts += isConflict ? 1 : 0;
    current.proposals = recsByDoc.get(doc) || current.proposals;
    current.status = isConflict ? "conflict" : current.proposals > 0 ? "proposal ready" : "possible update";
    current.health = current.status === "conflict" ? "Needs review" : current.proposals > 0 ? "Proposal pending" : "Possible update";
    current.lastDecision = decisions.find((decision) => decision.documents.includes(doc))?.decision;
    byDoc.set(doc, current);
  });
  return [...byDoc.values()].sort((a, b) => Number(Boolean(b.critical)) - Number(Boolean(a.critical)) || a.name.localeCompare(b.name));
}

export async function getMeetingIntelligenceConfig(slug: string) {
  if (!hasDatabase) {
    return { ok: false, storage: STORAGE_NOT_CONFIGURED, config: emptyConfig(slug) };
  }
  await ensureMeetingIntelligenceStorage();
  await seedSourcesIfEmpty(slug);
  await seedSettingsIfEmpty(slug);
  const database = getDb();
  const [rows, settingsRows] = await Promise.all([
    database.select().from(miSources).where(eq(miSources.slug, slug)),
    database.select().from(miSettings).where(eq(miSettings.slug, slug)).limit(1),
  ]);
  return { ok: true, storage: { configured: true, provider: "neon" }, config: rowsToConfig(slug, rows, settingsRows[0] || null) };
}

export async function saveMeetingIntelligenceConfig(slug: string, input: Partial<MeetingIntelligenceConfig> & RawRecord) {
  if (!hasDatabase) {
    return { ok: false, storage: STORAGE_NOT_CONFIGURED, config: emptyConfig(slug) };
  }
  await ensureMeetingIntelligenceStorage();
  const normalized = normalizeMeetingIntelligenceConfig(slug, input);
  const config = {
    ...normalized,
    sync: input.sync && typeof input.sync === "object"
      ? normalized.sync
      : { ...normalized.sync, enabled: normalized.enabled && configuredSourceCount(normalized) > 0 },
  };
  const database = getDb();
  const now = new Date();
  await database.delete(miSources).where(eq(miSources.slug, slug));
  const rows = sourceRowsFromConfig({ ...config, updatedAt: now.toISOString() });
  if (rows.length) {
    await database.insert(miSources).values(rows);
  }
  await database.insert(miSettings).values({
    id: `mist_${stableId(slug, "settings")}`,
    slug,
    enabled: config.enabled,
    syncEnabled: config.sync.enabled,
    syncTime: config.sync.time,
    syncTimezone: config.sync.timezone,
    syncCronExpr: cronExprFromTime(config.sync.time),
    syncLimit: config.sync.limit,
    cronJobId: config.sync.cronJobId,
    routing: config.routing,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: miSettings.id,
    set: {
      enabled: config.enabled,
      syncEnabled: config.sync.enabled,
      syncTime: config.sync.time,
      syncTimezone: config.sync.timezone,
      syncCronExpr: cronExprFromTime(config.sync.time),
      syncLimit: config.sync.limit,
      cronJobId: config.sync.cronJobId,
      routing: config.routing,
      updatedAt: now,
    },
  });
  return getMeetingIntelligenceConfig(slug);
}

export async function getMeetingIntelligenceState(slug: string, options: MeetingIntelligenceReadOptions = {}) {
  if (!hasDatabase) {
    return {
      ok: false,
      storage: STORAGE_NOT_CONFIGURED,
      meetings: [],
      totals: { meetings: 0, decisions: 0, actions: 0, proposals: 0, sources: 0 },
      intelligence: [],
      decisions: [],
      documents: [],
      proposals: [],
      lastSync: null,
      lastCheckStatus: "neon_not_configured",
      lastRun: null,
    };
  }

  if (options.prepareStorage !== false) {
    await ensureMeetingIntelligenceStorage();
  }
  if (options.backfillLegacy !== false) {
    await seedLegacyIfEmpty(slug);
    await relinkLegacyDraftInsights(slug);
  }
  const database = getDb();
  let sourceRows: Array<typeof miSources.$inferSelect>;
  let meetingRows: Array<typeof miMeetings.$inferSelect>;
  let artifactRows: Array<typeof miMeetingArtifacts.$inferSelect>;
  let insightRows: Array<typeof miInsights.$inferSelect>;
  let impactRows: Array<typeof miDocumentImpacts.$inferSelect>;
  let recommendationRows: Array<typeof miRecommendations.$inferSelect>;
  let runRows: Array<typeof miRuns.$inferSelect>;
  try {
    [sourceRows, meetingRows, artifactRows, insightRows, impactRows, recommendationRows, runRows] = await Promise.all([
      database.select().from(miSources).where(eq(miSources.slug, slug)),
      database.select().from(miMeetings).where(eq(miMeetings.slug, slug)).orderBy(desc(miMeetings.meetingDate), desc(miMeetings.meetingTime)),
      database.select().from(miMeetingArtifacts).where(eq(miMeetingArtifacts.slug, slug)),
      database.select().from(miInsights).where(eq(miInsights.slug, slug)).orderBy(desc(miInsights.createdAt)),
      database.select().from(miDocumentImpacts).where(eq(miDocumentImpacts.slug, slug)),
      database.select().from(miRecommendations).where(eq(miRecommendations.slug, slug)).orderBy(desc(miRecommendations.createdAt)),
      database.select().from(miRuns).where(eq(miRuns.slug, slug)).orderBy(desc(miRuns.startedAt)).limit(1),
    ]);
  } catch (error) {
    return {
      ok: false,
      storage: {
        configured: true,
        provider: "neon",
        message: `Meeting Intelligence read failed: ${messageFromError(error)}`,
      },
      meetings: [],
      totals: { meetings: 0, decisions: 0, actions: 0, proposals: 0, sources: 0 },
      intelligence: [],
      decisions: [],
      documents: [],
      proposals: [],
      lastSync: null,
      lastCheckStatus: "read_failed",
      lastRun: null,
    };
  }

  const artifactsByMeeting = new Map(artifactRows.map((artifact) => [artifact.meetingId, artifact]));
  const countsByMeeting = new Map<string, { decisions: number; actions: number }>();
  insightRows.forEach((insight) => {
    if (!insight.meetingId) return;
    const counts = countsByMeeting.get(insight.meetingId) || { decisions: 0, actions: 0 };
    if (insight.kind === "decision") counts.decisions += 1;
    if (insight.kind === "action") counts.actions += 1;
    countsByMeeting.set(insight.meetingId, counts);
  });
  const impactsByInsight = new Map<string, Array<typeof miDocumentImpacts.$inferSelect>>();
  impactRows.forEach((impact) => {
    if (!impact.insightId) return;
    impactsByInsight.set(impact.insightId, [...(impactsByInsight.get(impact.insightId) || []), impact]);
  });
  const meetings = meetingRows.map((meeting) => mapMeeting(meeting, artifactsByMeeting, countsByMeeting));
  const intelligence = insightRows.map((insight) => mapInsight(insight, artifactsByMeeting));
  const decisions = insightRows
    .filter((insight) => insight.kind === "decision")
    .map((insight) => mapDecision(insight, artifactsByMeeting, impactsByInsight));
  const meetingTitles = new Map(meetingRows.map((meeting) => [meeting.id, meeting.title]));
  const proposals = recommendationRows.map((proposal) => mapRecommendation(proposal, proposal.meetingId ? meetingTitles.get(proposal.meetingId) || "Meeting Intelligence" : "Meeting Intelligence"));
  const documents = aggregateDocuments(impactRows, recommendationRows, decisions);
  const lastRun = runRows[0] || null;

  return {
    ok: true,
    storage: { configured: true, provider: "neon" },
    meetings,
    totals: {
      meetings: meetings.length,
      decisions: insightRows.filter((insight) => insight.kind === "decision").length,
      actions: insightRows.filter((insight) => insight.kind === "action").length,
      proposals: recommendationRows.length,
      sources: sourceRows.filter((source) => source.enabled && source.kind !== "manual_upload").length,
    },
    intelligence,
    decisions,
    documents,
    proposals,
    lastSync: iso(lastRun?.finishedAt || lastRun?.startedAt),
    lastCheckStatus: lastRun?.status || null,
    lastRun: lastRun ? {
      date: iso(lastRun.startedAt) || "",
      status: lastRun.status,
      file: "",
      contentPreview: lastRun.errors ? JSON.stringify(lastRun.errors).slice(0, 180) : "",
    } : null,
  };
}

export async function getMeetingIntelligenceMeeting(
  slug: string,
  meetingId: string,
  options: MeetingIntelligenceReadOptions = {},
): Promise<{ ok: boolean; storage: RawRecord; detail: MeetingDetailRecord | null; error?: string }> {
  if (!hasDatabase) {
    return { ok: false, storage: STORAGE_NOT_CONFIGURED, detail: null, error: STORAGE_NOT_CONFIGURED.message };
  }
  if (options.prepareStorage !== false) {
    await ensureMeetingIntelligenceStorage();
  }
  const database = getDb();
  let meeting: typeof miMeetings.$inferSelect | undefined;
  try {
    meeting = (await database.select().from(miMeetings).where(and(eq(miMeetings.slug, slug), eq(miMeetings.id, meetingId))).limit(1))[0];
  } catch (error) {
    return {
      ok: false,
      storage: {
        configured: true,
        provider: "neon",
        message: `Meeting Intelligence read failed: ${messageFromError(error)}`,
      },
      detail: null,
      error: messageFromError(error),
    };
  }
  if (!meeting) {
    return { ok: false, storage: { configured: true, provider: "neon" }, detail: null, error: "Meeting not found" };
  }
  let artifact: Array<typeof miMeetingArtifacts.$inferSelect>;
  let insightRows: Array<typeof miInsights.$inferSelect>;
  let impactRows: Array<typeof miDocumentImpacts.$inferSelect>;
  let recommendationRows: Array<typeof miRecommendations.$inferSelect>;
  try {
    [artifact, insightRows, impactRows, recommendationRows] = await Promise.all([
      database.select().from(miMeetingArtifacts).where(eq(miMeetingArtifacts.meetingId, meetingId)).limit(1),
      database.select().from(miInsights).where(and(eq(miInsights.slug, slug), eq(miInsights.meetingId, meetingId))).orderBy(desc(miInsights.createdAt)),
      database.select().from(miDocumentImpacts).where(and(eq(miDocumentImpacts.slug, slug), eq(miDocumentImpacts.meetingId, meetingId))),
      database.select().from(miRecommendations).where(and(eq(miRecommendations.slug, slug), eq(miRecommendations.meetingId, meetingId))),
    ]);
  } catch (error) {
    return {
      ok: false,
      storage: {
        configured: true,
        provider: "neon",
        message: `Meeting Intelligence read failed: ${messageFromError(error)}`,
      },
      detail: null,
      error: messageFromError(error),
    };
  }
  const artifactsByMeeting = new Map([[meetingId, artifact[0]]].filter(([, item]) => Boolean(item)) as Array<[string, typeof miMeetingArtifacts.$inferSelect]>);
  const countsByMeeting = new Map<string, { decisions: number; actions: number }>();
  insightRows.forEach((insight) => {
    const counts = countsByMeeting.get(meetingId) || { decisions: 0, actions: 0 };
    if (insight.kind === "decision") counts.decisions += 1;
    if (insight.kind === "action") counts.actions += 1;
    countsByMeeting.set(meetingId, counts);
  });
  const impactsByInsight = new Map<string, Array<typeof miDocumentImpacts.$inferSelect>>();
  impactRows.forEach((impact) => {
    if (!impact.insightId) return;
    impactsByInsight.set(impact.insightId, [...(impactsByInsight.get(impact.insightId) || []), impact]);
  });

  return {
    ok: true,
    storage: { configured: true, provider: "neon" },
    detail: {
      meeting: mapMeeting(meeting, artifactsByMeeting, countsByMeeting),
      artifact: artifact[0] ? {
        rawText: artifact[0].rawText,
        summaryText: artifact[0].summaryText,
        sourcePayload: artifact[0].sourcePayload,
        checksum: artifact[0].checksum,
        fetchedAt: iso(artifact[0].fetchedAt),
      } : null,
      insights: insightRows.map((insight) => mapInsight(insight, artifactsByMeeting)),
      decisions: insightRows.filter((insight) => insight.kind === "decision").map((insight) => mapDecision(insight, artifactsByMeeting, impactsByInsight)),
      impacts: impactRows.map((impact) => ({
        id: impact.id,
        documentName: impact.documentName,
        status: impact.status,
        severity: impact.severity,
        reason: impact.reason,
        proposedChange: impact.proposedChange,
      })),
      recommendations: recommendationRows.map((proposal) => mapRecommendation(proposal, meeting.title)),
    },
  };
}

export async function createMeetingIntelligenceRun(input: {
  slug: string;
  status?: string;
  trigger?: string;
  sourcesScanned?: RawRecord | null;
  metrics?: RawRecord | null;
  errors?: unknown[] | RawRecord | null;
}) {
  if (!hasDatabase) return { ok: false, storage: STORAGE_NOT_CONFIGURED, run: null };
  await ensureMeetingIntelligenceStorage();
  const now = new Date();
  const run = {
    id: `mir_${stableId(input.slug, now.toISOString(), input.trigger || "agent")}`,
    slug: input.slug,
    status: input.status || "queued",
    trigger: input.trigger || "agent",
    sourcesScanned: input.sourcesScanned || null,
    metrics: input.metrics || null,
    errors: input.errors || null,
    startedAt: now,
    finishedAt: input.status === "completed" || input.status === "failed" ? now : null,
    createdAt: now,
  };
  await getDb().insert(miRuns).values(run);
  return { ok: true, storage: { configured: true, provider: "neon" }, run };
}

export async function applyMeetingRecommendationAction(slug: string, recommendationId: string, action: RecommendationAction) {
  if (!hasDatabase) return { ok: false, storage: STORAGE_NOT_CONFIGURED, recommendation: null };
  await ensureMeetingIntelligenceStorage();
  const database = getDb();
  const now = new Date();
  const storage = { configured: true, provider: "neon" };

  // Fix B (SAN-222): "Convert" creates a REAL task on the board (this is where the
  // loop used to die — it only flipped status). Idempotent: only create the task
  // the first time; a re-convert reuses the stored taskId, and createTask is also
  // keyed by thread (`mi-rec-<id>`) as a backstop against duplicates.
  if (action === "convert") {
    const existing = (await database
      .select()
      .from(miRecommendations)
      .where(and(eq(miRecommendations.slug, slug), eq(miRecommendations.id, recommendationId)))
      .limit(1))[0];
    if (!existing) return { ok: true, storage, recommendation: null };

    let taskId = existing.taskId;
    if (!taskId) {
      const { config } = await getMeetingIntelligenceConfig(slug);
      const owner = config.routing?.reviewOwner || "Alfonso";
      const task = await createTask(slug, {
        // Deterministic, unique id per recommendation. Without it createTask falls
        // back to getNextChildTaskId(slug, "") — which is FS-based and returns the
        // same "-T01" for every parentless task, so a second convert would collide
        // on sourceKey and overwrite the first task in the db backend. The explicit
        // id makes convert collision-proof and idempotent across both backends.
        id: `task-${existing.id}`,
        name: existing.title,
        description: existing.description ?? undefined,
        owner,
        type: "execution",
        mc_chat_thread_id: `mi-rec-${existing.id}`,
      });
      taskId = (task as { id?: string } | null)?.id ?? null;
    }

    const updated = await database
      .update(miRecommendations)
      .set({ status: "converted", taskStatus: "todo", taskId, convertedAt: now, updatedAt: now })
      .where(and(eq(miRecommendations.slug, slug), eq(miRecommendations.id, recommendationId)))
      .returning();
    return { ok: true, storage, recommendation: updated[0] ? mapRecommendation(updated[0]) : null };
  }

  const update = action === "reject"
    ? { status: "rejected", taskStatus: "rejected", rejectedAt: now, updatedAt: now }
    : { status: "approved", taskStatus: "todo", approvedAt: now, updatedAt: now };
  const updated = await database
    .update(miRecommendations)
    .set(update)
    .where(and(eq(miRecommendations.slug, slug), eq(miRecommendations.id, recommendationId)))
    .returning();
  return { ok: true, storage, recommendation: updated[0] ? mapRecommendation(updated[0]) : null };
}
