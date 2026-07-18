/**
 * Outreach · Partnerships (SAN-78) — vista principal bajo /dashboard/[slug]/yalc
 * cuando el selector Tipo está en "Partnerships".
 *
 * Sub-nav del mockup: Encuentra · Contactos · Inbox · Plantillas, con el
 * engranaje ⚙️ Settings fijo arriba a la derecha (decisión de diseño nº 3 —
 * misma lógica que Content Creation). Inbox y Plantillas son reales (SAN-80);
 * Settings es real (SAN-76): modelo de creators editable + cualificación +
 * funnel read-only (vive en Metrics) + Conexiones (providers del Cockpit).
 *
 * SAN-80: "Contactar" (bulk de la Lista o mover a Contacted) instancia la
 * secuencia de la búsqueda vía POST /api/partnerships/contact → GateItem en
 * Yalc; el modal de aprobación (human-in-the-loop) aprueba con
 * POST /api/yalc/gates (dry-run: nunca un email real en dev).
 *
 * Estado en query params (?tab=&vista=&busqueda=) para que Encuentra pueda
 * enlazar a Contactos · Lista filtrado por búsqueda y el verificador navegue
 * por URL. Datos contra los proxies reales de SAN-77 (/api/yalc/leads,
 * /api/yalc/leads/[id]/stage, /api/yalc/campaigns?type=Partnerships).
 */

"use client";

import { useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useOpenChat } from "@/hooks/useChat";
import { buildDiscoverySearchThread } from "@/lib/chat-openers";
import { cn } from "@/lib/utils";
import { isCampaignKind } from "@/lib/yalc/campaign-kind";
import {
  DISCARDED_STAGE,
  DISQUALIFIED_STATUS,
  canonicalStatusForStage,
  leadDisplayName,
  type StageFilterKey,
} from "@/lib/partnerships/stage-mapping";
import type {
  PartnershipCampaign,
  PartnershipCampaignsPayload,
  PartnershipLead,
  PartnershipLeadsPayload,
} from "@/lib/partnerships/types";
import type { DiscoverySearchRecord } from "@/lib/partnerships/discovery-types";
import type { TemplateSummary } from "@/lib/partnerships/templates";
import {
  OutreachTabs,
  type OutreachTabKey,
} from "@/components/outreach/outreach-tabs";
import type { SenderAccount } from "@/lib/partnerships/sender-accounts";
import { EncuentraTab } from "./encuentra-tab";
import { KanbanView } from "./kanban-view";
import { ListaView } from "./lista-view";
import { PartnerDrawer } from "./partner-drawer";
import { InboxTab } from "./inbox-tab";
import { PlantillasTab } from "./plantillas-tab";
import {
  SenderAccountSelect,
  senderAccountOptionLabel,
} from "./sender-account-select";
import { SettingsTab } from "./settings-tab";
import { ToastViewport, useToast } from "./ui";

type PartnershipsTab = OutreachTabKey | "settings";
type ContactosVista = "kanban" | "lista";

const HEADERS: Record<PartnershipsTab, { title: string; sub: string }> = {
  encuentra: {
    title: "Encuentra partners",
    sub: "Búsquedas, quality score y siguiente acción en un flujo único.",
  },
  contactos: {
    title: "Contactos",
    sub: "Pipeline de partners con vista kanban o lista para revisión operativa.",
  },
  inbox: {
    title: "Inbox",
    sub: "Respuestas, negociación y aprobación de mensajes.",
  },
  plantillas: {
    title: "Plantillas",
    sub: "Secuencias y briefs reutilizables para cada búsqueda.",
  },
  settings: { title: "Settings", sub: "Configuración de Outreach" },
};

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

function queryValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) || "";
}

function uniqueLeads(leads: PartnershipLead[]): PartnershipLead[] {
  const seen = new Set<string>();
  return leads.filter((lead) => {
    if (seen.has(lead.id)) return false;
    seen.add(lead.id);
    return true;
  });
}

export function PartnershipsView() {
  const slug = useSlugSync();
  const router = useRouter();
  const openChat = useOpenChat();
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();

  const tabParam = queryValue(router.query.tab) as PartnershipsTab;
  const tab: PartnershipsTab = (
    ["encuentra", "contactos", "inbox", "plantillas", "settings"] as const
  ).includes(tabParam)
    ? tabParam
    : "encuentra";
  const vista: ContactosVista =
    queryValue(router.query.vista) === "lista" ? "lista" : "kanban";
  const busqueda = queryValue(router.query.busqueda);
  // SAN-76: ?stage=descartados — el link de Settings abre la Lista ya filtrada.
  const stageParam = queryValue(router.query.stage);

  const [roster, setRoster] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  function pushQuery(
    next: Partial<{
      tab: PartnershipsTab;
      vista: ContactosVista;
      busqueda: string;
      stage: string;
    }>,
  ) {
    const query: Record<string, string> = { slug };
    const merged = { tab, vista, busqueda, stage: "", ...next };
    if (merged.tab !== "encuentra") query.tab = merged.tab;
    if (merged.tab === "contactos" && merged.vista !== "kanban")
      query.vista = merged.vista;
    if (merged.tab === "contactos" && merged.busqueda)
      query.busqueda = merged.busqueda;
    if (merged.tab === "contactos" && merged.stage) query.stage = merged.stage;
    void router.push({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  }

  // ── Datos (proxies SAN-77) ──
  const overview = useQuery({
    queryKey: ["yalc", slug, "overview"],
    queryFn: () =>
      fetchJson<{ ok: boolean; configured?: boolean }>(
        `/api/yalc/overview?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug,
  });

  const campaignsQuery = useQuery({
    queryKey: ["yalc", slug, "partnerships", "campaigns"],
    queryFn: () =>
      fetchJson<PartnershipCampaignsPayload>(
        `/api/yalc/campaigns?slug=${encodeURIComponent(slug)}&type=Partnerships`,
      ),
    enabled: !!slug,
  });

  const activeLeadsKey = [
    "yalc",
    slug,
    "partnerships",
    "leads",
    "active",
  ] as const;
  const discardedLeadsKey = [
    "yalc",
    slug,
    "partnerships",
    "leads",
    "discarded",
  ] as const;

  const activeLeadsQuery = useQuery({
    queryKey: activeLeadsKey,
    queryFn: () =>
      fetchJson<PartnershipLeadsPayload>(
        `/api/yalc/leads?slug=${encodeURIComponent(slug)}&type=Partnerships`,
      ),
    enabled: !!slug,
  });

  // Descartados: consultables y reversibles — el GET por defecto los excluye,
  // así que se piden aparte con lifecycleStatus=Disqualified (contrato SAN-77).
  const discardedLeadsQuery = useQuery({
    queryKey: discardedLeadsKey,
    queryFn: () =>
      fetchJson<PartnershipLeadsPayload>(
        `/api/yalc/leads?slug=${encodeURIComponent(slug)}&type=Partnerships&lifecycleStatus=${DISQUALIFIED_STATUS}`,
      ),
    enabled: !!slug,
  });

  // SAN-80: búsquedas (con plantillas instanciadas) + biblioteca para el picker.
  const searchesQuery = useQuery({
    queryKey: ["partnerships", slug, "searches"],
    queryFn: () =>
      fetchJson<{ searches?: DiscoverySearchRecord[] }>(
        `/api/partnerships/searches?slug=${encodeURIComponent(slug)}&includeArchived=1`,
      ),
    enabled: !!slug,
  });
  const templatesQuery = useQuery({
    queryKey: ["partnerships", slug, "templates"],
    queryFn: () =>
      fetchJson<{ summaries?: TemplateSummary[] }>(
        `/api/partnerships/templates?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug,
  });

  // ── SAN-480 · Cuenta remitente de Unipile (selector por tenant) ──
  interface SenderAccountsPayload {
    configured?: boolean;
    accounts?: SenderAccount[];
    selectedAccountId?: string | null;
  }
  const senderAccountsKey = ["partnerships", slug, "sender-accounts"] as const;
  const senderAccountsQuery = useQuery({
    queryKey: senderAccountsKey,
    queryFn: () =>
      fetchJson<SenderAccountsPayload>(
        `/api/partnerships/sender-accounts?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug,
  });
  const senderAccounts = senderAccountsQuery.data?.accounts || [];
  const selectedSenderAccountId =
    senderAccountsQuery.data?.selectedAccountId ?? null;
  const selectedSenderAccount =
    senderAccounts.find((account) => account.id === selectedSenderAccountId) ||
    null;

  const senderAccountMutation = useMutation({
    mutationFn: (senderAccountId: string | null) =>
      fetchJson<{ ok?: boolean; selectedAccountId?: string | null }>(
        `/api/partnerships/sender-accounts?slug=${encodeURIComponent(slug)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderAccountId }),
        },
      ),
    onMutate: async (senderAccountId) => {
      await queryClient.cancelQueries({ queryKey: senderAccountsKey });
      const previous =
        queryClient.getQueryData<SenderAccountsPayload>(senderAccountsKey);
      queryClient.setQueryData<SenderAccountsPayload>(
        senderAccountsKey,
        (old) => (old ? { ...old, selectedAccountId: senderAccountId } : old),
      );
      return { previous };
    },
    onError: (error, _senderAccountId, context) => {
      if (context?.previous)
        queryClient.setQueryData(senderAccountsKey, context.previous);
      showToast(
        `⚠️ No se pudo guardar el remitente: ${error instanceof Error ? error.message : "error"}`,
        "warn",
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: senderAccountsKey });
    },
  });

  const campaigns = useMemo(
    () =>
      (campaignsQuery.data?.campaigns || []).filter((campaign) =>
        isCampaignKind(campaign, "creator"),
      ),
    [campaignsQuery.data],
  );
  const activeLeads = useMemo(
    () =>
      (activeLeadsQuery.data?.leads || []).filter((lead) =>
        isCampaignKind(lead, "creator"),
      ),
    [activeLeadsQuery.data],
  );
  const discardedLeads = useMemo(
    () =>
      (discardedLeadsQuery.data?.leads || []).filter((lead) =>
        isCampaignKind(lead, "creator"),
      ),
    [discardedLeadsQuery.data],
  );
  const allLeads = useMemo(
    () => uniqueLeads([...activeLeads, ...discardedLeads]),
    [activeLeads, discardedLeads],
  );

  const selectedLead = useMemo(
    () =>
      selectedLeadId
        ? allLeads.find((lead) => lead.id === selectedLeadId) || null
        : null,
    [selectedLeadId, allLeads],
  );
  const busquedaCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === busqueda) || null,
    [campaigns, busqueda],
  );

  // ── Mutación de stage (PATCH /api/yalc/leads/[id]/stage) con update optimista ──
  const stageMutation = useMutation({
    mutationFn: ({
      lead,
      target,
      note,
    }: {
      lead: PartnershipLead;
      target: StageFilterKey;
      note?: string;
    }) =>
      fetchJson(
        `/api/yalc/leads/${encodeURIComponent(lead.id)}/stage?slug=${encodeURIComponent(slug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lifecycleStatus: canonicalStatusForStage(target),
            note,
          }),
        },
      ),
    onMutate: async ({ lead, target, note }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: activeLeadsKey }),
        queryClient.cancelQueries({ queryKey: discardedLeadsKey }),
      ]);
      const previousActive =
        queryClient.getQueryData<PartnershipLeadsPayload>(activeLeadsKey);
      const previousDiscarded =
        queryClient.getQueryData<PartnershipLeadsPayload>(discardedLeadsKey);

      const nextStatus = canonicalStatusForStage(target);
      const updated: PartnershipLead = {
        ...lead,
        lifecycleStatus: nextStatus,
        discardNote:
          target === DISCARDED_STAGE
            ? note || `manual · ${new Date().toISOString().slice(0, 10)}`
            : null,
      };
      const withoutLead = (
        payload?: PartnershipLeadsPayload,
      ): PartnershipLeadsPayload => ({
        ...payload,
        leads: (payload?.leads || []).filter((item) => item.id !== lead.id),
      });
      const withLead = (
        payload?: PartnershipLeadsPayload,
      ): PartnershipLeadsPayload => ({
        ...payload,
        leads: [
          ...(payload?.leads || []).filter((item) => item.id !== lead.id),
          updated,
        ],
      });

      if (target === DISCARDED_STAGE) {
        queryClient.setQueryData(activeLeadsKey, withoutLead(previousActive));
        queryClient.setQueryData(
          discardedLeadsKey,
          withLead(previousDiscarded),
        );
      } else {
        queryClient.setQueryData(activeLeadsKey, withLead(previousActive));
        queryClient.setQueryData(
          discardedLeadsKey,
          withoutLead(previousDiscarded),
        );
      }
      return { previousActive, previousDiscarded };
    },
    onError: (error, _variables, context) => {
      if (context?.previousActive)
        queryClient.setQueryData(activeLeadsKey, context.previousActive);
      if (context?.previousDiscarded)
        queryClient.setQueryData(discardedLeadsKey, context.previousDiscarded);
      showToast(
        `⚠️ No se pudo mover: ${error instanceof Error ? error.message : "error"}`,
        "warn",
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: activeLeadsKey });
      void queryClient.invalidateQueries({ queryKey: discardedLeadsKey });
      void queryClient.invalidateQueries({
        queryKey: ["yalc", slug, "partnerships", "campaigns"],
      });
    },
  });

  function moveLead(
    lead: PartnershipLead,
    target: StageFilterKey,
    note?: string,
  ) {
    // SAN-80: mover a Contacted NO es un PATCH a secas — instancia la
    // secuencia de la búsqueda y crea el gate (el estado avanza a Queued).
    if (target === "Contacted") {
      void contactLeads([lead]);
      return;
    }
    stageMutation.mutate(
      { lead, target, note },
      {
        onSuccess: () => {
          const name = leadDisplayName(lead);
          if (target === "Shortlist")
            showToast(`✓ ${name} → Shortlist · listo para contactar`);
          else if (target === DISCARDED_STAGE)
            showToast(
              `🗑 ${name} descartado — recuperable desde el filtro de descartados`,
            );
          else if (
            target === "Discovered" &&
            lead.lifecycleStatus === DISQUALIFIED_STATUS
          )
            showToast(`↩︎ ${name} restaurado a Discovered`);
          else showToast(`${name} → ${target}`);
        },
      },
    );
  }

  async function moveMany(leads: PartnershipLead[], target: StageFilterKey) {
    if (target === "Contacted") {
      await contactLeads(leads);
      return;
    }
    const status = canonicalStatusForStage(target);
    try {
      await Promise.all(
        leads.map((lead) =>
          fetchJson(
            `/api/yalc/leads/${encodeURIComponent(lead.id)}/stage?slug=${encodeURIComponent(slug)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lifecycleStatus: status }),
            },
          ),
        ),
      );
      if (target === DISCARDED_STAGE) {
        showToast(
          `🗑 ${leads.length} descartado${leads.length === 1 ? "" : "s"} — recuperables desde el filtro de descartados`,
        );
      } else {
        showToast(
          `${leads.length} movido${leads.length === 1 ? "" : "s"} a "${target}". El Kanban lo verá igual.`,
        );
      }
    } catch (error) {
      showToast(
        `⚠️ Bulk incompleto: ${error instanceof Error ? error.message : "error"}`,
        "warn",
      );
    } finally {
      void queryClient.invalidateQueries({ queryKey: activeLeadsKey });
      void queryClient.invalidateQueries({ queryKey: discardedLeadsKey });
    }
  }

  // ── SAN-80 · Contactar (instancia secuencia + GateItem) ──
  interface PendingContactGate {
    runId: string;
    prompt: string;
    dryRun: boolean;
    queuedLeads: number;
    sequenceName: string;
    draftCount?: number;
    canApprove: boolean;
    unresolvedVariables: string[];
    drafts?: Array<{
      leadId: string | null;
      providerId?: string | null;
      handle: string | null;
      network: string | null;
      email?: string | null;
      displayName: string;
      ready: boolean;
      unresolvedVariables: string[];
      steps: Array<{
        subject: string | null;
        body: string;
        delayDays: number;
      }>;
    }>;
    approvalError?: string | null;
    sending?: boolean;
    jobId?: string | null;
    sent?: boolean;
  }
  const [contactGate, setContactGate] = useState<PendingContactGate | null>(
    null,
  );
  const [contactPreviewIndex, setContactPreviewIndex] = useState(0);
  const [editingContactDraftKey, setEditingContactDraftKey] = useState<
    string | null
  >(null);

  function contactDraftKey(input: {
    leadId: string | null;
    displayName: string;
  }) {
    return input.leadId || input.displayName;
  }

  function unresolvedContactDrafts(
    drafts: NonNullable<PendingContactGate["drafts"]>,
  ): string[] {
    const unresolved = new Set<string>();
    if (drafts.length === 0) unresolved.add("preview_no_disponible");
    for (const draft of drafts) {
      if (draft.steps.length === 0) unresolved.add("paso_no_disponible");
      for (const step of draft.steps) {
        if (!step.body.trim()) unresolved.add("paso_sin_contenido");
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

  function updateContactGateDraft(
    key: string,
    stepIndex: number,
    patch: { subject?: string | null; body?: string },
  ) {
    setContactGate((prev) => {
      if (!prev) return prev;
      const drafts = (prev.drafts || []).map((draft) => {
        if (contactDraftKey(draft) !== key) return draft;
        const steps = draft.steps.map((step, index) =>
          index === stepIndex ? { ...step, ...patch } : step,
        );
        const unresolvedVariables = unresolvedContactDrafts([
          { ...draft, steps },
        ]);
        return {
          ...draft,
          steps,
          unresolvedVariables,
          ready: unresolvedVariables.length === 0,
        };
      });
      const unresolvedVariables = unresolvedContactDrafts(drafts);
      return {
        ...prev,
        drafts,
        unresolvedVariables,
        canApprove: drafts.length > 0 && unresolvedVariables.length === 0,
        approvalError: null,
      };
    });
  }

  async function contactLeads(leadsToContact: PartnershipLead[]) {
    try {
      const payload = await fetchJson<{
        gates: PendingContactGate[] & Array<{ runId: string }>;
      }>(`/api/partnerships/contact?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: leadsToContact.map((lead) => ({
            id: lead.id,
            campaignId: lead.campaignId,
          })),
          dryRun: false,
          // SAN-480: cuenta remitente de Unipile elegida (pass-through a
          // Yalc). Solo si la cuenta sigue en la lista cargada — así el chip
          // "Remitente" del gate y el payload siempre cuentan lo mismo.
          ...(selectedSenderAccount
            ? { senderAccountId: selectedSenderAccount.id }
            : {}),
        }),
      });
      const first = payload.gates?.[0];
      if (first) {
        const drafts = first.drafts || [];
        const unresolvedVariables = [
          ...new Set([
            ...(first.unresolvedVariables || []),
            ...unresolvedContactDrafts(drafts),
          ]),
        ].sort();
        setContactPreviewIndex(0);
        setEditingContactDraftKey(null);
        setContactGate({
          ...first,
          drafts,
          unresolvedVariables,
          canApprove:
            first.canApprove &&
            drafts.length > 0 &&
            unresolvedVariables.length === 0,
          approvalError: null,
          sending: false,
          sent: false,
        });
      }
      void queryClient.invalidateQueries({ queryKey: activeLeadsKey });
      void queryClient.invalidateQueries({ queryKey: discardedLeadsKey });
    } catch (error) {
      showToast(
        `⚠️ ${error instanceof Error ? error.message : "No se pudo contactar"}`,
        "warn",
      );
    }
  }

  async function approveContactGate(runId: string) {
    if (!contactGate?.canApprove) {
      setContactGate((prev) =>
        prev
          ? {
              ...prev,
              approvalError:
                "No se puede aprobar: hay variables sin valor o Yalc no devolvió un preview verificable.",
            }
          : prev,
      );
      return;
    }
    try {
      setContactGate((prev) =>
        prev ? { ...prev, approvalError: null, sending: true } : prev,
      );
      const approval = await fetchJson<{
        ok?: boolean;
        jobId?: string;
        status?: string;
      }>(`/api/yalc/gates?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          action: "approve",
          ...(contactGate?.drafts?.length
            ? { edits: { drafts: contactGate.drafts } }
            : {}),
        }),
      });
      if (approval.jobId) {
        setContactGate((prev) =>
          prev ? { ...prev, jobId: approval.jobId } : prev,
        );
        let completed = false;
        for (let attempt = 0; attempt < 90; attempt += 1) {
          const job = await fetchJson<{
            status?: string;
            errorMessage?: string | null;
            errorCode?: string | null;
          }>(
            `/api/yalc/jobs/${encodeURIComponent(approval.jobId)}?slug=${encodeURIComponent(slug)}`,
          );
          if (job.status === "succeeded") {
            completed = true;
            break;
          }
          if (job.status === "failed" || job.status === "interrupted") {
            throw new Error(
              job.errorMessage || job.errorCode || "El envío de Yalc falló.",
            );
          }
          await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        }
        if (!completed)
          throw new Error(
            "Yalc sigue procesando el envío. Revisa el estado del job en Outreach.",
          );
      } else if (approval.ok !== true && approval.status !== "succeeded") {
        throw new Error(
          "Yalc no devolvió una confirmación verificable. El gate puede estar ya procesado; revisa su estado antes de reintentar.",
        );
      }
      setContactGate((prev) =>
        prev ? { ...prev, sent: true, sending: false } : prev,
      );
      setEditingContactDraftKey(null);
      void queryClient.invalidateQueries({ queryKey: activeLeadsKey });
      void queryClient.invalidateQueries({
        queryKey: ["yalc", slug, "partnerships", "inbox-leads"],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo aprobar";
      setContactGate((prev) =>
        prev ? { ...prev, approvalError: message, sending: false } : prev,
      );
      showToast(`⚠️ ${message}`, "warn");
    }
  }

  async function assignTemplate(
    campaign: PartnershipCampaign,
    templateId: string,
  ) {
    try {
      await fetchJson(
        `/api/partnerships/templates/${encodeURIComponent(templateId)}/assign?slug=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: campaign.id }),
        },
      );
      showToast(`✓ Plantilla asignada a «${campaign.title || campaign.id}»`);
      void queryClient.invalidateQueries({
        queryKey: ["partnerships", slug, "searches"],
      });
    } catch (error) {
      showToast(
        `⚠️ ${error instanceof Error ? error.message : "No se pudo asignar"}`,
        "warn",
      );
    }
  }

  const retryDiscoveryMutation = useMutation({
    mutationFn: (search: DiscoverySearchRecord) => {
      const liveServerSide =
        search.runner.mode === "live" || !search.runner.mode;
      if (liveServerSide) {
        return fetchJson<{
          ok: boolean;
          runner?: {
            async?: boolean;
            dispatched?: boolean;
            jobId?: string | null;
            status?: string;
            error?: string | null;
          };
        }>(
          `/api/partnerships/searches/${encodeURIComponent(search.id)}/run?slug=${encodeURIComponent(slug)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ async: true }),
          },
        );
      }
      return fetchJson<{
        ok: boolean;
        runner?: {
          async?: boolean;
          dispatched?: boolean;
          jobId?: string | null;
          status?: string;
          error?: string | null;
        };
      }>(
        `/api/partnerships/searches/${encodeURIComponent(search.id)}/dispatch?slug=${encodeURIComponent(slug)}`,
        { method: "POST" },
      );
    },
    onSuccess: (payload) => {
      if (payload.runner?.async) {
        showToast("✓ Discovery encolado");
      } else if (payload.runner?.dispatched) {
        showToast("✓ Discovery reenviado a Rocinante");
      } else {
        showToast(
          `⚠️ No se pudo avisar a Rocinante${payload.runner?.error ? `: ${payload.runner.error}` : ""}`,
          "warn",
        );
      }
      void queryClient.invalidateQueries({
        queryKey: ["partnerships", slug, "searches"],
      });
    },
    onError: (error) => {
      showToast(
        `⚠️ ${error instanceof Error ? error.message : "No se pudo reintentar el discovery"}`,
        "warn",
      );
    },
  });

  const campaignUpdateAction = useMutation({
    mutationFn: ({
      campaignId,
      title,
    }: {
      campaignId: string;
      title: string;
    }) =>
      fetchJson<PartnershipCampaign>(
        `/api/yalc/campaigns/${encodeURIComponent(campaignId)}?slug=${encodeURIComponent(slug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, expectedKind: "creator" }),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["yalc", slug, "partnerships", "campaigns"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["partnerships", slug, "searches"],
      });
      showToast("Campaña renombrada");
    },
    onError: (error) =>
      showToast(
        error instanceof Error
          ? error.message
          : "No se pudo renombrar la campaña",
        "warn",
      ),
  });

  const campaignDeleteAction = useMutation({
    mutationFn: ({ campaignId }: { campaignId: string }) =>
      fetchJson(
        `/api/yalc/campaigns/${encodeURIComponent(campaignId)}?slug=${encodeURIComponent(slug)}&expectedKind=creator`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["yalc", slug, "partnerships"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["partnerships", slug, "searches"],
      });
      showToast("Campaña borrada");
    },
    onError: (error) =>
      showToast(
        error instanceof Error ? error.message : "No se pudo borrar la campaña",
        "warn",
      ),
  });

  const searchArchiveAction = useMutation({
    mutationFn: ({ searchId }: { searchId: string }) =>
      fetchJson<{ ok: boolean; search: DiscoverySearchRecord }>(
        `/api/partnerships/searches/${encodeURIComponent(searchId)}?slug=${encodeURIComponent(slug)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Archivada desde Encuentra" }),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["partnerships", slug, "searches"],
      });
      showToast("Búsqueda archivada");
    },
    onError: (error) =>
      showToast(
        error instanceof Error
          ? error.message
          : "No se pudo archivar la búsqueda",
        "warn",
      ),
  });

  function openDiscoveryChat(campaign?: PartnershipCampaign) {
    if (!slug) return;
    // SAN-328: desde la tarjeta de una búsqueda existente, retoma el hilo donde
    // se construyó el plan (threadId persistido en el registro de búsqueda), no
    // un hilo nuevo. El botón "Crear nueva búsqueda" (sin campaign) sigue abriendo
    // un hilo en blanco.
    const search = campaign
      ? (searchesQuery.data?.searches || []).find(
          (item) => item.campaignId === campaign.id,
        )
      : undefined;
    openChat(
      slug,
      buildDiscoverySearchThread(
        slug,
        campaign
          ? {
              campaignId: campaign.id,
              title: campaign.title,
              threadId: search?.threadId ?? undefined,
            }
          : undefined,
      ),
    );
  }

  const header = HEADERS[tab];
  const leadsError =
    activeLeadsQuery.error || discardedLeadsQuery.error || campaignsQuery.error;
  const notConfigured = overview.data?.configured === false;
  const activeSearches = campaigns.filter(
    (campaign) => (campaign.status || "").toLowerCase() !== "draft",
  ).length;

  return (
    <DashboardLayout>
      <Head>
        <title>{`Outreach - ${slug || "cliente"} - Mission Control`}</title>
      </Head>

      <div
        className="op-shell relative min-h-[calc(100vh-48px)] space-y-5"
        data-testid="partnerships-outreach"
      >
        <button
          type="button"
          onClick={() => pushQuery({ tab: "settings" })}
          title="Configurar Outreach"
          className={cn(
            "absolute right-0 top-0 z-10 grid h-9 w-9 place-items-center rounded-md border border-border bg-transparent text-base text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            tab === "settings" && "bg-muted text-foreground",
          )}
          data-testid="gear-settings"
        >
          ⚙️
        </button>

        <header className="op-hero pr-12">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-[240px] flex-1">
              <div className="op-kicker">Outreach · Partnerships</div>
              <h1 className="m-0 font-heading text-3xl leading-tight text-navy">
                {header.title}
              </h1>
              <p className="mb-0 mt-1 max-w-2xl text-sm text-muted-foreground">
                {header.sub}
              </p>
            </div>
            <div className="op-stat-grid" aria-label="Resumen de Partnerships">
              <div>
                <span>{activeSearches}</span>
                <small>búsquedas</small>
              </div>
              <div>
                <span>{activeLeads.length}</span>
                <small>pipeline</small>
              </div>
              <div>
                <span>{discardedLeads.length}</span>
                <small>descartados</small>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {tab === "encuentra" && (
              <button
                type="button"
                onClick={() => openDiscoveryChat()}
                className="rounded-lg border-2 border-rust bg-rust px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust/90"
                data-testid="crear-busqueda"
              >
                Generar nueva campaña
              </button>
            )}
            <div className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-bold text-rust">{slug || "cliente"}</span>
              <span>· Outreach</span>
            </div>
          </div>
        </header>

        <OutreachTabs
          active={tab === "settings" ? null : tab}
          tipo="partnerships"
          testId="partnerships-tabs"
          onChange={(nextTab) => pushQuery({ tab: nextTab })}
        />

        {notConfigured ? (
          <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-8 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-sage/15 text-2xl">
              ⚙️
            </div>
            <h2 className="font-heading text-xl text-navy">
              Outreach no está activado
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Falta conectar el motor de Outreach para este cliente. Cuando esté
              activo, aquí aparecerán las búsquedas, contactos, inbox y
              plantillas reales.
            </p>
          </div>
        ) : (
          <>
            {leadsError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                No se pudieron cargar los datos de Partnerships. Revisa la
                conexión de Outreach.
              </div>
            )}

            {tab === "encuentra" && (
              <EncuentraTab
                campaigns={campaigns}
                leads={allLeads}
                loading={campaignsQuery.isLoading}
                onOpenSearch={(campaign) =>
                  pushQuery({
                    tab: "contactos",
                    vista: "lista",
                    busqueda: campaign.id,
                  })
                }
                onContinueDraft={(campaign) => openDiscoveryChat(campaign)}
                onCreateSearch={() => openDiscoveryChat()}
                searches={searchesQuery.data?.searches || []}
                templateLibrary={(templatesQuery.data?.summaries || []).filter(
                  (template) => template.type === "partnerships",
                )}
                onAssignTemplate={(campaign, templateId) =>
                  void assignTemplate(campaign, templateId)
                }
                onCreateTemplate={() => pushQuery({ tab: "plantillas" })}
                onRetrySearch={(search) =>
                  retryDiscoveryMutation.mutate(search)
                }
                retryingSearchId={retryDiscoveryMutation.variables?.id ?? null}
                onRenameCampaign={(campaign, title) =>
                  campaignUpdateAction.mutate({
                    campaignId: campaign.id,
                    title,
                  })
                }
                onArchiveSearch={(_campaign, search) =>
                  searchArchiveAction.mutate({ searchId: search.id })
                }
                onDeleteCampaign={(campaign) =>
                  campaignDeleteAction.mutate({ campaignId: campaign.id })
                }
                campaignManagementBusy={
                  campaignUpdateAction.isPending ||
                  searchArchiveAction.isPending ||
                  campaignDeleteAction.isPending
                }
              />
            )}

            {tab === "contactos" && (
              <div>
                {/* Toolbar: vista + roster */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="flex gap-2" data-testid="vista-toggle">
                    {[
                      { key: "kanban" as const, label: "🗃️ Kanban" },
                      { key: "lista" as const, label: "📋 Lista" },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => pushQuery({ vista: option.key })}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                          vista === option.key
                            ? "border-rust bg-rust text-white"
                            : "border-border bg-background hover:bg-muted",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {vista === "kanban" && (
                    <button
                      type="button"
                      onClick={() => setRoster((value) => !value)}
                      title="Roster = este kanban filtrado a Signed/Active"
                      data-testid="roster-toggle"
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                        roster
                          ? "border-rust/50 bg-rust/10 text-rust"
                          : "border-border bg-background text-muted-foreground hover:bg-muted",
                      )}
                    >
                      🏆 Roster
                    </button>
                  )}

                  {/* SAN-480: desde qué cuenta conectada de Unipile sale el DM */}
                  <SenderAccountSelect
                    accounts={senderAccounts}
                    selectedAccountId={selectedSenderAccountId}
                    onSelect={(accountId) =>
                      senderAccountMutation.mutate(accountId)
                    }
                    disabled={senderAccountMutation.isPending}
                    className="ml-1"
                  />

                  <span className="ml-auto text-xs text-muted-foreground">
                    {activeLeadsQuery.isFetching ||
                    discardedLeadsQuery.isFetching
                      ? "Actualizando…"
                      : `${activeLeads.length} en pipeline · ${discardedLeads.length} descartados`}
                  </span>
                </div>

                {roster && vista === "kanban" && (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Mostrando solo partners firmados o activos.
                  </p>
                )}

                {vista === "kanban" ? (
                  activeLeadsQuery.isLoading ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      Cargando pipeline…
                    </p>
                  ) : (
                    <KanbanView
                      leads={activeLeads}
                      roster={roster}
                      busyLeadId={
                        stageMutation.isPending
                          ? stageMutation.variables?.lead.id
                          : undefined
                      }
                      onMove={moveLead}
                      onOpen={(lead) => setSelectedLeadId(lead.id)}
                    />
                  )
                ) : (
                  <ListaView
                    leads={allLeads}
                    busqueda={busqueda}
                    busquedaLabel={busquedaCampaign?.title}
                    initialStage={
                      stageParam === "descartados" ? DISCARDED_STAGE : undefined
                    }
                    onClearBusqueda={() => pushQuery({ busqueda: "" })}
                    onOpen={(lead) => setSelectedLeadId(lead.id)}
                    onBulkMove={(leads, target) => void moveMany(leads, target)}
                    onBulkDiscard={(leads) =>
                      void moveMany(leads, DISCARDED_STAGE)
                    }
                    onContactLead={(lead) => void contactLeads([lead])}
                    onBulkContact={(leads) => void contactLeads(leads)}
                    busy={stageMutation.isPending}
                  />
                )}
              </div>
            )}

            {tab === "inbox" && <InboxTab slug={slug} />}
            {tab === "plantillas" && <PlantillasTab slug={slug} />}
            {tab === "settings" && (
              <SettingsTab
                slug={slug}
                onGoDiscarded={() =>
                  pushQuery({
                    tab: "contactos",
                    vista: "lista",
                    stage: "descartados",
                  })
                }
                onGoMetrics={() =>
                  void router.push(
                    `/dashboard/${encodeURIComponent(slug)}/metrics`,
                  )
                }
              />
            )}
          </>
        )}
      </div>

      <PartnerDrawer
        slug={slug}
        lead={selectedLead}
        onClose={() => setSelectedLeadId(null)}
        onMove={moveLead}
        onContactLead={(lead) => void contactLeads([lead])}
        busy={stageMutation.isPending}
      />

      {/* ── GATE de contacto (GateItem · human-in-the-loop) ── */}
      {contactGate && (
        <div className="fixed inset-0 z-[600]">
          <div
            className="fixed inset-0 bg-black/30"
            onClick={() => setContactGate(null)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 max-h-[92vh] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border-[3px] border-ink bg-card p-6 shadow-comic"
            data-testid="contact-gate-modal"
          >
            {!contactGate.sent ? (
              <>
                <h2 className="text-lg font-semibold text-foreground">
                  🚦 Aprobar envío
                </h2>
                <span className="mt-1 inline-block rounded border border-rust/50 bg-rust/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rust">
                  Requiere aprobación
                </span>
                <div className="mt-3 space-y-1.5 text-sm">
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-1.5">
                    <b>Secuencia:</b> {contactGate.sequenceName}
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-1.5">
                    <b>Acción:</b> {contactGate.prompt}
                  </div>
                  {selectedSenderAccount && (
                    <div
                      className="rounded-md border border-border bg-muted/30 px-3 py-1.5"
                      data-testid="contact-gate-sender"
                    >
                      <b>Remitente:</b>{" "}
                      {senderAccountOptionLabel(selectedSenderAccount)}
                    </div>
                  )}
                  {contactGate.dryRun && (
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-1.5">
                      <b>Modo:</b> prueba
                    </div>
                  )}
                </div>
                {contactGate.drafts?.length ? (
                  (() => {
                    const safeIndex = Math.min(
                      contactPreviewIndex,
                      contactGate.drafts.length - 1,
                    );
                    const draft = contactGate.drafts[safeIndex];
                    return (
                      <section
                        className="mt-4 overflow-hidden rounded-xl border border-border bg-background"
                        data-testid="contact-gate-preview"
                      >
                        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
                          <div>
                            <h3 className="text-sm font-bold text-foreground">
                              Mensaje final por creator
                            </h3>
                            <p className="text-[11px] text-muted-foreground">
                              Render real devuelto por Yalc, antes de aprobar.
                            </p>
                          </div>
                          <label className="text-[11px] font-semibold text-muted-foreground">
                            Creator {safeIndex + 1} de{" "}
                            {contactGate.drafts.length}
                            <select
                              value={safeIndex}
                              onChange={(event) =>
                                setContactPreviewIndex(
                                  Number(event.target.value),
                                )
                              }
                              className="mt-1 block min-w-[220px] rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground"
                              data-testid="contact-preview-lead-select"
                            >
                              {contactGate.drafts.map((item, index) => (
                                <option
                                  key={
                                    item.leadId ||
                                    `${item.displayName}-${index}`
                                  }
                                  value={index}
                                >
                                  {item.displayName}
                                  {item.network ? ` · ${item.network}` : ""}
                                  {item.ready ? " · listo" : " · revisar"}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {!draft.ready && (
                          <div
                            className="border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive"
                            role="alert"
                          >
                            <b>Variables sin resolver:</b>{" "}
                            {draft.unresolvedVariables
                              .map((key) => `{{${key}}}`)
                              .join(", ")}
                            . Corrige la plantilla o completa el dato del lead.
                          </div>
                        )}
                        <div className="max-h-[42vh] space-y-3 overflow-y-auto p-4">
                          {draft.steps.map((step, index) => {
                            const draftKey = contactDraftKey(draft);
                            const editingKey = `${draftKey}:${index}`;
                            const editing =
                              editingContactDraftKey === editingKey;
                            return (
                              <article
                                key={index}
                                className="rounded-lg border border-border bg-card p-3"
                                data-testid="contact-preview-step"
                              >
                                <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  <span>
                                    Paso {index + 1}
                                    {index > 0 &&
                                      ` · espera ${step.delayDays} días`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingContactDraftKey((current) =>
                                        current === editingKey
                                          ? null
                                          : editingKey,
                                      )
                                    }
                                    className="rounded border border-border bg-card px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-rust transition-colors hover:border-rust hover:bg-rust/10"
                                    data-testid="edit-contact-gate-draft"
                                  >
                                    {editing ? "Listo" : "Editar"}
                                  </button>
                                </div>
                                {editing ? (
                                  <div className="space-y-2">
                                    <input
                                      value={step.subject || ""}
                                      onChange={(event) =>
                                        updateContactGateDraft(
                                          draftKey,
                                          index,
                                          {
                                            subject: event.target.value.trim()
                                              ? event.target.value
                                              : null,
                                          },
                                        )
                                      }
                                      placeholder="Asunto interno"
                                      className="w-full rounded border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground focus:border-rust focus:outline-none"
                                      data-testid="contact-gate-subject-input"
                                    />
                                    <textarea
                                      value={step.body}
                                      onChange={(event) =>
                                        updateContactGateDraft(
                                          draftKey,
                                          index,
                                          {
                                            body: event.target.value,
                                          },
                                        )
                                      }
                                      rows={8}
                                      className="w-full resize-y rounded border border-border bg-card px-2 py-2 text-sm leading-relaxed text-foreground focus:border-rust focus:outline-none"
                                      data-testid="contact-gate-body-input"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                      Al aprobar, Yalc usará este texto editado.
                                    </p>
                                  </div>
                                ) : (
                                  <>
                                    {step.subject && (
                                      <div className="mb-2 border-b border-border pb-2 text-xs font-bold text-foreground">
                                        {step.subject}
                                      </div>
                                    )}
                                    <div
                                      className="whitespace-pre-wrap text-sm leading-relaxed text-foreground"
                                      data-testid="contact-gate-preview-body"
                                    >
                                      {step.body}
                                    </div>
                                  </>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })()
                ) : (
                  <div
                    className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                    role="alert"
                  >
                    Yalc no devolvió borradores verificables. El envío queda
                    bloqueado para evitar aprobar texto sin previsualizar.
                  </div>
                )}
                {!contactGate.canApprove &&
                  contactGate.unresolvedVariables.length > 0 && (
                    <div
                      className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                      role="alert"
                    >
                      <b>El envío está bloqueado:</b>{" "}
                      {contactGate.unresolvedVariables.join(", ")}.
                    </div>
                  )}
                {contactGate.approvalError && (
                  <div
                    className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                    role="alert"
                    data-testid="contact-gate-error"
                  >
                    <b>No se pudo enviar:</b> {contactGate.approvalError}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!contactGate.canApprove || contactGate.sending}
                    onClick={() => void approveContactGate(contactGate.runId)}
                    title={
                      !contactGate.canApprove
                        ? "Resuelve todas las variables antes de aprobar"
                        : undefined
                    }
                    className="rounded-lg border-2 border-rust bg-rust px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                    data-testid="approve-contact-gate"
                  >
                    {contactGate.sending
                      ? "Enviando y verificando…"
                      : "✅ Aprobar y enviar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setContactGate(null);
                      showToast("Envío pendiente de aprobación.");
                    }}
                    className="rounded-lg border-2 border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
                  >
                    Luego
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Los creators quedan en cola hasta que apruebes el envío.
                </p>
              </>
            ) : (
              <div className="py-4 text-center" data-testid="contact-gate-sent">
                <span className="inline-flex items-center gap-2 rounded-lg border border-sage/50 bg-sage/10 px-5 py-2 font-heading text-xl text-sage">
                  ✅ Enviado
                </span>
                <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
                  Secuencia lanzada{contactGate.dryRun ? " en modo prueba" : ""}{" "}
                  a {contactGate.queuedLeads} creator
                  {contactGate.queuedLeads === 1 ? "" : "s"} — el primer toque
                  ya está en su hilo del Inbox.
                </p>
                <button
                  type="button"
                  onClick={() => setContactGate(null)}
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
      <PartnershipsOutreachStyles />
    </DashboardLayout>
  );
}

function PartnershipsOutreachStyles() {
  return (
    <style jsx global>{`
      .op-shell {
        --op-ink: var(--sc-ink);
        --op-paper: var(--sc-paper);
        --op-paper-2: var(--sc-paper-2);
        --op-paper-3: var(--sc-paper-3);
        --op-rust: var(--sc-rust-500);
        --op-rust-dark: var(--sc-rust-700);
        --op-navy: var(--sc-navy-500);
        --op-sage: var(--sc-sage-500);
        margin: -0.25rem;
        padding: clamp(16px, 2vw, 28px);
        border: 3px solid var(--op-ink);
        border-radius: var(--sc-r-lg);
        background:
          linear-gradient(135deg, rgba(196, 93, 53, 0.08), transparent 28%),
          radial-gradient(
            circle at 88% 8%,
            rgba(244, 196, 48, 0.18),
            transparent 22rem
          ),
          var(--op-paper);
        box-shadow: var(--pop-md);
        color: var(--op-ink);
      }

      .op-hero {
        position: relative;
        overflow: hidden;
        border: 3px solid var(--op-ink);
        border-radius: var(--sc-r-lg);
        background: var(--op-paper-3);
        padding: clamp(18px, 2vw, 26px);
        box-shadow: var(--pop-sm);
      }

      .op-hero::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image: var(--sc-halftone-dots);
        background-size: 14px 14px;
        opacity: 0.26;
        mix-blend-mode: multiply;
      }

      .op-hero > * {
        position: relative;
        z-index: 1;
      }

      .op-kicker {
        display: inline-flex;
        margin-bottom: 0.45rem;
        transform: rotate(-1deg);
        border: 2px solid var(--op-ink);
        border-radius: var(--sc-r-pill);
        background: var(--op-rust);
        color: white;
        padding: 0.2rem 0.65rem;
        font-family: var(--font-heading);
        font-size: 0.72rem;
        font-weight: 800;
        text-transform: uppercase;
      }

      .op-stat-grid {
        display: grid;
        min-width: min(100%, 360px);
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.65rem;
      }

      .op-stat-grid > div {
        border: 2px solid var(--op-ink);
        border-radius: var(--sc-r-md);
        background: var(--op-paper-2);
        padding: 0.7rem 0.8rem;
        box-shadow: var(--pop-xs);
      }

      .op-stat-grid span,
      .op-stat-grid small {
        display: block;
      }

      .op-stat-grid span {
        font-family: var(--font-heading);
        color: var(--op-navy);
        font-size: 1.45rem;
        font-weight: 800;
        line-height: 1;
      }

      .op-stat-grid small {
        margin-top: 0.25rem;
        color: var(--sc-fg-muted);
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
      }

      .op-shell [data-testid="gear-settings"] {
        right: clamp(16px, 2vw, 28px);
        top: clamp(16px, 2vw, 28px);
        border: 2px solid var(--op-ink);
        background: var(--op-paper-3);
        color: var(--op-ink);
        box-shadow: var(--pop-xs);
      }

      .op-shell [data-testid="partnerships-tabs"] button,
      .op-shell [data-testid="vista-toggle"] button,
      .op-shell [data-testid="roster-toggle"],
      .op-shell [data-testid="crear-busqueda"],
      .op-shell [data-testid="nueva-plantilla"],
      .op-shell [data-testid="bulk-contactar"],
      .op-shell [data-testid="assign-template-chip"],
      .op-shell [data-testid="picker-create-new"] {
        border: 2px solid var(--op-ink);
        border-radius: var(--sc-r-md);
        font-family: var(--font-heading);
        font-weight: 800;
        box-shadow: var(--pop-xs);
      }

      .op-shell [data-testid="partnerships-tabs"] button:hover,
      .op-shell [data-testid="vista-toggle"] button:hover,
      .op-shell [data-testid="roster-toggle"]:hover,
      .op-shell [data-testid="crear-busqueda"]:hover,
      .op-shell [data-testid="nueva-plantilla"]:hover,
      .op-shell [data-testid="bulk-contactar"]:hover,
      .op-shell [data-testid="assign-template-chip"]:hover,
      .op-shell [data-testid="picker-create-new"]:hover {
        transform: translate(-1px, -1px);
        box-shadow: var(--pop-sm);
      }

      .op-shell [data-testid="partnerships-tabs"] button:active,
      .op-shell [data-testid="vista-toggle"] button:active,
      .op-shell [data-testid="roster-toggle"]:active,
      .op-shell [data-testid="crear-busqueda"]:active,
      .op-shell [data-testid="nueva-plantilla"]:active,
      .op-shell [data-testid="bulk-contactar"]:active,
      .op-shell [data-testid="assign-template-chip"]:active,
      .op-shell [data-testid="picker-create-new"]:active {
        transform: translate(2px, 2px);
        box-shadow: none;
      }

      .op-shell [data-testid="partnerships-kanban"] section,
      .op-shell [data-testid="encuentra-tab"] section,
      .op-shell [data-testid="convo-list"],
      .op-shell [data-testid="thread-panel"],
      .op-shell [data-testid="plantillas-tab"] section > div,
      .op-shell [data-testid="busqueda-banner"],
      .op-shell [data-testid="template-picker"],
      .op-shell [data-testid="bulk-bar"] {
        border: 2px solid var(--op-ink);
        border-radius: var(--sc-r-md);
        background: var(--op-paper-3);
        box-shadow: var(--pop-xs);
      }

      .op-shell [data-testid="partnerships-kanban"] article {
        border: 2px solid var(--op-ink);
        border-radius: var(--sc-r-md);
        background: white;
        box-shadow: 2px 2px 0 0 rgba(31, 20, 16, 0.45);
      }

      .op-shell [data-testid="partnerships-kanban"] header,
      .op-shell table thead tr,
      .op-shell [data-testid="thread-panel"] > header {
        border-color: var(--op-ink);
        background: var(--op-paper-2);
      }

      .op-shell [data-testid="contactos-lista"] {
        border: 2px solid var(--op-ink);
        border-radius: var(--sc-r-md);
        background: var(--op-paper-3);
        box-shadow: var(--pop-xs);
        overflow: hidden;
      }

      .op-shell table {
        border-collapse: separate;
        border-spacing: 0;
      }

      .op-shell tbody tr {
        background: rgba(255, 255, 255, 0.62);
      }

      .op-shell tbody tr:hover {
        background: rgba(245, 191, 160, 0.22);
      }

      .op-shell input,
      .op-shell select,
      .op-shell textarea {
        border: 2px solid var(--op-ink);
        border-radius: var(--sc-r-md);
        background: #fffaf0;
        color: var(--op-ink);
      }

      .op-shell input:focus,
      .op-shell select:focus,
      .op-shell textarea:focus {
        border-color: var(--op-rust);
        box-shadow: 0 0 0 2px rgba(196, 93, 53, 0.16);
      }

      .op-shell [data-testid="search-templates-row"] {
        background: rgba(245, 232, 200, 0.72);
      }

      .op-shell [data-testid="settings-tab"] > section {
        border: 2px solid var(--op-ink);
        border-radius: var(--sc-r-md);
        background: var(--op-paper-3);
        box-shadow: var(--pop-xs);
      }

      .op-shell [data-testid="settings-tab"] [data-testid^="conn-row-"],
      .op-shell [data-testid="settings-tab"] [data-testid="qmode-desc"],
      .op-shell
        [data-testid="settings-tab"]
        [data-testid="funnel-readonly"]
        > div {
        border-color: var(--op-ink);
      }

      @media (max-width: 760px) {
        .op-shell {
          margin: 0;
          padding: 14px;
          border-width: 2px;
          box-shadow: var(--pop-sm);
        }

        .op-stat-grid {
          min-width: 100%;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .op-stat-grid > div {
          padding: 0.55rem;
        }
      }
    `}</style>
  );
}
