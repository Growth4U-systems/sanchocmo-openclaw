/**
 * Drawer del partner (SAN-78) — mismo patrón doc-slideover de Foundation
 * (overlay + panel derecho expandible a pantalla completa, como Brand Brain),
 * construido sobre el SlideOver compartido con contenido de partner:
 *
 *  1. Quality score grande + desglose de 5 componentes con barras
 *     (paridad drawer-partner.html; los componentes vienen del lead Yalc
 *     `qualityComponents` = { erVsTier, authenticity, sectorFit, audienceEs, consistency }).
 *  2. Datos del creator (red, followers, ER, tier, campaña, fuente).
 *  3. Calc break-even interactiva (SAN-80 · motor SAN-75b): deal editable
 *     recalculando en vivo — paridad drawer-partner.html.
 *  4. Contact log: hechos del pipeline + hilo real de mensajes (lead_messages
 *     de Yalc, el mismo del Inbox).
 */

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { SlideOver } from "@/components/shared/slide-over";
import { BreakEvenCalc } from "./break-even-calc";
import {
  DISCARDED_STAGE,
  feeStageNote,
  formatEur,
  formatFollowers,
  formatTier,
  leadDisplayName,
  qualityBand,
  stageForStatus,
  type StageFilterKey,
} from "@/lib/partnerships/stage-mapping";
import type { PartnershipLead, QualityComponentsMap } from "@/lib/partnerships/types";
import { NetworkChip, ScoreBar, StageStamp, TierChip } from "./ui";
import { useModelConfig } from "./use-model-config";

/** Orden + etiquetas del desglose (paridad mockup drawer-partner.html). */
const COMPONENT_ROWS: Array<{ key: keyof QualityComponentsMap; label: string }> = [
  { key: "erVsTier", label: "⚡ ER vs tier" },
  { key: "authenticity", label: "🛡️ Autenticidad" },
  { key: "sectorFit", label: "🎯 Sector fit & track record" },
  { key: "audienceEs", label: "🇪🇸 Audiencia ES" },
  { key: "consistency", label: "📆 Consistencia" },
];

interface PartnerDrawerProps {
  slug?: string;
  lead: PartnershipLead | null;
  onClose: () => void;
  onMove: (lead: PartnershipLead, target: StageFilterKey, note?: string) => void;
  busy?: boolean;
}

interface DrawerMessage {
  id: string;
  direction: "in" | "out";
  subject?: string | null;
  body: string;
  status: string;
  createdAt?: string | null;
}

export function PartnerDrawer({ slug, lead, onClose, onMove, busy }: PartnerDrawerProps) {
  const [expanded, setExpanded] = useState(false);

  // SAN-76: la calc del drawer usa la config EFECTIVA del modelo (la de
  // Settings/Yalc; degrada a la sembrada mientras carga o sin Yalc).
  const modelConfig = useModelConfig(slug || "");

  // Hilo real del lead (lead_messages de Yalc — el mismo que el Inbox).
  const thread = useQuery({
    queryKey: ["yalc", slug, "lead-messages", lead?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/yalc/leads/${encodeURIComponent(lead!.id)}/messages?slug=${encodeURIComponent(slug!)}`,
      );
      if (!res.ok) throw new Error(`messages ${res.status}`);
      return (await res.json()) as { messages?: DrawerMessage[] };
    },
    enabled: !!slug && !!lead,
  });

  if (!lead) return null;
  const threadMessages = (thread.data?.messages || []).filter((m) => m.status !== "draft");

  const stage = stageForStatus(lead.lifecycleStatus);
  const band = qualityBand(lead.qualityScore);
  const components = lead.qualityComponents || null;
  const feeNote = feeStageNote(stage);

  return (
    <SlideOver
      open={!!lead}
      onClose={() => {
        setExpanded(false);
        onClose();
      }}
      title={`🤝 ${leadDisplayName(lead)}`}
      width={expanded ? "w-screen" : "w-[600px] max-w-[94vw]"}
      actions={
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="rounded-md border border-border px-2.5 py-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-ink hover:text-foreground"
          title={expanded ? "Volver al panel lateral" : "Expandir a pantalla completa"}
        >
          {expanded ? "⇥ Contraer" : "⤢ Expandir"}
        </button>
      }
    >
      <div className={cn("space-y-6", expanded && "mx-auto max-w-5xl")} data-testid="partner-drawer">
        {/* Meta del creator */}
        <div className="flex flex-wrap items-center gap-2">
          <NetworkChip network={lead.network} />
          <TierChip tier={lead.tier} />
          <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">
            {formatFollowers(lead.followers)} followers
          </span>
          {typeof lead.engagementRate === "number" && (
            <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">
              ER {lead.engagementRate.toFixed(1)}%
            </span>
          )}
          <StageStamp lead={lead} />
        </div>

        {/* Triaje desde el drawer (paridad kanban) */}
        {(stage === "Discovered" || stage === DISCARDED_STAGE) && (
          <div className="flex flex-wrap gap-2">
            {stage === "Discovered" && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMove(lead, "Shortlist")}
                  className="rounded-md border-2 border-ink bg-yellow-100 px-3 py-1.5 text-sm font-bold text-ink shadow-comic-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  ✓ Mover a Shortlist
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const note = window.prompt("Nota del descarte (opcional):", "");
                    if (note === null) return;
                    onMove(lead, DISCARDED_STAGE, note.trim() || undefined);
                  }}
                  className="rounded-md border-2 border-border bg-card px-3 py-1.5 text-sm font-bold text-destructive shadow-comic-sm transition-transform hover:-translate-y-0.5 hover:border-destructive disabled:opacity-50"
                >
                  🗑 Descartar
                </button>
              </>
            )}
            {stage === DISCARDED_STAGE && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onMove(lead, "Discovered")}
                className="rounded-md border-2 border-ink bg-sage px-3 py-1.5 text-sm font-bold text-white shadow-comic-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                title="Los descartes son reversibles: vuelve a Discovered (yalc: Sourced)"
              >
                ↩︎ Restaurar a Discovered
              </button>
            )}
          </div>
        )}

        {/* Quality score — desglose de 5 componentes */}
        <section className="rounded-xl border-2 border-border bg-card p-4 shadow-comic-sm">
          <h3 className="font-heading text-base uppercase tracking-wide text-navy">🎯 Quality score — desglose</h3>
          <div className="mt-3 flex items-start gap-4">
            <div
              className={cn(
                "flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-ink font-heading text-3xl shadow-comic-sm",
                band === "high" && "bg-sage/15 text-sage",
                band === "medium" && "bg-yellow-100 text-yellow-800",
                band === "low" && "bg-destructive/10 text-destructive",
                !band && "bg-muted text-muted-foreground",
              )}
              data-testid="quality-total"
            >
              {typeof lead.qualityScore === "number" ? Math.round(lead.qualityScore) : "—"}
            </div>
            <div className="min-w-0 flex-1">
              {components ? (
                <div className="space-y-2.5">
                  {COMPONENT_ROWS.map((row) => {
                    const value = components[row.key];
                    return (
                      <div key={row.key} className="flex items-center gap-3" data-component={row.key}>
                        <span className="w-44 shrink-0 text-xs font-semibold text-muted-foreground">{row.label}</span>
                        {typeof value === "number" ? (
                          <>
                            <ScoreBar value={value} className="flex-1" />
                            <span className="w-8 shrink-0 text-right font-heading text-sm text-navy">
                              {Math.round(value)}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">sin señal</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sin desglose todavía: el quality score con sus 5 componentes lo calcula el
                  discovery (<code className="rounded bg-muted px-1">qualify-enrich</code>, SAN-79) y se puede pedir vía{" "}
                  <code className="rounded bg-muted px-1">/api/yalc/qualify</code>.
                </p>
              )}
            </div>
          </div>
          <p className="mt-3 text-[11px] italic text-muted-foreground">
            5 señales escaneadas de datos públicos del perfil — en discovery solo se ve CALIDAD (sin precio).
          </p>
        </section>

        {/* Datos del creator */}
        <section className="rounded-xl border-2 border-border bg-card p-4 shadow-comic-sm">
          <h3 className="font-heading text-base uppercase tracking-wide text-navy">👤 Datos del creator</h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <DataItem label="Handle" value={lead.handle || "—"} />
            <DataItem label="Red" value={lead.network || "—"} />
            <DataItem label="Seguidores" value={formatFollowers(lead.followers)} />
            <DataItem
              label="Engagement rate"
              value={typeof lead.engagementRate === "number" ? `${lead.engagementRate.toFixed(1)}%` : "—"}
            />
            <DataItem label="Tier" value={formatTier(lead.tier) || "—"} />
            <DataItem label="Búsqueda" value={lead.campaignTitle || lead.campaignId} />
            <DataItem label="Fuente" value={lead.source || "—"} />
            <DataItem label="Email" value={lead.email || "—"} />
            <DataItem
              label="Precio"
              value={
                typeof lead.offeredPrice === "number"
                  ? `${formatEur(lead.offeredPrice)}${feeNote ? ` (${feeNote})` : ""}`
                  : "—"
              }
            />
          </dl>
        </section>

        {/* Calc break-even interactiva (SAN-80 · motor calc-creator-core) */}
        <BreakEvenCalc lead={lead} config={modelConfig.data?.config} />

        {/* Contact log (placeholder hasta el Inbox de SAN-80) */}
        <section className="rounded-xl border-2 border-border bg-card p-4 shadow-comic-sm" data-testid="contact-log">
          <h3 className="font-heading text-base uppercase tracking-wide text-navy">📜 Contact log</h3>
          <div className="mt-3 space-y-2">
            <LogRow
              icon="🔭"
              title={`Descubierto vía búsqueda «${lead.campaignTitle || lead.campaignId}»`}
              date={lead.createdAt}
            />
            {lead.discardNote && <LogRow icon="🗑" title={`Descartado — ${lead.discardNote}`} date={lead.updatedAt} />}
            {stage !== "Discovered" && stage !== DISCARDED_STAGE && (
              <LogRow
                icon="🔁"
                title={`Último movimiento de stage → ${stage || lead.lifecycleStatus}`}
                date={lead.updatedAt}
              />
            )}
          </div>
          {threadMessages.length > 0 && (
            <div className="mt-2 space-y-2" data-testid="contact-log-messages">
              {threadMessages.map((message) => (
                <LogRow
                  key={message.id}
                  icon={message.direction === "out" ? "📨" : "📩"}
                  title={`${message.direction === "out" ? "Email enviado" : "Respuesta recibida"}${
                    message.subject ? ` — ${message.subject}` : ""
                  }${message.status === "dry_run" ? " (dry-run)" : ""}`}
                  date={message.createdAt}
                />
              ))}
            </div>
          )}
          <p className="mt-3 rounded-md border border-dashed border-border bg-background px-3 py-2 text-[12px] italic text-muted-foreground">
            El hilo completo (con detección de precios y break-even sobre cada oferta) vive en el
            Inbox de negociación.
          </p>
        </section>
      </div>
    </SlideOver>
  );
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate font-semibold text-foreground" title={value}>
        {value}
      </dd>
    </div>
  );
}

function LogRow({ icon, title, date }: { icon: string; title: string; date?: string | null }) {
  const formatted = date
    ? new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2">
      <span aria-hidden>{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {formatted && <div className="text-[11px] text-muted-foreground">{formatted}</div>}
      </div>
    </div>
  );
}
