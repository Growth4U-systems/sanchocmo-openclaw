import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { and, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import {
  miDocumentImpacts,
  miInsights,
  miMeetingArtifacts,
  miMeetings,
  miRecommendations,
  miRuns,
  miSources,
} from "@/db/schema";
import { BASE, apiHealthFile } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";
import {
  createMeetingIntelligenceRun,
  ensureMeetingIntelligenceStorage,
  getMeetingIntelligenceConfig,
} from "@/lib/data/meeting-intelligence-db";
import { reconcileMeetingsToPovBank } from "@/lib/data/pov-bank";

const GOG_BIN = "/opt/homebrew/bin/gog";
const NOTION_VERSION = "2022-06-28";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

type SourceRow = typeof miSources.$inferSelect;

interface DriveFile {
  id?: string;
  name?: string;
  title?: string;
  mimeType?: string;
  webViewLink?: string;
  url?: string;
  modifiedTime?: string;
}

interface FetchedMeeting {
  sourceRow: SourceRow;
  externalId: string;
  title: string;
  sourceLabel: string;
  meetingDate: string;
  meetingTime: string;
  participants: string[];
  sourceUrl: string | null;
  rawText: string;
  summaryText: string;
  payload: Record<string, unknown>;
}

function stableId(...parts: Array<string | number | null | undefined>) {
  return crypto.createHash("sha1").update(parts.filter(Boolean).join(":")).digest("hex").slice(0, 24);
}

function checksum(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function parseEnvFile(filePath: string): Record<string, string> {
  try {
    const vars: Record<string, string> = {};
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    }
    return vars;
  } catch {
    return {};
  }
}

function getNotionKey() {
  const root = path.join(BASE, "..");
  const envLocal = parseEnvFile(path.join(root, ".env.local"));
  const env = parseEnvFile(path.join(root, ".env"));
  return process.env.NOTION_API_KEY || envLocal.NOTION_API_KEY || env.NOTION_API_KEY || "";
}

function getGogAccount() {
  const data = readJSON<{ services?: Record<string, { details?: Record<string, unknown> }> }>(apiHealthFile(), {});
  const account = data.services?.gog?.details?.account;
  return typeof account === "string" && account ? account : process.env.GOG_ACCOUNT || null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function parseDriveItems(raw: unknown): DriveFile[] {
  if (Array.isArray(raw)) return raw as DriveFile[];
  const obj = asRecord(raw);
  for (const key of ["files", "items", "data", "results"]) {
    if (Array.isArray(obj[key])) return obj[key] as DriveFile[];
  }
  return [];
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function titleFromName(name: string) {
  return name.replace(/\.(md|txt|docx?|pdf)$/i, "").replace(/\s+-\s*$/, "").trim() || "Untitled meeting";
}

function dateFromText(value: string) {
  const iso = value.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const slash = value.match(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/);
  if (slash) return `${slash[1]}-${slash[2].padStart(2, "0")}-${slash[3].padStart(2, "0")}`;
  const spanish = value.toLowerCase().match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (spanish) return `${spanish[3]}-${spanish[2].padStart(2, "0")}-${spanish[1].padStart(2, "0")}`;
  return "";
}

function timeFromText(value: string) {
  return value.match(/(?:Fecha|Date):.*?T(\d{1,2}:\d{2})/i)?.[1]
    || value.match(/(?:Fecha|Date):.*?\b(\d{1,2}:\d{2})(?!:)/i)?.[1]
    || value.match(/\b(\d{1,2}:\d{2})\s*(?:CET|CEST)\b/i)?.[1]
    || value.match(/(?:^|[^\d:])(\d{1,2}:\d{2})(?!:)/)?.[1]
    || "";
}

function headingFromRaw(rawText: string, fallback: string) {
  const heading = rawText.match(/^#\s+(.+)$/m)?.[1] || rawText.match(/^Title:\s+(.+)$/mi)?.[1];
  return titleFromName((heading || fallback).replace(/\s+/g, " "));
}

function participantsFromRaw(rawText: string) {
  const line = rawText.match(/^\*\*Asistentes:\*\*\s+(.+)$/m)?.[1]
    || rawText.match(/^Asistentes:\s+(.+)$/mi)?.[1]
    || rawText.match(/^Participants:\s+(.+)$/mi)?.[1];
  if (!line) return [];
  return line
    .replace(/@\[/g, "@")
    .split(/,|;|·|\n/)
    .map((item) => item.replace(/^@/, "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function summaryFromRaw(rawText: string, title: string) {
  const description = rawText.match(/## Description\s+([\s\S]*?)(?:\n## |\n---|$)/i)?.[1]?.trim();
  const context = rawText.match(/## Contexto\s+([\s\S]*?)(?:\n## |\n---|$)/i)?.[1]?.trim();
  const firstBullets = rawText
    .split("\n")
    .filter((line) => /^[-*]\s+/.test(line.trim()))
    .slice(0, 8)
    .join("\n");
  const extract = [description, context, firstBullets || rawText.slice(0, 1800)]
    .filter(Boolean)
    .join("\n\n");
  return `## ${title}\n\n${extract.slice(0, 5000).trim()}`;
}

function extractBulletsFromSection(rawText: string, headings: string[]) {
  const escaped = headings.map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`^#{1,4}\\s*(?:${escaped})\\b[\\s\\S]*?(?=\\n#{1,4}\\s+|$)`, "gim");
  const blocks = rawText.match(regex) || [];
  return blocks.flatMap((block) => block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim())
    .filter(Boolean));
}

function uniqueItems(items: string[], limit: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const normalized = item.toLowerCase().replace(/\W+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(item.length > 220 ? `${item.slice(0, 217)}...` : item);
    if (out.length >= limit) break;
  }
  return out;
}

function inferInsights(rawText: string) {
  const lines = rawText.split("\n").map((line) => line.trim()).filter(Boolean);
  const decisions = uniqueItems([
    ...extractBulletsFromSection(rawText, ["Decisiones", "Decisions", "Acuerdos", "Decision log"]),
    ...lines.filter((line) => /\b(se decide|decidimos|acordamos|acuerdo|decision|decisión)\b/i.test(line)),
  ], 8);
  const actions = uniqueItems([
    ...extractBulletsFromSection(rawText, ["Acciones", "Action items", "Tareas", "Next steps", "Próximos pasos", "Pendientes"]),
    ...lines.filter((line) => /\b(debe|tiene que|pendiente|next step|follow[- ]?up|responsable|owner|hacer|enviar|crear|revisar|solicitar)\b/i.test(line)),
  ], 10);
  const risks = uniqueItems([
    ...extractBulletsFromSection(rawText, ["Riesgos", "Risks", "Problemas", "Bloqueos"]),
    ...lines.filter((line) => /\b(riesgo|problema|bloqueo|conflicto|inconsistencia|no funciona|error|limitacion|limitación)\b/i.test(line)),
  ], 6);
  const insights = uniqueItems([
    ...extractBulletsFromSection(rawText, ["Insights", "Aprendizajes", "Realizaciones", "Aha moments", "Problemas identificados", "Sugerencias", "Oportunidades", "Content mining"]),
    ...lines.filter((line) => /\b(insight|oportunidad|sugerencia|mejora|aprendizaje|objecion|objeción|posicionamiento|pov|nos dimos cuenta|realizamos que|problema resuelto|framework|proceso|sistema|contrario|mito|best practice|pasamos de|fuimos de)\b/i.test(line)),
  ], 8);
  return { decisions, actions, risks, insights };
}

export function documentsForText(text: string) {
  const lower = text.toLowerCase();
  const docs: Array<{ name: string; severity: "high" | "medium" | "low"; reason: string }> = [];
  if (/\b(strategyplan|strategy plan|estrategia|prioridad|roadmap|go[- ]?to[- ]?market|gtm)\b/i.test(lower)) {
    docs.push({ name: "StrategyPlan", severity: "high", reason: "Afecta estrategia, prioridades o roadmap." });
  }
  const directPovSignal = /\b(pov|proof point|creencia|belief|objecion|objeción|argumento|customer language|lenguaje de cliente)\b/i.test(lower);
  const mineablePovSignal = /\b(aha|insight|nos dimos cuenta|realizamos que|problema resuelto|solucionamos|framework|proceso|sistema|ritual|contrario|mito|best practice|pasamos de|fuimos de|mrr|cac|ltv|payback|conversion|conversión|frustracion|frustración|fallo|duda)\b/i.test(lower)
    || /\b\d+\s*(%|x|€|\$)\b/.test(lower);
  if (directPovSignal || mineablePovSignal) {
    docs.push({
      name: "POV Bank",
      severity: directPovSignal ? "medium" : "low",
      reason: directPovSignal
        ? "Afecta POV, proof points u objeciones."
        : "Contiene una señal mineable para POV: insight, proceso, métrica, conflicto o lenguaje de cliente.",
    });
  }
  if (/\b(posicionamiento|positioning|diferenciacion|diferenciación|competidor|competencia)\b/i.test(lower)) {
    docs.push({ name: "Positioning", severity: "medium", reason: "Afecta posicionamiento o diferenciación." });
  }
  if (/\b(contenido|content|pilar|pillar|editorial)\b/i.test(lower)) {
    docs.push({ name: "Content Pillars", severity: "low", reason: "Afecta temas o ángulos de contenido." });
  }
  if (/\b(tono|voice|mensaje|copy|lenguaje)\b/i.test(lower)) {
    docs.push({ name: "Brand Voice", severity: "low", reason: "Afecta tono o lenguaje de marca." });
  }
  if (/\b(company brief|empresa|producto|cliente|oferta)\b/i.test(lower)) {
    docs.push({ name: "Company Brief", severity: "low", reason: "Afecta contexto canónico de compañía o producto." });
  }
  return docs;
}

// Pure: which insights still lack a recommendation (keyed by insightId). The
// backfill (fix A, SAN-222) uses this so it NEVER re-touches an insight whose
// recommendation a human may have already approved/converted/rejected.
export function insightsNeedingRecommendation<T extends { id: string }>(
  insights: T[],
  recommendations: Array<{ insightId: string | null }>,
): T[] {
  const linked = new Set(
    recommendations.map((rec) => rec.insightId).filter((id): id is string => Boolean(id)),
  );
  return insights.filter((insight) => !linked.has(insight.id));
}

async function fetchDriveMeetings(source: SourceRow, limit: number, errors: string[]) {
  const account = getGogAccount();
  if (!account) {
    errors.push("Google Workspace account not found in API health.");
    return [];
  }
  if (!source.sourceId) return [];
  try {
    const stdout = execFileSync(GOG_BIN, [
      "--account", account,
      "drive", "ls",
      "--parent", source.sourceId,
      "--json",
      "--max", String(limit),
    ], { encoding: "utf-8", timeout: 30_000 });
    const files = parseDriveItems(JSON.parse(stdout));
    const fetched: FetchedMeeting[] = [];
    for (const file of files) {
      if (!file.id || file.mimeType !== GOOGLE_DOC_MIME) continue;
      try {
        const rawText = normalizeText(execFileSync(GOG_BIN, [
          "--account", account,
          "docs", "cat",
          file.id,
        ], { encoding: "utf-8", timeout: 30_000 }));
        if (!rawText) continue;
        const title = headingFromRaw(rawText, file.name || file.title || file.id);
        fetched.push({
          sourceRow: source,
          externalId: file.id,
          title,
          sourceLabel: "Google Drive",
          meetingDate: dateFromText(file.name || "") || dateFromText(rawText) || file.modifiedTime?.slice(0, 10) || "",
          meetingTime: timeFromText(file.name || "") || timeFromText(rawText),
          participants: participantsFromRaw(rawText),
          sourceUrl: file.webViewLink || file.url || `https://docs.google.com/document/d/${file.id}/edit`,
          rawText,
          summaryText: summaryFromRaw(rawText, title),
          payload: { provider: "google_drive", account, file, sourceId: source.id, fetchedBy: "meeting-intelligence-runner" },
        });
      } catch (error) {
        errors.push(`Drive doc ${file.name || file.id}: ${error instanceof Error ? error.message : "read failed"}`);
      }
    }
    return fetched;
  } catch (error) {
    errors.push(`Drive folder ${source.name}: ${error instanceof Error ? error.message : "list failed"}`);
    return [];
  }
}

function notionTitle(properties: Record<string, unknown>) {
  for (const value of Object.values(properties)) {
    const prop = asRecord(value);
    if (prop.type !== "title" || !Array.isArray(prop.title)) continue;
    return prop.title.map((item) => asString(asRecord(item).plain_text)).join("").trim();
  }
  return "Untitled Notion meeting";
}

function notionFilter(source: SourceRow) {
  const filter = asRecord(source.filter);
  const property = asString(filter.property);
  const value = asString(filter.value);
  const type = asString(filter.propertyType);
  if (!property || !value) return undefined;
  if (type === "relation") return { property, relation: { contains: value } };
  if (type === "multi_select") return { property, multi_select: { contains: value } };
  if (type === "select") return { property, select: { equals: value } };
  if (type === "status") return { property, status: { equals: value } };
  if (type === "checkbox") return { property, checkbox: { equals: value === "true" || value === "1" || value.toLowerCase() === "yes" } };
  return { property, rich_text: { contains: value } };
}

async function notionRequest<T>(pathName: string, init: RequestInit, key: string): Promise<T> {
  const response = await fetch(`https://api.notion.com/v1/${pathName}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(asString(asRecord(data).message, `Notion HTTP ${response.status}`));
  return data as T;
}

function blockToMarkdown(block: Record<string, unknown>) {
  const type = asString(block.type);
  const body = asRecord(block[type]);
  const rich = Array.isArray(body.rich_text) ? body.rich_text : [];
  const text = rich.map((item) => asString(asRecord(item).plain_text)).join("");
  if (!text.trim()) return "";
  if (type === "heading_1") return `# ${text}`;
  if (type === "heading_2") return `## ${text}`;
  if (type === "heading_3") return `### ${text}`;
  if (type === "bulleted_list_item") return `- ${text}`;
  if (type === "numbered_list_item") return `1. ${text}`;
  if (type === "quote") return `> ${text}`;
  return text;
}

async function fetchNotionPageText(pageId: string, key: string) {
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const data = await notionRequest<{ results?: Array<Record<string, unknown>>; has_more?: boolean; next_cursor?: string }>(
      `blocks/${encodeURIComponent(pageId)}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`,
      { method: "GET" },
      key
    );
    for (const block of data.results || []) {
      const line = blockToMarkdown(block);
      if (line) lines.push(line);
    }
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);
  return normalizeText(lines.join("\n"));
}

async function fetchNotionMeetings(source: SourceRow, limit: number, errors: string[]) {
  const key = getNotionKey();
  if (!key) {
    errors.push("NOTION_API_KEY not configured.");
    return [];
  }
  if (!source.sourceId) return [];
  try {
    const filter = notionFilter(source);
    const data = await notionRequest<{ results?: Array<Record<string, unknown>> }>(
      `databases/${encodeURIComponent(source.sourceId)}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: limit,
          ...(filter ? { filter } : {}),
          sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        }),
      },
      key
    );
    const fetched: FetchedMeeting[] = [];
    for (const page of data.results || []) {
      const pageId = asString(page.id);
      if (!pageId) continue;
      try {
        const rawText = await fetchNotionPageText(pageId, key);
        if (!rawText) continue;
        const props = asRecord(page.properties);
        const title = headingFromRaw(rawText, notionTitle(props));
        fetched.push({
          sourceRow: source,
          externalId: pageId,
          title,
          sourceLabel: "Notion",
          meetingDate: dateFromText(title) || dateFromText(rawText) || asString(page.created_time).slice(0, 10),
          meetingTime: timeFromText(title) || timeFromText(rawText),
          participants: participantsFromRaw(rawText),
          sourceUrl: asString(page.url) || source.url || null,
          rawText,
          summaryText: summaryFromRaw(rawText, title),
          payload: { provider: "notion", page, sourceId: source.id, filter: source.filter || null, fetchedBy: "meeting-intelligence-runner" },
        });
      } catch (error) {
        errors.push(`Notion page ${pageId}: ${error instanceof Error ? error.message : "read failed"}`);
      }
    }
    return fetched;
  } catch (error) {
    errors.push(`Notion database ${source.name}: ${error instanceof Error ? error.message : "query failed"}`);
    return [];
  }
}

async function findExistingMeetingId(slug: string, item: FetchedMeeting) {
  const database = getDb();
  const byExternal = await database
    .select()
    .from(miMeetings)
    .where(and(eq(miMeetings.slug, slug), eq(miMeetings.externalId, item.externalId)))
    .limit(1);
  if (byExternal[0]) return byExternal[0].id;
  const meetings = await database.select().from(miMeetings).where(eq(miMeetings.slug, slug));
  const normalizedTitle = item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const titleTokens = new Set(normalizedTitle.split(/\s+/).filter((token) => token.length > 3));
  const ranked = meetings
    .filter((meeting) => !item.meetingDate || meeting.meetingDate === item.meetingDate)
    .map((meeting) => {
      const tokens = meeting.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/);
      const score = tokens.filter((token) => titleTokens.has(token)).length;
      return { meeting, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 3 ? ranked[0].meeting.id : `mim_${stableId(slug, item.sourceLabel, item.externalId)}`;
}

async function upsertFetchedMeeting(slug: string, runId: string, item: FetchedMeeting) {
  const database = getDb();
  const now = new Date();
  const meetingId = await findExistingMeetingId(slug, item);
  await database.insert(miMeetings).values({
    id: meetingId,
    slug,
    sourceId: item.sourceRow.id,
    runId,
    externalId: item.externalId,
    title: item.title,
    meetingDate: item.meetingDate || now.toISOString().slice(0, 10),
    meetingTime: item.meetingTime || "",
    sourceLabel: item.sourceLabel,
    status: "raw_available",
    rawStatus: "raw_text_available",
    meetingType: "meeting",
    participants: item.participants,
    sourceUrl: item.sourceUrl,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: miMeetings.id,
    set: {
      sourceId: item.sourceRow.id,
      runId,
      externalId: item.externalId,
      title: item.title,
      meetingDate: item.meetingDate || now.toISOString().slice(0, 10),
      meetingTime: item.meetingTime || "",
      sourceLabel: item.sourceLabel,
      status: "raw_available",
      rawStatus: "raw_text_available",
      meetingType: "meeting",
      participants: item.participants,
      sourceUrl: item.sourceUrl,
      updatedAt: now,
    },
  });

  await database.insert(miMeetingArtifacts).values({
    id: `mia_${stableId(slug, meetingId)}`,
    slug,
    meetingId,
    rawText: item.rawText,
    summaryText: item.summaryText,
    sourcePayload: item.payload,
    checksum: checksum(item.rawText),
    fetchedAt: now,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: miMeetingArtifacts.id,
    set: {
      rawText: item.rawText,
      summaryText: item.summaryText,
      sourcePayload: item.payload,
      checksum: checksum(item.rawText),
      fetchedAt: now,
      updatedAt: now,
    },
  });
  return meetingId;
}

type MeetingIntelligenceDb = ReturnType<typeof getDb>;

interface InsightForImpact {
  id: string;
  title: string;
  body?: string | null;
  meetingId?: string | null;
}

// Extracted from writeAnalysis (fix A, SAN-222): for one insight, materialize its
// document impacts + a review-first recommendation per impacted document.
// Idempotent via stableId. `fromRaw` only changes the human-facing provenance
// copy — the raw path keeps its exact wording, the backfill path flags that no
// raw_text was available. Nothing here applies changes without human approval.
async function writeInsightImpacts(
  database: MeetingIntelligenceDb,
  slug: string,
  insight: InsightForImpact,
  sourceTitle: string,
  now: Date,
  opts: { fromRaw: boolean },
): Promise<number> {
  const meetingId = insight.meetingId ?? null;
  const docs = documentsForText(`${insight.title}\n${insight.body || ""}`);
  const provenance = opts.fromRaw
    ? `Recommendation creada desde raw_text. Fuente: ${sourceTitle}.`
    : `Recommendation generada desde un insight existente (raw no disponible). Fuente: ${sourceTitle}.`;
  let recommendationCount = 0;
  for (const doc of docs) {
    const impactId = `mip_${stableId(slug, meetingId, insight.id, doc.name)}`;
    const priority = doc.severity === "high" ? "high" : doc.severity === "low" ? "low" : "medium";
    const description = `${provenance} No aplica cambios sin aprobación humana.`;
    await database.insert(miDocumentImpacts).values({
      id: impactId,
      slug,
      meetingId,
      insightId: insight.id,
      documentName: doc.name,
      documentPath: null,
      impactType: doc.name === "StrategyPlan" ? "conflict_check" : "possible_update",
      status: doc.name === "StrategyPlan" ? "conflict" : "possible_update",
      severity: doc.severity,
      reason: doc.reason,
      proposedChange: `Revisar ${doc.name} con evidencia de "${sourceTitle}".`,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: miDocumentImpacts.id,
      set: {
        reason: doc.reason,
        proposedChange: `Revisar ${doc.name} con evidencia de "${sourceTitle}".`,
        severity: doc.severity,
        updatedAt: now,
      },
    });
    await database.insert(miRecommendations).values({
      id: `mirc_${stableId(slug, meetingId, insight.id, doc.name)}`,
      slug,
      meetingId,
      insightId: insight.id,
      impactId,
      title: `Revisar ${doc.name}: ${insight.title}`,
      description,
      priority,
      targetType: "task",
      targetId: null,
      documentName: doc.name,
      status: "recommended",
      taskId: null,
      taskStatus: "recommended",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: miRecommendations.id,
      set: {
        description,
        priority,
        status: "recommended",
        taskStatus: "recommended",
        updatedAt: now,
      },
    });
    recommendationCount += 1;
  }
  return recommendationCount;
}

async function writeAnalysis(slug: string, runId: string, meetingId: string, item: FetchedMeeting) {
  const database = getDb();
  const now = new Date();
  const extracted = inferInsights(item.rawText);
  const rows: Array<typeof miInsights.$inferInsert> = [];
  const addInsight = (kind: string, title: string, index: number) => {
    rows.push({
      id: `mii_${stableId(slug, meetingId, kind, title)}`,
      slug,
      meetingId,
      runId,
      kind,
      title,
      body: title,
      rationale: kind === "decision" ? "Extraído desde raw_text de la reunión." : null,
      owner: title.match(/^\[([^\]]+)\]/)?.[1] || null,
      confidence: 0.72,
      evidence: {
        rawText: true,
        sourceExternalId: item.externalId,
        sourceUrl: item.sourceUrl,
        excerpt: title,
        order: index,
      },
      status: "reviewable",
      sourceLabel: item.title,
      eventDate: item.meetingDate,
      createdAt: now,
      updatedAt: now,
    });
  };
  extracted.decisions.forEach((title, index) => addInsight("decision", title, index));
  extracted.actions.forEach((title, index) => addInsight("action", title, index));
  extracted.insights.forEach((title, index) => addInsight("insight", title, index));
  extracted.risks.forEach((title, index) => addInsight("risk", title, index));

  for (const row of rows) {
    await database.insert(miInsights).values(row).onConflictDoUpdate({
      target: miInsights.id,
      set: {
        runId,
        body: row.body,
        rationale: row.rationale,
        owner: row.owner,
        confidence: row.confidence,
        evidence: row.evidence,
        status: "reviewable",
        sourceLabel: row.sourceLabel,
        eventDate: row.eventDate,
        updatedAt: now,
      },
    });
  }

  let recommendationCount = 0;
  for (const insight of rows) {
    recommendationCount += await writeInsightImpacts(database, slug, insight, item.title, now, { fromRaw: true });
  }
  return { insights: rows.length, recommendations: recommendationCount };
}

// Fix A (SAN-222): generate review-first recommendations from insights that have
// none yet — including legacy/seeded insights with no raw_text. This unblocks the
// "Convert to task" loop for clients whose meetings were never raw-synced (e.g.
// growth4u: 29 insights, 0 proposals). Idempotent and cheap after the first run:
// once every insight has a recommendation, `pending` is empty and nothing writes.
export async function backfillMeetingRecommendations(
  slug: string,
): Promise<{ recommendations: number; insightsScanned: number }> {
  if (!hasDatabase) return { recommendations: 0, insightsScanned: 0 };
  const database = getDb();
  const now = new Date();
  const [insightRows, recommendationRows, meetingRows] = await Promise.all([
    database.select().from(miInsights).where(eq(miInsights.slug, slug)),
    database.select({ insightId: miRecommendations.insightId }).from(miRecommendations).where(eq(miRecommendations.slug, slug)),
    database.select({ id: miMeetings.id, title: miMeetings.title }).from(miMeetings).where(eq(miMeetings.slug, slug)),
  ]);
  const titleByMeeting = new Map(meetingRows.map((meeting) => [meeting.id, meeting.title]));
  const pending = insightsNeedingRecommendation(insightRows, recommendationRows);
  let recommendationCount = 0;
  for (const insight of pending) {
    const sourceTitle =
      (insight.meetingId ? titleByMeeting.get(insight.meetingId) : null) ||
      insight.sourceLabel ||
      "Meeting Intelligence";
    recommendationCount += await writeInsightImpacts(database, slug, insight, sourceTitle, now, { fromRaw: false });
  }
  return { recommendations: recommendationCount, insightsScanned: insightRows.length };
}

export async function runMeetingIntelligenceSync(input: {
  slug: string;
  trigger?: string;
  limit?: number;
}) {
  if (!hasDatabase) {
    return {
      ok: false,
      storage: { configured: false, provider: "neon", message: "DATABASE_URL is not configured." },
      run: null,
    };
  }
  await ensureMeetingIntelligenceStorage();
  const configResult = await getMeetingIntelligenceConfig(input.slug);
  const trigger = input.trigger || "manual_ui";
  const isAutomatic = trigger.includes("cron") || trigger.includes("automatic");
  if (isAutomatic && configResult.config && (!configResult.config.enabled || !configResult.config.sync.enabled)) {
    return {
      ok: true,
      skipped: true,
      storage: { configured: true, provider: "neon" },
      run: null,
      metrics: { sources: 0, fetched: 0, rawAvailable: 0, insights: 0, recommendations: 0, povEvidence: 0, povProposals: 0 },
      errors: ["Meeting Intelligence automatic sync is disabled."],
    };
  }
  const created = await createMeetingIntelligenceRun({
    slug: input.slug,
    status: "running",
    trigger,
    metrics: { requestedFrom: trigger },
  });
  const run = created.run;
  if (!run) return created;

  const database = getDb();
  const errors: string[] = [];
  const metrics = {
    sources: 0,
    fetched: 0,
    rawAvailable: 0,
    insights: 0,
    recommendations: 0,
    povEvidence: 0,
    povProposals: 0,
  };

  try {
    const limit = Math.max(1, Math.min(input.limit || 30, 60));
    const sources = await database
      .select()
      .from(miSources)
      .where(and(eq(miSources.slug, input.slug), eq(miSources.enabled, true)));
    metrics.sources = sources.length;

    const fetched: FetchedMeeting[] = [];
    for (const source of sources) {
      if (source.kind === "google_drive") {
        fetched.push(...await fetchDriveMeetings(source, limit, errors));
      } else if (source.kind === "notion_database") {
        fetched.push(...await fetchNotionMeetings(source, limit, errors));
      }
    }
    metrics.fetched = fetched.length;

    for (const item of fetched) {
      const meetingId = await upsertFetchedMeeting(input.slug, run.id, item);
      metrics.rawAvailable += 1;
      const analysis = await writeAnalysis(input.slug, run.id, meetingId, item);
      metrics.insights += analysis.insights;
      metrics.recommendations += analysis.recommendations;
    }

    try {
      const povReconcile = await reconcileMeetingsToPovBank(input.slug);
      metrics.povEvidence = povReconcile.evidenceUpserted;
      metrics.povProposals = povReconcile.proposalsUpserted || 0;
    } catch (error) {
      errors.push(`POV Bank reconcile: ${error instanceof Error ? error.message : "failed"}`);
    }

    // Fix A (SAN-222): close the loop even when no raw was synced this run —
    // generate review-first recommendations from any insight that still lacks one.
    try {
      const backfill = await backfillMeetingRecommendations(input.slug);
      metrics.recommendations += backfill.recommendations;
    } catch (error) {
      errors.push(`Recommendation backfill: ${error instanceof Error ? error.message : "failed"}`);
    }

    const finishedAt = new Date();
    const status = errors.length && metrics.rawAvailable === 0 ? "failed" : "completed";
    await database.update(miRuns).set({
      status,
      sourcesScanned: {
        sourceIds: sources.map((source) => source.id),
        providers: [...new Set(sources.map((source) => source.kind))],
      },
      metrics,
      errors: errors.length ? errors : null,
      finishedAt,
    }).where(eq(miRuns.id, run.id));
    return {
      ok: status !== "failed",
      storage: { configured: true, provider: "neon" },
      run: { ...run, status, finishedAt },
      metrics,
      errors,
    };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : "Meeting Intelligence sync failed";
    await database.update(miRuns).set({
      status: "failed",
      metrics,
      errors: [...errors, message],
      finishedAt,
    }).where(eq(miRuns.id, run.id));
    return {
      ok: false,
      storage: { configured: true, provider: "neon" },
      run: { ...run, status: "failed", finishedAt },
      metrics,
      errors: [...errors, message],
    };
  }
}
