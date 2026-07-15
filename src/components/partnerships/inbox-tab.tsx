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
import { useRouter } from "next/router";
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
import {
  formatFollowers,
  formatIntEs,
  formatTier,
  leadDisplayName,
} from "@/lib/partnerships/stage-mapping";
import type { PartnershipLead } from "@/lib/partnerships/types";
import { ToastViewport, useToast } from "./ui";
import { useModelConfig } from "./use-model-config";

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

interface AwaitingGateDraftStep {
  subject?: string | null;
  body?: string | null;
  delayDays?: number | null;
}

interface AwaitingGateDraft {
  leadId?: string | null;
  providerId?: string | null;
  handle?: string | null;
  network?: string | null;
  email?: string | null;
  displayName?: string | null;
  steps?: AwaitingGateDraftStep[];
}

interface AwaitingGateItem {
  run_id: string;
  framework?: string | null;
  gate_id?: string | null;
  prompt?: string | null;
  created_at?: string | null;
  stale?: boolean;
  payload?: {
    kind?: string | null;
    sequenceName?: string | null;
    dryRun?: boolean;
    drafts?: AwaitingGateDraft[];
  } | null;
  inputs?: {
    campaignId?: string | null;
    leadIds?: string[];
  } | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload as T;
}

const STATE_CHIP_TONES: Record<string, string> = {
  paper: "border-border bg-muted/40 text-muted-foreground",
  blue: "border-cyan-600/50 bg-cyan-50 text-cyan-800",
  pale: "border-border bg-background text-muted-foreground",
  yellow: "border-yellow-500/50 bg-yellow-100 text-yellow-800",
  navy: "border-navy/40 bg-navy/10 text-navy",
  rust: "border-rust/50 bg-rust/10 text-rust",
  aged: "border-border bg-muted text-muted-foreground",
  red: "border-destructive/50 bg-destructive/10 text-destructive",
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

function normalizeHandle(value?: string | null): string {
  return (value || "").trim().replace(/^@+/, "").toLowerCase();
}

function gateDraftMatchesLead(
  draft: AwaitingGateDraft,
  lead: InboxLead,
): boolean {
  if (draft.leadId && draft.leadId === lead.id) return true;
  if (
    draft.providerId &&
    lead.providerId &&
    draft.providerId === lead.providerId
  )
    return true;
  if (
    draft.email &&
    lead.email &&
    draft.email.toLowerCase() === lead.email.toLowerCase()
  )
    return true;
  const draftHandle = normalizeHandle(draft.handle);
  const leadHandle = normalizeHandle(lead.handle);
  return Boolean(draftHandle && leadHandle && draftHandle === leadHandle);
}

function gateMatchesLead(gate: AwaitingGateItem, lead: InboxLead): boolean {
  if (
    gate.framework !== "partner-outreach" ||
    gate.gate_id !== "approve-send" ||
    gate.payload?.kind !== "partner-contact"
  ) {
    return false;
  }
  if (
    Array.isArray(gate.inputs?.leadIds) &&
    gate.inputs.leadIds.includes(lead.id)
  )
    return true;
  return (gate.payload?.drafts || []).some((draft) =>
    gateDraftMatchesLead(draft, lead),
  );
}

function unresolvedDraftVariables(
  drafts: readonly AwaitingGateDraft[],
): string[] {
  const unresolved = new Set<string>();
  if (drafts.length === 0) unresolved.add("preview_no_disponible");

  for (const draft of drafts) {
    const steps = draft.steps || [];
    if (steps.length === 0) unresolved.add("paso_no_disponible");
    for (const step of steps) {
      if (!step.body?.trim()) unresolved.add("paso_sin_contenido");
      for (const text of [step.subject, step.body]) {
        if (!text) continue;
        for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
          unresolved.add(match[1].split("|")[0].trim() || "variable_vacía");
        }
        const remainder = text.replace(/\{\{[\s\S]*?\}\}/g, "");
        if (remainder.includes("{{") || remainder.includes("}}")) {
          unresolved.add("sintaxis_incompleta");
        }
      }
    }
  }
  return [...unresolved].sort();
}

function gateDraftLabel(draft: AwaitingGateDraft, index: number): string {
  return (
    draft.displayName ||
    draft.handle ||
    draft.email ||
    draft.leadId ||
    `Creator ${index + 1}`
  );
}

export function InboxTab({ slug }: { slug: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();

  const [filter, setFilter] = useState<InboxStateKey | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // SAN-76: el break-even de negociación usa la config efectiva del modelo.
  const modelConfig = useModelConfig(slug);

  const leadsKey = ["yalc", slug, "partnerships", "inbox-leads"] as const;
  const leadsQuery = useQuery({
    queryKey: leadsKey,
    queryFn: () =>
      fetchJson<{ leads?: InboxLead[] }>(
        `/api/yalc/leads?slug=${encodeURIComponent(slug)}&type=Partnerships&include=lastMessage`,
      ),
    enabled: !!slug,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const gatesKey = ["yalc", slug, "gates", "awaiting"] as const;
  const gatesQuery = useQuery({
    queryKey: gatesKey,
    queryFn: () =>
      fetchJson<{ items?: AwaitingGateItem[] }>(
        `/api/yalc/gates?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const conversations = useMemo(
    () => inboxConversations(leadsQuery.data?.leads || []),
    [leadsQuery.data],
  );
  const counts = useMemo(
    () => inboxStateCounts(leadsQuery.data?.leads || []),
    [leadsQuery.data],
  );
  const visible = useMemo(
    () =>
      conversations.filter((convo) => !filter || convo.inboxState === filter),
    [conversations, filter],
  );
  const selected = useMemo(
    () =>
      conversations.find((convo) => convo.id === selectedId) ||
      visible[0] ||
      null,
    [conversations, visible, selectedId],
  );
  const pendingContactGate = useMemo(
    () =>
      selected
        ? (gatesQuery.data?.items || []).find((gate) =>
            gateMatchesLead(gate, selected),
          ) || null
        : null,
    [gatesQuery.data, selected],
  );
  const pendingContactDrafts = useMemo(
    () => pendingContactGate?.payload?.drafts || [],
    [pendingContactGate],
  );
  const pendingContactUnresolved = useMemo(
    () => unresolvedDraftVariables(pendingContactDrafts),
    [pendingContactDrafts],
  );
  const pendingContactCanApprove = pendingContactUnresolved.length === 0;

  useEffect(() => {
    const requestedLeadId =
      typeof router.query.leadId === "string" ? router.query.leadId : "";
    if (!requestedLeadId) return;
    if (conversations.some((convo) => convo.id === requestedLeadId)) {
      setSelectedId(requestedLeadId);
    }
  }, [router.query.leadId, conversations]);

  const threadKey = ["yalc", slug, "lead-messages", selected?.id] as const;
  const threadQuery = useQuery({
    queryKey: threadKey,
    queryFn: () =>
      fetchJson<{ messages: LeadMessage[] }>(
        `/api/yalc/leads/${encodeURIComponent(selected!.id)}/messages?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug && !!selected,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const messages = useMemo(
    () =>
      (threadQuery.data?.messages || []).filter(
        (message) => message.status !== "draft",
      ),
    [threadQuery.data],
  );
  const draftMessage = useMemo(
    () =>
      (threadQuery.data?.messages || []).find(
        (message) => message.status === "draft",
      ) || null,
    [threadQuery.data],
  );
  const waitingForFirstTouch =
    selected?.inboxState === "en-cola" && messages.length === 0;

  // ── negotiation-assist: precio en la última reply entrante ──
  const lastIncoming = useMemo(
    () =>
      [...messages].reverse().find((message) => message.direction === "in") ||
      null,
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
        config: modelConfig.data?.config,
      });
    } catch {
      return null;
    }
  }, [fee, multiplier, selected, modelConfig.data?.config]);

  // ── Borrador ──
  const [draft, setDraft] = useState("");
  useEffect(() => {
    setDraft(draftMessage?.body || "");
  }, [draftMessage?.id, draftMessage?.body, selected?.id]);

  const saveDraft = useMutation({
    mutationFn: () =>
      fetchJson(
        `/api/yalc/leads/${encodeURIComponent(selected!.id)}/messages?slug=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            direction: "out",
            body: draft,
            status: "draft",
          }),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: threadKey });
      showToast("✓ borrador guardado");
    },
    onError: (error) =>
      showToast(
        `⚠️ ${error instanceof Error ? error.message : "error"}`,
        "warn",
      ),
  });

  // ── Enviar → gate (human-in-the-loop) ──
  interface PendingGate {
    runId: string;
    prompt: string;
    dryRun: boolean;
    preview: string;
    drafts: AwaitingGateDraft[];
    unresolvedVariables: string[];
    canApprove: boolean;
    error?: string | null;
    sent?: boolean;
  }
  const [gate, setGate] = useState<PendingGate | null>(null);

  const createGate = useMutation({
    mutationFn: () =>
      fetchJson<{
        gates: Array<{
          runId: string;
          prompt: string;
          dryRun: boolean;
          canApprove: boolean;
          unresolvedVariables?: string[];
          drafts?: AwaitingGateDraft[];
        }>;
      }>(`/api/partnerships/contact?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: [{ id: selected!.id, campaignId: selected!.campaignId }],
          sequence: [
            {
              subject: `Re: colaboración con ${leadDisplayName(selected!)}`,
              body: draft,
              delayDays: 0,
            },
          ],
          sequenceName: `Respuesta a ${leadDisplayName(selected!)}`,
          dryRun: false,
        }),
      }),
    onSuccess: (data) => {
      const first = data.gates?.[0];
      if (!first) {
        showToast("⚠️ No se pudo preparar la aprobación", "warn");
        return;
      }
      const renderedDrafts = first.drafts || [];
      const unresolvedVariables = [
        ...new Set([
          ...(first.unresolvedVariables || []),
          ...unresolvedDraftVariables(renderedDrafts),
        ]),
      ].sort();
      const canApprove = first.canApprove && unresolvedVariables.length === 0;
      setGate({
        runId: first.runId,
        prompt: first.prompt,
        dryRun: first.dryRun,
        canApprove,
        drafts: renderedDrafts,
        unresolvedVariables,
        preview: first.drafts?.[0]?.steps?.[0]?.body || draft,
        error: canApprove
          ? null
          : `No hay un preview listo para aprobar: ${unresolvedVariables.join(", ")}.`,
      });
    },
    onError: (error) =>
      showToast(
        `⚠️ ${error instanceof Error ? error.message : "error"}`,
        "warn",
      ),
  });

  const createFirstContactGate = useMutation({
    mutationFn: () =>
      fetchJson<{
        gates: Array<{ runId: string; prompt: string; dryRun: boolean }>;
      }>(`/api/partnerships/contact?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: [{ id: selected!.id, campaignId: selected!.campaignId }],
          dryRun: false,
        }),
      }),
    onSuccess: (data) => {
      const first = data.gates?.[0];
      if (!first) {
        showToast("⚠️ No se pudo preparar la aprobación", "warn");
        return;
      }
      showToast("✓ aprobación preparada");
      void queryClient.invalidateQueries({ queryKey: gatesKey });
      void queryClient.invalidateQueries({ queryKey: leadsKey });
      void queryClient.invalidateQueries({ queryKey: threadKey });
    },
    onError: (error) =>
      showToast(
        `⚠️ ${error instanceof Error ? error.message : "error"}`,
        "warn",
      ),
  });

  const approveGate = useMutation({
    mutationFn: async (runId: string) => {
      const approval = await fetchJson<{
        ok?: boolean;
        jobId?: string;
        status?: string;
      }>(`/api/yalc/gates?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, action: "approve" }),
      });
      if (approval.jobId) {
        for (let attempt = 0; attempt < 90; attempt += 1) {
          const job = await fetchJson<{
            status?: string;
            errorMessage?: string | null;
            errorCode?: string | null;
          }>(
            `/api/yalc/jobs/${encodeURIComponent(approval.jobId)}?slug=${encodeURIComponent(slug)}`,
          );
          if (job.status === "succeeded") return;
          if (job.status === "failed" || job.status === "interrupted") {
            throw new Error(
              job.errorMessage || job.errorCode || "El envío de Yalc falló.",
            );
          }
          await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        }
        throw new Error(
          "Yalc sigue procesando el envío. Revisa el job en Outreach.",
        );
      }
      if (approval.ok === true || approval.status === "succeeded") return;
      throw new Error(
        "Yalc no devolvió una confirmación verificable. El gate puede estar ya procesado; revisa su estado antes de reintentar.",
      );
    },
    onSuccess: () => {
      setGate((prev) => (prev ? { ...prev, sent: true } : prev));
      showToast("✓ envío aprobado");
      void queryClient.invalidateQueries({ queryKey: threadKey });
      void queryClient.invalidateQueries({ queryKey: leadsKey });
      void queryClient.invalidateQueries({ queryKey: gatesKey });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "error";
      setGate((prev) => (prev ? { ...prev, error: message } : prev));
      showToast(`⚠️ ${message}`, "warn");
    },
  });

  if (leadsQuery.isLoading) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Cargando conversaciones…
      </p>
    );
  }

  return (
    <div data-testid="inbox-tab">
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* ── Lista + chips ── */}
        <div>
          <div
            className="mb-3 flex flex-wrap gap-1.5"
            data-testid="inbox-chips"
          >
            {INBOX_STATES.map((state) => {
              const count = counts[state.key];
              const active = filter === state.key;
              return (
                <button
                  key={state.key}
                  type="button"
                  title={state.label}
                  onClick={() => setFilter(active ? null : state.key)}
                  data-state={state.key}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                    active
                      ? "border-rust bg-rust text-white"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                    count === 0 && !active && "opacity-50",
                  )}
                >
                  {state.label}
                  <span
                    className={cn(
                      "ml-1.5 inline-block min-w-[17px] rounded-full px-1 text-center text-[10px]",
                      active
                        ? "bg-white/20 text-white"
                        : count > 0
                          ? "bg-border text-foreground"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="overflow-hidden rounded-xl border border-border bg-card"
            data-testid="convo-list"
          >
            {visible.length === 0 && (
              <p className="px-4 py-7 text-center text-sm text-muted-foreground">
                Ninguna conversación
                {filter
                  ? ` en "${INBOX_STATES.find((s) => s.key === filter)?.label}"`
                  : ""}
                . Sancho está en ello…
              </p>
            )}
            {visible.map((convo) => {
              const meta = INBOX_STATES.find(
                (state) => state.key === convo.inboxState,
              )!;
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
                    "block w-full border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40",
                    selected?.id === convo.id &&
                      "bg-muted/50 shadow-[inset_2px_0_0_theme(colors.rust)]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {networkEmoji(convo.network)} {leadDisplayName(convo)}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {timeAgo(convo.lastMessage?.createdAt || convo.updatedAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {snippet}
                  </div>
                  <span
                    className={cn(
                      "mt-1.5 inline-block rounded border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
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
        <div
          className="overflow-hidden rounded-xl border border-border bg-card"
          data-testid="thread-panel"
        >
          {!selected ? (
            <div className="px-8 py-14 text-center">
              <div className="text-base font-semibold text-foreground">
                Sin conversaciones
              </div>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Cuando contactes creators (Contactos → Contactar) sus hilos
                aparecerán aquí; cada respuesta con precio dispara el break-even
                de Sancho.
              </p>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-5 py-3">
                <div
                  className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-background text-lg"
                  aria-hidden
                >
                  {networkEmoji(selected.network)}
                </div>
                <div className="min-w-[180px] flex-1">
                  <div className="text-[15px] font-semibold leading-tight text-foreground">
                    {leadDisplayName(selected)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {[
                      selected.network,
                      formatFollowers(selected.followers),
                      formatTier(selected.tier) &&
                        `Tier ${formatTier(selected.tier)}`,
                      typeof selected.engagementRate === "number" &&
                        `ER ${selected.engagementRate.toFixed(1)}%`,
                      typeof selected.qualityScore === "number" &&
                        `Quality ${Math.round(selected.qualityScore)}`,
                      selected.campaignTitle &&
                        `campaña: ${selected.campaignTitle}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    STATE_CHIP_TONES[
                      INBOX_STATES.find((s) => s.key === selected.inboxState)!
                        .tone
                    ],
                  )}
                  data-testid="thread-state"
                >
                  {
                    INBOX_STATES.find((s) => s.key === selected.inboxState)!
                      .label
                  }
                </span>
              </header>

              <div className="space-y-4 px-5 py-4">
                {threadQuery.isLoading && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Cargando hilo…
                  </p>
                )}
                {!threadQuery.isLoading &&
                  messages.length === 0 &&
                  !pendingContactGate && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Sin mensajes todavía — el primer mensaje saldrá al aprobar
                      el contacto.
                    </p>
                  )}
                {pendingContactGate && (
                  <section
                    className="rounded-xl border border-yellow-500/40 bg-yellow-50/70 p-4"
                    data-testid="pending-contact-gate"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-yellow-900">
                          Primer contacto pendiente de aprobación
                        </h3>
                        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-yellow-900/80">
                          El lead está en cola. Todavía no salió por Instagram
                          ni aparece como enviado hasta que apruebes este gate.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={
                          approveGate.isPending || !pendingContactCanApprove
                        }
                        onClick={() =>
                          approveGate.mutate(pendingContactGate.run_id)
                        }
                        className="rounded-lg border-2 border-rust bg-rust px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
                        data-testid="approve-pending-contact"
                      >
                        {approveGate.isPending
                          ? "Enviando y verificando…"
                          : "Aprobar y enviar"}
                      </button>
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs text-yellow-950">
                      <div className="rounded-md border border-yellow-500/30 bg-background/70 px-3 py-1.5">
                        <b>Secuencia:</b>{" "}
                        {pendingContactGate.payload?.sequenceName ||
                          "Primer contacto"}
                      </div>
                      <div className="rounded-md border border-yellow-500/30 bg-background/70 px-3 py-1.5">
                        <b>Acción:</b>{" "}
                        {pendingContactGate.prompt ||
                          "Aprobar envío al creator"}
                      </div>
                    </div>
                    <div className="mt-3 max-h-64 space-y-3 overflow-y-auto rounded-md border border-dashed border-yellow-500/40 bg-background px-3 py-2 text-xs leading-relaxed text-foreground">
                      {pendingContactDrafts.map((contactDraft, draftIndex) => (
                        <article
                          key={
                            contactDraft.leadId ||
                            `${contactDraft.handle || "creator"}-${draftIndex}`
                          }
                        >
                          <h4 className="font-semibold">
                            {gateDraftLabel(contactDraft, draftIndex)}
                          </h4>
                          {(contactDraft.steps || []).map((step, stepIndex) => (
                            <div
                              key={stepIndex}
                              className="mt-2 border-t border-border/60 pt-2 first:mt-1 first:border-t-0 first:pt-0"
                            >
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Paso {stepIndex + 1}
                                {step.delayDays
                                  ? ` · espera ${step.delayDays} días`
                                  : ""}
                              </div>
                              {step.subject && (
                                <div className="mt-1 font-semibold">
                                  Asunto: {step.subject}
                                </div>
                              )}
                              <div className="mt-1 whitespace-pre-wrap">
                                {step.body || "Sin contenido"}
                              </div>
                            </div>
                          ))}
                        </article>
                      ))}
                      {pendingContactDrafts.length === 0 && (
                        <p>No hay ningún preview renderizado para verificar.</p>
                      )}
                    </div>
                    {!pendingContactCanApprove && (
                      <div
                        className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                        role="alert"
                      >
                        <b>No se puede aprobar:</b>{" "}
                        {pendingContactUnresolved.join(", ")}.
                      </div>
                    )}
                  </section>
                )}
                {waitingForFirstTouch &&
                  !pendingContactGate &&
                  !gatesQuery.isLoading && (
                    <section
                      className="rounded-xl border border-yellow-500/40 bg-yellow-50/70 p-4"
                      data-testid="missing-contact-gate"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-yellow-900">
                            Contacto en cola sin aprobación abierta
                          </h3>
                          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-yellow-900/80">
                            Sancho no encuentra un gate pendiente para este
                            lead. Si el envío anterior se cerró o falló antes de
                            salir, prepara una nueva aprobación desde acá.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={createFirstContactGate.isPending}
                          onClick={() => createFirstContactGate.mutate()}
                          className="rounded-lg border-2 border-rust bg-rust px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
                          data-testid="retry-first-contact"
                        >
                          {createFirstContactGate.isPending
                            ? "Preparando…"
                            : "Preparar contacto de nuevo"}
                        </button>
                      </div>
                    </section>
                  )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.direction === "out" && "justify-end",
                    )}
                    data-direction={message.direction}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-xl border border-border px-4 py-2.5 text-sm leading-relaxed",
                        message.direction === "out"
                          ? "rounded-br-sm bg-muted/40"
                          : "rounded-bl-sm bg-background",
                      )}
                    >
                      <div className="mb-1 text-[10px] text-muted-foreground">
                        {message.direction === "out"
                          ? "Equipo (vía Sancho)"
                          : leadDisplayName(selected)}
                        {" · "}
                        {timeAgo(message.createdAt)}
                        {message.subject ? ` · ${message.subject}` : ""}
                        {message.status === "dry_run" && " · modo prueba"}
                      </div>
                      <div className="whitespace-pre-wrap">{message.body}</div>
                    </div>
                  </div>
                ))}

                {/* ── Panel negotiation-assist ── */}
                {breakEven && detectedPrice && (
                  <section
                    className="rounded-xl border border-rust/30 border-l-4 border-l-rust bg-rust/5 p-4"
                    data-testid="sancho-price-panel"
                  >
                    <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-rust">
                      🧮 Sancho ha detectado un precio:{" "}
                      <span data-testid="detected-price">
                        {formatIntEs(fee ?? detectedPrice.amountEur)}€
                      </span>
                    </h3>

                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-semibold text-muted-foreground">
                      <label className="flex items-center gap-2">
                        Fee 💶
                        <input
                          type="number"
                          min={0}
                          step={50}
                          value={fee ?? 0}
                          onChange={(e) =>
                            setFee(parseFloat(e.target.value) || 0)
                          }
                          className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm focus:border-rust focus:outline-none"
                          data-testid="panel-fee"
                        />
                      </label>
                      <label className="flex items-center gap-2">
                        Incentivo 🎁
                        <select
                          value={String(multiplier)}
                          onChange={(e) =>
                            setMultiplier(parseFloat(e.target.value) || 1)
                          }
                          className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:border-rust focus:outline-none"
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

                    <div
                      className="mt-3 grid grid-cols-3 gap-2.5"
                      data-testid="panel-cells"
                    >
                      <div className="rounded-lg border border-border bg-background p-2.5 text-center">
                        <div
                          className="font-heading text-xl font-semibold leading-none text-navy"
                          data-testid="panel-necesarias"
                        >
                          {Number.isFinite(breakEven.necesarias)
                            ? formatIntEs(breakEven.necesarias)
                            : "∞"}
                        </div>
                        <div className="mt-1 text-[9px] text-muted-foreground">
                          conversiones necesarias
                          <br />({breakEven.formulaNecesarias})
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-background p-2.5 text-center">
                        <div
                          className="font-heading text-xl font-semibold leading-none text-navy"
                          data-testid="panel-alcanzable"
                        >
                          ~{formatIntEs(breakEven.alcanzable)}
                        </div>
                        <div className="mt-1 text-[9px] text-muted-foreground">
                          alcanzables estimadas
                          <br />
                          (×{breakEven.deal.incentiveMultiplier} incentivo)
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-background p-2.5 text-center">
                        <div
                          className="font-heading text-xl font-semibold leading-none text-navy"
                          data-testid="panel-ratio"
                        >
                          {breakEven.ratio === Infinity
                            ? "∞"
                            : `${Math.round(breakEven.ratio * 100)}%`}
                        </div>
                        <div className="mt-1 text-[9px] text-muted-foreground">
                          cobertura del break-even
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-sm font-semibold",
                          breakEven.veredictoColor === "green" &&
                            "border-sage/60 bg-sage/10 text-sage",
                          breakEven.veredictoColor === "amber" &&
                            "border-amber-400/60 bg-amber-100 text-amber-900",
                          breakEven.veredictoColor === "red" &&
                            "border-destructive/50 bg-destructive/10 text-destructive",
                        )}
                        data-testid="panel-verdict"
                      >
                        {breakEven.veredictoColor === "green" && "✅ "}
                        {breakEven.veredictoColor === "amber" && "⚠️ "}
                        {breakEven.veredictoColor === "red" && "⛔ "}
                        {breakEven.veredictoLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {breakEven.modelo}
                    </p>

                    {breakEven.contraofertaEur !== null &&
                      breakEven.contraofertaEur > 0 && (
                        <div
                          className="mt-3 rounded-md border border-yellow-300/60 bg-yellow-50/60 px-3 py-2 text-[13px] text-yellow-900"
                          data-testid="panel-contraoferta"
                        >
                          💡 <b>Contraoferta sugerida:</b>{" "}
                          {formatIntEs(breakEven.contraofertaEur)}€ —{" "}
                          {breakEven.contraofertaNota}
                        </div>
                      )}

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft((prev) =>
                            insertAnalysisParagraph(prev, breakEven),
                          );
                          showToast("✓ análisis insertado en el borrador");
                        }}
                        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-muted"
                        data-testid="insert-analysis"
                      >
                        📎 Insertar análisis en la respuesta
                      </button>
                    </div>
                  </section>
                )}

                {/* ── Borrador ── */}
                {!waitingForFirstTouch && (
                  <div
                    className="rounded-xl border border-dashed border-border bg-background p-3"
                    data-testid="draft-box"
                  >
                    <span className="text-xs font-semibold text-muted-foreground">
                      ✍️ Borrador — respuesta
                    </span>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={`Escribe la respuesta a ${leadDisplayName(selected)}…`}
                      className="mt-2 min-h-[150px] w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:border-rust focus:outline-none"
                      data-testid="draft-textarea"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={!draft.trim() || createGate.isPending}
                        onClick={() => createGate.mutate()}
                        className="rounded-lg border-2 border-rust bg-rust px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
                        data-testid="send-draft"
                      >
                        {createGate.isPending ? "Preparando…" : "📨 Enviar"}
                      </button>
                      <button
                        type="button"
                        disabled={!draft.trim() || saveDraft.isPending}
                        onClick={() => saveDraft.mutate()}
                        className="rounded-lg border-2 border-border bg-background px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
                        data-testid="save-draft"
                      >
                        💾 Guardar
                      </button>
                      <span className="text-[11px] text-muted-foreground">
                        Enviar pasa por aprobación antes de salir.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── GATE MODAL (GateItem · human-in-the-loop) ── */}
      {gate && (
        <div className="fixed inset-0 z-[600]">
          <div
            className="fixed inset-0 bg-black/30"
            onClick={() => setGate(null)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 w-[min(540px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border-[3px] border-ink bg-card p-6 shadow-comic"
            data-testid="gate-modal"
          >
            {!gate.sent ? (
              <>
                <h2 className="text-lg font-semibold text-foreground">
                  🚦 Aprobar envío
                </h2>
                <span className="mt-1 inline-block rounded border border-rust/50 bg-rust/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rust">
                  Requiere aprobación
                </span>
                <div className="mt-3 space-y-1.5 text-sm">
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-1.5">
                    <b>Para:</b> {selected ? leadDisplayName(selected) : ""}
                    {selected?.email ? ` (${selected.email})` : ""}
                  </div>
                  {gate.dryRun && (
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-1.5">
                      <b>Modo:</b> prueba
                    </div>
                  )}
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-1.5">
                    <b>Acción:</b>{" "}
                    {gate.prompt || "Aprobar el envío de la respuesta"}
                  </div>
                </div>
                <div
                  className="mt-3 max-h-64 space-y-3 overflow-y-auto rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs"
                  data-testid="gate-draft-previews"
                >
                  {gate.drafts.map((contactDraft, draftIndex) => (
                    <article
                      key={
                        contactDraft.leadId ||
                        `${contactDraft.handle || "creator"}-${draftIndex}`
                      }
                    >
                      <h3 className="font-semibold">
                        {gateDraftLabel(contactDraft, draftIndex)}
                      </h3>
                      {(contactDraft.steps || []).map((step, stepIndex) => (
                        <div
                          key={stepIndex}
                          className="mt-2 border-t border-border/60 pt-2 first:mt-1 first:border-t-0 first:pt-0"
                        >
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Paso {stepIndex + 1}
                            {step.delayDays
                              ? ` · espera ${step.delayDays} días`
                              : ""}
                          </div>
                          {step.subject && (
                            <div className="mt-1 font-semibold">
                              Asunto: {step.subject}
                            </div>
                          )}
                          <div className="mt-1 whitespace-pre-wrap">
                            {step.body || "Sin contenido"}
                          </div>
                        </div>
                      ))}
                    </article>
                  ))}
                  {gate.drafts.length === 0 && (
                    <p className="whitespace-pre-wrap">
                      {gate.preview ||
                        "No hay ningún preview renderizado para verificar."}
                    </p>
                  )}
                </div>
                {gate.error && (
                  <div
                    className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    role="alert"
                    data-testid="gate-error"
                  >
                    <b>No se puede enviar:</b> {gate.error}
                  </div>
                )}
                {gate.unresolvedVariables.length > 0 && (
                  <p className="mt-2 text-xs text-destructive">
                    Variables o datos pendientes:{" "}
                    {gate.unresolvedVariables.join(", ")}.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={approveGate.isPending || !gate.canApprove}
                    onClick={() => approveGate.mutate(gate.runId)}
                    className="rounded-lg border-2 border-rust bg-rust px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
                    data-testid="approve-gate"
                  >
                    {approveGate.isPending
                      ? "Enviando y verificando…"
                      : "✅ Aprobar y enviar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGate(null)}
                    className="rounded-lg border-2 border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
                  >
                    Cancelar
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  La respuesta queda pendiente hasta que apruebes el envío.
                </p>
              </>
            ) : (
              <div className="py-4 text-center" data-testid="gate-sent">
                <span className="inline-flex items-center gap-2 rounded-lg border border-sage/50 bg-sage/10 px-5 py-2 font-heading text-xl text-sage">
                  ✅ Enviado
                </span>
                <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
                  Sancho ha registrado la respuesta en el hilo
                  {gate.dryRun ? " en modo prueba" : ""} y el estado del creator
                  avanza en el pipeline.
                </p>
                <button
                  type="button"
                  onClick={() => setGate(null)}
                  className="mt-4 rounded-lg border-2 border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
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
