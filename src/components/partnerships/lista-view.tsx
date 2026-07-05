/**
 * Contactos · Lista (SAN-78) — tabla a volumen con paridad de columnas del
 * mockup contactos-lista.html:
 *
 *   Creator · Quality · Sector fit · Precio · Break-even ("—", Ola 2) ·
 *   Veredicto ("—", Ola 2) · Stage
 *
 *  - Filtros: stage (incl. "🗑 Descartados" — excluidos por defecto) + red + buscador.
 *  - Orden por columnas Quality / Precio (Break-even llega con la calc, SAN-75b).
 *  - Multi-select + bulk: Mover a stage / Descartar.
 *  - Banner de búsqueda activa (?busqueda=campaignId) con ✕ quitar filtro.
 */

"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DISCARDED_STAGE,
  EMPTY_LIST_FILTER,
  PIPELINE_STAGES,
  filterAndSortLeads,
  feeStageNote,
  formatEur,
  formatFollowers,
  formatTier,
  leadDisplayName,
  stageForStatus,
  type ListFilterState,
  type ListSortKey,
  type NetworkKey,
  type StageFilterKey,
} from "@/lib/partnerships/stage-mapping";
import type { PartnershipLead } from "@/lib/partnerships/types";
import { QualityBadge, ScoreBar, StageStamp, networkMeta } from "./ui";

const NETWORK_FILTERS: Array<{ key: NetworkKey; label: string }> = [
  { key: "instagram", label: "📸 IG" },
  { key: "youtube", label: "▶️ YT" },
  { key: "tiktok", label: "🎵 TikTok" },
];

interface ListaViewProps {
  /** Todos los leads Partnerships, INCLUIDOS los descartados (la vista filtra). */
  leads: PartnershipLead[];
  busqueda: string;
  busquedaLabel?: string | null;
  /** Filtro Stage inicial (SAN-76: el link de Settings abre 🗑 Descartados). */
  initialStage?: StageFilterKey | "";
  onClearBusqueda: () => void;
  onOpen: (lead: PartnershipLead) => void;
  onBulkMove: (leads: PartnershipLead[], target: StageFilterKey) => void;
  onBulkDiscard: (leads: PartnershipLead[]) => void;
  onContactLead?: (lead: PartnershipLead) => void;
  /** SAN-80: instancia la secuencia de la búsqueda y crea el GateItem. */
  onBulkContact?: (leads: PartnershipLead[]) => void;
  busy?: boolean;
}

export function ListaView({
  leads,
  busqueda,
  busquedaLabel,
  initialStage,
  onClearBusqueda,
  onOpen,
  onBulkMove,
  onBulkDiscard,
  onContactLead,
  onBulkContact,
  busy,
}: ListaViewProps) {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<StageFilterKey | "">(initialStage ?? "");
  const [networks, setNetworks] = useState<NetworkKey[]>([]);
  const [sortKey, setSortKey] = useState<ListSortKey | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const filterState: ListFilterState = useMemo(
    () => ({
      ...EMPTY_LIST_FILTER,
      search,
      stage,
      networks,
      busqueda,
      sortKey,
      sortDir,
    }),
    [search, stage, networks, busqueda, sortKey, sortDir],
  );
  const visible = useMemo(
    () => filterAndSortLeads(leads, filterState),
    [leads, filterState],
  );

  const selectedLeads = useMemo(
    () => leads.filter((lead) => selected[lead.id]),
    [leads, selected],
  );

  function toggleNetwork(key: NetworkKey) {
    setNetworks((current) =>
      current.includes(key)
        ? current.filter((n) => n !== key)
        : [...current, key],
    );
  }

  function toggleSort(key: ListSortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === -1 ? 1 : -1));
    } else {
      setSortKey(key);
      setSortDir(-1); // primero descendente: lo más alto arriba (mockup)
    }
  }

  function toggleSelected(leadId: string) {
    setSelected((current) => {
      const next = { ...current };
      if (next[leadId]) delete next[leadId];
      else next[leadId] = true;
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelected((current) => {
      const next = { ...current };
      for (const lead of visible) {
        if (checked) next[lead.id] = true;
        else delete next[lead.id];
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected({});
  }

  const allVisibleChecked =
    visible.length > 0 && visible.every((lead) => selected[lead.id]);

  return (
    <div>
      {/* Banner de búsqueda activa (viene de Encuentra vía ?busqueda=) */}
      {busqueda && (
        <div
          data-testid="busqueda-banner"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border border-l-4 border-l-rust bg-card px-4 py-2 text-sm"
        >
          <span aria-hidden>🔭</span>
          Candidatos de la búsqueda: <b>{busquedaLabel || busqueda}</b>
          <button
            type="button"
            onClick={onClearBusqueda}
            className="ml-auto rounded-md border border-border bg-background px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-muted"
          >
            ✕ quitar filtro
          </button>
        </div>
      )}

      {/* Toolbar de filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative">
          <span
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm"
            aria-hidden
          >
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por handle…"
            className="w-56 rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm focus:border-rust focus:outline-none"
          />
        </label>

        <select
          value={stage}
          onChange={(event) =>
            setStage(event.target.value as StageFilterKey | "")
          }
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-rust focus:outline-none"
          title="Los descartados están excluidos por defecto"
        >
          <option value="">Estado: todos</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
          <option value={DISCARDED_STAGE}>🗑 Descartados</option>
        </select>

        <span className="ml-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Red
        </span>
        {NETWORK_FILTERS.map((net) => (
          <button
            key={net.key}
            type="button"
            onClick={() => toggleNetwork(net.key)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors",
              networks.includes(net.key)
                ? "border-rust/50 bg-rust/10 text-rust"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {net.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table
          className="w-full min-w-[1040px] text-left text-sm"
          data-testid="contactos-lista"
        >
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allVisibleChecked}
                  onChange={(event) => toggleAllVisible(event.target.checked)}
                  title="Seleccionar visibles"
                  className="h-4 w-4 accent-rust"
                />
              </th>
              <th className="px-3 py-2.5">Creator</th>
              <SortableTh
                label="Quality"
                active={sortKey === "quality"}
                dir={sortDir}
                onClick={() => toggleSort("quality")}
              />
              <th className="px-3 py-2.5">Sector fit</th>
              <SortableTh
                label="Precio"
                active={sortKey === "fee"}
                dir={sortDir}
                onClick={() => toggleSort("fee")}
              />
              <th
                className="px-3 py-2.5"
                title="Break-even pendiente de cálculo"
              >
                Break-even
              </th>
              <th
                className="px-3 py-2.5"
                title="Veredicto pendiente de cálculo"
              >
                Veredicto
              </th>
              <th className="px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-10 text-center text-sm italic text-muted-foreground"
                >
                  Ningún creator coincide con esos filtros.
                </td>
              </tr>
            )}
            {visible.map((lead) => {
              const leadStage = stageForStatus(lead.lifecycleStatus);
              const fit = lead.qualityComponents?.sectorFit;
              const feeNote = feeStageNote(leadStage);
              const discarded = leadStage === DISCARDED_STAGE;
              return (
                <tr
                  key={lead.id}
                  data-lead-id={lead.id}
                  onClick={() => onOpen(lead)}
                  className={cn(
                    "cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/40",
                    selected[lead.id] && "bg-rust/5",
                    discarded && "opacity-60",
                  )}
                >
                  <td
                    className="px-3 py-2.5"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={!!selected[lead.id]}
                      onChange={() => toggleSelected(lead.id)}
                      className="h-4 w-4 accent-rust"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base" aria-hidden>
                        {networkMeta(lead.network).emoji}
                      </span>
                      <span>
                        <span className="font-semibold text-foreground">
                          {leadDisplayName(lead)}
                        </span>
                        <br />
                        <span className="text-[11px] text-muted-foreground">
                          {[
                            networkMeta(lead.network).label,
                            formatFollowers(lead.followers),
                            formatTier(lead.tier)
                              ? `Tier ${formatTier(lead.tier)}`
                              : null,
                            typeof lead.engagementRate === "number"
                              ? `ER ${lead.engagementRate.toFixed(1)}%`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <QualityBadge score={lead.qualityScore} />
                  </td>
                  <td className="px-3 py-2.5">
                    {typeof fit === "number" ? (
                      <div className="w-24">
                        <span className="text-xs font-semibold">
                          {Math.round(fit)}%
                        </span>
                        <ScoreBar value={fit} className="mt-1" />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {typeof lead.offeredPrice === "number" ? (
                      <span className="font-semibold text-foreground">
                        {formatEur(lead.offeredPrice)}
                        {feeNote && (
                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                            {feeNote}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2.5 text-muted-foreground"
                    title="Break-even pendiente"
                  >
                    —
                  </td>
                  <td
                    className="px-3 py-2.5 text-muted-foreground"
                    title="Veredicto pendiente"
                  >
                    —
                  </td>
                  <td className="px-3 py-2.5">
                    <StageStamp lead={lead} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {contactActionForStage(leadStage) === "enabled" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          onContactLead?.(lead);
                        }}
                        className="rounded-md border border-rust/60 bg-rust px-2.5 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
                        data-testid="row-contactar"
                      >
                        Contactar
                      </button>
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {contactActionForStage(leadStage) === "done" ? "Contactado" : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Mostrando {visible.length} de {leads.length} creators
        {stage !== DISCARDED_STAGE && " · descartados excluidos por defecto"}
      </p>

      {/* Bulk actions bar */}
      {selectedLeads.length > 0 && (
        <div
          data-testid="bulk-bar"
          className="fixed bottom-6 left-1/2 z-[550] flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-lg"
        >
          <span className="text-sm font-semibold text-foreground">
            {selectedLeads.length} seleccionado
            {selectedLeads.length === 1 ? "" : "s"}
          </span>
          <select
            defaultValue=""
            disabled={busy}
            onChange={(event) => {
              const value = event.target.value as StageFilterKey | "";
              if (!value) return;
              onBulkMove(selectedLeads, value);
              event.target.value = "";
              clearSelection();
            }}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-rust focus:outline-none"
          >
            <option value="">Mover a estado…</option>
            {PIPELINE_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          {onBulkContact && (
            <button
              type="button"
              disabled={busy}
              title="Preparar contacto para estos creators"
              onClick={() => {
                onBulkContact(selectedLeads);
                clearSelection();
              }}
              className="rounded-lg border-2 border-rust bg-rust px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
              data-testid="bulk-contactar"
            >
              📨 Contactar
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onBulkDiscard(selectedLeads);
              clearSelection();
            }}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            🗑 Descartar
          </button>
          <button
            type="button"
            onClick={clearSelection}
            title="Deseleccionar"
            className="text-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function contactActionForStage(stage: StageFilterKey | null): "enabled" | "done" | "hidden" {
  if (!stage || stage === DISCARDED_STAGE) return "hidden";
  if (["Contacted", "Replied", "Negotiating", "Signed", "Active"].includes(stage)) return "done";
  return "enabled";
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 1 | -1;
  onClick: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className={cn(
        "cursor-pointer select-none px-3 py-2.5 transition-colors hover:text-foreground",
        active && "text-rust",
      )}
      title={`Ordenar por ${label.toLowerCase()}`}
    >
      {label}{" "}
      <span className="text-[9px]">
        {active ? (dir === -1 ? "▼" : "▲") : "▲▼"}
      </span>
    </th>
  );
}
