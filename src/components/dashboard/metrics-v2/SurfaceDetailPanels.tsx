import { useMemo, type ReactNode } from "react";
import type {
  MetricKpiQualityStatus,
  MetricKpiValue,
  MetricStageRollupResult,
  SurfaceDetailMetric,
  SurfaceDetailQuality,
  SurfaceDetailResult,
} from "@/hooks/useMetrics";

type DetailLoadState = "loading" | "error" | "empty" | "partial" | "ready";

interface SurfacePanelProps {
  kpis: MetricKpiValue[];
  detail?: SurfaceDetailResult;
  isLoading?: boolean;
  hasError?: boolean;
}

interface FlatDetailMetric extends SurfaceDetailMetric {
  source: string;
}

interface DetailEntity {
  id: string;
  source: string;
  dimensions: Record<string, string>;
  metrics: Map<string, FlatDetailMetric>;
}

interface KpiSpec {
  ids: string[];
  label: string;
}

interface TableColumn<Row> {
  key: string;
  label: string;
  numeric?: boolean;
  render: (row: Row) => ReactNode;
}

const INTEGER_FORMAT = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const DECIMAL_FORMAT = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const QUALITY_LABEL: Record<MetricKpiQualityStatus | SurfaceDetailQuality, string> = {
  ok: "REAL",
  partial: "PARCIAL",
  missing: "SIN DATO",
  dirty: "REVISAR",
  stale: "DESACTUALIZADO",
  demo: "DEMO",
};

const SOURCE_LABELS: Record<string, string> = {
  ga4: "GA4",
  gsc: "Search Console",
  pagespeed: "PageSpeed",
  meta_ads: "Meta Ads",
  metaads: "Meta Ads",
  google_ads: "Google Ads",
  googleads: "Google Ads",
  ghl: "GoHighLevel",
  posthog: "PostHog",
  metricool: "Metricool",
};

const SOURCE_CANONICAL: Record<string, string> = {
  ga4: "ga4",
  googleanalytics: "ga4",
  gsc: "gsc",
  googlesearchconsole: "gsc",
  pagespeed: "pagespeed",
  pagespeedinsights: "pagespeed",
  meta: "meta_ads",
  metaads: "meta_ads",
  google: "google_ads",
  googleads: "google_ads",
  ghl: "ghl",
  gohighlevel: "ghl",
  posthog: "posthog",
  metricool: "metricool",
};

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function sourceLabel(source: string): string {
  return SOURCE_LABELS[canonicalSource(source)] ?? source;
}

function canonicalSource(source: string): string {
  const key = normalized(source);
  return SOURCE_CANONICAL[key] ?? key;
}

function detailRows(detail?: SurfaceDetailResult): FlatDetailMetric[] {
  return detail?.sources.flatMap((entry) =>
    entry.metrics.map((metric) => ({ ...metric, source: entry.source }))) ?? [];
}

function dimension(
  row: Pick<FlatDetailMetric, "dimensions"> | Pick<DetailEntity, "dimensions">,
  aliases: string[],
): string | null {
  const dimensions = row.dimensions;
  if (!dimensions) return null;
  const wanted = new Set(aliases.map(normalized));
  const match = Object.entries(dimensions).find(([key]) => wanted.has(normalized(key)));
  const value = match?.[1]?.trim();
  return value ? value : null;
}

function hasDimension(row: FlatDetailMetric, aliases: string[]): boolean {
  return dimension(row, aliases) != null;
}

function groupEntities(
  rows: FlatDetailMetric[],
  predicate: (row: FlatDetailMetric) => boolean,
): DetailEntity[] {
  const entities = new Map<string, DetailEntity>();
  for (const row of rows) {
    if (!predicate(row) || !row.dimensions) continue;
    const dimensionEntries = Object.entries(row.dimensions)
      .filter(([, value]) => value.trim() !== "")
      .sort(([left], [right]) => left.localeCompare(right));
    const id = JSON.stringify([canonicalSource(row.source), dimensionEntries]);
    const existing = entities.get(id) ?? {
      id,
      source: row.source,
      dimensions: Object.fromEntries(dimensionEntries),
      metrics: new Map<string, FlatDetailMetric>(),
    };
    existing.metrics.set(normalized(row.metric), row);
    entities.set(id, existing);
  }
  return [...entities.values()];
}

function entityMetric(entity: DetailEntity, aliases: string[]): FlatDetailMetric | null {
  for (const alias of aliases) {
    const metric = entity.metrics.get(normalized(alias));
    if (metric) return metric;
  }
  return null;
}

function entityQuality(entity: DetailEntity): SurfaceDetailQuality {
  const qualities = [...entity.metrics.values()].map((metric) => metric.quality);
  if (qualities.includes("dirty")) return "dirty";
  if (qualities.includes("stale")) return "stale";
  if (qualities.includes("demo")) return qualities.every((quality) => quality === "demo") ? "demo" : "partial";
  if (qualities.includes("partial")) return "partial";
  return "ok";
}

function kpiById(kpis: MetricKpiValue[], ids: string[]): MetricKpiValue | null {
  const wanted = new Set(ids.map(normalized));
  return kpis.find((kpi) => wanted.has(normalized(kpi.kpiId)) || wanted.has(normalized(kpi.id))) ?? null;
}

function kpiDisplay(kpi: MetricKpiValue | null): string {
  if (!kpi || kpi.qualityStatus === "missing") return "-";
  if (kpi.value == null && !kpi.valueText) return "-";
  const display = kpi.displayValue?.trim();
  if (display) return display;
  if (kpi.value != null) return DECIMAL_FORMAT.format(kpi.value);
  return kpi.valueText?.trim() ? kpi.valueText : "-";
}

function formatValue(
  value: number | null | undefined,
  kind: "integer" | "decimal" | "percent" | "ratio" = "integer",
): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (kind === "percent") return DECIMAL_FORMAT.format(value) + "%";
  if (kind === "ratio") return DECIMAL_FORMAT.format(value) + "×";
  return kind === "decimal" ? DECIMAL_FORMAT.format(value) : INTEGER_FORMAT.format(value);
}

function numericDimension(dimensions: Record<string, string>, aliases: string[]): number | null {
  const raw = dimension({ dimensions }, aliases);
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function qualityClass(quality: MetricKpiQualityStatus | SurfaceDetailQuality): string {
  if (quality === "demo") return "demo";
  if (quality === "partial" || quality === "dirty" || quality === "stale") return "warn";
  if (quality === "missing") return "missing";
  return "ok";
}

function QualityChip({
  quality,
  provenance,
}: {
  quality: MetricKpiQualityStatus | SurfaceDetailQuality;
  provenance?: string | null;
}) {
  return (
    <span
      className={"m-quality-badge " + qualityClass(quality)}
      title={provenance ? "Origen: " + provenance : undefined}
    >
      {QUALITY_LABEL[quality]}
    </span>
  );
}

function DetailStatus({
  detail,
  isLoading,
  hasError,
}: {
  detail?: SurfaceDetailResult;
  isLoading?: boolean;
  hasError?: boolean;
}) {
  const rows = useMemo(() => detailRows(detail), [detail]);
  const coverageGaps = detail?.sources.filter((entry) => {
    const coverage = entry.coverage;
    return Boolean(
      coverage?.enabled
      && (coverage.missingDates.length > 0
        || coverage.failedDates.length > 0
        || (coverage.ratio != null && coverage.ratio < 1)),
    );
  }) ?? [];
  const incomplete = detail?.complete === false;
  let state: DetailLoadState = "ready";
  if (isLoading) state = "loading";
  else if (hasError) state = "error";
  else if (!rows.length) state = "empty";
  if (!isLoading && !hasError && (incomplete || coverageGaps.length > 0 || rows.some((row) => row.quality !== "ok"))) {
    state = "partial";
  }

  const qualities = new Set(rows.map((row) => row.quality));
  const completenessReason = detail?.completeness?.reason === "row_limit"
    ? "se alcanzó el límite de filas"
    : detail?.completeness?.reason === "group_limit"
      ? "se alcanzó el límite de grupos"
      : detail?.completeness?.reason === "storage_unconfigured"
        ? "el almacenamiento no está configurado"
        : "la lectura no puede considerarse exhaustiva";
  const coverageSources = coverageGaps.map((entry) => sourceLabel(entry.source)).join(" · ");
  const label = state === "loading"
    ? "Cargando detalle de proveedor…"
    : state === "error"
      ? "No se pudo cargar el desglose. Los KPIs agregados permanecen visibles."
      : state === "empty"
        ? "Sin desglose dimensionado para este rango."
        : incomplete
            ? "LECTURA INCOMPLETA · " + completenessReason
            : coverageGaps.length > 0
              ? "COBERTURA PARCIAL · faltan fechas de " + coverageSources
              : qualities.size === 1 && qualities.has("demo")
                ? "DEMO · detalle no procedente de una integración real"
          : state === "partial"
            ? "DETALLE PARCIAL · hay filas que requieren revisión"
            : "DETALLE REAL · " + rows.length + " filas observadas";

  return (
    <div
      className={"m-detail-status " + state}
      data-surface-detail-complete={detail ? String(detail.complete !== false) : undefined}
      data-surface-detail-state={state}
      role="status"
    >
      <span aria-hidden="true" />
      <b>{label}</b>
      {detail?.from && detail?.to ? <small>{detail.from} → {detail.to}</small> : null}
    </div>
  );
}

function KpiRail({ kpis, specs }: { kpis: MetricKpiValue[]; specs: KpiSpec[] }) {
  return (
    <div className="m-detail-kpi-grid">
      {specs.map((spec) => {
        const kpi = kpiById(kpis, spec.ids);
        const quality = kpi?.qualityStatus ?? "missing";
        return (
          <article className="m-detail-kpi" data-kpi-id={kpi?.kpiId ?? spec.ids[0]} key={spec.ids[0]}>
            <div className="m-detail-kpi-label">{kpi?.label ?? spec.label}</div>
            <div className="m-detail-kpi-value">{kpiDisplay(kpi)}</div>
            <div className="m-detail-kpi-foot">
              <QualityChip quality={quality} provenance={kpi?.provenanceLabel} />
              <span>{kpi?.source ? sourceLabel(kpi.source) : "Sin fuente"}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DetailSection({
  number,
  title,
  note,
  children,
}: {
  number: string;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="m-detail-section">
      <header>
        <span>{number}</span>
        <div>
          <h3>{title}</h3>
          <p>{note}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function EmptyDetail({ children }: { children: ReactNode }) {
  return <div className="m-panel m-pad m-detail-empty">{children}</div>;
}

function DataTable<Row>({
  label,
  rows,
  columns,
  rowKey,
  empty,
  totalRows,
}: {
  label: string;
  rows: Row[];
  columns: TableColumn<Row>[];
  rowKey: (row: Row) => string;
  empty: string;
  totalRows?: number;
}) {
  if (!rows.length) return <EmptyDetail>{empty}</EmptyDetail>;
  return (
    <div className="m-panel m-detail-table-wrap">
      {totalRows != null && totalRows > rows.length ? (
        <div className="m-detail-table-limit">
          Mostrando {rows.length} de {totalRows} filas ordenadas · límite visual de esta tabla
        </div>
      ) : null}
      <table className="m-detail-table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.numeric ? "num" : undefined}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? "num" : undefined}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function metricCell(
  entity: DetailEntity,
  aliases: string[],
  kind: "integer" | "decimal" | "percent" | "ratio" = "integer",
): string {
  return formatValue(entityMetric(entity, aliases)?.value, kind);
}

function sortByMetric(entities: DetailEntity[], metric: string): DetailEntity[] {
  return [...entities].sort((left, right) => {
    const leftValue = entityMetric(left, [metric])?.value;
    const rightValue = entityMetric(right, [metric])?.value;
    if (leftValue == null && rightValue == null) return left.id.localeCompare(right.id);
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    return rightValue - leftValue;
  });
}

const PAID_KPIS: KpiSpec[] = [
  { ids: ["paid.meta.spend"], label: "Meta · inversión" },
  { ids: ["paid.meta.cpc"], label: "Meta · CPC" },
  { ids: ["paid.meta.conversions"], label: "Meta · conversiones" },
  { ids: ["paid.meta.roas"], label: "Meta · ROAS" },
  { ids: ["paid.google.spend"], label: "Google · inversión" },
  { ids: ["paid.google.cpc"], label: "Google · CPC" },
  { ids: ["paid.google.conversions"], label: "Google · conversiones" },
  { ids: ["paid.google.roas"], label: "Google · ROAS" },
];

interface PaidEntityRow {
  entity: DetailEntity;
  level: string;
  name: string;
}

function paidColumns(): TableColumn<PaidEntityRow>[] {
  return [
    { key: "source", label: "Proveedor", render: (row) => sourceLabel(row.entity.source) },
    { key: "level", label: "Nivel", render: (row) => row.level },
    { key: "name", label: "Entidad", render: (row) => <b>{row.name}</b> },
    { key: "spend", label: "Gasto · moneda cuenta", numeric: true, render: (row) => metricCell(row.entity, ["spend"], "decimal") },
    { key: "impressions", label: "Impr.", numeric: true, render: (row) => metricCell(row.entity, ["impressions"]) },
    { key: "clicks", label: "Clicks", numeric: true, render: (row) => metricCell(row.entity, ["clicks"]) },
    { key: "ctr", label: "CTR", numeric: true, render: (row) => metricCell(row.entity, ["ctr"], "percent") },
    { key: "conversions", label: "Conv./leads", numeric: true, render: (row) => metricCell(row.entity, ["conversions", "leads"]) },
    { key: "roas", label: "ROAS", numeric: true, render: (row) => metricCell(row.entity, ["roas"], "ratio") },
    { key: "quality", label: "Calidad", render: (row) => <QualityChip quality={entityQuality(row.entity)} provenance={sourceLabel(row.entity.source)} /> },
  ];
}

function paidEntities(rows: FlatDetailMetric[], kind: "campaign" | "adset" | "ad" | "placement" | "audience"): PaidEntityRow[] {
  const aliases = [kind];
  const entities = groupEntities(rows, (row) => {
    if (!hasDimension(row, aliases)) return false;
    if (kind === "campaign" && (hasDimension(row, ["adset"]) || hasDimension(row, ["ad"]))) return false;
    if (kind === "adset" && hasDimension(row, ["ad"])) return false;
    return true;
  });
  const level = kind === "campaign"
    ? "Campaña"
    : kind === "adset"
      ? "Ad set"
      : kind === "ad"
        ? "Creatividad"
        : kind === "placement"
          ? "Placement"
          : "Audiencia";
  return sortByMetric(entities, "spend").map((entity) => ({
    entity,
    level,
    name: dimension(entity, aliases) ?? "-",
  }));
}

export function PaidSurfacePanel(props: SurfacePanelProps) {
  const rows = useMemo(() => detailRows(props.detail), [props.detail]);
  const allCampaignRows = useMemo(() => paidEntities(rows, "campaign"), [rows]);
  const allAdsetRows = useMemo(() => paidEntities(rows, "adset"), [rows]);
  const allAdRows = useMemo(() => paidEntities(rows, "ad"), [rows]);
  const allPlacementRows = useMemo(() => paidEntities(rows, "placement"), [rows]);
  const allAudienceRows = useMemo(() => paidEntities(rows, "audience"), [rows]);
  return (
    <div data-surface-renderer="paid">
      <DetailStatus detail={props.detail} isLoading={props.isLoading} hasError={props.hasError} />
      <DetailSection
        number="01"
        title="Economía de adquisición"
        note="KPIs semánticos separados por proveedor; no se suman conversiones ni ROAS entre plataformas."
      >
        <KpiRail kpis={props.kpis} specs={PAID_KPIS} />
      </DetailSection>
      <DetailSection
        number="02"
        title="Campañas"
        note="Filas dimensionadas reales de Meta Ads y Google Ads. El límite de esta tabla no oculta ad sets ni creatividades."
      >
        <DataTable
          label="Rendimiento Paid por campaña"
          rows={allCampaignRows.slice(0, 30)}
          columns={paidColumns()}
          rowKey={(row) => row.level + row.entity.id}
          empty="Sin campañas dimensionadas en este rango."
          totalRows={allCampaignRows.length}
        />
      </DetailSection>
      <DetailSection
        number="03"
        title="Ad sets"
        note="Cada nivel conserva su propio cupo, incluso cuando la cuenta supera 30 campañas."
      >
        <DataTable
          label="Rendimiento Paid por ad set"
          rows={allAdsetRows.slice(0, 30)}
          columns={paidColumns()}
          rowKey={(row) => row.level + row.entity.id}
          empty="Sin ad sets dimensionados en este rango."
          totalRows={allAdsetRows.length}
        />
      </DetailSection>
      <DetailSection
        number="04"
        title="Creatividades"
        note="Un guion significa que el proveedor no devolvió ese campo; no se inventan thumbnails ni atributos."
      >
        <DataTable
          label="Rendimiento Paid por creatividad"
          rows={allAdRows.slice(0, 30)}
          columns={paidColumns()}
          rowKey={(row) => row.level + row.entity.id}
          empty="Sin creatividades dimensionadas en este rango."
          totalRows={allAdRows.length}
        />
      </DetailSection>
      <DetailSection
        number="05"
        title="Placement"
        note="Se muestra solo cuando Meta entrega la dimensión de placement."
      >
        <DataTable
          label="Rendimiento Paid por placement"
          rows={allPlacementRows.slice(0, 24)}
          columns={paidColumns()}
          rowKey={(row) => row.level + row.entity.id}
          empty="Sin breakdown de placement para este rango."
          totalRows={allPlacementRows.length}
        />
      </DetailSection>
      <DetailSection
        number="06"
        title="Audiencias"
        note="Se muestra solo cuando Meta entrega la dimensión; no se infieren segmentos ausentes."
      >
        <DataTable
          label="Rendimiento Paid por audiencia"
          rows={allAudienceRows.slice(0, 24)}
          columns={paidColumns()}
          rowKey={(row) => row.level + row.entity.id}
          empty="Sin breakdown de audiencia para este rango."
          totalRows={allAudienceRows.length}
        />
      </DetailSection>
    </div>
  );
}

const PIPELINE_KPIS: KpiSpec[] = [
  { ids: ["pipeline.ghl.contacts"], label: "Contactos totales" },
  { ids: ["pipeline.ghl.new_contacts"], label: "Contactos nuevos" },
  { ids: ["pipeline.ghl.appointments"], label: "Reuniones" },
  { ids: ["pipeline.ghl.opportunities"], label: "Oportunidades" },
  { ids: ["pipeline.ghl.pipeline_value"], label: "Valor de oportunidades" },
];

interface PipelineStageRow {
  id: string;
  pipeline: string;
  label: string;
  order: number | null;
  value: number;
  quality: SurfaceDetailQuality;
  source: string;
}

function parsePipelineStages(row: FlatDetailMetric): PipelineStageRow[] {
  if (normalized(row.metric) !== "pipeline" || !row.dimensions) return [];
  const rawStages = dimension(row, ["stages"]);
  if (!rawStages || !rawStages.startsWith("[")) return [];
  try {
    const parsed: unknown = JSON.parse(rawStages);
    if (!Array.isArray(parsed)) return [];
    const pipeline = dimension(row, ["pipelineName", "pipeline"]) ?? "Pipeline";
    return parsed.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const value = Number(record.count);
      if (!Number.isFinite(value)) return [];
      const label = String(record.name ?? record.label ?? "").trim();
      if (!label) return [];
      return [{
        id: row.source + ":" + pipeline + ":" + String(record.id ?? label),
        pipeline,
        label,
        order: Number.isFinite(Number(record.order)) ? Number(record.order) : index + 1,
        value,
        quality: row.quality,
        source: row.source,
      }];
    });
  } catch {
    return [];
  }
}

function detailPipelineStages(rows: FlatDetailMetric[]): PipelineStageRow[] {
  const flat = rows.flatMap((row) => {
    const stageName = dimension(row, ["stageName", "pipelineStageName", "stage"]);
    const isStageMetric = ["pipelinestage", "pipeline_stage", "stagecount"]
      .map(normalized)
      .includes(normalized(row.metric));
    if (!stageName || !isStageMetric) return [];
    const orderRaw = dimension(row, ["stageOrder", "order"]);
    const orderValue = orderRaw == null ? null : Number(orderRaw);
    return [{
      id: JSON.stringify([row.source, row.metric, row.dimensions]),
      pipeline: dimension(row, ["pipelineName", "pipeline"]) ?? "Pipeline",
      label: stageName,
      order: orderValue != null && Number.isFinite(orderValue) ? orderValue : null,
      value: row.value,
      quality: row.quality,
      source: row.source,
    }];
  });
  const nested = rows.flatMap(parsePipelineStages);
  return [...flat, ...nested].sort((left, right) => {
    const pipelineOrder = left.pipeline.localeCompare(right.pipeline);
    if (pipelineOrder !== 0) return pipelineOrder;
    if (left.order == null && right.order == null) return left.label.localeCompare(right.label);
    if (left.order == null) return 1;
    if (right.order == null) return -1;
    return left.order - right.order;
  });
}

function rollupPipelineStages(stageRollups?: MetricStageRollupResult): PipelineStageRow[] {
  if (!stageRollups?.available) return [];
  return stageRollups.stages.flatMap((stage) => {
    const sources = stage.sources.map(canonicalSource).filter(Boolean);
    if (!sources.length || sources.some((source) => source !== "ghl") || stage.value == null) return [];
    if (stage.qualityStatus === "missing") return [];
    return [{
      id: "rollup:" + stage.stageId,
      pipeline: "Stage rollup GHL",
      label: stage.label,
      order: stage.order,
      value: stage.value,
      quality: stage.qualityStatus,
      source: "ghl",
    }];
  });
}

function PipelineWaterfall({ stages }: { stages: PipelineStageRow[] }) {
  if (!stages.length) {
    return (
      <EmptyDetail>
        Sin stage waterfall utilizable. Se necesitan filas GHL con stage, orden y count; una dimensión serializada como texto no se presenta como dato real.
      </EmptyDetail>
    );
  }
  const maximum = Math.max(...stages.map((stage) => stage.value));
  return (
    <div className="m-panel m-provider-funnel" aria-label="Stage waterfall de Pipeline">
      {stages.map((stage) => {
        const width = maximum > 0 ? Math.max(4, Math.round((stage.value / maximum) * 100)) : 0;
        return (
          <div className="m-provider-funnel-row" key={stage.id}>
            <div className="m-provider-funnel-label">
              <b>{stage.label}</b>
              <small>{stage.pipeline} · {sourceLabel(stage.source)}</small>
            </div>
            <div className="m-provider-funnel-track">
              <span style={{ width: width + "%" }} />
              <b>{formatValue(stage.value)}</b>
            </div>
            <QualityChip quality={stage.quality} provenance={sourceLabel(stage.source)} />
          </div>
        );
      })}
    </div>
  );
}

interface NamedEntityRow {
  entity: DetailEntity;
  name: string;
}

function namedEntityRows(
  rows: FlatDetailMetric[],
  metric: string,
  dimensionAliases: string[],
): NamedEntityRow[] {
  return sortByMetric(
    groupEntities(rows, (row) =>
      normalized(row.metric) === normalized(metric) && hasDimension(row, dimensionAliases)),
    metric,
  ).map((entity) => ({
    entity,
    name: dimension(entity, dimensionAliases) ?? "-",
  }));
}

function singleMetricColumns(metric: string, metricLabel: string): TableColumn<NamedEntityRow>[] {
  return [
    { key: "source", label: "Proveedor", render: (row) => sourceLabel(row.entity.source) },
    { key: "name", label: "Dimensión", render: (row) => <b>{row.name}</b> },
    { key: "value", label: metricLabel, numeric: true, render: (row) => metricCell(row.entity, [metric]) },
    { key: "quality", label: "Calidad", render: (row) => <QualityChip quality={entityQuality(row.entity)} provenance={sourceLabel(row.entity.source)} /> },
  ];
}

export function PipelineSurfacePanel(
  props: SurfacePanelProps & { stageRollups?: MetricStageRollupResult },
) {
  const rows = useMemo(() => detailRows(props.detail), [props.detail]);
  const stages = useMemo(() => {
    const direct = detailPipelineStages(rows);
    return direct.length ? direct : rollupPipelineStages(props.stageRollups);
  }, [props.stageRollups, rows]);
  const channels = useMemo(
    () => namedEntityRows(rows, "newContacts", ["channel"]),
    [rows],
  );
  const appointmentStatuses = useMemo(
    () => namedEntityRows(rows, "appointments", ["status"]),
    [rows],
  );
  return (
    <div data-surface-renderer="pipeline">
      <DetailStatus detail={props.detail} isLoading={props.isLoading} hasError={props.hasError} />
      <DetailSection
        number="01"
        title="Pulso de CRM"
        note="Contactos, reuniones y oportunidades son cifras propias de GoHighLevel para el rango seleccionado."
      >
        <KpiRail kpis={props.kpis} specs={PIPELINE_KPIS} />
      </DetailSection>
      <DetailSection
        number="02"
        title="Stage waterfall real"
        note="Solo se dibujan etapas observadas en GHL o rollups persistidos cuyo único origen sea GHL."
      >
        <PipelineWaterfall stages={stages} />
      </DetailSection>
      <div className="m-detail-split">
        <DetailSection
          number="03"
          title="Origen de contactos"
          note="Breakdown de newContacts por canal reportado."
        >
          <DataTable
            label="Contactos GHL por canal"
            rows={channels}
            columns={singleMetricColumns("newContacts", "Contactos")}
            rowKey={(row) => row.entity.id}
            empty="Sin desglose de contactos por canal."
          />
        </DetailSection>
        <DetailSection
          number="04"
          title="Estado de reuniones"
          note="Eventos de calendario agrupados por status de GHL."
        >
          <DataTable
            label="Reuniones GHL por estado"
            rows={appointmentStatuses}
            columns={singleMetricColumns("appointments", "Reuniones")}
            rowKey={(row) => row.entity.id}
            empty="Sin desglose de reuniones por estado."
          />
        </DetailSection>
      </div>
    </div>
  );
}

const PRODUCT_KPIS: KpiSpec[] = [
  { ids: ["product.pageviews"], label: "Pageviews" },
  { ids: ["product.activation_events"], label: "Eventos de activación" },
  { ids: ["product.activation_rate"], label: "Activación / 100 pageviews" },
  { ids: ["product.north_star_weekly"], label: "Eventos North Star" },
];

interface ProductStep {
  id: string;
  label: string;
  order: number | null;
  value: number;
  quality: SurfaceDetailQuality;
  source: string;
}

function productSteps(rows: FlatDetailMetric[]): ProductStep[] {
  return rows
    .filter((row) =>
      canonicalSource(row.source) === "posthog"
      && normalized(row.metric) === "funnelstepreached"
      && dimension(row, ["step"]) != null)
    .map((row) => {
      const rawOrder = dimension(row, ["order"]);
      const parsedOrder = rawOrder == null ? null : Number(rawOrder);
      return {
        id: JSON.stringify([row.source, row.metric, row.dimensions]),
        label: dimension(row, ["step"]) ?? "-",
        order: parsedOrder != null && Number.isFinite(parsedOrder) ? parsedOrder : null,
        value: row.value,
        quality: row.quality,
        source: row.source,
      };
    })
    .sort((left, right) => {
      if (left.order == null && right.order == null) return left.label.localeCompare(right.label);
      if (left.order == null) return 1;
      if (right.order == null) return -1;
      return left.order - right.order;
    });
}

function ProductEventFunnel({ steps }: { steps: ProductStep[] }) {
  if (!steps.length) {
    return <EmptyDetail>Sin eventos funnel_step_reached para este rango.</EmptyDetail>;
  }
  const maximum = Math.max(...steps.map((step) => step.value));
  return (
    <div className="m-panel m-product-funnel" aria-label="Volumen de eventos configurados de Product">
      {steps.map((step, index) => {
        const width = maximum > 0 ? Math.max(4, Math.round((step.value / maximum) * 100)) : 0;
        return (
          <div className="m-product-funnel-row" key={step.id}>
            <div className="m-product-funnel-order">{step.order ?? index + 1}</div>
            <div className="m-product-funnel-main">
              <div>
                <b>{step.label}</b>
                <span>Conteo independiente observado en el rango</span>
              </div>
              <div className="m-product-funnel-track">
                <span style={{ width: width + "%" }} />
              </div>
            </div>
            <strong>{formatValue(step.value)}</strong>
            <QualityChip quality={step.quality} provenance={sourceLabel(step.source)} />
          </div>
        );
      })}
      <footer>
        Volúmenes aditivos independientes por evento observados por PostHog; no representan
        personas únicas ni permiten inferir conversión, continuidad o abandono entre pasos.
      </footer>
    </div>
  );
}

export function ProductSurfacePanel(props: SurfacePanelProps) {
  const rows = useMemo(() => detailRows(props.detail), [props.detail]);
  const steps = useMemo(() => productSteps(rows), [rows]);
  return (
    <div data-surface-renderer="product">
      <DetailStatus detail={props.detail} isLoading={props.isLoading} hasError={props.hasError} />
      <DetailSection
        number="01"
        title="Actividad de producto"
        note="KPIs agregados del rango. Cero se conserva solo cuando PostHog lo reporta; ausencia se muestra como guion."
      >
        <KpiRail kpis={props.kpis} specs={PRODUCT_KPIS} />
      </DetailSection>
      <DetailSection
        number="02"
        title="Secuencia configurada de eventos"
        note="El orden procede de PostHog; cada valor es un conteo independiente, no una cohorte secuencial."
      >
        <ProductEventFunnel steps={steps} />
      </DetailSection>
    </div>
  );
}

const SOCIAL_KPIS: KpiSpec[] = [
  { ids: ["social.posts"], label: "Posts publicados" },
  { ids: ["social.impressions"], label: "Impresiones acumuladas" },
  { ids: ["social.reach"], label: "Reach acumulado" },
  { ids: ["social.clicks"], label: "Clicks acumulados" },
  { ids: ["social.avg_engagement"], label: "Engagement acumulado medio (escala Metricool)" },
  { ids: ["social.followers"], label: "Followers" },
  { ids: ["social.video_views"], label: "Video views acumuladas" },
  { ids: ["social.saves"], label: "Guardados acumulados" },
];

interface SocialPostRow {
  id: string;
  source: string;
  network: string;
  text: string;
  url: string | null;
  value: number;
  likes: number | null;
  clicks: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  videoViews: number | null;
  engagement: number | null;
  quality: SurfaceDetailQuality;
}

const SOCIAL_POST_METRICS = new Set([
  "postdetail",
  "postlikes",
  "postclicks",
  "postshares",
  "postsaves",
  "postreach",
  "postvideoviews",
  "postengagement",
]);

function socialNetworks(rows: FlatDetailMetric[]): NamedEntityRow[] {
  return sortByMetric(
    groupEntities(rows, (row) =>
      canonicalSource(row.source) === "metricool"
      && !SOCIAL_POST_METRICS.has(normalized(row.metric))
      && hasDimension(row, ["network"])),
    "impressions",
  ).map((entity) => ({
    entity,
    name: dimension(entity, ["network"]) ?? "-",
  }));
}

function safeExternalUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function socialPosts(rows: FlatDetailMetric[]): SocialPostRow[] {
  return groupEntities(
    rows,
    (row) =>
      canonicalSource(row.source) === "metricool"
      && SOCIAL_POST_METRICS.has(normalized(row.metric))
      && dimension(row, ["network"]) != null,
  )
    .flatMap((entity) => {
      const detail = entityMetric(entity, ["postDetail"]);
      if (!detail) return [];
      const metricOrLegacyDimension = (metric: string, legacyDimension: string): number | null =>
        entityMetric(entity, [metric])?.value
        ?? numericDimension(entity.dimensions, [legacyDimension]);
      return [{
        id: entity.id,
        source: entity.source,
        network: dimension(entity, ["network"]) ?? "-",
        text: dimension(entity, ["text"]) ?? "Post sin copy disponible",
        url: safeExternalUrl(dimension(entity, ["url"])),
        value: detail.value,
        likes: metricOrLegacyDimension("postLikes", "likes"),
        clicks: metricOrLegacyDimension("postClicks", "clicks"),
        shares: metricOrLegacyDimension("postShares", "shares"),
        saves: metricOrLegacyDimension("postSaves", "saves"),
        reach: metricOrLegacyDimension("postReach", "reach"),
        videoViews: metricOrLegacyDimension("postVideoViews", "videoViews"),
        engagement: metricOrLegacyDimension("postEngagement", "engagement"),
        quality: entityQuality(entity),
      }];
    })
    .sort((left, right) => right.value - left.value);
}

function networkColumns(): TableColumn<NamedEntityRow>[] {
  return [
    { key: "network", label: "Red", render: (row) => <b>{row.name}</b> },
    { key: "posts", label: "Posts", numeric: true, render: (row) => metricCell(row.entity, ["posts"]) },
    { key: "impressions", label: "Impr.", numeric: true, render: (row) => metricCell(row.entity, ["impressions"]) },
    { key: "reach", label: "Reach", numeric: true, render: (row) => metricCell(row.entity, ["reach"]) },
    { key: "clicks", label: "Clicks", numeric: true, render: (row) => metricCell(row.entity, ["clicks"]) },
    { key: "likes", label: "Likes", numeric: true, render: (row) => metricCell(row.entity, ["likes"]) },
    { key: "shares", label: "Shares", numeric: true, render: (row) => metricCell(row.entity, ["shares"]) },
    {
      key: "engagement",
      label: "Engagement medio (escala Metricool)",
      numeric: true,
      render: (row) => metricCell(row.entity, ["avgEngagement"], "decimal"),
    },
    { key: "followers", label: "Followers", numeric: true, render: (row) => metricCell(row.entity, ["followers"]) },
    { key: "quality", label: "Calidad", render: (row) => <QualityChip quality={entityQuality(row.entity)} provenance="Metricool" /> },
  ];
}

function PostList({ posts, total }: { posts: SocialPostRow[]; total: number }) {
  if (!posts.length) {
    return <EmptyDetail>Sin postDetail observado en este rango.</EmptyDetail>;
  }
  return (
    <div className="m-social-posts">
      {total > posts.length ? (
        <div className="m-detail-table-limit">Mostrando {posts.length} de {total} posts devueltos</div>
      ) : null}
      {posts.map((post) => (
        <article className="m-social-post" key={post.id}>
          <header>
            <span>{post.network}</span>
            <QualityChip quality={post.quality} provenance={sourceLabel(post.source)} />
          </header>
          <p>{post.text}</p>
          <dl>
            <div><dt>Impr./views</dt><dd>{formatValue(post.value)}</dd></div>
            <div><dt>Reach</dt><dd>{formatValue(post.reach)}</dd></div>
            <div><dt>Video views</dt><dd>{formatValue(post.videoViews)}</dd></div>
            <div><dt>Likes</dt><dd>{formatValue(post.likes)}</dd></div>
            <div><dt>Clicks</dt><dd>{formatValue(post.clicks)}</dd></div>
            <div><dt>Shares</dt><dd>{formatValue(post.shares)}</dd></div>
            <div><dt>Saves</dt><dd>{formatValue(post.saves)}</dd></div>
            <div><dt>Engagement</dt><dd>{formatValue(post.engagement, "decimal")}</dd></div>
          </dl>
          {post.url ? (
            <a href={post.url} target="_blank" rel="noreferrer">Abrir publicación ↗</a>
          ) : (
            <span className="m-detail-muted">URL no disponible</span>
          )}
        </article>
      ))}
    </div>
  );
}

export function SocialSurfacePanel(props: SurfacePanelProps) {
  const rows = useMemo(() => detailRows(props.detail), [props.detail]);
  const networks = useMemo(() => socialNetworks(rows), [rows]);
  const allPosts = useMemo(() => socialPosts(rows), [rows]);
  const posts = useMemo(() => allPosts.slice(0, 12), [allPosts]);
  return (
    <div data-surface-renderer="social">
      <DetailStatus detail={props.detail} isLoading={props.isLoading} hasError={props.hasError} />
      <DetailSection
        number="01"
        title="Pulso editorial"
        note="Metricool selecciona publicaciones creadas en el rango y devuelve sus contadores acumulados al recogerlas. No son interacciones ocurridas exclusivamente dentro del rango."
      >
        <KpiRail kpis={props.kpis} specs={SOCIAL_KPIS} />
      </DetailSection>
      <DetailSection
        number="02"
        title="Rendimiento acumulado por red"
        note="Snapshot de la cohorte publicada en el rango. Las redes no se rellenan entre sí: cada celda procede del campo que Metricool entregó para esa plataforma."
      >
        <DataTable
          label="Rendimiento Social por red"
          rows={networks}
          columns={networkColumns()}
          rowKey={(row) => row.entity.id}
          empty="Sin breakdown de red para este rango."
        />
      </DetailSection>
      <DetailSection
        number="03"
        title="Publicaciones observadas"
        note="Top posts creados en el rango, ordenados por el contador acumulado que Metricool entregó al recogerlos (impresiones o views, según la red)."
      >
        <PostList posts={posts} total={allPosts.length} />
      </DetailSection>
    </div>
  );
}

const WEB_KPIS: KpiSpec[] = [
  { ids: ["web.sessions"], label: "Sesiones" },
  { ids: ["web.users"], label: "Usuarios" },
  { ids: ["web.pageviews"], label: "Páginas vistas" },
  { ids: ["web.engagement_rate"], label: "Engagement rate" },
  { ids: ["web.gsc_clicks"], label: "Clicks GSC" },
  { ids: ["web.gsc_impressions"], label: "Impresiones GSC" },
  { ids: ["web.gsc_ctr"], label: "CTR GSC" },
  { ids: ["web.gsc_position"], label: "Posición media" },
];

const WEB_VITAL_KPIS: KpiSpec[] = [
  { ids: ["web.pagespeed_mobile"], label: "Lighthouse performance mobile (lab)" },
  { ids: ["web.pagespeed_desktop"], label: "Lighthouse performance desktop (lab)" },
  { ids: ["web.lcp_mobile"], label: "LCP mobile (lab)" },
  { ids: ["web.cls_mobile"], label: "CLS mobile (lab)" },
  { ids: ["web.inp_mobile"], label: "INP mobile (lab)" },
];

function webEntityRows(
  rows: FlatDetailMetric[],
  source: string,
  dimensionAliases: string[],
  sortMetric: string,
): NamedEntityRow[] {
  return sortByMetric(
    groupEntities(rows, (row) =>
      canonicalSource(row.source) === canonicalSource(source)
      && hasDimension(row, dimensionAliases)),
    sortMetric,
  ).map((entity) => ({
    entity,
    name: dimension(entity, dimensionAliases) ?? "-",
  }));
}

function webChannelColumns(dimensionLabel: "Canal" | "Dispositivo"): TableColumn<NamedEntityRow>[] {
  return [
    { key: "dimension", label: dimensionLabel, render: (row) => <b>{row.name}</b> },
    { key: "sessions", label: "Sesiones", numeric: true, render: (row) => metricCell(row.entity, ["sessions"]) },
    { key: "users", label: "Usuarios", numeric: true, render: (row) => metricCell(row.entity, ["totalUsers"]) },
    { key: "newUsers", label: "Nuevos", numeric: true, render: (row) => metricCell(row.entity, ["newUsers"]) },
    { key: "engaged", label: "Sesiones engaged", numeric: true, render: (row) => metricCell(row.entity, ["engagedSessions"]) },
    { key: "pageviews", label: "Pageviews", numeric: true, render: (row) => metricCell(row.entity, ["screenPageViews"]) },
    { key: "quality", label: "Calidad", render: (row) => <QualityChip quality={entityQuality(row.entity)} provenance="GA4" /> },
  ];
}

function ga4RatioPercentCell(entity: DetailEntity, aliases: string[]): string {
  const value = entityMetric(entity, aliases)?.value;
  return formatValue(value == null ? null : value * 100, "percent");
}

function webDeviceColumns(): TableColumn<NamedEntityRow>[] {
  return [
    { key: "device", label: "Dispositivo", render: (row) => <b>{row.name}</b> },
    { key: "sessions", label: "Sesiones", numeric: true, render: (row) => metricCell(row.entity, ["sessions"]) },
    { key: "engagement", label: "Engagement", numeric: true, render: (row) => ga4RatioPercentCell(row.entity, ["engagementRate"]) },
    { key: "bounce", label: "Bounce", numeric: true, render: (row) => ga4RatioPercentCell(row.entity, ["bounceRate"]) },
    { key: "quality", label: "Calidad", render: (row) => <QualityChip quality={entityQuality(row.entity)} provenance="GA4" /> },
  ];
}

function webSearchColumns(kind: "query" | "page"): TableColumn<NamedEntityRow>[] {
  return [
    { key: kind, label: kind === "query" ? "Query" : "Página", render: (row) => <b>{row.name}</b> },
    { key: "clicks", label: "Clicks", numeric: true, render: (row) => metricCell(row.entity, ["clicks"]) },
    { key: "impressions", label: "Impr.", numeric: true, render: (row) => metricCell(row.entity, ["impressions"]) },
    { key: "ctr", label: "CTR", numeric: true, render: (row) => metricCell(row.entity, ["ctr"], "percent") },
    { key: "position", label: "Posición", numeric: true, render: (row) => metricCell(row.entity, ["position"], "decimal") },
    { key: "quality", label: "Calidad", render: (row) => <QualityChip quality={entityQuality(row.entity)} provenance="Search Console" /> },
  ];
}

interface WebPageRow {
  entity: DetailEntity;
  name: string;
  primary: FlatDetailMetric;
}

function ga4TopPages(rows: FlatDetailMetric[]): WebPageRow[] {
  const topPageMetrics = new Set(["toppage", "toppagesessions", "toppageduration", "toppageengagementrate"]);
  return groupEntities(
    rows,
    (row) =>
      canonicalSource(row.source) === "ga4"
      && topPageMetrics.has(normalized(row.metric))
      && dimension(row, ["page"]) != null,
  )
    .flatMap((entity) => {
      const primary = entityMetric(entity, ["topPage"]);
      return primary ? [{
        entity,
        name: dimension(entity, ["page"]) ?? "-",
        primary,
      }] : [];
    })
    .sort((left, right) => right.primary.value - left.primary.value);
}

function topPageColumns(): TableColumn<WebPageRow>[] {
  return [
    { key: "page", label: "Página", render: (row) => <b>{row.name}</b> },
    { key: "views", label: "Pageviews", numeric: true, render: (row) => formatValue(row.primary.value) },
    { key: "sessions", label: "Sesiones", numeric: true, render: (row) => metricCell(row.entity, ["topPageSessions"]) },
    { key: "duration", label: "Duración", numeric: true, render: (row) => {
      const duration = entityMetric(row.entity, ["topPageDuration"])?.value
        ?? numericDimension(row.entity.dimensions, ["duration"]);
      return duration == null ? "-" : formatValue(duration) + "s";
    } },
    { key: "engagement", label: "Engagement", numeric: true, render: (row) => {
      const engagement = entityMetric(row.entity, ["topPageEngagementRate"])?.value
        ?? numericDimension(row.entity.dimensions, ["engagementRate"]);
      return formatValue(engagement, "percent");
    } },
    { key: "quality", label: "Calidad", render: (row) => <QualityChip quality={entityQuality(row.entity)} provenance="GA4" /> },
  ];
}

export function WebSurfacePanel(props: SurfacePanelProps) {
  const rows = useMemo(() => detailRows(props.detail), [props.detail]);
  const channels = useMemo(() => webEntityRows(rows, "ga4", ["channel"], "sessions"), [rows]);
  const devices = useMemo(() => webEntityRows(rows, "ga4", ["device"], "sessions"), [rows]);
  const queries = useMemo(() => webEntityRows(rows, "gsc", ["query"], "clicks"), [rows]);
  const searchPages = useMemo(() => webEntityRows(rows, "gsc", ["page"], "clicks"), [rows]);
  const topPages = useMemo(() => ga4TopPages(rows), [rows]);
  return (
    <div data-surface-renderer="web">
      <DetailStatus detail={props.detail} isLoading={props.isLoading} hasError={props.hasError} />
      <div className="m-discoverability-rail" aria-label="Ámbitos de Discoverability">
        <b>SEO observado</b>
        <span>GA4 · Search Console · PageSpeed</span>
        <i>AI Search · Sin dato: no hay fuente AEO en este rango</i>
      </div>
      <DetailSection
        number="01"
        title="Discoverability"
        note="Tráfico y búsqueda se conservan como sistemas de medición distintos; no se atribuyen conversiones entre fuentes."
      >
        <KpiRail kpis={props.kpis} specs={WEB_KPIS} />
      </DetailSection>
      <DetailSection
        number="02"
        title="Canales observados (top 10 diario)"
        note="GA4 devuelve como máximo los 10 canales con más sesiones de cada día. Los acumulados por canal solo suman los días en que ese canal entró en la muestra; no representan un total exhaustivo del rango."
      >
        <DataTable
          label="Canales GA4"
          rows={channels}
          columns={webChannelColumns("Canal")}
          rowKey={(row) => row.entity.id}
          empty="Sin breakdown de canal GA4."
        />
      </DetailSection>
      <div className="m-detail-split">
        <DetailSection
          number="03"
          title="Queries (muestra top del rango)"
          note="Search Console limita la respuesta global a 20 filas por día solicitado. Una query puede faltar en días donde quedó fuera del top; sus cifras son solo el volumen observado en la muestra."
        >
          <DataTable
            label="Queries de Search Console"
            rows={queries.slice(0, 25)}
            totalRows={queries.length}
            columns={webSearchColumns("query")}
            rowKey={(row) => row.entity.id}
            empty="Sin queries de Search Console."
          />
        </DetailSection>
        <DetailSection
          number="04"
          title="Páginas en búsqueda (muestra top del rango)"
          note="Search Console limita la respuesta global a 20 filas por día solicitado. Las cifras por página no son exhaustivas si la respuesta alcanzó el límite."
        >
          <DataTable
            label="Páginas de Search Console"
            rows={searchPages.slice(0, 25)}
            totalRows={searchPages.length}
            columns={webSearchColumns("page")}
            rowKey={(row) => row.entity.id}
            empty="Sin páginas de Search Console."
          />
        </DetailSection>
      </div>
      <div className="m-detail-split">
        <DetailSection
          number="05"
          title="Páginas más vistas (top 15 diario)"
          note="GA4 devuelve como máximo 15 páginas por día. Pageviews, sesiones, duración y engagement solo agregan los días en que la página entró en esa muestra; no son totales exhaustivos del rango."
        >
          <DataTable
            label="Páginas más vistas en GA4"
            rows={topPages.slice(0, 20)}
            totalRows={topPages.length}
            columns={topPageColumns()}
            rowKey={(row) => row.entity.id}
            empty="Sin top pages de GA4."
          />
        </DetailSection>
        <DetailSection
          number="06"
          title="Dispositivos"
          note="Sesiones y engagement observados por device."
        >
          <DataTable
            label="Dispositivos GA4"
            rows={devices}
            columns={webDeviceColumns()}
            rowKey={(row) => row.entity.id}
            empty="Sin breakdown de dispositivo GA4."
          />
        </DetailSection>
      </div>
      <DetailSection
        number="07"
        title="Métricas Lighthouse (laboratorio)"
        note="Una ejecución sintética de PageSpeed, no la ventana de experiencia real de CrUX. Una auditoría ausente no se sustituye por cero ni por datos de campo."
      >
        <KpiRail kpis={props.kpis} specs={WEB_VITAL_KPIS} />
      </DetailSection>
    </div>
  );
}
