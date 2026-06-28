import {
  and,
  asc,
  eq,
  gte,
  lte,
  sql as drizzleSql,
} from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import {
  metricFunnelStageMap,
  metricSnapshots,
  metricStageRollups,
} from "@/db/schema";
import { ensureMetricsStorage, stableId } from "@/lib/data/metrics-snapshots";
import {
  DEFAULT_FUNNEL_STAGE_DEFINITIONS,
  METRIC_STAGE_ROLLUP_DEFINITION_VERSION,
  buildStageRollupsAvailabilityKpi,
  computeMetricStageRollupsFromSnapshots,
  type ComputedMetricStageRollup,
  type MetricFunnelStageDefinition,
} from "@/lib/metrics/stage-rollups";
import type {
  ComputedMetricKpiValue,
  MetricKpiDefinition,
  MetricKpiSnapshotInput,
} from "@/lib/metrics/semantic-kpis";

export type MetricFunnelStageMapRow = typeof metricFunnelStageMap.$inferSelect;
export type MetricStageRollupRow = typeof metricStageRollups.$inferSelect;

export interface PersistMetricStageRollupsOptions {
  runId?: string | null;
  range: { from: string; to: string };
  snapshots: MetricKpiSnapshotInput[];
  archetype?: string | null;
  definitionVersion?: number | null;
  definitions?: MetricFunnelStageDefinition[];
}

export interface MetricStageRollupReadOptions {
  from: string;
  to: string;
  runId?: string | null;
  definitionVersion?: number | null;
}

const ENSURE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "metric_funnel_stage_map" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "archetype" text DEFAULT 'lead-to-sale' NOT NULL, "stage_id" text NOT NULL, "stage_label" text NOT NULL, "stage_order" integer NOT NULL, "surface" text, "source" text NOT NULL, "metric_name" text NOT NULL, "source_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL, "metric_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL, "dimensions_filter" jsonb DEFAULT '{}'::jsonb NOT NULL, "channel" text, "aggregation" text DEFAULT 'sum' NOT NULL, "quality_override" text, "enabled" boolean DEFAULT true NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_funnel_stage_map_slug_idx" ON "metric_funnel_stage_map" ("slug")`,
  `CREATE INDEX IF NOT EXISTS "metric_funnel_stage_map_slug_stage_idx" ON "metric_funnel_stage_map" ("slug", "stage_id")`,
  `CREATE TABLE IF NOT EXISTS "metric_stage_rollups" ("id" text PRIMARY KEY NOT NULL, "run_id" text, "map_id" text, "slug" text NOT NULL, "stage_id" text NOT NULL, "stage_label" text NOT NULL, "stage_order" integer NOT NULL, "stage_date" text NOT NULL, "channel" text NOT NULL, "surface" text, "source" text NOT NULL, "metric_name" text NOT NULL, "value" real NOT NULL, "quality_status" text NOT NULL, "provenance_label" text NOT NULL, "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL, "range_from" text NOT NULL, "range_to" text NOT NULL, "definition_version" integer, "computed_at" timestamp DEFAULT now() NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_date_idx" ON "metric_stage_rollups" ("slug", "stage_date")`,
  `CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_stage_idx" ON "metric_stage_rollups" ("slug", "stage_id")`,
  `CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_channel_idx" ON "metric_stage_rollups" ("slug", "channel")`,
  `CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_range_idx" ON "metric_stage_rollups" ("slug", "range_from", "range_to")`,
];

let ensurePromise: Promise<void> | null = null;

export async function ensureMetricStageRollupStorage(): Promise<void> {
  if (!hasDatabase) return;
  await ensureMetricsStorage();
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

export function metricStageRollupStorageConfigured(): boolean {
  return hasDatabase;
}

export async function listMetricStageRollups(
  slug: string,
  opts: MetricStageRollupReadOptions,
): Promise<MetricStageRollupRow[]> {
  if (!hasDatabase) return [];
  if (!slug) throw new Error("slug is required to read metric stage rollups");
  if (!opts.from || !opts.to || opts.from > opts.to) {
    throw new Error(`Invalid metric stage rollup range: ${opts.from}..${opts.to}`);
  }
  await ensureMetricStageRollupStorage();
  const conditions = [
    eq(metricStageRollups.slug, slug),
    eq(metricStageRollups.rangeFrom, opts.from),
    eq(metricStageRollups.rangeTo, opts.to),
  ];
  if (opts.runId) conditions.push(eq(metricStageRollups.runId, opts.runId));
  if (typeof opts.definitionVersion === "number") {
    conditions.push(eq(metricStageRollups.definitionVersion, opts.definitionVersion));
  }

  return getDb()
    .select()
    .from(metricStageRollups)
    .where(and(...conditions))
    .orderBy(
      asc(metricStageRollups.stageOrder),
      asc(metricStageRollups.stageDate),
      asc(metricStageRollups.channel),
      asc(metricStageRollups.source),
    );
}

function defaultMapId(slug: string, definition: MetricFunnelStageDefinition) {
  return `mfsm_${stableId(slug, definition.mapId)}`;
}

function toMapDefinition(
  row: MetricFunnelStageMapRow,
): MetricFunnelStageDefinition {
  return {
    mapId: row.id,
    stageId: row.stageId as MetricFunnelStageDefinition["stageId"],
    stageLabel: row.stageLabel,
    stageOrder: row.stageOrder,
    surface: row.surface
      ? (row.surface as MetricFunnelStageDefinition["surface"])
      : undefined,
    source: row.source,
    sourceAliases: row.sourceAliases,
    metric: row.metricName,
    metricAliases: row.metricAliases,
    dimensionsFilter: row.dimensionsFilter,
    channel: row.channel ?? undefined,
    aggregation: row.aggregation as MetricFunnelStageDefinition["aggregation"],
    qualityOverride: row.qualityOverride
      ? (row.qualityOverride as MetricFunnelStageDefinition["qualityOverride"])
      : undefined,
    enabled: row.enabled,
  };
}

export async function seedMetricFunnelStageMap(
  slug: string,
  opts: {
    archetype?: string | null;
    definitions?: MetricFunnelStageDefinition[];
  } = {},
): Promise<MetricFunnelStageMapRow[]> {
  if (!hasDatabase) return [];
  if (!slug) throw new Error("slug is required to seed metric funnel stage map");
  await ensureMetricStageRollupStorage();
  const database = getDb();
  const now = new Date();
  const archetype = opts.archetype || "lead-to-sale";
  const definitions = opts.definitions ?? DEFAULT_FUNNEL_STAGE_DEFINITIONS;

  if (definitions.length) {
    await database
      .insert(metricFunnelStageMap)
      .values(
        definitions.map((definition) => ({
          id: defaultMapId(slug, definition),
          slug,
          archetype,
          stageId: definition.stageId,
          stageLabel: definition.stageLabel,
          stageOrder: definition.stageOrder,
          surface: definition.surface ?? null,
          source: definition.source,
          metricName: definition.metric,
          sourceAliases: definition.sourceAliases ?? [],
          metricAliases: definition.metricAliases ?? [],
          dimensionsFilter: definition.dimensionsFilter ?? {},
          channel: definition.channel ?? null,
          aggregation: definition.aggregation ?? "sum",
          qualityOverride: definition.qualityOverride ?? null,
          enabled: definition.enabled !== false,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();
  }

  return database
    .select()
    .from(metricFunnelStageMap)
    .where(and(eq(metricFunnelStageMap.slug, slug), eq(metricFunnelStageMap.enabled, true)));
}

function toInputRefs(
  rollup: ComputedMetricStageRollup,
): Array<Record<string, unknown>> {
  return rollup.inputRefs.map((ref) => ({
    id: ref.id,
    source: ref.source,
    metricName: ref.metricName,
    metricDate: ref.metricDate,
    dimensions: ref.dimensions,
  }));
}

function stageRollupId(slug: string, rollup: ComputedMetricStageRollup): string {
  return `msroll_${stableId(
    slug,
    rollup.range.from,
    rollup.range.to,
    rollup.stageDate,
    rollup.mapId,
    rollup.channel,
  )}`;
}

export async function persistMetricStageRollupsForSnapshots(
  slug: string,
  opts: PersistMetricStageRollupsOptions,
): Promise<ComputedMetricStageRollup[]> {
  if (!hasDatabase) return [];
  if (!slug) throw new Error("slug is required to compute metric stage rollups");
  await ensureMetricStageRollupStorage();
  const database = getDb();
  const definitionVersion =
    opts.definitionVersion ?? METRIC_STAGE_ROLLUP_DEFINITION_VERSION;
  const mapRows = await seedMetricFunnelStageMap(slug, {
    archetype: opts.archetype,
    definitions: opts.definitions,
  });
  const definitions = mapRows.map(toMapDefinition);
  const rollups = computeMetricStageRollupsFromSnapshots(
    opts.snapshots,
    opts.range,
    definitions,
  );
  const now = new Date();

  await database
    .delete(metricStageRollups)
    .where(
      and(
        eq(metricStageRollups.slug, slug),
        eq(metricStageRollups.rangeFrom, opts.range.from),
        eq(metricStageRollups.rangeTo, opts.range.to),
        eq(metricStageRollups.definitionVersion, definitionVersion),
      ),
    );

  if (rollups.length) {
    await database.insert(metricStageRollups).values(
      rollups.map((rollup) => ({
        id: stageRollupId(slug, rollup),
        runId: opts.runId ?? null,
        mapId: rollup.mapId,
        slug,
        stageId: rollup.stageId,
        stageLabel: rollup.stageLabel,
        stageOrder: rollup.stageOrder,
        stageDate: rollup.stageDate,
        channel: rollup.channel,
        surface: rollup.surface ?? null,
        source: rollup.source,
        metricName: rollup.metricName,
        value: rollup.value,
        qualityStatus: rollup.qualityStatus,
        provenanceLabel: rollup.provenanceLabel,
        inputRefs: toInputRefs(rollup),
        dimensions: rollup.dimensions,
        rangeFrom: opts.range.from,
        rangeTo: opts.range.to,
        definitionVersion,
        computedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  return rollups;
}

export async function computeMetricStageRollups(
  slug: string,
  opts: {
    from: string;
    to: string;
    runId?: string | null;
    archetype?: string | null;
    definitionVersion?: number | null;
    definitions?: MetricFunnelStageDefinition[];
  },
): Promise<ComputedMetricStageRollup[]> {
  if (!hasDatabase) return [];
  await ensureMetricStageRollupStorage();
  const rawRows = await getDb()
    .select({
      id: metricSnapshots.id,
      source: metricSnapshots.source,
      metricName: metricSnapshots.metricName,
      value: metricSnapshots.value,
      valueText: metricSnapshots.valueText,
      metricDate: metricSnapshots.metricDate,
      dimensions: metricSnapshots.dimensions,
      dimsKey: metricSnapshots.dimsKey,
      collectedAt: metricSnapshots.collectedAt,
      ingestRunId: metricSnapshots.ingestRunId,
    })
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.slug, slug),
        gte(metricSnapshots.metricDate, opts.from),
        lte(metricSnapshots.metricDate, opts.to),
      ),
    );
  const snapshots: MetricKpiSnapshotInput[] = rawRows.map((row) => ({
    id: row.id,
    source: row.source,
    metricName: row.metricName,
    value: row.value == null ? null : Number(row.value),
    valueText: row.valueText,
    metricDate: row.metricDate,
    dimensions: row.dimensions,
    dimsKey: row.dimsKey,
    collectedAt: row.collectedAt,
    ingestRunId: row.ingestRunId,
  }));
  return persistMetricStageRollupsForSnapshots(slug, {
    runId: opts.runId,
    range: { from: opts.from, to: opts.to },
    snapshots,
    archetype: opts.archetype,
    definitionVersion: opts.definitionVersion,
    definitions: opts.definitions,
  });
}

export function replaceStageRollupAvailabilityKpi(
  values: ComputedMetricKpiValue[],
  rollups: ComputedMetricStageRollup[],
  range: { from: string; to: string },
): ComputedMetricKpiValue[] {
  const index = values.findIndex(
    (value) => value.kpiId === "conversion.stage_rollups",
  );
  if (index < 0) return values;
  const definition = values[index].definition as MetricKpiDefinition;
  const next = [...values];
  next[index] = buildStageRollupsAvailabilityKpi(rollups, range, definition);
  return next;
}
