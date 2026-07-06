/**
 * Contactos · Kanban (SAN-78) — pipeline Discovered → … → Closed sobre
 * GET /api/yalc/leads; drag&drop → PATCH /api/yalc/leads/[id]/stage.
 *
 * Comportamiento (spec = mockup contactos-kanban.html + decisiones 2026-06-11):
 *  - 8 columnas con sublabel del estado Yalc al que mapean (tooltip + texto).
 *  - Cards en Discovered llevan triaje rápido: ✓ → Shortlist · 🗑 → Descartado
 *    (Descartado NO es columna: estado oculto recuperable desde la Lista).
 *  - Roster = este mismo kanban filtrado a Signed + Active (toggle, no pantalla).
 *  - Click en card → drawer del partner.
 */

"use client";

import { useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import {
  PIPELINE_STAGES,
  ROSTER_STAGES,
  groupLeadsByStage,
  leadDisplayName,
  feeStageNote,
  formatEur,
  stageForStatus,
  type PipelineStageKey,
  type StageFilterKey,
} from "@/lib/partnerships/stage-mapping";
import type { PartnershipLead } from "@/lib/partnerships/types";
import { NetworkChip, QualityBadge, TierChip } from "./ui";

interface KanbanViewProps {
  leads: PartnershipLead[];
  roster: boolean;
  busyLeadId?: string;
  onMove: (
    lead: PartnershipLead,
    target: StageFilterKey,
    note?: string,
  ) => void;
  onOpen: (lead: PartnershipLead) => void;
}

export function KanbanView({
  leads,
  roster,
  busyLeadId,
  onMove,
  onOpen,
}: KanbanViewProps) {
  const groups = groupLeadsByStage(leads);
  const stages = roster
    ? PIPELINE_STAGES.filter((stage) => ROSTER_STAGES.includes(stage.key))
    : PIPELINE_STAGES;
  const [dragOver, setDragOver] = useState<PipelineStageKey | null>(null);

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
    target: PipelineStageKey,
  ) {
    event.preventDefault();
    setDragOver(null);
    const leadId = event.dataTransfer.getData("text/plain");
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return;
    if (stageForStatus(lead.lifecycleStatus) === target) return;
    onMove(lead, target);
  }

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-4"
      data-testid="partnerships-kanban"
    >
      {stages.map((stage) => {
        const items = groups[stage.key];
        return (
          <section
            key={stage.key}
            data-stage={stage.key}
            className={cn(
              "flex min-h-[320px] w-[230px] shrink-0 flex-col rounded-lg border border-border bg-card transition-colors",
              dragOver === stage.key && "border-rust bg-rust/5",
            )}
          >
            <header
              title={stage.headTooltip || stage.label}
              className="flex items-start justify-between gap-2 border-b border-border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-muted-foreground">
                  {stage.label}
                </div>
              </div>
              <span className="rounded-full bg-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {items.length}
              </span>
            </header>
            <div
              className="flex-1 space-y-2 p-2"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dragOver !== stage.key) setDragOver(stage.key);
              }}
              onDragLeave={() =>
                setDragOver((current) =>
                  current === stage.key ? null : current,
                )
              }
              onDrop={(event) => handleDrop(event, stage.key)}
            >
              {items.length === 0 && (
                <p className="py-8 text-center text-[11px] text-muted-foreground">
                  Vacío
                </p>
              )}
              {items.map((lead) => (
                <KanbanCard
                  key={lead.id}
                  lead={lead}
                  stage={stage.key}
                  busy={busyLeadId === lead.id}
                  onMove={onMove}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function KanbanCard({
  lead,
  stage,
  busy,
  onMove,
  onOpen,
}: {
  lead: PartnershipLead;
  stage: PipelineStageKey;
  busy: boolean;
  onMove: KanbanViewProps["onMove"];
  onOpen: KanbanViewProps["onOpen"];
}) {
  const [dragging, setDragging] = useState(false);
  const feeNote = feeStageNote(stage);

  function discard() {
    // Triaje con nota manual: el humano puede explicar el descarte; si lo deja
    // vacío, Yalc registra 'manual · <fecha>' (reversible desde la Lista).
    const note = window.prompt(
      `Descartar ${leadDisplayName(lead)} — nota del descarte (opcional):`,
      "",
    );
    if (note === null) return; // cancelado
    onMove(lead, "Discarded", note.trim() || undefined);
  }

  return (
    <article
      draggable
      data-lead-id={lead.id}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", lead.id);
        event.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={() => onOpen(lead)}
      className={cn(
        "cursor-pointer rounded-lg border border-border bg-background p-2.5 transition-colors hover:border-rust",
        dragging && "opacity-50",
        busy && "pointer-events-none opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {leadDisplayName(lead)}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <NetworkChip network={lead.network} />
            <TierChip tier={lead.tier} />
          </div>
        </div>
        <QualityBadge score={lead.qualityScore} />
      </div>
      {typeof lead.offeredPrice === "number" && (
        <div className="mt-1.5 text-xs font-semibold text-rust">
          {formatEur(lead.offeredPrice)}
          {feeNote && (
            <span className="ml-1 font-normal text-muted-foreground">
              {feeNote}
            </span>
          )}
        </div>
      )}
      {(stage === "Discovered" || stage === "Shortlist") && (
        <div className="mt-2 flex gap-1.5 border-t border-border pt-2">
          {stage === "Shortlist" && (
            <button
              type="button"
              title="Preparar contacto"
              onClick={(event) => {
                event.stopPropagation();
                onMove(lead, "Contacted");
              }}
              className="flex-1 rounded-md border border-rust bg-rust px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-rust/90"
              data-testid="kanban-contactar"
            >
              Contactar
            </button>
          )}
          {stage === "Discovered" && (
            <>
              <button
                type="button"
                title="Mover a Shortlist"
                onClick={(event) => {
                  event.stopPropagation();
                  onMove(lead, "Shortlist");
                }}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold transition-colors hover:border-rust hover:text-rust"
              >
                ✓ Shortlist
              </button>
              <button
                type="button"
                title="Descartar"
                onClick={(event) => {
                  event.stopPropagation();
                  discard();
                }}
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
              >
                🗑
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
