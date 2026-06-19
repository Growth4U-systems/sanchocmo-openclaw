import crypto from "crypto";
import fs from "fs";
import path from "path";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import { metricDashboards } from "@/db/schema";
import { BASE } from "@/lib/data/paths";
import { SURFACES } from "@/lib/metrics/surfaces";
import {
  dashboardDefinitionSchema,
  isSafeFormula,
  parseDashboardDefinition,
  type CustomMetric,
  type DashboardDefinition,
} from "@/lib/metrics/dashboard-schema";

/**
 * Versioned dashboard definition store (SAN-265 · Métricas v2 PR-3), modeled on
 * the POV Bank: one row per slug holding the active `definition` plus an
 * append-only `versionHistory` of full snapshots (so revert restores a known
 * state). `metrics-plan.json` is the SEED; once in the DB, the DB is the source
 * of truth. Degrades cleanly (configured: false) without DATABASE_URL.
 */

const MAX_HISTORY = 50;

const ENSURE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "metric_dashboards" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "version" integer DEFAULT 1 NOT NULL, "definition" jsonb DEFAULT '{}'::jsonb NOT NULL, "version_history" jsonb DEFAULT '[]'::jsonb NOT NULL, "status" text DEFAULT 'active' NOT NULL, "source" text DEFAULT 'neon' NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_dashboards_slug_idx" ON "metric_dashboards" ("slug")`,
];

let ensurePromise: Promise<void> | null = null;

export async function ensureMetricsDashboardStorage(): Promise<void> {
  if (!hasDatabase) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const database = getDb();
      for (const statement of ENSURE_STATEMENTS) {
        await database.execute(drizzleSql.raw(statement));
      }
    })();
  }
  await ensurePromise;
}

function stableId(...parts: Array<string | number>): string {
  return crypto.createHash("sha1").update(parts.map(String).join(":")).digest("hex").slice(0, 24);
}

function dashboardId(slug: string): string {
  return `mdash_${stableId(slug)}`;
}

export interface DashboardVersionMeta {
  version: number;
  date: string;
  trigger: string;
  changes?: string;
}

export interface DashboardRecord {
  configured: boolean;
  slug: string;
  version: number;
  definition: DashboardDefinition | null;
  versions: DashboardVersionMeta[];
}

interface HistoryEntry extends DashboardVersionMeta {
  definition: DashboardDefinition;
}

const NOT_CONFIGURED = (slug: string): DashboardRecord => ({
  configured: false,
  slug,
  version: 0,
  definition: null,
  versions: [],
});

// ---- Templates (system knowledge; the bespoke parts come from the DB) -------

const DEFAULT_TABS = [
  { key: "overview", label: "Overview", visible: true, order: 0 },
  { key: "surfaces", label: "Surfaces", visible: true, order: 1 },
  { key: "channels", label: "Channels", visible: true, order: 2 },
  { key: "conversion", label: "Conversion", visible: true, order: 3 },
  { key: "trends", label: "Trends", visible: true, order: 4 },
  { key: "conexiones", label: "Conexiones", visible: true, order: 5 },
];

function defaultSurfaceRefs() {
  return SURFACES.map((surface, index) => ({ surface: surface.key, visible: true, order: index }));
}

const ARCHETYPE_TEMPLATES: Record<string, { activationEvent: string; northStarLabel: string; funnel: string[] }> = {
  "lead-to-sale": {
    activationEvent: "Primera reunión cualificada",
    northStarLabel: "Reuniones cualificadas",
    funnel: ["Sessions", "Leads", "Cualificados", "Reuniones", "Deals"],
  },
  marketplace: {
    activationEvent: "Primera transacción completada",
    northStarLabel: "Primeras transacciones · GMV",
    funnel: ["Visita", "Signup", "Activación", "1ª transacción", "GMV"],
  },
  saas: {
    activationEvent: "Activación",
    northStarLabel: "Usuarios activados",
    funnel: ["Visita", "Signup", "Activación", "Suscripción"],
  },
  ecommerce: {
    activationEvent: "Primera compra",
    northStarLabel: "Pedidos",
    funnel: ["Visita", "Carrito", "Checkout", "Compra"],
  },
};

function normalizeArchetype(value: unknown): string {
  const key = String(value ?? "lead-to-sale").toLowerCase().replace(/[\s_]+/g, "-");
  return ARCHETYPE_TEMPLATES[key] ? key : "lead-to-sale";
}

export function buildTemplateDefinition(archetype: string): DashboardDefinition {
  const key = normalizeArchetype(archetype);
  const template = ARCHETYPE_TEMPLATES[key];
  return dashboardDefinitionSchema.parse({
    archetype: key,
    activationEvent: template.activationEvent,
    northStar: { label: template.northStarLabel, target: null },
    tabs: DEFAULT_TABS,
    surfaces: defaultSurfaceRefs(),
    plan: { activationEvent: template.activationEvent, funnel: template.funnel.map((name) => ({ name })), kpis: [] },
    customSurfaces: [],
    customMetrics: [],
  });
}

function readMetricsPlan(slug: string): Record<string, unknown> | null {
  const planFile = path.join(BASE, "brand", slug, "metrics-plan.json");
  if (!fs.existsSync(planFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(planFile, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Seed a definition from the client's metrics-plan.json, falling back to the archetype template. */
export function buildSeedDefinition(slug: string): DashboardDefinition {
  const plan = readMetricsPlan(slug);
  const archetype = normalizeArchetype(plan?.archetype);
  const base = buildTemplateDefinition(archetype);
  if (!plan) return base;
  const enriched: Record<string, unknown> = {
    ...base,
    activationEvent: (plan.activationEvent as string) ?? base.activationEvent,
    plan: {
      activationEvent: (plan.activationEvent as string) ?? base.plan.activationEvent,
      funnel: Array.isArray(plan.funnel) && plan.funnel.length ? plan.funnel : base.plan.funnel,
      kpis: Array.isArray(plan.kpis) ? plan.kpis : base.plan.kpis,
    },
  };
  try {
    return dashboardDefinitionSchema.parse(enriched);
  } catch {
    return base; // a malformed plan never blocks seeding
  }
}

// ---- CRUD + versioning ------------------------------------------------------

function metaFromHistory(history: unknown): DashboardVersionMeta[] {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => entry as Partial<HistoryEntry>)
    .filter((entry) => typeof entry.version === "number")
    .map((entry) => ({
      version: entry.version as number,
      date: String(entry.date ?? ""),
      trigger: String(entry.trigger ?? "edit"),
      changes: entry.changes,
    }))
    .sort((a, b) => b.version - a.version);
}

async function readRow(slug: string) {
  const database = getDb();
  const rows = await database.select().from(metricDashboards).where(eq(metricDashboards.slug, slug)).limit(1);
  return rows[0] ?? null;
}

async function writeDefinition(
  slug: string,
  definition: DashboardDefinition,
  opts: { trigger: string; changeNote?: string },
): Promise<DashboardRecord> {
  const database = getDb();
  const existing = await readRow(slug);
  const prevHistory: HistoryEntry[] = Array.isArray(existing?.versionHistory)
    ? (existing!.versionHistory as unknown as HistoryEntry[])
    : [];
  const version = (existing?.version ?? 0) + 1;
  const now = new Date();
  const snapshot: HistoryEntry = {
    version,
    date: now.toISOString().slice(0, 10),
    trigger: opts.trigger,
    changes: opts.changeNote,
    definition,
  };
  const history = [...prevHistory, snapshot].slice(-MAX_HISTORY);
  const id = existing?.id ?? dashboardId(slug);
  await database
    .insert(metricDashboards)
    .values({
      id,
      slug,
      version,
      definition: definition as unknown as Record<string, unknown>,
      versionHistory: history as unknown as Array<Record<string, unknown>>,
      status: "active",
      source: "neon",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: metricDashboards.id,
      set: {
        version,
        definition: definition as unknown as Record<string, unknown>,
        versionHistory: history as unknown as Array<Record<string, unknown>>,
        updatedAt: now,
      },
    });
  return { configured: true, slug, version, definition, versions: metaFromHistory(history) };
}

/** Get the active definition, lazily seeding from the metrics-plan/template on first access. */
export async function getDashboardDefinition(slug: string): Promise<DashboardRecord> {
  if (!hasDatabase) return NOT_CONFIGURED(slug);
  await ensureMetricsDashboardStorage();
  const existing = await readRow(slug);
  if (!existing) {
    return writeDefinition(slug, buildSeedDefinition(slug), {
      trigger: "seed",
      changeNote: "Semilla desde metrics-plan.json",
    });
  }
  let definition: DashboardDefinition;
  try {
    definition = parseDashboardDefinition(existing.definition);
  } catch {
    definition = buildSeedDefinition(slug);
  }
  return {
    configured: true,
    slug,
    version: existing.version,
    definition,
    versions: metaFromHistory(existing.versionHistory),
  };
}

/** Validate + persist a new definition as the next version. */
export async function saveDashboardDefinition(
  slug: string,
  definition: unknown,
  opts: { trigger?: string; changeNote?: string } = {},
): Promise<DashboardRecord> {
  if (!hasDatabase) return NOT_CONFIGURED(slug);
  await ensureMetricsDashboardStorage();
  const validated = parseDashboardDefinition(definition);
  return writeDefinition(slug, validated, { trigger: opts.trigger ?? "edit", changeNote: opts.changeNote });
}

export async function listDashboardVersions(slug: string): Promise<{ configured: boolean; versions: DashboardVersionMeta[] }> {
  if (!hasDatabase) return { configured: false, versions: [] };
  await ensureMetricsDashboardStorage();
  const existing = await readRow(slug);
  return { configured: true, versions: metaFromHistory(existing?.versionHistory) };
}

/** Revert to a prior version by appending a NEW version that copies its snapshot (append-only). */
export async function revertDashboardDefinition(
  slug: string,
  toVersion: number,
  opts: { changeNote?: string } = {},
): Promise<DashboardRecord> {
  if (!hasDatabase) return NOT_CONFIGURED(slug);
  await ensureMetricsDashboardStorage();
  const existing = await readRow(slug);
  const history: HistoryEntry[] = Array.isArray(existing?.versionHistory)
    ? (existing!.versionHistory as unknown as HistoryEntry[])
    : [];
  const target = history.find((entry) => entry.version === toVersion);
  if (!target?.definition) {
    throw new Error(`No snapshot found for version ${toVersion}`);
  }
  return writeDefinition(slug, parseDashboardDefinition(target.definition), {
    trigger: "revert",
    changeNote: opts.changeNote ?? `Revertido a v${toVersion}`,
  });
}

export async function applyDashboardTemplate(
  slug: string,
  archetype: string,
  opts: { changeNote?: string } = {},
): Promise<DashboardRecord> {
  if (!hasDatabase) return NOT_CONFIGURED(slug);
  await ensureMetricsDashboardStorage();
  const key = normalizeArchetype(archetype);
  return writeDefinition(slug, buildTemplateDefinition(key), {
    trigger: "template",
    changeNote: opts.changeNote ?? `Plantilla ${key} aplicada`,
  });
}

/** Append a custom (formula) metric to the active definition as a new version. */
export async function addCustomMetric(
  slug: string,
  metric: { label: string; formula: string; format?: string; tier?: string; surface?: string },
  opts: { changeNote?: string } = {},
): Promise<DashboardRecord> {
  if (!hasDatabase) return NOT_CONFIGURED(slug);
  if (!metric?.label || !metric?.formula) throw new Error("label and formula are required");
  if (!isSafeFormula(metric.formula)) throw new Error("Unsafe formula: only identifiers, source.metric refs, numbers and arithmetic are allowed");
  const current = await getDashboardDefinition(slug);
  const definition = current.definition ?? buildSeedDefinition(slug);
  const id = `cm_${stableId(slug, metric.label)}`;
  const next: CustomMetric = {
    id,
    label: metric.label,
    formula: metric.formula.trim(),
    format: metric.format,
    tier: metric.tier,
    surface: metric.surface,
  };
  const customMetrics = [...definition.customMetrics.filter((entry) => entry.id !== id), next];
  return writeDefinition(slug, { ...definition, customMetrics }, {
    trigger: "chat",
    changeNote: opts.changeNote ?? `Métrica custom «${metric.label}»`,
  });
}
