/**
 * Outreach > Contactos tab — Phase 1 placeholder.
 *
 * Merged with Pipeline tab (2026-04-15): same dataset (contacts del cliente),
 * two view modes. Toggle arriba entre:
 *
 *   - 📋 Lista: tabla con filtros, multi-select, bulk actions
 *   - 🗂️ Kanban: cards por contacto agrupados por `pipeline_stage`
 *
 * Same architectural pattern as Content Creation (Ideas list + Calendar
 * view on the same underlying ideas dataset).
 *
 * Future content (Phase 2+):
 *   **Vista Lista**:
 *   - Tabla con filtros (ECP, signal, enrichment_status, source, project, tags)
 *   - Multi-select + bulk actions (enrichment, pipeline, exclude, export, tag)
 *   - Drawer de detalle por contacto (historial touches + replies + enrichment)
 *   - Cache lookup: skip enrichment cuando el contacto ya está enriquecido
 *     (decision #1 del plan v3 — no re-quemar tokens)
 *
 *   **Vista Kanban**:
 *   - Columnas: Queued / Sent / Opened / Replied / Meeting / Stopped
 *   - Cards = contactos con touch count, último touch, reply classification
 *   - Drag manual override
 *   - Auto-move cuando llegan webhooks de Gmail/Instantly/HeyReach
 *
 * Reference: Outreach plan v3 → merged tab decision 2026-04-15.
 */

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { OutreachPhase1Placeholder } from "./OutreachPhase1Placeholder";

interface Props {
  slug: string;
}

type ViewMode = "list" | "kanban";

export function OutreachContactsTab({ slug }: Props) {
  const [view, setView] = useState<ViewMode>("list");

  return (
    <div className="space-y-4">
      {/* View mode toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView("list")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all",
            view === "list"
              ? "bg-rust text-white border-rust"
              : "border-border hover:border-rust text-foreground/70"
          )}
        >
          📋 Vista Lista
        </button>
        <button
          type="button"
          onClick={() => setView("kanban")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all",
            view === "kanban"
              ? "bg-rust text-white border-rust"
              : "border-border hover:border-rust text-foreground/70"
          )}
        >
          🗂️ Vista Kanban
        </button>
      </div>

      {view === "list" ? (
        <OutreachPhase1Placeholder
          icon="📋"
          title="Contactos — Vista Lista"
          slug={slug}
          description="Tabla de contactos del cliente con filtros, multi-select y bulk actions. Cache de enrichment — no re-quema tokens si el contacto ya está enriquecido."
          actions={[
            "Tabla: nombre, title, company, email_verified, enrichment_status, pipeline_stage, ECP match, signal, source, project, tags",
            "Filtros multi-select en toolbar (chips de ECP, signal, source, status)",
            "Multi-select de filas + bulk actions (enrichment, pipeline, exclude, export CSV, tag bulk)",
            "Drawer de detalle por contacto: historial touches + replies + enrichment provenance",
            "Cache lookup: skip enrichment cuando el contacto ya tiene email_verified válido (evita re-quemar tokens)",
          ]}
        />
      ) : (
        <OutreachPhase1Placeholder
          icon="🗂️"
          title="Contactos — Vista Kanban"
          slug={slug}
          description="Kanban del estado de cada contacto en el pipeline outbound. Mismo dataset que la vista lista, agrupado por pipeline_stage."
          actions={[
            "Columnas: Queued / Sent / Opened / Replied / Meeting / Stopped",
            "Cards = contactos (con touch count, último touch, reply classification)",
            "Drag manual override (permite mover contactos manualmente entre stages)",
            "Auto-move con webhooks: Gmail/Instantly/HeyReach → update pipeline_stage automáticamente",
            "Click en card → abre el mismo drawer de detalle que la vista lista",
          ]}
        />
      )}
    </div>
  );
}
