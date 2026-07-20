import { useEffect } from "react";
import {
  useSalesEngineLeads,
  type SalesEngineLeadRow,
  type SalesEngineLeadsResponse,
  type SalesEngineLeadsStage,
} from "@/hooks/useMetrics";

/**
 * Drill-down behind a "Motor de ventas" matrix cell (SAN-326): a modal listing
 * the live GHL records (leads, reuniones, oportunidades, ganadas) whose
 * acquisition channel maps to the clicked bucket. Data comes straight from
 * GoHighLevel via /api/metrics/sales-engine-leads, so the list is current even
 * when the persisted matrix counts lag a collection run.
 */

/** Matrix row key → drill-down stage. "valor" (€ ganado) lists the same won
 * deals as "ganadas"; the monetary column carries the € the cell aggregates. */
export function drilldownStageForMatrixRow(key: string): SalesEngineLeadsStage | null {
  switch (key) {
    case "leads": return "leads";
    case "reuniones": return "meetings";
    case "oportunidades": return "opportunities";
    case "ganadas":
    case "valor": return "won";
    default: return null;
  }
}

export interface SalesEngineCellSelection {
  stage: SalesEngineLeadsStage;
  stageLabel: string;
  bucket: string | null;
  bucketLabel: string;
}

function formatRowDate(raw: string): string {
  if (!raw) return "—";
  if (/^\d{13}$/.test(raw)) {
    return new Date(Number(raw)).toISOString().slice(0, 10);
  }
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : raw;
}

function formatMonetary(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `€${new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: Math.abs(value) < 100 ? 1 : 0,
  }).format(value)}`;
}

interface DrilldownColumn {
  key: string;
  label: string;
  numeric?: boolean;
  render: (row: SalesEngineLeadRow) => string;
}

export function salesEngineDrilldownColumns(stage: SalesEngineLeadsStage): DrilldownColumn[] {
  const base: DrilldownColumn[] = [
    { key: "name", label: "Nombre", render: (row) => row.name || "—" },
    { key: "company", label: "Empresa", render: (row) => row.companyName || "—" },
    { key: "source", label: "Origen", render: (row) => row.source || "Unknown" },
    { key: "date", label: "Fecha", render: (row) => formatRowDate(row.date) },
  ];
  if (stage === "meetings") {
    base.push({ key: "status", label: "Estado", render: (row) => row.status || "—" });
  }
  if (stage === "opportunities" || stage === "won") {
    base.push(
      { key: "pipelineStage", label: "Etapa pipeline", render: (row) => row.pipelineStage || "—" },
      { key: "monetaryValue", label: "Valor", numeric: true, render: (row) => formatMonetary(row.monetaryValue) },
    );
  }
  return base;
}

/** Presentational body of the drill-down: loading / error / empty / rows.
 * Pure so it can be tested without the query client. */
export function SalesEngineLeadsContent({
  stage,
  isLoading,
  errorMessage,
  data,
}: {
  stage: SalesEngineLeadsStage;
  isLoading?: boolean;
  errorMessage?: string | null;
  data?: SalesEngineLeadsResponse | null;
}) {
  if (isLoading) {
    return (
      <div className="m-drill-state" role="status">
        ⏳ Consultando GoHighLevel…
      </div>
    );
  }
  if (errorMessage) {
    return (
      <div className="m-drill-state m-drill-error" role="alert">
        ⚠️ {errorMessage}
      </div>
    );
  }
  if (!data || !data.rows.length) {
    return (
      <div className="m-drill-state">
        Sin registros en GoHighLevel para esta celda y rango.
      </div>
    );
  }
  const columns = salesEngineDrilldownColumns(stage);
  return (
    <div className="m-detail-table-wrap m-drill-table">
      {data.total > data.rows.length || data.truncated ? (
        <div className="m-detail-table-limit">
          Mostrando {data.rows.length} de {data.total}
          {data.truncated ? "+" : ""} registros — acota el rango para ver el resto
        </div>
      ) : null}
      <table className="m-detail-table" aria-label="Registros de GoHighLevel">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.numeric ? "num" : undefined}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            <tr key={`${row.email || row.name}-${row.date}-${index}`}>
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? "num" : undefined}>
                  {column.key === "name" ? (
                    <>
                      <b>{column.render(row)}</b>
                      {row.email ? <small>{row.email}</small> : null}
                    </>
                  ) : (
                    column.render(row)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SalesEngineDrilldownPanel({
  slug,
  from,
  to,
  selection,
  onClose,
}: {
  slug: string;
  from: string;
  to: string;
  selection: SalesEngineCellSelection;
  onClose: () => void;
}) {
  const query = useSalesEngineLeads(slug, {
    stage: selection.stage,
    bucket: selection.bucket,
    from,
    to,
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const rangeNote = selection.stage === "won"
    ? "estado actual del CRM (histórico, sin filtro de fechas)"
    : `${from} → ${to} (incluye hoy)`;

  return (
    <div
      className="m-drill-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="m-panel m-drill" role="dialog" aria-modal="true" aria-label={`${selection.stageLabel} · ${selection.bucketLabel}`}>
        <div className="m-drill-head">
          <div>
            <b>{selection.stageLabel} · {selection.bucketLabel}</b>
            <small>{rangeNote}</small>
          </div>
          <button type="button" className="m-btn m-drill-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <SalesEngineLeadsContent
          stage={selection.stage}
          isLoading={query.isLoading}
          errorMessage={query.isError
            ? (query.error instanceof Error ? query.error.message : "No se pudo consultar GoHighLevel")
            : null}
          data={query.data ?? null}
        />
        <div className="m-drill-foot">
          Consulta en vivo a GoHighLevel · puede diferir levemente de los totales recolectados
        </div>
      </div>
    </div>
  );
}
