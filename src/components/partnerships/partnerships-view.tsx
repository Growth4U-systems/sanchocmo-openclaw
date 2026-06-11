/**
 * Outreach · Partnerships (SAN-78) — vista principal bajo /dashboard/[slug]/yalc
 * cuando el selector Tipo está en "Partnerships".
 *
 * Sub-nav del mockup: Encuentra · Contactos · Inbox · Plantillas, con el
 * engranaje ⚙️ Settings fijo arriba a la derecha (decisión de diseño nº 3 —
 * misma lógica que Content Creation). Inbox y Plantillas son reales (SAN-80);
 * Settings sigue placeholder (SAN-76).
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
import { TipoSelector } from "./tipo-selector";
import { EncuentraTab } from "./encuentra-tab";
import { KanbanView } from "./kanban-view";
import { ListaView } from "./lista-view";
import { PartnerDrawer } from "./partner-drawer";
import { InboxTab } from "./inbox-tab";
import { PlantillasTab } from "./plantillas-tab";
import { SettingsPlaceholder } from "./placeholder-tabs";
import { NarratorCaption, ToastViewport, useToast } from "./ui";

type PartnershipsTab = "encuentra" | "contactos" | "inbox" | "plantillas" | "settings";
type ContactosVista = "kanban" | "lista";

const TABS: Array<{ key: PartnershipsTab; label: string; icon: string }> = [
  { key: "encuentra", label: "Encuentra", icon: "🔭" },
  { key: "contactos", label: "Contactos", icon: "🗂️" },
  { key: "inbox", label: "Inbox", icon: "📥" },
  { key: "plantillas", label: "Plantillas", icon: "📝" },
];

const HEADERS: Record<PartnershipsTab, { narrator: string; title: string; sub: string }> = {
  encuentra: {
    narrator: "Capítulo: en busca de creators dignos de la causa…",
    title: "ENCUENTRA",
    sub: "CREATORS",
  },
  contactos: {
    narrator: "Capítulo: creators, un pipeline, y Sancho moviendo fichas…",
    title: "CONTACTOS",
    sub: "· PIPELINE",
  },
  inbox: { narrator: "Capítulo: cartas que llegan, tratos que se cierran…", title: "INBOX", sub: "· NEGOCIACIÓN" },
  plantillas: { narrator: "Capítulo: el arsenal de cartas y briefs…", title: "PLANTILLAS", sub: "& BRIEFS" },
  settings: { narrator: "Capítulo: los engranajes del modelo…", title: "SETTINGS", sub: "· OUTREACH" },
};

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

function queryValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) || "";
}

export function PartnershipsView() {
  const slug = useSlugSync();
  const router = useRouter();
  const openChat = useOpenChat();
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();

  const tabParam = queryValue(router.query.tab) as PartnershipsTab;
  const tab: PartnershipsTab = (["encuentra", "contactos", "inbox", "plantillas", "settings"] as const).includes(
    tabParam,
  )
    ? tabParam
    : "encuentra";
  const vista: ContactosVista = queryValue(router.query.vista) === "lista" ? "lista" : "kanban";
  const busqueda = queryValue(router.query.busqueda);

  const [roster, setRoster] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  function pushQuery(next: Partial<{ tab: PartnershipsTab; vista: ContactosVista; busqueda: string }>) {
    const query: Record<string, string> = { slug };
    const merged = { tab, vista, busqueda, ...next };
    if (merged.tab !== "encuentra") query.tab = merged.tab;
    if (merged.tab === "contactos" && merged.vista !== "kanban") query.vista = merged.vista;
    if (merged.tab === "contactos" && merged.busqueda) query.busqueda = merged.busqueda;
    void router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
  }

  // ── Datos (proxies SAN-77) ──
  const overview = useQuery({
    queryKey: ["yalc", slug, "overview"],
    queryFn: () => fetchJson<{ ok: boolean; configured?: boolean }>(`/api/yalc/overview?slug=${encodeURIComponent(slug)}`),
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

  const activeLeadsKey = ["yalc", slug, "partnerships", "leads", "active"] as const;
  const discardedLeadsKey = ["yalc", slug, "partnerships", "leads", "discarded"] as const;

  const activeLeadsQuery = useQuery({
    queryKey: activeLeadsKey,
    queryFn: () =>
      fetchJson<PartnershipLeadsPayload>(`/api/yalc/leads?slug=${encodeURIComponent(slug)}&type=Partnerships`),
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
        `/api/partnerships/searches?slug=${encodeURIComponent(slug)}`,
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

  const campaigns = useMemo(
    () => (campaignsQuery.data?.campaigns || []).filter((c) => (c.type || "") === "Partnerships"),
    [campaignsQuery.data],
  );
  const activeLeads = useMemo(() => activeLeadsQuery.data?.leads || [], [activeLeadsQuery.data]);
  const discardedLeads = useMemo(() => discardedLeadsQuery.data?.leads || [], [discardedLeadsQuery.data]);
  const allLeads = useMemo(() => [...activeLeads, ...discardedLeads], [activeLeads, discardedLeads]);

  const selectedLead = useMemo(
    () => (selectedLeadId ? allLeads.find((lead) => lead.id === selectedLeadId) || null : null),
    [selectedLeadId, allLeads],
  );
  const busquedaCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === busqueda) || null,
    [campaigns, busqueda],
  );

  // ── Mutación de stage (PATCH /api/yalc/leads/[id]/stage) con update optimista ──
  const stageMutation = useMutation({
    mutationFn: ({ lead, target, note }: { lead: PartnershipLead; target: StageFilterKey; note?: string }) =>
      fetchJson(`/api/yalc/leads/${encodeURIComponent(lead.id)}/stage?slug=${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycleStatus: canonicalStatusForStage(target), note }),
      }),
    onMutate: async ({ lead, target, note }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: activeLeadsKey }),
        queryClient.cancelQueries({ queryKey: discardedLeadsKey }),
      ]);
      const previousActive = queryClient.getQueryData<PartnershipLeadsPayload>(activeLeadsKey);
      const previousDiscarded = queryClient.getQueryData<PartnershipLeadsPayload>(discardedLeadsKey);

      const nextStatus = canonicalStatusForStage(target);
      const updated: PartnershipLead = {
        ...lead,
        lifecycleStatus: nextStatus,
        discardNote: target === DISCARDED_STAGE ? note || `manual · ${new Date().toISOString().slice(0, 10)}` : null,
      };
      const withoutLead = (payload?: PartnershipLeadsPayload): PartnershipLeadsPayload => ({
        ...payload,
        leads: (payload?.leads || []).filter((item) => item.id !== lead.id),
      });
      const withLead = (payload?: PartnershipLeadsPayload): PartnershipLeadsPayload => ({
        ...payload,
        leads: [...(payload?.leads || []).filter((item) => item.id !== lead.id), updated],
      });

      if (target === DISCARDED_STAGE) {
        queryClient.setQueryData(activeLeadsKey, withoutLead(previousActive));
        queryClient.setQueryData(discardedLeadsKey, withLead(previousDiscarded));
      } else {
        queryClient.setQueryData(activeLeadsKey, withLead(previousActive));
        queryClient.setQueryData(discardedLeadsKey, withoutLead(previousDiscarded));
      }
      return { previousActive, previousDiscarded };
    },
    onError: (error, _variables, context) => {
      if (context?.previousActive) queryClient.setQueryData(activeLeadsKey, context.previousActive);
      if (context?.previousDiscarded) queryClient.setQueryData(discardedLeadsKey, context.previousDiscarded);
      showToast(`⚠️ No se pudo mover: ${error instanceof Error ? error.message : "error"}`, "warn");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: activeLeadsKey });
      void queryClient.invalidateQueries({ queryKey: discardedLeadsKey });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "partnerships", "campaigns"] });
    },
  });

  function moveLead(lead: PartnershipLead, target: StageFilterKey, note?: string) {
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
          if (target === "Shortlist") showToast(`✓ ${name} → Shortlist · listo para contactar`);
          else if (target === DISCARDED_STAGE)
            showToast(`🗑 ${name} descartado — recuperable con el filtro Stage → 🗑 Descartados`);
          else if (target === "Discovered" && lead.lifecycleStatus === DISQUALIFIED_STATUS)
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
          fetchJson(`/api/yalc/leads/${encodeURIComponent(lead.id)}/stage?slug=${encodeURIComponent(slug)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lifecycleStatus: status }),
          }),
        ),
      );
      if (target === DISCARDED_STAGE) {
        showToast(`🗑 ${leads.length} descartado${leads.length === 1 ? "" : "s"} — recuperables con el filtro Stage → 🗑 Descartados`);
      } else {
        showToast(`${leads.length} movido${leads.length === 1 ? "" : "s"} a "${target}". El Kanban lo verá igual.`);
      }
    } catch (error) {
      showToast(`⚠️ Bulk incompleto: ${error instanceof Error ? error.message : "error"}`, "warn");
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
    sent?: boolean;
  }
  const [contactGate, setContactGate] = useState<PendingContactGate | null>(null);

  async function contactLeads(leadsToContact: PartnershipLead[]) {
    try {
      const payload = await fetchJson<{ gates: PendingContactGate[] & Array<{ runId: string }> }>(
        `/api/partnerships/contact?slug=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leads: leadsToContact.map((lead) => ({ id: lead.id, campaignId: lead.campaignId })),
          }),
        },
      );
      const first = payload.gates?.[0];
      if (first) setContactGate({ ...first, sent: false });
      void queryClient.invalidateQueries({ queryKey: activeLeadsKey });
      void queryClient.invalidateQueries({ queryKey: discardedLeadsKey });
    } catch (error) {
      showToast(`⚠️ ${error instanceof Error ? error.message : "No se pudo contactar"}`, "warn");
    }
  }

  async function approveContactGate(runId: string) {
    try {
      await fetchJson(`/api/yalc/gates?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, action: "approve" }),
      });
      setContactGate((prev) => (prev ? { ...prev, sent: true } : prev));
      void queryClient.invalidateQueries({ queryKey: activeLeadsKey });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "partnerships", "inbox-leads"] });
    } catch (error) {
      showToast(`⚠️ ${error instanceof Error ? error.message : "No se pudo aprobar"}`, "warn");
    }
  }

  async function assignTemplate(campaign: PartnershipCampaign, templateId: string) {
    try {
      await fetchJson(
        `/api/partnerships/templates/${encodeURIComponent(templateId)}/assign?slug=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: campaign.id }),
        },
      );
      showToast(`✓ Plantilla instanciada en «${campaign.title || campaign.id}»`);
      void queryClient.invalidateQueries({ queryKey: ["partnerships", slug, "searches"] });
    } catch (error) {
      showToast(`⚠️ ${error instanceof Error ? error.message : "No se pudo asignar"}`, "warn");
    }
  }

  function openDiscoveryChat(campaign?: PartnershipCampaign) {
    if (!slug) return;
    openChat(
      slug,
      buildDiscoverySearchThread(slug, campaign ? { campaignId: campaign.id, title: campaign.title } : undefined),
    );
  }

  const header = HEADERS[tab];
  const leadsError = activeLeadsQuery.error || discardedLeadsQuery.error || campaignsQuery.error;
  const notConfigured = overview.data?.configured === false;

  return (
    <DashboardLayout>
      <Head>
        <title>{`Outreach - ${slug || "cliente"} - Mission Control`}</title>
      </Head>

      <div className="relative min-h-[calc(100vh-48px)] space-y-4" data-testid="partnerships-outreach">
        {/* Engranaje ⚙️ Settings fijo arriba a la derecha (decisión nº 3) */}
        <button
          type="button"
          onClick={() => pushQuery({ tab: "settings" })}
          title="Settings de Outreach (SAN-76)"
          className={cn(
            "absolute right-0 top-0 z-10 grid h-10 w-10 place-items-center rounded-xl border-2 border-ink bg-card text-lg shadow-comic-sm transition-all hover:-translate-y-0.5 hover:rotate-12",
            tab === "settings" && "bg-yellow-100",
          )}
          data-testid="gear-settings"
        >
          ⚙️
        </button>

        <header className="flex flex-wrap items-end justify-between gap-4 pr-12">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {slug || "cliente"} · Outreach
            </div>
            <div className="mt-1.5">
              <NarratorCaption>{header.narrator}</NarratorCaption>
            </div>
            <h1 className="mt-1 font-heading text-3xl tracking-wide text-navy">
              {header.title} <span className="text-rust">{header.sub}</span>
            </h1>
          </div>
          {tab === "encuentra" && (
            <button
              type="button"
              onClick={() => openDiscoveryChat()}
              className="rounded-md border-2 border-ink bg-rust px-4 py-2 text-sm font-bold text-white shadow-comic-sm transition-transform hover:-translate-y-0.5"
              data-testid="crear-busqueda"
            >
              ✨ Crear nueva búsqueda
            </button>
          )}
        </header>

        {/* Sub-nav Outreach + selector Tipo */}
        <div className="flex flex-wrap items-center gap-3 border-b-2 border-border pb-3">
          <nav className="flex flex-wrap gap-2" data-testid="partnerships-tabs">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => pushQuery({ tab: item.key })}
                className={cn(
                  "rounded-full border-2 px-4 py-1.5 text-sm font-bold shadow-comic-sm transition-all hover:-translate-y-0.5",
                  tab === item.key ? "border-ink bg-navy text-white" : "border-border bg-card text-foreground hover:border-ink",
                )}
              >
                <span className="mr-1.5" aria-hidden>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto">
            <TipoSelector tipo="partnerships" />
          </div>
        </div>

        {notConfigured ? (
          <div className="mx-auto max-w-2xl rounded-xl border-2 border-border bg-card p-8 text-center shadow-comic-sm">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border-2 border-ink bg-sage/20 text-2xl">🚀</div>
            <h2 className="font-heading text-xl text-navy">Outreach no está activado</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              YALC es el motor de outbound (búsquedas, leads, secuencias). Activalo con{" "}
              <code className="rounded bg-muted px-1">./install.sh --yalc</code> o el overlay{" "}
              <code className="rounded bg-muted px-1">docker-compose.yalc.yml</code>, y define{" "}
              <code className="rounded bg-muted px-1">YALC_BASE_URL</code> /{" "}
              <code className="rounded bg-muted px-1">YALC_API_TOKEN</code> en tu .env.
            </p>
          </div>
        ) : (
          <>
            {leadsError && (
              <div className="rounded-lg border-2 border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {String((leadsError as Error).message || leadsError)}
              </div>
            )}

            {tab === "encuentra" && (
              <EncuentraTab
                campaigns={campaigns}
                leads={allLeads}
                loading={campaignsQuery.isLoading}
                onOpenSearch={(campaign) => pushQuery({ tab: "contactos", vista: "lista", busqueda: campaign.id })}
                onContinueDraft={(campaign) => openDiscoveryChat(campaign)}
                onCreateSearch={() => openDiscoveryChat()}
                searches={searchesQuery.data?.searches || []}
                templateLibrary={templatesQuery.data?.summaries || []}
                onAssignTemplate={(campaign, templateId) => void assignTemplate(campaign, templateId)}
                onCreateTemplate={() => pushQuery({ tab: "plantillas" })}
              />
            )}

            {tab === "contactos" && (
              <div>
                {/* Toolbar: vista + roster */}
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Vista</span>
                  <div className="inline-flex overflow-hidden rounded-full border-2 border-ink bg-card shadow-comic-sm" data-testid="vista-toggle">
                    {(
                      [
                        { key: "kanban" as const, label: "🗃️ Kanban" },
                        { key: "lista" as const, label: "📋 Lista" },
                      ]
                    ).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => pushQuery({ vista: option.key })}
                        className={cn(
                          "px-3 py-1 text-xs font-bold transition-colors",
                          vista === option.key ? "bg-navy text-white" : "bg-card text-foreground hover:bg-muted",
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
                        "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-bold shadow-comic-sm transition-all hover:-translate-y-0.5",
                        roster ? "border-ink bg-yellow-200 text-ink" : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      🏆 Roster
                    </button>
                  )}

                  <span className="ml-auto text-xs font-semibold text-muted-foreground">
                    {activeLeadsQuery.isFetching || discardedLeadsQuery.isFetching
                      ? "Actualizando…"
                      : `${activeLeads.length} en pipeline · ${discardedLeads.length} descartados`}
                  </span>
                </div>

                {roster && vista === "kanban" && (
                  <div className="mb-3">
                    <NarratorCaption>
                      El Roster no es otra pantalla: es <b>este mismo kanban filtrado</b> a Signed + Active — tus partners en activo.
                    </NarratorCaption>
                  </div>
                )}

                {vista === "kanban" ? (
                  activeLeadsQuery.isLoading ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">Cargando pipeline…</p>
                  ) : (
                    <KanbanView
                      leads={activeLeads}
                      roster={roster}
                      busyLeadId={stageMutation.isPending ? stageMutation.variables?.lead.id : undefined}
                      onMove={moveLead}
                      onOpen={(lead) => setSelectedLeadId(lead.id)}
                    />
                  )
                ) : (
                  <ListaView
                    leads={allLeads}
                    busqueda={busqueda}
                    busquedaLabel={busquedaCampaign?.title}
                    onClearBusqueda={() => pushQuery({ busqueda: "" })}
                    onOpen={(lead) => setSelectedLeadId(lead.id)}
                    onBulkMove={(leads, target) => void moveMany(leads, target)}
                    onBulkDiscard={(leads) => void moveMany(leads, DISCARDED_STAGE)}
                    onBulkContact={(leads) => void contactLeads(leads)}
                    busy={stageMutation.isPending}
                  />
                )}
              </div>
            )}

            {tab === "inbox" && <InboxTab slug={slug} />}
            {tab === "plantillas" && <PlantillasTab slug={slug} />}
            {tab === "settings" && (
              <SettingsPlaceholder
                onGoB2B={() => {
                  void router.push(
                    { pathname: router.pathname, query: { slug, tipo: "b2b" } },
                    undefined,
                    { shallow: true },
                  );
                }}
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
        busy={stageMutation.isPending}
      />

      {/* ── GATE de contacto (GateItem · human-in-the-loop) ── */}
      {contactGate && (
        <div className="fixed inset-0 z-[600]">
          <div className="fixed inset-0 bg-ink/45" onClick={() => setContactGate(null)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 w-[min(540px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-ink bg-background p-6 shadow-comic"
            data-testid="contact-gate-modal"
          >
            {!contactGate.sent ? (
              <>
                <h2 className="font-heading text-2xl text-navy">🚦 GATE: APROBAR ENVÍO</h2>
                <span className="mt-1 inline-block -rotate-2 rounded border-2 border-rust px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rust">
                  GateItem · requiere humano
                </span>
                <div className="mt-3 space-y-1.5 text-sm">
                  <div className="rounded-md border-2 border-border bg-card px-3 py-1.5">
                    <b>Secuencia:</b> {contactGate.sequenceName}
                  </div>
                  <div className="rounded-md border-2 border-border bg-card px-3 py-1.5">
                    <b>Acción:</b> {contactGate.prompt}
                  </div>
                  <div className="rounded-md border-2 border-border bg-card px-3 py-1.5">
                    <b>Gate:</b> {contactGate.runId}
                    {contactGate.dryRun && " · dry-run (no saldrá ningún email real)"}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void approveContactGate(contactGate.runId)}
                    className="rounded-md border-2 border-ink bg-rust px-4 py-2 text-sm font-bold text-white shadow-comic-sm transition-transform hover:-translate-y-0.5"
                    data-testid="approve-contact-gate"
                  >
                    ✅ Aprobar y enviar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setContactGate(null);
                      showToast("Gate pendiente — lo tienes también en el Cockpit (yalc_list_gates)");
                    }}
                    className="rounded-md border-2 border-border bg-card px-4 py-2 text-sm font-bold shadow-comic-sm transition-transform hover:-translate-y-0.5 hover:border-ink"
                  >
                    ✋ Luego
                  </button>
                </div>
                <p className="mt-2 text-[11px] italic text-muted-foreground">
                  Los creators quedan «En cola» hasta tu OK. El mismo gate se puede aprobar desde el
                  chat (Rocinante) o desde Claude Code (yalc_approve_gate).
                </p>
              </>
            ) : (
              <div className="py-4 text-center" data-testid="contact-gate-sent">
                <span className="inline-block -rotate-3 rounded-xl border-4 border-sage px-6 py-2 font-heading text-2xl tracking-wide text-sage">
                  ¡ENVIADO!
                </span>
                <p className="mx-auto mt-3 max-w-sm text-sm italic text-muted-foreground">
                  Secuencia lanzada{contactGate.dryRun ? " en dry-run (sin email real)" : ""} a{" "}
                  {contactGate.queuedLeads} creator{contactGate.queuedLeads === 1 ? "" : "s"} — el primer
                  toque ya está en su hilo del Inbox.
                </p>
                <button
                  type="button"
                  onClick={() => setContactGate(null)}
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
    </DashboardLayout>
  );
}
