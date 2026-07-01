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
import type {
  PartnershipCampaign,
  PartnershipLead,
} from "@/lib/partnerships/types";
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

const STATE_META: Record<
  SearchState,
  { stamp: string; stampClass: string; barClass: string }
> = {
  running: {
    stamp: "Activa",
    stampClass: "border-cyan-600/50 bg-cyan-50 text-cyan-700",
    barClass: "bg-cyan-600",
  },
  done: {
    stamp: "Completada",
    stampClass: "border-sage/50 bg-sage/10 text-sage",
    barClass: "bg-sage",
  },
  draft: {
    stamp: "Borrador",
    stampClass: "border-border bg-muted/40 text-muted-foreground",
    barClass: "bg-border",
  },
  paused: {
    stamp: "Pausada",
    stampClass: "border-yellow-500/50 bg-yellow-100 text-yellow-800",
    barClass: "bg-yellow-400",
  },
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
  onAssignTemplate?: (
    campaign: PartnershipCampaign,
    templateId: string,
  ) => void;
  onCreateTemplate?: () => void;
}

/** Orden de cards como el mockup: en marcha primero, drafts al final. */
const STATE_ORDER: Record<SearchState, number> = {
  running: 0,
  done: 1,
  paused: 2,
  draft: 3,
};

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
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Filtrar
        </span>
        {(["todas", "archivadas"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-colors",
              filter === key
                ? "border-rust bg-rust text-white"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            {key === "todas" ? "Todas" : "Archivadas"}
          </button>
        ))}
      </div>

      {filter === "archivadas" ? (
        <ZeroState
          title="Nada por aquí"
          body="No hay búsquedas archivadas. Cuando archives una búsqueda, conservará sus candidatos y su histórico."
          action={{
            label: "← Volver a todas",
            onClick: () => setFilter("todas"),
          }}
        />
      ) : loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Cargando búsquedas…
        </p>
      ) : campaigns.length === 0 ? (
        <ZeroState
          title="Sin búsquedas todavía"
          body="Crea una búsqueda para traer partners al pipeline con quality score y datos de contacto."
          action={{ label: "+ Nueva búsqueda", onClick: onCreateSearch }}
        />
      ) : (
        <div className="space-y-4">
          {ordered.map((campaign) => {
            const state = searchState(campaign);
            const meta = STATE_META[state];
            const campaignLeads = leads.filter(
              (lead) => lead.campaignId === campaign.id,
            );
            const candidateCount =
              campaignLeads.length || campaign.leadCount || 0;
            const shortlisted = campaignLeads.filter((lead) => {
              const stage = stageForStatus(lead.lifecycleStatus);
              return (
                stage !== null &&
                stage !== "Discovered" &&
                stage !== "Discarded"
              );
            }).length;
            const isDraft = state === "draft";
            return (
              <section
                key={campaign.id}
                data-campaign-id={campaign.id}
                onClick={() =>
                  isDraft ? onContinueDraft(campaign) : onOpenSearch(campaign)
                }
                className="cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-rust"
                title={
                  isDraft
                    ? "Borrador — completa el plan con Sancho para lanzar"
                    : "Abrir Contactos · Lista filtrado por esta búsqueda"
                }
              >
                <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-muted/40 text-xl"
                    aria-hidden
                  >
                    {isDraft ? "🎙️" : state === "done" ? "📺" : "🔍"}
                  </div>
                  <div className="min-w-[240px] flex-1">
                    <h3 className="font-heading text-[15px] font-bold leading-tight text-foreground">
                      {campaign.title || campaign.id}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {campaign.campaignKindLabel || "Campaña creator"}
                      {campaign.createdAt &&
                        ` · creada ${new Date(campaign.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}`}
                      {campaign.targetSegment && ` · ${campaign.targetSegment}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div
                        className={cn(
                          "font-heading text-2xl leading-none",
                          isDraft ? "text-muted-foreground/60" : "text-rust",
                        )}
                      >
                        {candidateCount}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        candidatos
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        meta.stampClass,
                      )}
                    >
                      {meta.stamp}
                    </span>
                  </div>
                </div>

                <div className="px-5 pb-3">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", meta.barClass)}
                      style={{ width: isDraft ? "0%" : "100%" }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {isDraft
                      ? "Borrador pendiente de completar."
                      : `${candidateCount} candidatos en pipeline · ${shortlisted} priorizados`}
                  </p>
                </div>

                {!isDraft && (
                  <div
                    className="relative flex flex-wrap items-center gap-2 border-t border-border px-5 py-2.5"
                    onClick={(event) => event.stopPropagation()}
                    data-testid="search-templates-row"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Plantillas:
                    </span>
                    {(
                      searches.find(
                        (search) => search.campaignId === campaign.id,
                      )?.templates || []
                    ).map((instance) => (
                      <span
                        key={instance.instanceId}
                        title={`Plantilla asignada: ${instance.name}`}
                        className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-foreground"
                        data-template-instance={instance.templateId}
                      >
                        {instance.kind === "sequence" ? "✉️" : "📝"}{" "}
                        {instance.name}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setPickerFor(
                          pickerFor === campaign.id ? null : campaign.id,
                        )
                      }
                      className="rounded-full border border-dashed border-border px-3 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-rust hover:text-foreground"
                      title="Asignar una plantilla de la biblioteca"
                      data-testid="assign-template-chip"
                    >
                      + asignar plantilla
                    </button>

                    {pickerFor === campaign.id && (
                      <div
                        className="absolute left-5 top-full z-20 mt-1 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-md"
                        data-testid="template-picker"
                      >
                        <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Asignar desde biblioteca
                        </div>
                        {templateLibrary.length === 0 && (
                          <p className="px-3 py-3 text-xs italic text-muted-foreground">
                            Biblioteca vacía.
                          </p>
                        )}
                        {templateLibrary.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => {
                              onAssignTemplate?.(campaign, template.id);
                              setPickerFor(null);
                            }}
                            className="flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left text-xs transition-colors last:border-b-0 hover:bg-muted/40"
                            data-picker-template={template.id}
                          >
                            <span aria-hidden>
                              {template.kind === "sequence" ? "✉️" : "📝"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold text-foreground">
                                {template.name}
                              </span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {template.description}
                              </span>
                            </span>
                            <span className="shrink-0 rounded border border-border bg-muted px-1.5 text-[9px] font-semibold text-muted-foreground">
                              Asignar
                            </span>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setPickerFor(null);
                            onCreateTemplate?.();
                          }}
                          className="w-full border-t border-border px-3 py-2 text-left text-xs font-semibold text-rust transition-colors hover:bg-muted/40"
                          data-testid="picker-create-new"
                        >
                          + Crear nueva en Plantillas →
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

      <p className="mt-5 text-[11px] text-muted-foreground">
        Abrir una búsqueda muestra sus candidatos filtrados en Contactos.
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
  quote?: string;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-8 py-12 text-center">
      {quote && (
        <p className="text-[13px] italic text-muted-foreground">{quote}</p>
      )}
      <div className="mt-3 text-base font-semibold text-foreground">
        {title}
      </div>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {body}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 rounded-lg border-2 border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:border-rust"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
