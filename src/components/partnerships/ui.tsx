/**
 * Partnerships (SAN-78) · piezas UI pequeñas compartidas por kanban/lista/drawer.
 * Estilo del producto real (mismos patrones que metrics/content-creation/brand-brain):
 * badges sobrios de un borde, sin estética cómic — los mockups mandan solo en
 * comportamiento.
 */

"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  formatTier,
  normalizeNetwork,
  qualityBand,
  stageForStatus,
  type QualityBand,
  type StageFilterKey,
} from "@/lib/partnerships/stage-mapping";
import type { PartnershipLead } from "@/lib/partnerships/types";

// ── Quality badge (verde ≥85 · ámbar 70-84 · rojo <70) ──

const BAND_BADGE: Record<QualityBand, string> = {
  high: "border-sage/60 bg-sage/15 text-sage",
  medium: "border-amber-400/60 bg-amber-100 text-amber-800",
  low: "border-destructive/50 bg-destructive/10 text-destructive",
};

export function QualityBadge({
  score,
  size = "md",
}: {
  score?: number | null;
  size?: "md" | "lg";
}) {
  const band = qualityBand(score);
  return (
    <span
      title={
        band
          ? `Quality ${score}/100 — ER vs tier · autenticidad · sector fit · audiencia ES · consistencia`
          : "Sin quality score todavía (lo calcula el discovery, SAN-79)"
      }
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border font-heading font-semibold",
        size === "lg" ? "h-12 w-12 text-lg" : "h-9 w-9 text-sm",
        band ? BAND_BADGE[band] : "border-border bg-muted text-muted-foreground",
      )}
    >
      {typeof score === "number" ? Math.round(score) : "—"}
    </span>
  );
}

// ── Chips de red / tier ──

const NETWORK_META: Record<string, { label: string; emoji: string; className: string }> = {
  instagram: { label: "Instagram", emoji: "📸", className: "border-pink-300/70 bg-pink-50 text-pink-800" },
  youtube: { label: "YouTube", emoji: "▶️", className: "border-red-300/70 bg-red-50 text-red-800" },
  tiktok: { label: "TikTok", emoji: "🎵", className: "border-border bg-muted text-foreground" },
  other: { label: "Red", emoji: "🌐", className: "border-border bg-muted/50 text-muted-foreground" },
};

export function networkMeta(network?: string | null) {
  const meta = NETWORK_META[normalizeNetwork(network)];
  return network && normalizeNetwork(network) === "other"
    ? { ...meta, label: network }
    : meta;
}

export function NetworkChip({ network }: { network?: string | null }) {
  const meta = networkMeta(network);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", meta.className)}>
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
    </span>
  );
}

export function TierChip({ tier }: { tier?: string | null }) {
  const label = formatTier(tier);
  if (!label) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Tier {label}
    </span>
  );
}

// ── Stamp de stage (lista + drawer) ──

const STAGE_STAMP: Partial<Record<StageFilterKey, string>> = {
  Discovered: "border-border bg-muted/50 text-muted-foreground",
  Shortlist: "border-cyan-600/50 bg-cyan-50 text-cyan-800",
  Contacted: "border-yellow-500/50 bg-yellow-100 text-yellow-800",
  Replied: "border-cyan-600/50 bg-cyan-50 text-cyan-800",
  Negotiating: "border-rust/50 bg-rust/10 text-rust",
  Signed: "border-sage/50 bg-sage/10 text-sage",
  Active: "border-sage bg-sage text-white",
  Closed: "border-border bg-muted text-muted-foreground",
  Discarded: "border-destructive/50 bg-destructive/10 text-destructive",
};

export function StageStamp({ lead }: { lead: PartnershipLead }) {
  const stage = stageForStatus(lead.lifecycleStatus);
  const label = stage === "Discarded" ? "Descartado" : stage || lead.lifecycleStatus || "—";
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        title={`yalc: ${lead.lifecycleStatus || "?"}`}
        className={cn(
          "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          (stage && STAGE_STAMP[stage]) || "border-border bg-muted/50 text-muted-foreground",
        )}
      >
        {stage === "Discarded" && <span className="mr-1" aria-hidden>🗑</span>}
        {label}
      </span>
      {lead.discardNote && (
        <span className="text-[10px] text-muted-foreground">{lead.discardNote}</span>
      )}
    </span>
  );
}

// ── Barra mini (sector fit en la lista, componentes en el drawer) ──

export function ScoreBar({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span className={cn("block h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <span
        className={cn(
          "block h-full rounded-full",
          clamped >= 80 ? "bg-sage" : clamped >= 60 ? "bg-cyan-600" : "bg-destructive",
        )}
        style={{ width: `${clamped}%` }}
      />
    </span>
  );
}

// ── Toast ligero (feedback de triaje / drag / bulk) ──

export interface ToastState {
  message: string;
  tone: "ok" | "warn";
}

export function useToast(): { toast: ToastState | null; showToast: (message: string, tone?: "ok" | "warn") => void } {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string, tone: "ok" | "warn" = "ok") => {
    setToast({ message, tone });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  return { toast, showToast };
}

export function ToastViewport({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      className={cn(
        "fixed bottom-6 left-1/2 z-[600] -translate-x-1/2 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg",
        toast.tone === "ok"
          ? "border-border bg-card text-foreground"
          : "border-yellow-300/60 bg-yellow-50 text-yellow-900",
      )}
    >
      {toast.message}
    </div>
  );
}
