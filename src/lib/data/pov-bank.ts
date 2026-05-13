import crypto from "crypto";
import fs from "fs";
import path from "path";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import {
  miDocumentImpacts,
  miInsights,
  miMeetings,
  povBanks,
  povClarifyPatterns,
  povEvidenceItems,
  povPillars,
  povUpdateProposals,
} from "@/db/schema";
import { BASE } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";
import { loadDraft } from "@/lib/data/drafts";

export interface PillarPov {
  pillar_name?: string;
  core_belief: string | null;
  we_say_yes_to: string[];
  we_say_no_to: string[];
  preferred_angles: string[];
  evidence_we_cite: string[];
  evidence_items?: PovEvidenceItem[];
  clarify_patterns?: PovClarifyPattern[];
  update_candidates?: PovUpdateProposal[];
}

export interface PovBank {
  version: number;
  global: {
    one_liner: string | null;
    villain: string | null;
    voice_traits: string[];
  };
  pov_per_pillar: Record<string, PillarPov>;
  updated_at?: string;
  version_history?: Array<Record<string, unknown>>;
  storage?: "neon";
}

export interface PovEvidenceItem {
  id: string;
  pillar_id: string;
  source_type: string;
  signal_type: string;
  statement: string;
  exact_quote?: string | null;
  speaker?: string | null;
  context?: string | null;
  source_ref?: Record<string, unknown> | null;
  privacy: string;
  status: string;
  used_in: string[];
  created_at: string;
  updated_at: string;
}

export interface PovClarifyPattern {
  id: string;
  pillar_id: string;
  pattern_type: string;
  pattern: string;
  evidence_count: number;
  confidence?: number | null;
  source_refs: Array<Record<string, unknown>>;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PovUpdateProposal {
  id: string;
  pillar_id?: string | null;
  target_field: string;
  current_value?: unknown;
  proposed_value?: unknown;
  rationale?: string | null;
  evidence_item_ids: string[];
  status: string;
  created_at: string;
  updated_at: string;
  approved_at?: string | null;
  rejected_at?: string | null;
}

export interface PovBankLoadResult {
  configured: boolean;
  povBank: PovBank | null;
  seededFromLegacyJson: boolean;
  error?: string;
}

export interface PovReconcileResult {
  configured: boolean;
  source: "clarify" | "meetings";
  scanned: number;
  evidenceUpserted: number;
  patternsUpserted?: number;
  proposalsUpserted?: number;
  skipped: number;
  error?: string;
}

interface ContentIdeaContext {
  id: string;
  title?: string;
  pillar_id?: string;
  pillar_name?: string;
  content_type?: string;
  target_channel?: string;
  angle_draft?: string;
  created_at?: string;
  updated_at?: string;
  item_type?: string;
}

interface ClarifyAnswer {
  questionKey: string;
  question: string;
  answer: string;
  patternType: string;
}

let ensurePromise: Promise<void> | null = null;

function stableId(...parts: Array<string | number | null | undefined>) {
  return crypto.createHash("sha1").update(parts.filter(Boolean).join(":")).digest("hex").slice(0, 24);
}

function bankId(slug: string) {
  return `povb_${slug}`;
}

function pillarRowId(slug: string, pillarId: string) {
  return `povp_${slug}_${pillarId}`;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeGlobal(value: unknown): PovBank["global"] {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    one_liner: typeof raw.one_liner === "string" && raw.one_liner ? raw.one_liner : null,
    villain: typeof raw.villain === "string" && raw.villain ? raw.villain : null,
    voice_traits: asStringArray(raw.voice_traits),
  };
}

function normalizePillar(value: unknown, fallbackName = ""): PillarPov {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    pillar_name: typeof raw.pillar_name === "string" ? raw.pillar_name : fallbackName,
    core_belief: typeof raw.core_belief === "string" && raw.core_belief ? raw.core_belief : null,
    we_say_yes_to: asStringArray(raw.we_say_yes_to),
    we_say_no_to: asStringArray(raw.we_say_no_to),
    preferred_angles: asStringArray(raw.preferred_angles),
    evidence_we_cite: asStringArray(raw.evidence_we_cite),
  };
}

function legacyPovBankPath(slug: string) {
  return path.join(BASE, "brand", slug, "content", "pov-bank.json");
}

function contentDraftsDir(slug: string) {
  return path.join(BASE, "brand", slug, "content", "drafts");
}

function contentIdeaQueuePath(slug: string) {
  return path.join(BASE, "brand", slug, "content", "idea-queue.json");
}

function loadContentIdeaMap(slug: string) {
  const ideas = readJSON<ContentIdeaContext[]>(contentIdeaQueuePath(slug), []);
  const map = new Map<string, ContentIdeaContext>();
  for (const idea of Array.isArray(ideas) ? ideas : []) {
    if (idea?.id) map.set(idea.id, idea);
  }
  return map;
}

function discoverClarifyIdeaIds(slug: string, onlyIdeaId?: string) {
  if (onlyIdeaId) return [onlyIdeaId];
  const dir = contentDraftsDir(slug);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, "clarify.md")))
    .map((entry) => entry.name)
    .sort();
}

function stripMarkdownAnswer(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/^\s*>\s?/, "").replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForTokens(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenize(value: string) {
  return normalizeForTokens(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !["para", "como", "pero", "esta", "este", "that", "with", "from", "into"].includes(token));
}

function shortText(value: string, limit = 240) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
}

function patternTypeForClarify(question: string, questionKey: string) {
  const lower = normalizeForTokens(`${questionKey} ${question}`);
  if (/\b(q1|angulo|angle|take|tesis|contrarian|hot take)\b/.test(lower)) return "angle";
  if (/\b(q2|evidencia|proof|dato|metric|fuente|numero|número|caso)\b/.test(lower)) return "evidence";
  if (/\b(q3|insight|aprendizaje|nadie|reframe|realizacion|realización)\b/.test(lower)) return "non_obvious_insight";
  if (/\b(q4|audiencia|cta|llamada|cierre|conversion|conversión)\b/.test(lower)) return "audience_cta";
  if (/\b(tono|voice|lenguaje|frase)\b/.test(lower)) return "voice_language";
  return "clarify_answer";
}

function parseClarifyAnswers(body: string): ClarifyAnswer[] {
  const sections = body
    .split(/\n(?=##\s+)/g)
    .map((section) => section.trim())
    .filter((section) => /^##\s+/.test(section));
  const answers: ClarifyAnswer[] = [];

  sections.forEach((section, index) => {
    const heading = section.match(/^##\s+(.+)$/m)?.[1]?.trim() || `Pregunta ${index + 1}`;
    const explicitQuestion = section.match(/\*\*Pregunta\*\*:\s*([\s\S]*?)(?=\n\*\*|\n>|$)/i)?.[1]?.trim();
    const question = explicitQuestion || heading;
    const humanMatch = section.match(/\*\*Respuesta humana\*\*:\s*([\s\S]*?)(?=\n##\s+|$)/i);
    const fallbackMatch = section.match(/\*\*Respuesta\*\*:\s*([\s\S]*?)(?=\n##\s+|$)/i);
    const answer = stripMarkdownAnswer(humanMatch?.[1] || fallbackMatch?.[1] || "");
    if (!answer || /^(pendiente|pending|n\/a|na|sin respuesta)$/i.test(answer)) return;
    const questionKey = heading.match(/\bQ?\d+\b/i)?.[0]?.toUpperCase() || `Q${index + 1}`;
    answers.push({
      questionKey,
      question,
      answer,
      patternType: patternTypeForClarify(question, questionKey),
    });
  });

  return answers;
}

function textFromUnknown(value: unknown) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function pillarSearchText(pillarId: string, pillar: PillarPov) {
  return [
    pillarId,
    pillar.pillar_name,
    pillar.core_belief,
    ...pillar.we_say_yes_to,
    ...pillar.we_say_no_to,
    ...pillar.preferred_angles,
    ...pillar.evidence_we_cite,
  ].filter(Boolean).join(" ");
}

function inferPillarFromText(text: string, bank: PovBank | null | undefined) {
  const pillars = bank?.pov_per_pillar || {};
  const ids = Object.keys(pillars);
  if (ids.length === 0) return "unknown";

  const haystack = normalizeForTokens(text);
  const tokens = new Set(tokenize(text));
  const manualScores: Record<string, RegExp[]> = {
    P1: [/\bsistema\b/, /\bframework\b/, /\bproceso\b/, /\bdashboard\b/, /\bmetricas?\b/, /\bgrowth\b/],
    P2: [/\bcanal(es)?\b/, /\bpaid\b/, /\bseo\b/, /\bacquisition\b/, /\badquisicion\b/, /\bdistribucion\b/],
    P3: [/\bcompliance\b/, /\bregulaci[oó]n\b/, /\bcnmv\b/, /\bmica\b/, /\blegal\b/],
    P4: [/\bretainer\b/, /\bagencia\b/, /\bprograma\b/, /\bprecio\b/, /\boferta\b/],
    P5: [/\bia\b/, /\bai\b/, /\bagente(s)?\b/, /\bautomatizaci[oó]n\b/, /\bsancho\b/],
  };

  let best = { id: ids[0], score: 0 };
  for (const id of ids) {
    const pillarTokens = tokenize(pillarSearchText(id, pillars[id]));
    let score = id.toLowerCase() === haystack ? 10 : 0;
    for (const token of pillarTokens) if (tokens.has(token)) score += 1;
    for (const regex of manualScores[id] || []) if (regex.test(haystack)) score += 3;
    if (score > best.score) best = { id, score };
  }
  return best.score > 0 ? best.id : ids[0];
}

function inferMeetingSignalType(kind: string, text: string) {
  const lower = normalizeForTokens(text);
  if (/\b(de|from)\s+\d+.*\b(a|to)\s+\d+|\b\d+\s*(%|x|€|\$)\b/.test(lower)) return "milestone_or_metric";
  if (/\b(no es|nadie|contrario|contrarian|mejor practica|best practice|mito|la industria)\b/.test(lower)) return "contrarian_opinion";
  if (/\b(proceso|sistema|framework|ritual|playbook|metodologia|metodología)\b/.test(lower)) return "system_process";
  if (/\b(riesgo|bloqueo|problema|duda|frustracion|frustración|fallo|no funciona)\b/.test(lower)) return "vulnerability_or_risk";
  if (kind === "decision") return "decision";
  if (kind === "risk") return "risk";
  return "meeting_insight";
}

function meetingEvidenceQuote(evidence: unknown, fallback: string) {
  const record = evidence && typeof evidence === "object" ? evidence as Record<string, unknown> : {};
  const excerpt = typeof record.excerpt === "string" ? record.excerpt : "";
  return excerpt || fallback;
}

async function ensurePovBankBase(slug: string) {
  await ensurePovBankStorage();
  const database = getDb();
  const now = new Date();
  const id = bankId(slug);
  const [existing] = await database.select().from(povBanks).where(eq(povBanks.id, id)).limit(1);
  if (!existing) {
    await database.insert(povBanks).values({
      id,
      slug,
      version: 3,
      global: {},
      versionHistory: [{
        version: 3,
        date: now.toISOString().slice(0, 10),
        trigger: "automatic-extraction",
        changes: "Creado automáticamente para almacenar evidencia del POV Bank en Neon",
      }],
      status: "active",
      source: "neon",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  }
  return id;
}

async function ensurePillarForEvidence(slug: string, bankIdValue: string, pillarId: string, pillarName?: string | null) {
  const database = getDb();
  const now = new Date();
  const id = pillarRowId(slug, pillarId);
  const [existing] = await database.select().from(povPillars).where(eq(povPillars.id, id)).limit(1);
  await database.insert(povPillars).values({
    id,
    slug,
    bankId: bankIdValue,
    pillarId,
    pillarName: existing?.pillarName || pillarName || null,
    coreBelief: existing?.coreBelief || null,
    weSayYesTo: existing?.weSayYesTo || [],
    weSayNoTo: existing?.weSayNoTo || [],
    preferredAngles: existing?.preferredAngles || [],
    evidenceWeCite: existing?.evidenceWeCite || [],
    status: "active",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: povPillars.id,
    set: {
      bankId: bankIdValue,
      pillarName: existing?.pillarName || pillarName || null,
      coreBelief: existing?.coreBelief || null,
      weSayYesTo: existing?.weSayYesTo || [],
      weSayNoTo: existing?.weSayNoTo || [],
      preferredAngles: existing?.preferredAngles || [],
      evidenceWeCite: existing?.evidenceWeCite || [],
      status: "active",
      updatedAt: now,
    },
  });
}

export async function ensurePovBankStorage() {
  if (!hasDatabase) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const database = getDb();
      const statements = [
        `CREATE TABLE IF NOT EXISTS "pov_banks" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "version" integer DEFAULT 3 NOT NULL, "global" jsonb DEFAULT '{}'::jsonb NOT NULL, "version_history" jsonb DEFAULT '[]'::jsonb NOT NULL, "status" text DEFAULT 'active' NOT NULL, "source" text DEFAULT 'neon' NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS "pov_pillars" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "bank_id" text REFERENCES "pov_banks"("id") ON DELETE CASCADE, "pillar_id" text NOT NULL, "pillar_name" text, "core_belief" text, "we_say_yes_to" jsonb DEFAULT '[]'::jsonb NOT NULL, "we_say_no_to" jsonb DEFAULT '[]'::jsonb NOT NULL, "preferred_angles" jsonb DEFAULT '[]'::jsonb NOT NULL, "evidence_we_cite" jsonb DEFAULT '[]'::jsonb NOT NULL, "status" text DEFAULT 'active' NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS "pov_evidence_items" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "bank_id" text REFERENCES "pov_banks"("id") ON DELETE CASCADE, "pillar_id" text NOT NULL, "source_type" text NOT NULL, "signal_type" text NOT NULL, "statement" text NOT NULL, "exact_quote" text, "speaker" text, "context" text, "source_ref" jsonb, "privacy" text DEFAULT 'internal_exact_public_anonymous' NOT NULL, "status" text DEFAULT 'candidate' NOT NULL, "used_in" jsonb DEFAULT '[]'::jsonb NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS "pov_clarify_patterns" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "bank_id" text REFERENCES "pov_banks"("id") ON DELETE CASCADE, "pillar_id" text NOT NULL, "pattern_type" text NOT NULL, "pattern" text NOT NULL, "evidence_count" integer DEFAULT 1 NOT NULL, "confidence" real, "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "status" text DEFAULT 'active' NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS "pov_update_proposals" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "bank_id" text REFERENCES "pov_banks"("id") ON DELETE CASCADE, "pillar_id" text, "target_field" text NOT NULL, "current_value" jsonb, "proposed_value" jsonb, "rationale" text, "evidence_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL, "status" text DEFAULT 'recommended' NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL, "approved_at" timestamp, "rejected_at" timestamp)`,
        `CREATE INDEX IF NOT EXISTS "pov_banks_slug_idx" ON "pov_banks" ("slug")`,
        `CREATE INDEX IF NOT EXISTS "pov_banks_status_idx" ON "pov_banks" ("status")`,
        `CREATE INDEX IF NOT EXISTS "pov_pillars_slug_idx" ON "pov_pillars" ("slug")`,
        `CREATE INDEX IF NOT EXISTS "pov_pillars_slug_pillar_idx" ON "pov_pillars" ("slug", "pillar_id")`,
        `CREATE INDEX IF NOT EXISTS "pov_pillars_bank_idx" ON "pov_pillars" ("bank_id")`,
        `CREATE INDEX IF NOT EXISTS "pov_evidence_slug_idx" ON "pov_evidence_items" ("slug")`,
        `CREATE INDEX IF NOT EXISTS "pov_evidence_slug_pillar_idx" ON "pov_evidence_items" ("slug", "pillar_id")`,
        `CREATE INDEX IF NOT EXISTS "pov_evidence_source_idx" ON "pov_evidence_items" ("slug", "source_type")`,
        `CREATE INDEX IF NOT EXISTS "pov_evidence_status_idx" ON "pov_evidence_items" ("slug", "status")`,
        `CREATE INDEX IF NOT EXISTS "pov_clarify_patterns_slug_idx" ON "pov_clarify_patterns" ("slug")`,
        `CREATE INDEX IF NOT EXISTS "pov_clarify_patterns_slug_pillar_idx" ON "pov_clarify_patterns" ("slug", "pillar_id")`,
        `CREATE INDEX IF NOT EXISTS "pov_clarify_patterns_status_idx" ON "pov_clarify_patterns" ("slug", "status")`,
        `CREATE INDEX IF NOT EXISTS "pov_update_proposals_slug_idx" ON "pov_update_proposals" ("slug")`,
        `CREATE INDEX IF NOT EXISTS "pov_update_proposals_status_idx" ON "pov_update_proposals" ("slug", "status")`,
        `CREATE INDEX IF NOT EXISTS "pov_update_proposals_target_idx" ON "pov_update_proposals" ("slug", "pillar_id", "target_field")`,
      ];
      for (const statement of statements) {
        await database.execute(drizzleSql.raw(statement));
      }
    })();
  }
  await ensurePromise;
}

async function materializePovBank(slug: string): Promise<PovBank | null> {
  const database = getDb();
  const [bank] = await database.select().from(povBanks).where(eq(povBanks.id, bankId(slug))).limit(1);
  if (!bank) return null;

  const [pillarRows, evidenceRows, patternRows, proposalRows] = await Promise.all([
    database.select().from(povPillars).where(eq(povPillars.slug, slug)),
    database.select().from(povEvidenceItems).where(eq(povEvidenceItems.slug, slug)),
    database.select().from(povClarifyPatterns).where(eq(povClarifyPatterns.slug, slug)),
    database.select().from(povUpdateProposals).where(eq(povUpdateProposals.slug, slug)),
  ]);

  const evidenceByPillar = new Map<string, PovEvidenceItem[]>();
  for (const row of evidenceRows) {
    const item: PovEvidenceItem = {
      id: row.id,
      pillar_id: row.pillarId,
      source_type: row.sourceType,
      signal_type: row.signalType,
      statement: row.statement,
      exact_quote: row.exactQuote,
      speaker: row.speaker,
      context: row.context,
      source_ref: row.sourceRef || null,
      privacy: row.privacy,
      status: row.status,
      used_in: row.usedIn || [],
      created_at: iso(row.createdAt) || "",
      updated_at: iso(row.updatedAt) || "",
    };
    evidenceByPillar.set(row.pillarId, [...(evidenceByPillar.get(row.pillarId) || []), item]);
  }

  const patternsByPillar = new Map<string, PovClarifyPattern[]>();
  for (const row of patternRows) {
    const item: PovClarifyPattern = {
      id: row.id,
      pillar_id: row.pillarId,
      pattern_type: row.patternType,
      pattern: row.pattern,
      evidence_count: row.evidenceCount,
      confidence: row.confidence,
      source_refs: row.sourceRefs || [],
      status: row.status,
      created_at: iso(row.createdAt) || "",
      updated_at: iso(row.updatedAt) || "",
    };
    patternsByPillar.set(row.pillarId, [...(patternsByPillar.get(row.pillarId) || []), item]);
  }

  const proposalsByPillar = new Map<string, PovUpdateProposal[]>();
  for (const row of proposalRows) {
    const item: PovUpdateProposal = {
      id: row.id,
      pillar_id: row.pillarId,
      target_field: row.targetField,
      current_value: row.currentValue,
      proposed_value: row.proposedValue,
      rationale: row.rationale,
      evidence_item_ids: row.evidenceItemIds || [],
      status: row.status,
      created_at: iso(row.createdAt) || "",
      updated_at: iso(row.updatedAt) || "",
      approved_at: iso(row.approvedAt),
      rejected_at: iso(row.rejectedAt),
    };
    const key = row.pillarId || "__global__";
    proposalsByPillar.set(key, [...(proposalsByPillar.get(key) || []), item]);
  }

  const povPerPillar: PovBank["pov_per_pillar"] = {};
  for (const row of pillarRows.sort((a, b) => a.pillarId.localeCompare(b.pillarId))) {
    povPerPillar[row.pillarId] = {
      pillar_name: row.pillarName || undefined,
      core_belief: row.coreBelief || null,
      we_say_yes_to: row.weSayYesTo || [],
      we_say_no_to: row.weSayNoTo || [],
      preferred_angles: row.preferredAngles || [],
      evidence_we_cite: row.evidenceWeCite || [],
      evidence_items: evidenceByPillar.get(row.pillarId) || [],
      clarify_patterns: patternsByPillar.get(row.pillarId) || [],
      update_candidates: proposalsByPillar.get(row.pillarId) || [],
    };
  }

  return {
    version: bank.version,
    global: normalizeGlobal(bank.global),
    pov_per_pillar: povPerPillar,
    updated_at: iso(bank.updatedAt) || undefined,
    version_history: bank.versionHistory || [],
    storage: "neon",
  };
}

export async function savePovBankToNeon(
  slug: string,
  input: PovBank,
  opts: { changeNote?: string; trigger?: string; appendHistory?: boolean } = {},
): Promise<PovBank> {
  await ensurePovBankStorage();
  const database = getDb();
  const now = new Date();
  const id = bankId(slug);
  const [existing] = await database.select().from(povBanks).where(eq(povBanks.id, id)).limit(1);
  const existingHistory = Array.isArray(existing?.versionHistory) ? existing.versionHistory : [];
  const incomingHistory = Array.isArray(input.version_history) ? input.version_history : [];
  const history = existing ? [...existingHistory] : [...incomingHistory];
  if (opts.appendHistory !== false) {
    history.push({
      version: Math.max(Number(input.version) || 3, 3),
      date: now.toISOString().slice(0, 10),
      trigger: opts.trigger || "neon-edit",
      changes: opts.changeNote || "Actualización del POV Bank en Neon",
    });
  }
  while (history.length > 25) history.shift();

  await database.insert(povBanks).values({
    id,
    slug,
    version: Math.max(Number(input.version) || 3, 3),
    global: normalizeGlobal(input.global),
    versionHistory: history,
    status: "active",
    source: existing?.source || "neon",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: povBanks.id,
    set: {
      version: Math.max(Number(input.version) || 3, 3),
      global: normalizeGlobal(input.global),
      versionHistory: history,
      status: "active",
      updatedAt: now,
    },
  });

  for (const [pillarId, rawPillar] of Object.entries(input.pov_per_pillar || {})) {
    const pillar = normalizePillar(rawPillar);
    const rowId = pillarRowId(slug, pillarId);
    const [existingPillar] = await database.select().from(povPillars).where(eq(povPillars.id, rowId)).limit(1);
    await database.insert(povPillars).values({
      id: rowId,
      slug,
      bankId: id,
      pillarId,
      pillarName: pillar.pillar_name || null,
      coreBelief: pillar.core_belief,
      weSayYesTo: pillar.we_say_yes_to,
      weSayNoTo: pillar.we_say_no_to,
      preferredAngles: pillar.preferred_angles,
      evidenceWeCite: pillar.evidence_we_cite,
      status: "active",
      createdAt: existingPillar?.createdAt || now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: povPillars.id,
      set: {
        bankId: id,
        pillarName: pillar.pillar_name || null,
        coreBelief: pillar.core_belief,
        weSayYesTo: pillar.we_say_yes_to,
        weSayNoTo: pillar.we_say_no_to,
        preferredAngles: pillar.preferred_angles,
        evidenceWeCite: pillar.evidence_we_cite,
        status: "active",
        updatedAt: now,
      },
    });
  }

  const saved = await materializePovBank(slug);
  if (!saved) throw new Error(`Failed to load saved POV Bank for ${slug}`);
  return saved;
}

async function seedFromLegacyJson(slug: string): Promise<boolean> {
  const filePath = legacyPovBankPath(slug);
  if (!fs.existsSync(filePath)) return false;
  const legacy = readJSON<PovBank | null>(filePath, null);
  if (!legacy?.pov_per_pillar || Object.keys(legacy.pov_per_pillar).length === 0) return false;
  await savePovBankToNeon(slug, legacy, {
    trigger: "legacy-json-import",
    changeNote: `Import inicial desde ${path.relative(BASE, filePath)}`,
  });
  return true;
}

export async function loadPovBankFromNeon(
  slug: string,
  opts: { bootstrapFromLegacyJson?: boolean } = {},
): Promise<PovBankLoadResult> {
  if (!hasDatabase) {
    return {
      configured: false,
      povBank: null,
      seededFromLegacyJson: false,
      error: "DATABASE_URL is not configured. POV Bank must be read from Neon.",
    };
  }
  await ensurePovBankStorage();
  let povBank = await materializePovBank(slug);
  let seededFromLegacyJson = false;
  if (!povBank && opts.bootstrapFromLegacyJson === true) {
    seededFromLegacyJson = await seedFromLegacyJson(slug);
    povBank = await materializePovBank(slug);
  }
  return { configured: true, povBank, seededFromLegacyJson };
}

export async function getPovGroundingPack(slug: string, pillarId?: string) {
  const result = await loadPovBankFromNeon(slug);
  const bank = result.povBank;
  if (!bank) return null;
  const pillars = pillarId && bank.pov_per_pillar[pillarId]
    ? { [pillarId]: bank.pov_per_pillar[pillarId] }
    : bank.pov_per_pillar;
  return {
    global: bank.global,
    pillars,
    generated_at: new Date().toISOString(),
  };
}

export function buildPovEvidenceId(slug: string, sourceType: string, sourceKey: string, statement: string) {
  return `pove_${stableId(slug, sourceType, sourceKey, statement)}`;
}

export async function reconcileClarifyToPovBank(
  slug: string,
  opts: { ideaId?: string; bank?: PovBank | null } = {},
): Promise<PovReconcileResult> {
  if (!hasDatabase) {
    return {
      configured: false,
      source: "clarify",
      scanned: 0,
      evidenceUpserted: 0,
      patternsUpserted: 0,
      skipped: 0,
      error: "DATABASE_URL is not configured. Clarify extraction must write to Neon.",
    };
  }

  await ensurePovBankStorage();
  const database = getDb();
  const bankIdValue = await ensurePovBankBase(slug);
  const bank = opts.bank ?? (await loadPovBankFromNeon(slug)).povBank;
  const ideas = loadContentIdeaMap(slug);
  const ideaIds = discoverClarifyIdeaIds(slug, opts.ideaId);

  let scanned = 0;
  let skipped = 0;
  let evidenceUpserted = 0;
  let patternsUpserted = 0;
  const now = new Date();

  for (const ideaId of ideaIds) {
    const draft = loadDraft(slug, ideaId, "clarify");
    if (!draft) {
      skipped += 1;
      continue;
    }
    scanned += 1;
    const status = String(draft.meta.clarify_status || "").toLowerCase();
    const answers = parseClarifyAnswers(draft.body);
    if (status === "skipped" || answers.length === 0) {
      skipped += 1;
      continue;
    }

    const idea = ideas.get(ideaId);
    const contextText = [idea?.pillar_id, idea?.pillar_name, idea?.title, idea?.angle_draft, draft.body].filter(Boolean).join("\n");
    const pillarId = idea?.pillar_id || inferPillarFromText(contextText, bank);
    await ensurePillarForEvidence(slug, bankIdValue, pillarId, idea?.pillar_name || bank?.pov_per_pillar[pillarId]?.pillar_name || null);

    for (const answer of answers) {
      const sourceKey = `${ideaId}:${answer.questionKey}`;
      const evidenceId = buildPovEvidenceId(slug, "clarify", sourceKey, answer.answer);
      const sourceRef = {
        idea_id: ideaId,
        title: idea?.title || null,
        content_type: idea?.content_type || null,
        target_channel: idea?.target_channel || null,
        item_type: draft.meta.item_type || idea?.item_type || null,
        angle_draft: idea?.angle_draft || null,
        question_key: answer.questionKey,
        question: answer.question,
        path: draft.relPath,
        clarify_status: status || null,
      };

      await database.insert(povEvidenceItems).values({
        id: evidenceId,
        slug,
        bankId: bankIdValue,
        pillarId,
        sourceType: "clarify",
        signalType: answer.patternType,
        statement: answer.answer,
        exactQuote: answer.answer,
        speaker: "human",
        context: shortText(answer.question, 300),
        sourceRef,
        privacy: "internal_exact_public_anonymous",
        status: "active",
        usedIn: [],
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: povEvidenceItems.id,
        set: {
          bankId: bankIdValue,
          pillarId,
          signalType: answer.patternType,
          statement: answer.answer,
          exactQuote: answer.answer,
          speaker: "human",
          context: shortText(answer.question, 300),
          sourceRef,
          privacy: "internal_exact_public_anonymous",
          status: "active",
          updatedAt: now,
        },
      });
      evidenceUpserted += 1;

      const patternId = `povcp_${stableId(slug, pillarId, sourceKey, answer.patternType, answer.answer)}`;
      await database.insert(povClarifyPatterns).values({
        id: patternId,
        slug,
        bankId: bankIdValue,
        pillarId,
        patternType: answer.patternType,
        pattern: answer.answer,
        evidenceCount: 1,
        confidence: 0.9,
        sourceRefs: [{ ...sourceRef, evidence_item_id: evidenceId }],
        status: "active",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: povClarifyPatterns.id,
        set: {
          bankId: bankIdValue,
          pillarId,
          patternType: answer.patternType,
          pattern: answer.answer,
          evidenceCount: 1,
          confidence: 0.9,
          sourceRefs: [{ ...sourceRef, evidence_item_id: evidenceId }],
          status: "active",
          updatedAt: now,
        },
      });
      patternsUpserted += 1;
    }
  }

  return {
    configured: true,
    source: "clarify",
    scanned,
    evidenceUpserted,
    patternsUpserted,
    skipped,
  };
}

export async function reconcileMeetingsToPovBank(slug: string): Promise<PovReconcileResult> {
  if (!hasDatabase) {
    return {
      configured: false,
      source: "meetings",
      scanned: 0,
      evidenceUpserted: 0,
      proposalsUpserted: 0,
      skipped: 0,
      error: "DATABASE_URL is not configured. Meeting extraction must write to Neon.",
    };
  }

  await ensurePovBankStorage();
  const database = getDb();
  const bankIdValue = await ensurePovBankBase(slug);
  const bank = (await loadPovBankFromNeon(slug)).povBank;
  const [impacts, insights, meetings] = await Promise.all([
    database.select().from(miDocumentImpacts).where(eq(miDocumentImpacts.slug, slug)),
    database.select().from(miInsights).where(eq(miInsights.slug, slug)),
    database.select().from(miMeetings).where(eq(miMeetings.slug, slug)),
  ]);

  const insightById = new Map(insights.map((item) => [item.id, item]));
  const meetingById = new Map(meetings.map((item) => [item.id, item]));
  const povImpacts = impacts.filter((impact) => impact.documentName === "POV Bank");

  let skipped = 0;
  let evidenceUpserted = 0;
  let proposalsUpserted = 0;
  const now = new Date();

  for (const impact of povImpacts) {
    const insight = impact.insightId ? insightById.get(impact.insightId) : null;
    if (!insight) {
      skipped += 1;
      continue;
    }
    const meeting = insight.meetingId ? meetingById.get(insight.meetingId) : null;
    const text = [
      insight.title,
      insight.body,
      insight.rationale,
      impact.reason,
      impact.proposedChange,
      textFromUnknown(insight.evidence),
    ].filter(Boolean).join("\n");
    if (!text.trim()) {
      skipped += 1;
      continue;
    }

    const pillarId = inferPillarFromText(text, bank);
    await ensurePillarForEvidence(slug, bankIdValue, pillarId, bank?.pov_per_pillar[pillarId]?.pillar_name || null);

    const statement = shortText(insight.title || insight.body || impact.proposedChange || impact.reason || "Meeting POV signal", 320);
    const evidenceId = buildPovEvidenceId(slug, "meeting", `${impact.meetingId || "meeting"}:${insight.id}`, statement);
    const exactQuote = meetingEvidenceQuote(insight.evidence, insight.body || insight.title);
    const sourceRef = {
      meeting_id: insight.meetingId || impact.meetingId || null,
      insight_id: insight.id,
      impact_id: impact.id,
      meeting_title: meeting?.title || insight.sourceLabel || null,
      meeting_date: meeting?.meetingDate || insight.eventDate || null,
      source_label: meeting?.sourceLabel || null,
      source_url: meeting?.sourceUrl || null,
      impact_reason: impact.reason || null,
      proposed_change: impact.proposedChange || null,
    };

    await database.insert(povEvidenceItems).values({
      id: evidenceId,
      slug,
      bankId: bankIdValue,
      pillarId,
      sourceType: "meeting",
      signalType: inferMeetingSignalType(insight.kind, text),
      statement,
      exactQuote,
      speaker: insight.owner || null,
      context: shortText(impact.reason || insight.rationale || meeting?.title || "", 300),
      sourceRef,
      privacy: "internal_exact_public_anonymous",
      status: "candidate",
      usedIn: [],
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: povEvidenceItems.id,
      set: {
        bankId: bankIdValue,
        pillarId,
        signalType: inferMeetingSignalType(insight.kind, text),
        statement,
        exactQuote,
        speaker: insight.owner || null,
        context: shortText(impact.reason || insight.rationale || meeting?.title || "", 300),
        sourceRef,
        privacy: "internal_exact_public_anonymous",
        updatedAt: now,
      },
    });
    evidenceUpserted += 1;

    const proposalId = `povup_${stableId(slug, impact.id, evidenceId, "evidence_we_cite")}`;
    await database.insert(povUpdateProposals).values({
      id: proposalId,
      slug,
      bankId: bankIdValue,
      pillarId,
      targetField: `pov_per_pillar.${pillarId}.evidence_we_cite`,
      currentValue: bank?.pov_per_pillar[pillarId]?.evidence_we_cite || [],
      proposedValue: {
        operation: "append_candidate",
        value: statement,
        source: "meeting-intelligence",
      },
      rationale: impact.proposedChange || impact.reason || "Meeting Intelligence detected a POV Bank impact.",
      evidenceItemIds: [evidenceId],
      status: "recommended",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: povUpdateProposals.id,
      set: {
        bankId: bankIdValue,
        pillarId,
        targetField: `pov_per_pillar.${pillarId}.evidence_we_cite`,
        currentValue: bank?.pov_per_pillar[pillarId]?.evidence_we_cite || [],
        proposedValue: {
          operation: "append_candidate",
          value: statement,
          source: "meeting-intelligence",
        },
        rationale: impact.proposedChange || impact.reason || "Meeting Intelligence detected a POV Bank impact.",
        evidenceItemIds: [evidenceId],
        updatedAt: now,
      },
    });
    proposalsUpserted += 1;
  }

  return {
    configured: true,
    source: "meetings",
    scanned: povImpacts.length,
    evidenceUpserted,
    proposalsUpserted,
    skipped,
  };
}
