/**
 * Encuentra (SAN-78) — lista de búsquedas de creators.
 *
 * Decisión de diseño 2026-06-11 (nº 1): NO hay vista aparte de candidatos —
 * los candidatos son Leads del pipeline desde el primer momento; click en una
 * búsqueda abre Contactos · Lista filtrado por esa búsqueda (?busqueda=).
 *
 * Fuente de búsquedas: cada búsqueda = tarea Outreach (SAN-79). Su shape de
 * tarea aún no está construido/pusheado, así que tiramos de la fuente
 * equivalente ya real: campañas Yalc `type=Partnerships` (una búsqueda = una
 * campaña). TODO(SAN-79): cuando discovery-plan-builder cree tareas Outreach
 * con runner real, leer de ahí el estado/progreso del runner y las plantillas
 * instanciadas (SAN-80) en lugar de derivarlos de la campaña.
 */

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { stageForStatus } from "@/lib/partnerships/stage-mapping";
import type { PartnershipCampaign, PartnershipLead } from "@/lib/partnerships/types";
import type { DiscoverySearchRecord } from "@/lib/partnerships/discovery-types";
import type { TemplateSummary } from "@/lib/partnerships/templates";

type SearchState = "running" | "done" | "draft" | "paused";

function searchState(campaign: PartnershipCampaign): SearchState {
  const status = (campaign.status || "").toLowerCase();
  if (status === "draft") return "draft";
  if (status === "paused") return "paused";
  if (["completed", "done", "closed"].includes(status)) return "done";
  return "running"; // active / running / live
}

const STATE_META: Record<SearchState, { stamp: string; stampClass: string; barClass: string }> = {
  running: { stamp: "⚙ Running", stampClass: "border-cyan-600 text-cyan-700", barClass: "bg-cyan-600" },
  done: { stamp: "✔ Done", stampClass: "border-sage text-sage", barClass: "bg-sage" },
  draft: { stamp: "✎ Draft", stampClass: "border-border text-muted-foreground", barClass: "bg-border" },
  paused: { stamp: "⏸ Paused", stampClass: "border-yellow-600 text-yellow-700", barClass: "bg-yellow-400" },
};

interface EncuentraTabProps {
  campaigns: PartnershipCampaign[];
  leads: PartnershipLead[];
  loading: boolean;
  onOpenSearch: (campaign: PartnershipCampaign) => void;
  onContinueDraft: (campaign: PartnershipCampaign) => void;
  onCreateSearch: () => void;
  /** Búsquedas (SAN-79) con sus plantillas instanciadas (SAN-80). */
  searches?: DiscoverySearchRecord[];
  /** Biblioteca de plantillas para el picker "＋ asignar plantilla". */
  templateLibrary?: TemplateSummary[];
  onAssignTemplate?: (campaign: PartnershipCampaign, templateId: string) => void;
  onCreateTemplate?: () => void;
}

/** Orden de cards como el mockup: en marcha primero, drafts al final. */
const STATE_ORDER: Record<SearchState, number> = { running: 0, done: 1, paused: 2, draft: 3 };

export function EncuentraTab({
  campaigns,
  leads,
  loading,
  onOpenSearch,
  onContinueDraft,
  onCreateSearch,
  searches = [],
  templateLibrary = [],
  onAssignTemplate,
  onCreateTemplate,
}: EncuentraTabProps) {
  const [filter, setFilter] = useState<"todas" | "archivadas">("todas");
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const ordered = campaigns
    .slice()
    .sort((a, b) => STATE_ORDER[searchState(a)] - STATE_ORDER[searchState(b)]);

  return (
    <div data-testid="encuentra-tab">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Filtrar</span>
        {(["todas", "archivadas"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full border-2 px-3 py-1 text-xs font-bold shadow-comic-sm transition-transform hover:-translate-y-0.5",
              filter === key ? "border-ink bg-yellow-200 text-ink" : "border-border bg-card text-muted-foreground",
            )}
          >
            {key === "todas" ? "Todas" : "Archivadas"}
          </button>
        ))}
      </div>

      {filter === "archivadas" ? (
        <ZeroState
          quote="«En este cajón no hay más que polvo y telarañas, señor…»"
          title="¡NADA POR AQUÍ!"
          body="No has archivado ninguna búsqueda todavía. Las búsquedas archivadas conservan sus candidatos y su histórico de scoring por si quieres rescatarlas."
          action={{ label: "← Volver a todas", onClick: () => setFilter("todas") }}
        />
      ) : loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Cargando búsquedas…</p>
      ) : campaigns.length === 0 ? (
        <ZeroState
          quote="«Quien busca creators, halla partners, mi señor.»"
          title="SIN BÚSQUEDAS TODAVÍA"
          body="Crea tu primera búsqueda de creators con Sancho: te propone sectores con fit, redes y tiers, y el runner trae candidatos ya puntuados con quality score."
          action={{ label: "✨ Crear nueva búsqueda", onClick: onCreateSearch }}
        />
      ) : (
        <div className="space-y-4">
          {ordered.map((campaign) => {
            const state = searchState(campaign);
            const meta = STATE_META[state];
            const campaignLeads = leads.filter((lead) => lead.campaignId === campaign.id);
            const candidateCount = campaignLeads.length || campaign.leadCount || 0;
            const shortlisted = campaignLeads.filter((lead) => {
              const stage = stageForStatus(lead.lifecycleStatus);
              return stage !== null && stage !== "Discovered" && stage !== "Discarded";
            }).length;
            const isDraft = state === "draft";
            return (
              <section
                key={campaign.id}
                data-campaign-id={campaign.id}
                onClick={() => (isDraft ? onContinueDraft(campaign) : onOpenSearch(campaign))}
                className={cn(
                  "cursor-pointer overflow-hidden rounded-xl border-2 border-border bg-card shadow-comic-sm transition-all hover:-translate-y-0.5 hover:border-ink hover:shadow-comic",
                )}
                title={
                  isDraft
                    ? "Borrador — completa el plan con Sancho para lanzar"
                    : "Abrir Contactos · Lista filtrado por esta búsqueda"
                }
              >
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-4 px-5 py-4",
                    state === "running" && "bg-yellow-50",
                    state === "done" && "bg-sage/10",
                    isDraft && "bg-muted/40",
                  )}
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-ink bg-background text-xl shadow-comic-sm" aria-hidden>
                    {isDraft ? "🎙️" : state === "done" ? "📺" : "🔍"}
                  </div>
                  <div className="min-w-[240px] flex-1">
                    <h3 className="font-heading text-lg leading-tight text-ink">{campaign.title || campaign.id}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Búsqueda Outreach
                      {campaign.createdAt &&
                        ` · creada ${new Date(campaign.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}`}
                      {campaign.targetSegment && ` · ${campaign.targetSegment}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className={cn("font-heading text-2xl leading-none", isDraft ? "text-muted-foreground/60" : "text-rust")}>
                        {candidateCount}
                      </div>
                      <div className="text-[10px] font-semibold text-muted-foreground">candidatos</div>
                    </div>
                    <span
                      className={cn(
                        "-rotate-3 rounded-md border-2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                        meta.stampClass,
                      )}
                    >
                      {meta.stamp}
                    </span>
                  </div>
                </div>

                {/* Estado del runner — TODO(SAN-79): progreso real del discovery-search-runner */}
                <div className="px-5 pb-3">
                  <div className="h-2.5 overflow-hidden rounded-full border-2 border-ink/50 bg-background">
                    <div
                      className={cn("h-full rounded-full", meta.barClass)}
                      style={{ width: isDraft ? "0%" : "100%" }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                    {isDraft
                      ? "runner: sin lanzar — completa el plan con Sancho para arrancar"
                      : `runner: discovery por chat (SAN-79) · ${candidateCount} candidatos en pipeline · ${shortlisted} más allá de Discovered`}
                  </p>
                </div>

                {/* Plantillas instanciadas por búsqueda (SAN-80) */}
                {!isDraft && (
                  <div
                    className="relative flex flex-wrap items-center gap-2 border-t-2 border-dashed border-border px-5 py-2.5"
                    onClick={(event) => event.stopPropagation()}
                    data-testid="search-templates-row"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Plantillas de esta búsqueda:
                    </span>
                    {(searches.find((search) => search.campaignId === campaign.id)?.templates || []).map(
                      (instance) => (
                        <span
                          key={instance.instanceId}
                          title={`Instancia de «${instance.name}» (copia congelada al asignar)`}
                          className="rounded-full border-2 border-ink bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-ink shadow-comic-sm"
                          data-template-instance={instance.templateId}
                        >
                          {instance.kind === "sequence" ? "✉️" : "📝"} {instance.name}
                        </span>
                      ),
                    )}
                    <button
                      type="button"
                      onClick={() => setPickerFor(pickerFor === campaign.id ? null : campaign.id)}
                      className="rounded-full border-2 border-dashed border-border px-3 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-ink hover:text-foreground"
                      title="Instanciar una plantilla de la biblioteca en esta búsqueda"
                      data-testid="assign-template-chip"
                    >
                      ＋ asignar plantilla
                    </button>

                    {/* Picker de la biblioteca */}
                    {pickerFor === campaign.id && (
                      <div
                        className="absolute left-5 top-full z-20 mt-1 w-80 overflow-hidden rounded-xl border-2 border-ink bg-card shadow-comic"
                        data-testid="template-picker"
                      >
                        <div className="border-b-2 border-border bg-yellow-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          Instanciar desde la biblioteca
                        </div>
                        {templateLibrary.length === 0 && (
                          <p className="px-3 py-3 text-xs italic text-muted-foreground">Biblioteca vacía.</p>
                        )}
                        {templateLibrary.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => {
                              onAssignTemplate?.(campaign, template.id);
                              setPickerFor(null);
                            }}
                            className="flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left text-xs transition-colors last:border-b-0 hover:bg-yellow-50"
                            data-picker-template={template.id}
                          >
                            <span aria-hidden>{template.kind === "sequence" ? "✉️" : "📝"}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-bold text-ink">{template.name}</span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {template.description}
                              </span>
                            </span>
                            <span className="shrink-0 rounded border border-ink bg-yellow-200 px-1.5 text-[9px] font-bold">
                              Instanciar
                            </span>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setPickerFor(null);
                            onCreateTemplate?.();
                          }}
                          className="w-full border-t-2 border-border px-3 py-2 text-left text-xs font-bold text-rust transition-colors hover:bg-yellow-50"
                          data-testid="picker-create-new"
                        >
                          ✨ Crear nueva en Plantillas →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-[11px] italic text-muted-foreground">
        * Los candidatos son Leads del pipeline: abrir una búsqueda lleva a <b>Contactos filtrado
        por esa búsqueda</b> (no hay vista aparte). Las búsquedas en borrador abren el chat de
        Sancho para completar el plan.
      </p>
    </div>
  );
}

function ZeroState({
  quote,
  title,
  body,
  action,
}: {
  quote: string;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border-4 border-dashed border-border bg-card px-8 py-12 text-center shadow-comic-sm">
      <div className="inline-block rotate-1 rounded border-2 border-ink bg-yellow-200 px-3 py-0.5 font-serif text-[13px] italic text-ink shadow-comic-sm">
        {quote}
      </div>
      <div className="mt-4 font-heading text-3xl tracking-wide text-navy/30" style={{ WebkitTextStroke: "1px var(--navy)" }}>
        {title}
      </div>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 rounded-md border-2 border-border bg-card px-4 py-2 text-sm font-bold shadow-comic-sm transition-transform hover:-translate-y-0.5 hover:border-ink"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
