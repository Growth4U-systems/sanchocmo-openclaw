/**
 * Inbox de negociación (SAN-80) — paridad de comportamiento con inbox.html:
 *
 *  - chips de estado con contadores (8 estados mapeados al enum real de
 *    Yalc vía inbox-mapping; los inexistentes se derivan) que filtran la
 *    lista de conversaciones;
 *  - hilo de la conversación (lead_messages de Yalc) con burbujas in/out;
 *  - negotiation-assist: precio detectado en la última reply → panel
 *    "Sancho ha detectado un precio" con el break-even REAL de
 *    calc-creator-core (fee editable + incentivo, necesarias vs alcanzable,
 *    veredicto, contraoferta) + "📎 Insertar análisis en la respuesta";
 *  - borrador (💾 guardar como draft en el hilo) + 📨 Enviar → GateItem
 *    real (POST /api/partnerships/contact → gate en Yalc) → modal de
 *    aprobación (human-in-the-loop) → aprobar = dry-run send y el estado
 *    avanza.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  INBOX_STATES,
  inboxConversations,
  inboxStateCounts,
  type InboxStateKey,
} from "@/lib/partnerships/inbox-mapping";
import {
  detectLatestPrice,
  insertAnalysisParagraph,
  negotiationBreakEven,
} from "@/lib/partnerships/negotiation";
import { formatFollowers, formatIntEs, formatTier, leadDisplayName } from "@/lib/partnerships/stage-mapping";
import type { PartnershipLead } from "@/lib/partnerships/types";
import { NarratorCaption, ToastViewport, useToast } from "./ui";

interface LeadMessage {
  id: string;
  direction: "in" | "out";
  subject?: string | null;
  body: string;
  status: string;
  createdAt?: string | null;
  meta?: Record<string, unknown> | null;
}

interface InboxLead extends PartnershipLead {
  emailSentAt?: string | null;
  emailRepliedAt?: string | null;
  emailBouncedAt?: string | null;
  emailStatus?: string | null;
  lastMessage?: LeadMessage | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload as T;
}

const STATE_CHIP_TONES: Record<string, string> = {
  paper: "bg-card text-foreground",
  blue: "bg-blue-100 text-navy",
  pale: "bg-yellow-50 text-foreground",
  yellow: "bg-yellow-300 text-ink",
  navy: "bg-navy text-white",
  rust: "bg-rust text-white",
  aged: "bg-muted text-muted-foreground",
  red: "bg-destructive text-white",
};

const MULTIPLIERS = [
  { value: 1, label: "×1 (sin código)" },
  { value: 1.5, label: "×1.5 (código descuento)" },
  { value: 2, label: "×2 (bono bienvenida)" },
  { value: 3, label: "×3 (bono + sorteo)" },
] as const;

function networkEmoji(network?: string | null): string {
  const value = (network || "").toLowerCase();
  if (value.startsWith("insta")) return "📸";
  if (value.startsWith("tik")) return "🎵";
  if (value.startsWith("you")) return "▶️";
  return "👤";
}

function timeAgo(date?: string | null): string {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "hace minutos";
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export function InboxTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();

  const [filter, setFilter] = useState<InboxStateKey | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const leadsKey = ["yalc", slug, "partnerships", "inbox-leads"] as const;
  const leadsQuery = useQuery({
    queryKey: leadsKey,
    queryFn: () =>
      fetchJson<{ leads?: InboxLead[] }>(
        `/api/yalc/leads?slug=${encodeURIComponent(slug)}&type=Partnerships&include=lastMessage`,
      ),
    enabled: !!slug,
  });

  const conversations = useMemo(
    () => inboxConversations(leadsQuery.data?.leads || []),
    [leadsQuery.data],
  );
  const counts = useMemo(() => inboxStateCounts(leadsQuery.data?.leads || []), [leadsQuery.data]);
  const visible = useMemo(
    () => conversations.filter((convo) => !filter || convo.inboxState === filter),
    [conversations, filter],
  );
  const selected = useMemo(
    () => conversations.find((convo) => convo.id === selectedId) || visible[0] || null,
    [conversations, visible, selectedId],
  );

  const threadKey = ["yalc", slug, "lead-messages", selected?.id] as const;
  const threadQuery = useQuery({
    queryKey: threadKey,
    queryFn: () =>
      fetchJson<{ messages: LeadMessage[] }>(
        `/api/yalc/leads/${encodeURIComponent(selected!.id)}/messages?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug && !!selected,
  });

  const messages = useMemo(
    () => (threadQuery.data?.messages || []).filter((message) => message.status !== "draft"),
    [threadQuery.data],
  );
  const draftMessage = useMemo(
    () => (threadQuery.data?.messages || []).find((message) => message.status === "draft") || null,
    [threadQuery.data],
  );

  // ── negotiation-assist: precio en la última reply entrante ──
  const lastIncoming = useMemo(
    () => [...messages].reverse().find((message) => message.direction === "in") || null,
    [messages],
  );
  const detectedPrice = useMemo(
    () => (lastIncoming ? detectLatestPrice(lastIncoming.body) : null),
    [lastIncoming],
  );

  const [fee, setFee] = useState<number | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  useEffect(() => {
    setFee(detectedPrice ? detectedPrice.amountEur : null);
    setMultiplier(1);
  }, [detectedPrice, selected?.id]);

  const breakEven = useMemo(() => {
    if (fee === null || !selected) return null;
    try {
      return negotiationBreakEven({
        feeEur: Math.max(0, fee),
        followers: selected.followers,
        engagementRatePct: selected.engagementRate,
        incentiveMultiplier: multiplier,
      });
    } catch {
      return null;
    }
  }, [fee, multiplier, selected]);

  // ── Borrador ──
  const [draft, setDraft] = useState("");
  useEffect(() => {
    setDraft(draftMessage?.body || "");
  }, [draftMessage?.id, draftMessage?.body, selected?.id]);

  const saveDraft = useMutation({
    mutationFn: () =>
      fetchJson(`/api/yalc/leads/${encodeURIComponent(selected!.id)}/messages?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: "out", body: draft, status: "draft" }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: threadKey });
      showToast("✓ borrador guardado");
    },
    onError: (error) => showToast(`⚠️ ${error instanceof Error ? error.message : "error"}`, "warn"),
  });

  // ── Enviar → gate (human-in-the-loop) ──
  interface PendingGate {
    runId: string;
    prompt: string;
    dryRun: boolean;
    preview: string;
    sent?: boolean;
  }
  const [gate, setGate] = useState<PendingGate | null>(null);

  const createGate = useMutation({
    mutationFn: () =>
      fetchJson<{ gates: Array<{ runId: string; prompt: string; dryRun: boolean }> }>(
        `/api/partnerships/contact?slug=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leads: [{ id: selected!.id, campaignId: selected!.campaignId }],
            sequence: [{ subject: `Re: colaboración con ${leadDisplayName(selected!)}`, body: draft, delayDays: 0 }],
            sequenceName: `Respuesta a ${leadDisplayName(selected!)}`,
          }),
        },
      ),
    onSuccess: (data) => {
      const first = data.gates?.[0];
      if (!first) {
        showToast("⚠️ Yalc no devolvió el gate", "warn");
        return;
      }
      setGate({ runId: first.runId, prompt: first.prompt, dryRun: first.dryRun, preview: draft });
    },
    onError: (error) => showToast(`⚠️ ${error instanceof Error ? error.message : "error"}`, "warn"),
  });

  const approveGate = useMutation({
    mutationFn: (runId: string) =>
      fetchJson(`/api/yalc/gates?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, action: "approve" }),
      }),
    onSuccess: () => {
      setGate((prev) => (prev ? { ...prev, sent: true } : prev));
      void queryClient.invalidateQueries({ queryKey: threadKey });
      void queryClient.invalidateQueries({ queryKey: leadsKey });
    },
    onError: (error) => showToast(`⚠️ ${error instanceof Error ? error.message : "error"}`, "warn"),
  });

  if (leadsQuery.isLoading) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Cargando conversaciones…</p>;
  }

  return (
    <div data-testid="inbox-tab">
      <div className="mb-3">
        <NarratorCaption>Las respuestas llegan… y Sancho lee entre líneas.</NarratorCaption>
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* ── Lista + chips ── */}
        <div>
          <div className="mb-3 flex flex-wrap gap-1.5" data-testid="inbox-chips">
            {INBOX_STATES.map((state) => {
              const count = counts[state.key];
              const active = filter === state.key;
              return (
                <button
                  key={state.key}
                  type="button"
                  title={state.source}
                  onClick={() => setFilter(active ? null : state.key)}
                  data-state={state.key}
                  className={cn(
                    "rounded-full border-2 px-2.5 py-0.5 text-[11px] font-bold shadow-comic-sm transition-all hover:-translate-y-0.5",
                    active ? "border-ink bg-navy text-white" : "border-border bg-card text-foreground",
                    count === 0 && !active && "opacity-50",
                  )}
                >
                  {state.label}
                  <span
                    className={cn(
                      "ml-1.5 inline-block min-w-[17px] rounded-full border border-ink px-1 text-center text-[10px]",
                      count > 0 ? "bg-yellow-300 text-ink" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-xl border-2 border-border bg-card shadow-comic-sm" data-testid="convo-list">
            {visible.length === 0 && (
              <p className="px-4 py-7 text-center text-sm italic text-muted-foreground">
                Ninguna conversación{filter ? ` en "${INBOX_STATES.find((s) => s.key === filter)?.label}"` : ""}.
                Sancho está en ello…
              </p>
            )}
            {visible.map((convo) => {
              const meta = INBOX_STATES.find((state) => state.key === convo.inboxState)!;
              const snippet =
                convo.lastMessage?.direction === "out"
                  ? `Tú: ${convo.lastMessage.body}`
                  : convo.lastMessage?.body || "—";
              return (
                <button
                  key={convo.id}
                  type="button"
                  onClick={() => setSelectedId(convo.id)}
                  data-convo-id={convo.id}
                  className={cn(
                    "block w-full border-b-2 border-border/40 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-yellow-50",
                    selected?.id === convo.id && "bg-yellow-50 shadow-[inset_4px_0_0_theme(colors.rust)]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-ink">
                      {networkEmoji(convo.network)} {leadDisplayName(convo)}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {timeAgo(convo.lastMessage?.createdAt || convo.updatedAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{snippet}</div>
                  <span
                    className={cn(
                      "mt-1.5 inline-block rounded border-2 border-ink px-1.5 py-px text-[9px] font-bold uppercase tracking-wide shadow-comic-sm",
                      STATE_CHIP_TONES[meta.tone],
                    )}
                  >
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Hilo ── */}
        <div className="overflow-hidden rounded-xl border-2 border-border bg-card shadow-comic-sm" data-testid="thread-panel">
          {!selected ? (
            <div className="px-8 py-14 text-center">
              <div className="font-heading text-2xl text-navy">SIN CONVERSACIONES</div>
              <p className="mx-auto mt-2 max-w-md text-sm italic text-muted-foreground">
                Cuando contactes creators (Contactos → Contactar) sus hilos aparecerán aquí; cada
                respuesta con precio dispara el break-even de Sancho.
              </p>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-3 border-b-2 border-border bg-yellow-50 px-5 py-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg border-2 border-ink bg-card text-lg shadow-comic-sm" aria-hidden>
                  {networkEmoji(selected.network)}
                </div>
                <div className="min-w-[180px] flex-1">
                  <div className="font-heading text-lg leading-tight text-ink">{leadDisplayName(selected)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {[
                      selected.network,
                      formatFollowers(selected.followers),
                      formatTier(selected.tier) && `Tier ${formatTier(selected.tier)}`,
                      typeof selected.engagementRate === "number" && `ER ${selected.engagementRate.toFixed(1)}%`,
                      typeof selected.qualityScore === "number" && `Quality ${Math.round(selected.qualityScore)}`,
                      selected.campaignTitle && `campaña: ${selected.campaignTitle}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded border-2 border-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-comic-sm",
                    STATE_CHIP_TONES[INBOX_STATES.find((s) => s.key === selected.inboxState)!.tone],
                  )}
                  data-testid="thread-state"
                >
                  {INBOX_STATES.find((s) => s.key === selected.inboxState)!.label}
                </span>
              </header>

              <div className="space-y-4 px-5 py-4">
                {threadQuery.isLoading && (
                  <p className="py-4 text-center text-sm text-muted-foreground">Cargando hilo…</p>
                )}
                {!threadQuery.isLoading && messages.length === 0 && (
                  <p className="py-4 text-center text-sm italic text-muted-foreground">
                    Sin mensajes todavía — el primer email saldrá al aprobar el gate de contacto.
                  </p>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("flex", message.direction === "out" && "justify-end")}
                    data-direction={message.direction}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-xl border-2 border-ink px-4 py-2.5 text-sm leading-relaxed shadow-comic-sm",
                        message.direction === "out" ? "rounded-br-sm bg-blue-50" : "rounded-bl-sm bg-card",
                      )}
                    >
                      <div className="mb-1 text-[10px] font-semibold text-muted-foreground">
                        {message.direction === "out" ? "Equipo (vía Sancho)" : leadDisplayName(selected)}
                        {" · "}
                        {timeAgo(message.createdAt)}
                        {message.subject ? ` · ${message.subject}` : ""}
                        {message.status === "dry_run" && " · dry-run"}
                      </div>
                      <div className="whitespace-pre-wrap">{message.body}</div>
                    </div>
                  </div>
                ))}

                {/* ── Panel negotiation-assist ── */}
                {breakEven && detectedPrice && (
                  <section
                    className="rounded-xl border-2 border-ink bg-card p-4 shadow-comic-sm"
                    style={{
                      backgroundImage: "radial-gradient(circle, rgba(196,93,53,0.08) 1px, transparent 1px)",
                      backgroundSize: "6px 6px",
                    }}
                    data-testid="sancho-price-panel"
                  >
                    <h3 className="flex flex-wrap items-center gap-2 font-heading text-lg text-rust">
                      🧮 Sancho ha detectado un precio:{" "}
                      <span data-testid="detected-price">{formatIntEs(fee ?? detectedPrice.amountEur)}€</span>
                    </h3>

                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-bold text-muted-foreground">
                      <label className="flex items-center gap-2">
                        Fee 💶
                        <input
                          type="number"
                          min={0}
                          step={50}
                          value={fee ?? 0}
                          onChange={(e) => setFee(parseFloat(e.target.value) || 0)}
                          className="w-24 rounded-md border-2 border-border bg-background px-2 py-1 text-sm font-bold focus:border-ink focus:outline-none"
                          data-testid="panel-fee"
                        />
                      </label>
                      <label className="flex items-center gap-2">
                        Incentivo 🎁
                        <select
                          value={String(multiplier)}
                          onChange={(e) => setMultiplier(parseFloat(e.target.value) || 1)}
                          className="rounded-md border-2 border-border bg-background px-2 py-1 text-sm font-bold focus:border-ink focus:outline-none"
                          data-testid="panel-mult"
                        >
                          {MULTIPLIERS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2.5" data-testid="panel-cells">
                      <div className="rounded-lg border-2 border-border bg-background p-2.5 text-center">
                        <div className="font-heading text-xl leading-none text-navy" data-testid="panel-necesarias">
                          {Number.isFinite(breakEven.necesarias) ? formatIntEs(breakEven.necesarias) : "∞"}
                        </div>
                        <div className="mt-1 text-[9px] font-semibold text-muted-foreground">
                          conversiones necesarias
                          <br />({breakEven.formulaNecesarias})
                        </div>
                      </div>
                      <div className="rounded-lg border-2 border-border bg-background p-2.5 text-center">
                        <div className="font-heading text-xl leading-none text-navy" data-testid="panel-alcanzable">
                          ~{formatIntEs(breakEven.alcanzable)}
                        </div>
                        <div className="mt-1 text-[9px] font-semibold text-muted-foreground">
                          alcanzables estimadas
                          <br />
                          (×{breakEven.deal.incentiveMultiplier} incentivo)
                        </div>
                      </div>
                      <div className="rounded-lg border-2 border-border bg-background p-2.5 text-center">
                        <div className="font-heading text-xl leading-none text-navy" data-testid="panel-ratio">
                          {breakEven.ratio === Infinity ? "∞" : `${Math.round(breakEven.ratio * 100)}%`}
                        </div>
                        <div className="mt-1 text-[9px] font-semibold text-muted-foreground">
                          cobertura del break-even
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span
                        className={cn(
                          "-rotate-1 rounded-md border-2 border-ink px-3 py-0.5 font-heading text-base tracking-wide shadow-comic-sm",
                          breakEven.veredictoColor === "green" && "bg-sage text-white",
                          breakEven.veredictoColor === "amber" && "bg-yellow-300 text-ink",
                          breakEven.veredictoColor === "red" && "bg-destructive text-white",
                        )}
                        data-testid="panel-verdict"
                      >
                        {breakEven.veredictoColor === "green" && "✅ "}
                        {breakEven.veredictoColor === "amber" && "⚠️ "}
                        {breakEven.veredictoColor === "red" && "⛔ "}
                        {breakEven.veredictoLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">{breakEven.modelo}</p>

                    {breakEven.contraofertaEur !== null && breakEven.contraofertaEur > 0 && (
                      <div
                        className="mt-3 -rotate-[0.4deg] rounded-md border-2 border-ink bg-yellow-200 px-3 py-2 text-[13px] font-semibold text-ink shadow-comic-sm"
                        data-testid="panel-contraoferta"
                      >
                        💡 <b>Contraoferta sugerida:</b> {formatIntEs(breakEven.contraofertaEur)}€ —{" "}
                        {breakEven.contraofertaNota}
                      </div>
                    )}

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft((prev) => insertAnalysisParagraph(prev, breakEven));
                          showToast("✓ análisis insertado en el borrador");
                        }}
                        className="rounded-md border-2 border-border bg-card px-3 py-1.5 text-sm font-bold shadow-comic-sm transition-transform hover:-translate-y-0.5 hover:border-ink"
                        data-testid="insert-analysis"
                      >
                        📎 Insertar análisis en la respuesta
                      </button>
                    </div>
                  </section>
                )}

                {/* ── Borrador ── */}
                <div className="rounded-xl border-2 border-dashed border-ink bg-card p-3" data-testid="draft-box">
                  <span className="-rotate-1 inline-block rounded border-2 border-ink bg-yellow-300 px-2 py-0.5 font-heading text-xs tracking-wide text-ink shadow-comic-sm">
                    ✍️ BORRADOR · respuesta
                  </span>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={`Escribe la respuesta a ${leadDisplayName(selected)}…`}
                    className="mt-2 min-h-[150px] w-full resize-y rounded-md border-2 border-border bg-background px-3 py-2 text-sm leading-relaxed focus:border-ink focus:outline-none"
                    data-testid="draft-textarea"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={!draft.trim() || createGate.isPending}
                      onClick={() => createGate.mutate()}
                      className="rounded-md border-2 border-ink bg-rust px-4 py-1.5 text-sm font-bold text-white shadow-comic-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                      data-testid="send-draft"
                    >
                      {createGate.isPending ? "Creando gate…" : "📨 Enviar"}
                    </button>
                    <button
                      type="button"
                      disabled={!draft.trim() || saveDraft.isPending}
                      onClick={() => saveDraft.mutate()}
                      className="rounded-md border-2 border-border bg-card px-4 py-1.5 text-sm font-bold shadow-comic-sm transition-transform hover:-translate-y-0.5 hover:border-ink disabled:opacity-50"
                      data-testid="save-draft"
                    >
                      💾 Guardar
                    </button>
                    <span className="text-[11px] italic text-muted-foreground">
                      Enviar abre el gate de aprobación — nada sale sin tu OK (dry-run en dev).
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── GATE MODAL (GateItem · human-in-the-loop) ── */}
      {gate && (
        <div className="fixed inset-0 z-[600]">
          <div className="fixed inset-0 bg-ink/45" onClick={() => setGate(null)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 w-[min(540px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-ink bg-background p-6 shadow-comic"
            data-testid="gate-modal"
          >
            {!gate.sent ? (
              <>
                <h2 className="font-heading text-2xl text-navy">🚦 GATE: APROBAR ENVÍO</h2>
                <span className="mt-1 inline-block -rotate-2 rounded border-2 border-rust px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rust">
                  GateItem · requiere humano
                </span>
                <div className="mt-3 space-y-1.5 text-sm">
                  <div className="rounded-md border-2 border-border bg-card px-3 py-1.5">
                    <b>Para:</b> {selected ? leadDisplayName(selected) : ""}
                    {selected?.email ? ` (${selected.email})` : ""}
                  </div>
                  <div className="rounded-md border-2 border-border bg-card px-3 py-1.5">
                    <b>Gate:</b> {gate.runId}
                    {gate.dryRun && " · dry-run (no saldrá ningún email real)"}
                  </div>
                  <div className="rounded-md border-2 border-border bg-card px-3 py-1.5">
                    <b>Acción:</b> {gate.prompt || "Aprobar el envío de la respuesta"}
                  </div>
                </div>
                <div className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border-2 border-dashed border-ink bg-card px-3 py-2 text-xs">
                  {gate.preview}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={approveGate.isPending}
                    onClick={() => approveGate.mutate(gate.runId)}
                    className="rounded-md border-2 border-ink bg-rust px-4 py-2 text-sm font-bold text-white shadow-comic-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                    data-testid="approve-gate"
                  >
                    {approveGate.isPending ? "Aprobando…" : "✅ Aprobar y enviar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGate(null)}
                    className="rounded-md border-2 border-border bg-card px-4 py-2 text-sm font-bold shadow-comic-sm transition-transform hover:-translate-y-0.5 hover:border-ink"
                  >
                    ✋ Cancelar
                  </button>
                </div>
                <p className="mt-2 text-[11px] italic text-muted-foreground">
                  El gate queda también en el Cockpit (yalc_list_gates) — puedes aprobarlo desde el
                  chat o desde Claude Code (yalc_approve_gate). Tres superficies, una sola lógica.
                </p>
              </>
            ) : (
              <div className="py-4 text-center" data-testid="gate-sent">
                <span className="inline-block -rotate-3 rounded-xl border-4 border-sage px-6 py-2 font-heading text-2xl tracking-wide text-sage">
                  ¡ENVIADO!
                </span>
                <p className="mx-auto mt-3 max-w-sm text-sm italic text-muted-foreground">
                  Sancho ha registrado la respuesta en el hilo
                  {gate.dryRun ? " (dry-run: sin email real)" : ""} y el estado del creator avanza en
                  el pipeline.
                </p>
                <button
                  type="button"
                  onClick={() => setGate(null)}
                  className="mt-4 rounded-md border-2 border-border bg-card px-4 py-2 text-sm font-bold shadow-comic-sm transition-transform hover:-translate-y-0.5 hover:border-ink"
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ToastViewport toast={toast} />
    </div>
  );
}
