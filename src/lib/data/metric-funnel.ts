import { and, eq, gte, lte, sql as drizzleSql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import { metricFunnelStageMap, metricStageRollups } from "@/db/schema";
import { canonicalMetricDimensions, stableSemanticId } from "@/lib/data/metric-kpis";
import type { MetricQualityStatus } from "@/lib/metrics/semantic-types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

const FUNNEL_STORAGE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "metric_funnel_stage_map" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "archetype" text DEFAULT 'lead-to-sale' NOT NULL, "stage_key" text NOT NULL, "stage_label" text NOT NULL, "stage_order" integer DEFAULT 0 NOT NULL, "source" text NOT NULL, "metric_name" text NOT NULL, "dimensions" jsonb, "dims_key" text DEFAULT '' NOT NULL, "entity_type" text, "channel" text, "cost_source" text, "cost_metric_name" text, "enabled" boolean DEFAULT true NOT NULL, "notes" text, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_funnel_stage_map_slug_idx" ON "metric_funnel_stage_map" ("slug")`,
  `CREATE INDEX IF NOT EXISTS "metric_funnel_stage_map_slug_archetype_idx" ON "metric_funnel_stage_map" ("slug", "archetype")`,
  `CREATE INDEX IF NOT EXISTS "metric_funnel_stage_map_slug_stage_idx" ON "metric_funnel_stage_map" ("slug", "stage_key")`,
  `CREATE TABLE IF NOT EXISTS "metric_stage_rollups" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "metric_date" text NOT NULL, "grain" text DEFAULT 'day' NOT NULL, "stage_key" text NOT NULL, "channel" text DEFAULT '' NOT NULL, "count" real DEFAULT 0 NOT NULL, "value" real, "cost" real, "dimensions" jsonb, "dims_key" text DEFAULT '' NOT NULL, "quality_status" text DEFAULT 'missing' NOT NULL, "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "run_id" text REFERENCES "metric_kpi_runs"("id") ON DELETE SET NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_date_idx" ON "metric_stage_rollups" ("slug", "metric_date")`,
  `CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_stage_date_idx" ON "metric_stage_rollups" ("slug", "stage_key", "metric_date")`,
  `CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_channel_date_idx" ON "metric_stage_rollups" ("slug", "channel", "metric_date")`,
  `CREATE INDEX IF NOT EXISTS "metric_stage_rollups_run_idx" ON "metric_stage_rollups" ("run_id")`,
  `CREATE TABLE IF NOT EXISTS "metric_stage_events" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "entity_id" text NOT NULL, "entity_type" text DEFAULT 'lead' NOT NULL, "stage_key" text NOT NULL, "channel" text, "occurred_at" timestamp NOT NULL, "metric_date" text NOT NULL, "source" text NOT NULL, "source_event_id" text, "value" real, "revenue" real, "cost" real, "dimensions" jsonb, "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_stage_events_slug_entity_idx" ON "metric_stage_events" ("slug", "entity_type", "entity_id")`,
  `CREATE INDEX IF NOT EXISTS "metric_stage_events_slug_stage_date_idx" ON "metric_stage_events" ("slug", "stage_key", "metric_date")`,
  `CREATE INDEX IF NOT EXISTS "metric_stage_events_slug_channel_date_idx" ON "metric_stage_events" ("slug", "channel", "metric_date")`,
  `CREATE TABLE IF NOT EXISTS "metric_attribution_results" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "model" text NOT NULL, "range_start" text NOT NULL, "range_end" text NOT NULL, "channel" text NOT NULL, "stage_key" text, "attributed_count" real, "attributed_value" real, "attributed_revenue" real, "attributed_cost" real, "weight" real, "quality_status" text DEFAULT 'missing' NOT NULL, "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "run_id" text REFERENCES "metric_kpi_runs"("id") ON DELETE SET NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_attribution_results_slug_range_idx" ON "metric_attribution_results" ("slug", "range_start", "range_end")`,
  `CREATE INDEX IF NOT EXISTS "metric_attribution_results_slug_model_idx" ON "metric_attribution_results" ("slug", "model")`,
  `CREATE INDEX IF NOT EXISTS "metric_attribution_results_slug_channel_idx" ON "metric_attribution_results" ("slug", "channel")`,
  `CREATE INDEX IF NOT EXISTS "metric_attribution_results_run_idx" ON "metric_attribution_results" ("run_id")`,
  `CREATE TABLE IF NOT EXISTS "metric_annotations" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "annotation_date" text NOT NULL, "title" text NOT NULL, "body" text, "category" text DEFAULT 'manual' NOT NULL, "source" text DEFAULT 'manual' NOT NULL, "created_by" text, "scope" text DEFAULT 'dashboard' NOT NULL, "metric_definition_id" text, "metadata" jsonb, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_annotations_slug_date_idx" ON "metric_annotations" ("slug", "annotation_date")`,
  `CREATE INDEX IF NOT EXISTS "metric_annotations_slug_metric_idx" ON "metric_annotations" ("slug", "metric_definition_id")`,
  `CREATE TABLE IF NOT EXISTS "metric_signals" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "signal_date" text NOT NULL, "surface" text, "definition_id" text, "severity" text DEFAULT 'info' NOT NULL, "title" text NOT NULL, "body" text, "status" text DEFAULT 'open' NOT NULL, "source" text DEFAULT 'system' NOT NULL, "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "metadata" jsonb, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_signals_slug_date_idx" ON "metric_signals" ("slug", "signal_date")`,
  `CREATE INDEX IF NOT EXISTS "metric_signals_slug_surface_idx" ON "metric_signals" ("slug", "surface")`,
  `CREATE INDEX IF NOT EXISTS "metric_signals_slug_definition_idx" ON "metric_signals" ("slug", "definition_id")`,
  `CREATE INDEX IF NOT EXISTS "metric_signals_slug_status_idx" ON "metric_signals" ("slug", "status")`,
];

let ensurePromise: Promise<void> | null = null;

export async function ensureMetricFunnelStorage(): Promise<void> {
  if (!hasDatabase) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const database = getDb();
      for (const statement of FUNNEL_STORAGE_STATEMENTS) {
        await database.execute(drizzleSql.raw(statement));
      }
    })();
  }
  await ensurePromise;
}

export interface FunnelStageMappingInput {
  stageKey: string;
  stageLabel: string;
  stageOrder: number;
  source: string;
  metricName: string;
  dimensions?: Record<string, unknown> | null;
  entityType?: string | null;
  channel?: string | null;
  costSource?: string | null;
  costMetricName?: string | null;
  enabled?: boolean;
  notes?: string | null;
}

export type FunnelStageMapping = FunnelStageMappingInput & {
  archetype: string;
  dimensions: Record<string, string> | null;
  dimsKey: string;
};

const DEFAULT_STAGE_MAPS: Record<string, FunnelStageMappingInput[]> = {
  "lead-to-sale": [
    { stageKey: "sessions", stageLabel: "Sessions", stageOrder: 10, source: "ga4", metricName: "sessions", entityType: "session", channel: "web" },
    { stageKey: "leads", stageLabel: "Leads", stageOrder: 20, source: "ghl", metricName: "newContacts", entityType: "lead", channel: "crm" },
    { stageKey: "qualified", stageLabel: "Qualified", stageOrder: 30, source: "ghl", metricName: "qualifiedLeads", entityType: "lead", channel: "crm" },
    { stageKey: "meetings", stageLabel: "Meetings", stageOrder: 40, source: "ghl", metricName: "appointments", entityType: "appointment", channel: "crm" },
    { stageKey: "deals", stageLabel: "Deals", stageOrder: 50, source: "ghl", metricName: "opportunities", entityType: "deal", channel: "crm" },
    { stageKey: "revenue", stageLabel: "Revenue", stageOrder: 60, source: "ghl", metricName: "closedWonValue", entityType: "deal", channel: "crm" },
  ],
  marketplace: [
    { stageKey: "visits", stageLabel: "Visits", stageOrder: 10, source: "ga4", metricName: "sessions", entityType: "session", channel: "web" },
    { stageKey: "signups", stageLabel: "Signups", stageOrder: 20, source: "ga4", metricName: "signups", entityType: "user", channel: "web" },
    { stageKey: "kyc", stageLabel: "KYC approved", stageOrder: 30, source: "koibox", metricName: "kyc_approved", entityType: "user", channel: "product" },
    { stageKey: "first_transaction", stageLabel: "First transaction", stageOrder: 40, source: "stripe", metricName: "first_payment", entityType: "customer", channel: "product" },
    { stageKey: "gmv", stageLabel: "GMV", stageOrder: 50, source: "stripe", metricName: "gross_revenue", entityType: "customer", channel: "revenue" },
  ],
  saas: [
    { stageKey: "visits", stageLabel: "Visits", stageOrder: 10, source: "ga4", metricName: "sessions", entityType: "session", channel: "web" },
    { stageKey: "signups", stageLabel: "Signups", stageOrder: 20, source: "posthog", metricName: "signups", entityType: "user", channel: "product" },
    { stageKey: "activated", stageLabel: "Activated", stageOrder: 30, source: "posthog", metricName: "activation", entityType: "user", channel: "product" },
    { stageKey: "subscription", stageLabel: "Subscription", stageOrder: 40, source: "stripe", metricName: "subscription_started", entityType: "customer", channel: "revenue" },
  ],
  ecommerce: [
    { stageKey: "visits", stageLabel: "Visits", stageOrder: 10, source: "ga4", metricName: "sessions", entityType: "session", channel: "web" },
    { stageKey: "cart", stageLabel: "Cart", stageOrder: 20, source: "ga4", metricName: "add_to_cart", entityType: "session", channel: "web" },
    { stageKey: "checkout", stageLabel: "Checkout", stageOrder: 30, source: "ga4", metricName: "begin_checkout", entityType: "session", channel: "web" },
    { stageKey: "purchase", stageLabel: "Purchase", stageOrder: 40, source: "stripe", metricName: "purchase", entityType: "customer", channel: "revenue" },
  ],
  fintech: [
    { stageKey: "visits", stageLabel: "Visits", stageOrder: 10, source: "ga4", metricName: "sessions", entityType: "session", channel: "web" },
    { stageKey: "signups", stageLabel: "Signups", stageOrder: 20, source: "posthog", metricName: "signups", entityType: "user", channel: "product" },
    { stageKey: "kyc", stageLabel: "KYC", stageOrder: 30, source: "koibox", metricName: "kyc_approved", entityType: "user", channel: "product" },
    { stageKey: "first_operation", stageLabel: "First operation", stageOrder: 40, source: "stripe", metricName: "first_operation", entityType: "customer", channel: "revenue" },
  ],
};

function normalizeArchetype(archetype?: string | null): string {
  const normalized = String(archetype || "lead-to-sale").toLowerCase().replace(/[\s_]+/g, "-");
  return DEFAULT_STAGE_MAPS[normalized] ? normalized : "lead-to-sale";
}

function normalizeStageMapping(archetype: string, input: FunnelStageMappingInput): FunnelStageMapping {
  const { dimsKey, dimensions } = canonicalMetricDimensions(input.dimensions);
  return {
    ...input,
    archetype,
    dimensions,
    dimsKey,
    enabled: input.enabled ?? true,
    entityType: input.entityType ?? null,
    channel: input.channel ?? null,
    costSource: input.costSource ?? null,
    costMetricName: input.costMetricName ?? null,
    notes: input.notes ?? null,
  };
}

export function getDefaultFunnelStageMap(archetype?: string | null): FunnelStageMapping[] {
  const key = normalizeArchetype(archetype);
  return DEFAULT_STAGE_MAPS[key].map((stage) => normalizeStageMapping(key, stage));
}

export function validateFunnelStageMap(stages: readonly FunnelStageMappingInput[]): string[] {
  const errors: string[] = [];
  const stageKeys = new Set<string>();
  for (const stage of stages) {
    if (!KEY_RE.test(stage.stageKey)) errors.push(`Invalid stage key: ${stage.stageKey}`);
    if (!stage.stageLabel?.trim()) errors.push(`Missing label for stage: ${stage.stageKey}`);
    if (!Number.isInteger(stage.stageOrder) || stage.stageOrder < 0) errors.push(`Invalid order for stage: ${stage.stageKey}`);
    if (!stage.source?.trim()) errors.push(`Missing source for stage: ${stage.stageKey}`);
    if (!stage.metricName?.trim()) errors.push(`Missing metricName for stage: ${stage.stageKey}`);
    if (stageKeys.has(stage.stageKey)) errors.push(`Duplicate stage key: ${stage.stageKey}`);
    stageKeys.add(stage.stageKey);
    try {
      canonicalMetricDimensions(stage.dimensions);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `Invalid dimensions for stage: ${stage.stageKey}`);
    }
  }
  return errors;
}

function stageMapId(slug: string, archetype: string, stage: FunnelStageMapping): string {
  return `mfsm_${stableSemanticId(slug, archetype, stage.stageKey, stage.source, stage.metricName, stage.dimsKey)}`;
}

type StageMapRow = typeof metricFunnelStageMap.$inferInsert;

function stageMapRow(slug: string, stage: FunnelStageMapping): StageMapRow {
  const now = new Date();
  return {
    id: stageMapId(slug, stage.archetype, stage),
    slug,
    archetype: stage.archetype,
    stageKey: stage.stageKey,
    stageLabel: stage.stageLabel,
    stageOrder: stage.stageOrder,
    source: stage.source,
    metricName: stage.metricName,
    dimensions: stage.dimensions,
    dimsKey: stage.dimsKey,
    entityType: stage.entityType ?? null,
    channel: stage.channel ?? null,
    costSource: stage.costSource ?? null,
    costMetricName: stage.costMetricName ?? null,
    enabled: stage.enabled ?? true,
    notes: stage.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function upsertFunnelStageMap(
  slug: string,
  stages: FunnelStageMappingInput[],
  archetype?: string | null,
): Promise<{ configured: boolean; rows: number; errors: string[] }> {
  const errors = validateFunnelStageMap(stages);
  if (errors.length) return { configured: hasDatabase, rows: 0, errors };
  const key = normalizeArchetype(archetype);
  const rows = stages.map((stage) => stageMapRow(slug, normalizeStageMapping(key, stage)));
  if (!hasDatabase) return { configured: false, rows: 0, errors: [] };
  await ensureMetricFunnelStorage();
  await getDb()
    .insert(metricFunnelStageMap)
    .values(rows)
    .onConflictDoUpdate({
      target: metricFunnelStageMap.id,
      set: {
        stageLabel: drizzleSql`excluded."stage_label"`,
        stageOrder: drizzleSql`excluded."stage_order"`,
        dimensions: drizzleSql`excluded."dimensions"`,
        dimsKey: drizzleSql`excluded."dims_key"`,
        entityType: drizzleSql`excluded."entity_type"`,
        channel: drizzleSql`excluded."channel"`,
        costSource: drizzleSql`excluded."cost_source"`,
        costMetricName: drizzleSql`excluded."cost_metric_name"`,
        enabled: drizzleSql`excluded."enabled"`,
        notes: drizzleSql`excluded."notes"`,
        updatedAt: new Date(),
      },
    });
  return { configured: true, rows: rows.length, errors: [] };
}

export async function getFunnelStageMap(
  slug: string,
  archetype?: string | null,
): Promise<{ configured: boolean; archetype: string; stages: FunnelStageMapping[] }> {
  const key = normalizeArchetype(archetype);
  if (!hasDatabase) return { configured: false, archetype: key, stages: getDefaultFunnelStageMap(key) };
  await ensureMetricFunnelStorage();
  const rows = await getDb()
    .select()
    .from(metricFunnelStageMap)
    .where(and(eq(metricFunnelStageMap.slug, slug), eq(metricFunnelStageMap.archetype, key), eq(metricFunnelStageMap.enabled, true)))
    .orderBy(metricFunnelStageMap.stageOrder);
  if (!rows.length) return { configured: true, archetype: key, stages: getDefaultFunnelStageMap(key) };
  return {
    configured: true,
    archetype: key,
    stages: rows.map((row) => ({
      archetype: row.archetype,
      stageKey: row.stageKey,
      stageLabel: row.stageLabel,
      stageOrder: row.stageOrder,
      source: row.source,
      metricName: row.metricName,
      dimensions: row.dimensions ?? null,
      dimsKey: row.dimsKey,
      entityType: row.entityType,
      channel: row.channel,
      costSource: row.costSource,
      costMetricName: row.costMetricName,
      enabled: row.enabled,
      notes: row.notes,
    })),
  };
}

export interface StageRollupInput {
  metricDate: string;
  stageKey: string;
  grain?: "day" | "week" | "month" | "range";
  channel?: string | null;
  count: number;
  value?: number | null;
  cost?: number | null;
  dimensions?: Record<string, unknown> | null;
  qualityStatus?: MetricQualityStatus;
  inputRefs?: Array<Record<string, unknown>>;
}

function assertDate(value: string, field: string): void {
  if (!DATE_RE.test(value)) throw new Error(`${field} must be YYYY-MM-DD`);
}

export function metricStageRollupId(slug: string, input: StageRollupInput, dimsKey?: string): string {
  return `msroll_${stableSemanticId(slug, input.metricDate, input.grain ?? "day", input.stageKey, input.channel ?? "", dimsKey ?? "")}`;
}

type StageRollupRow = typeof metricStageRollups.$inferInsert;

function stageRollupRow(slug: string, input: StageRollupInput, runId?: string | null): StageRollupRow {
  assertDate(input.metricDate, "metricDate");
  if (!KEY_RE.test(input.stageKey)) throw new Error(`Invalid stage key: ${input.stageKey}`);
  const { dimsKey, dimensions } = canonicalMetricDimensions(input.dimensions);
  const now = new Date();
  return {
    id: metricStageRollupId(slug, input, dimsKey),
    slug,
    metricDate: input.metricDate,
    grain: input.grain ?? "day",
    stageKey: input.stageKey,
    channel: input.channel ?? "",
    count: input.count,
    value: input.value ?? null,
    cost: input.cost ?? null,
    dimensions,
    dimsKey,
    qualityStatus: input.qualityStatus ?? "missing",
    inputRefs: input.inputRefs ?? [],
    runId: runId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function upsertStageRollups(
  slug: string,
  rollups: StageRollupInput[],
  options: { runId?: string | null } = {},
): Promise<{ configured: boolean; rows: number }> {
  if (!rollups.length) return { configured: hasDatabase, rows: 0 };
  const rows = rollups.map((rollup) => stageRollupRow(slug, rollup, options.runId));
  if (!hasDatabase) return { configured: false, rows: 0 };
  await ensureMetricFunnelStorage();
  await getDb()
    .insert(metricStageRollups)
    .values(rows)
    .onConflictDoUpdate({
      target: metricStageRollups.id,
      set: {
        count: drizzleSql`excluded."count"`,
        value: drizzleSql`excluded."value"`,
        cost: drizzleSql`excluded."cost"`,
        dimensions: drizzleSql`excluded."dimensions"`,
        dimsKey: drizzleSql`excluded."dims_key"`,
        qualityStatus: drizzleSql`excluded."quality_status"`,
        inputRefs: drizzleSql`excluded."input_refs"`,
        runId: drizzleSql`excluded."run_id"`,
        updatedAt: new Date(),
      },
    });
  return { configured: true, rows: rows.length };
}

export async function getStageRollups(
  slug: string,
  query: { from?: string; to?: string; stageKey?: string; channel?: string } = {},
): Promise<{ configured: boolean; rollups: Array<typeof metricStageRollups.$inferSelect> }> {
  if (!hasDatabase) return { configured: false, rollups: [] };
  await ensureMetricFunnelStorage();
  const conditions = [eq(metricStageRollups.slug, slug)];
  if (query.from) conditions.push(gte(metricStageRollups.metricDate, query.from));
  if (query.to) conditions.push(lte(metricStageRollups.metricDate, query.to));
  if (query.stageKey) conditions.push(eq(metricStageRollups.stageKey, query.stageKey));
  if (query.channel) conditions.push(eq(metricStageRollups.channel, query.channel));
  const rows = await getDb()
    .select()
    .from(metricStageRollups)
    .where(and(...conditions))
    .orderBy(metricStageRollups.metricDate);
  return { configured: true, rollups: rows };
}
