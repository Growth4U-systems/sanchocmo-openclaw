"use client";

import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Target,
  Trash2,
  X,
  Users,
  type LucideIcon,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SlideOver } from "@/components/shared/slide-over";
import { TipoSelector } from "@/components/partnerships/tipo-selector";
import { ScoreBar, ToastViewport, useToast } from "@/components/partnerships/ui";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useOpenChat } from "@/hooks/useChat";
import { buildYalcThread } from "@/lib/chat-openers";
import { cn } from "@/lib/utils";
import {
  DISCARDED_STAGE,
  DISQUALIFIED_STATUS,
  PIPELINE_STAGES,
  ROSTER_STAGES,
  canonicalStatusForStage,
  qualityBand,
  stageForStatus,
  type PipelineStageKey,
  type StageFilterKey,
} from "@/lib/partnerships/stage-mapping";

type B2BTab = "encuentra" | "contactos" | "inbox" | "plantillas" | "settings";
type ContactosVista = "kanban" | "lista";
type OutboundAction = "search" | "enrich" | "approve" | "dry-run" | "publish" | "live";
type B2BInboxFilter = "all" | "followup" | "replied" | "meeting" | "deal";

interface OverviewPayload {
  ok: boolean;
  configured?: boolean;
  runtime?: { baseUrl?: string; auth?: string };
}

interface Campaign {
  id: string;
  type?: string | null;
  title?: string;
  status?: string;
  hypothesis?: string | null;
  targetSegment?: string | null;
  channels?: string[] | string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  leadCount?: number;
  metrics?: Record<string, number | string | null>;
  funnel?: Record<string, number>;
}

interface CampaignStep {
  id?: string;
  stepIndex?: number;
  skillId?: string;
  skillInput?: Record<string, unknown>;
  channel?: string | null;
  status?: string | null;
}

interface CampaignDetail extends Campaign {
  steps?: CampaignStep[];
}

interface CampaignPayload {
  campaigns?: Campaign[];
}

interface Lead {
  id: string;
  campaignId?: string | null;
  campaignTitle?: string | null;
  email?: string | null;
  emailStatus?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  headline?: string | null;
  title?: string | null;
  company?: string | null;
  companyDomain?: string | null;
  companySize?: string | null;
  location?: string | null;
  seniority?: string | null;
  linkedinUrl?: string | null;
  lifecycleStatus?: string | null;
  qualificationScore?: number | null;
  source?: string | null;
  tags?: string[] | null;
  discardNote?: string | null;
  instantlyCampaignId?: string | null;
  connectSentAt?: string | null;
  connectedAt?: string | null;
  dm1SentAt?: string | null;
  dm2SentAt?: string | null;
  repliedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastMessage?: LeadMessage | null;
  fitBreakdown?: Record<string, number | null> | null;
}

interface LeadsPayload {
  leads?: Lead[];
}

interface LeadMessage {
  id: string;
  direction: "in" | "out";
  subject?: string | null;
  body: string;
  status: string;
  createdAt?: string | null;
}

interface GateItem {
  run_id?: string;
  runId?: string;
  title?: string;
  message?: string;
  created_at?: string;
  createdAt?: string;
  stale?: boolean;
  payload?: Record<string, unknown>;
}

interface GatesPayload {
  items?: GateItem[];
}

interface Provider {
  id: string;
  name?: string;
  description?: string;
  type?: string;
  capabilities?: string[];
  status?: "green" | "red" | "gray" | string;
  hasHealthProbe?: boolean;
}

interface ProvidersPayload {
  providers?: Provider[];
}

interface EmailSequenceEmail {
  subject?: string | null;
  body: string;
  delayDays?: number | null;
}

interface EmailSequenceBlock {
  stepId?: string;
  source: string;
  emails: EmailSequenceEmail[];
}

const TABS: Array<{ key: Exclude<B2BTab, "settings">; label: string; icon: LucideIcon }> = [
  { key: "encuentra", label: "Encuentra", icon: Search },
  { key: "contactos", label: "Contactos", icon: Users },
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "plantillas", label: "Plantillas", icon: FileText },
];

const HEADERS: Record<B2BTab, { title: string; sub: string }> = {
  encuentra: {
    title: "Encuentra prospectos",
    sub: "Búsquedas B2B, scoring ICP y siguiente acción en el mismo flujo.",
  },
  contactos: {
    title: "Contactos",
    sub: "Pipeline B2B para priorizar personas, revisar cuentas y activar contacto.",
  },
  inbox: {
    title: "Inbox",
    sub: "Respuestas, aprobaciones humanas y conversaciones listas para seguimiento.",
  },
  plantillas: {
    title: "Plantillas",
    sub: "Secuencias outbound editables por búsqueda antes de aprobar o lanzar.",
  },
  settings: {
    title: "Settings",
    sub: "Conexiones del motor B2B y estado de proveedores de Outreach.",
  },
};

const SCORE_ROWS: Array<{ key: string; label: string }> = [
  { key: "icpFit", label: "ICP fit" },
  { key: "seniority", label: "Seniority" },
  { key: "companyFit", label: "Company fit" },
  { key: "intent", label: "Intent" },
  { key: "contactability", label: "Contactability" },
];

const MANUAL_STATUS_OPTIONS = ["Replied", "Negotiating", "Demo_Booked", "Deal_Created", "Closed_Won", "Closed_Lost"];

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

function campaignState(campaign: Campaign): "running" | "done" | "draft" | "paused" {
  const status = (campaign.status || "").toLowerCase();
  if (status === "draft") return "draft";
  if (status === "paused") return "paused";
  if (["completed", "done", "closed"].includes(status)) return "done";
  return "running";
}

function campaignStateMeta(state: ReturnType<typeof campaignState>) {
  if (state === "done") {
    return {
      label: "Completada",
      stampClass: "border-sage/50 bg-sage/10 text-sage",
      barClass: "bg-sage",
    };
  }
  if (state === "draft") {
    return {
      label: "Borrador",
      stampClass: "border-border bg-muted/40 text-muted-foreground",
      barClass: "bg-border",
    };
  }
  if (state === "paused") {
    return {
      label: "Pausada",
      stampClass: "border-yellow-500/50 bg-yellow-100 text-yellow-800",
      barClass: "bg-yellow-400",
    };
  }
  return {
    label: "Activa",
    stampClass: "border-cyan-600/50 bg-cyan-50 text-cyan-700",
    barClass: "bg-cyan-600",
  };
}

function isB2BCampaign(campaign: Campaign): boolean {
  const type = (campaign.type || "").toLowerCase();
  return !type || type === "b2b";
}

function leadDisplayName(lead: Lead): string {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  return name || lead.email || lead.linkedinUrl || lead.id;
}

function leadRole(lead: Lead): string {
  return lead.title || lead.headline || lead.seniority || "Contacto B2B";
}

function leadScore(lead: Lead): number | null {
  return typeof lead.qualificationScore === "number" && Number.isFinite(lead.qualificationScore)
    ? lead.qualificationScore
    : null;
}

function campaignLeadCount(campaign: Campaign, leads: Lead[]): number {
  const byLead = leads.filter((lead) => lead.campaignId === campaign.id).length;
  return byLead || campaign.leadCount || 0;
}

function stageLabel(lead: Lead): string {
  const stage = stageForStatus(lead.lifecycleStatus);
  if (stage === DISCARDED_STAGE) return "Descartado";
  return stage || lead.lifecycleStatus || "-";
}

function stageClasses(lead: Lead): string {
  const stage = stageForStatus(lead.lifecycleStatus);
  if (stage === "Active") return "border-sage bg-sage text-white";
  if (stage === "Signed") return "border-sage/50 bg-sage/10 text-sage";
  if (stage === "Negotiating") return "border-rust/50 bg-rust/10 text-rust";
  if (stage === "Replied" || stage === "Shortlist") return "border-cyan-600/50 bg-cyan-50 text-cyan-800";
  if (stage === "Contacted") return "border-yellow-500/50 bg-yellow-100 text-yellow-800";
  if (stage === DISCARDED_STAGE) return "border-destructive/50 bg-destructive/10 text-destructive";
  return "border-border bg-muted/50 text-muted-foreground";
}

function providerClasses(status?: string): string {
  const value = (status || "").toLowerCase();
  if (["green", "active", "connected"].includes(value)) return "border-sage/50 bg-sage/10 text-sage";
  if (["red", "error", "failed"].includes(value)) return "border-destructive/50 bg-destructive/10 text-destructive";
  return "border-border bg-muted/50 text-muted-foreground";
}

function providerDot(status?: string): string {
  const value = (status || "").toLowerCase();
  if (["green", "active", "connected"].includes(value)) return "bg-sage";
  if (["red", "error", "failed"].includes(value)) return "bg-destructive";
  return "bg-muted-foreground";
}

function compactDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function channelText(channels?: string[] | string | null): string {
  if (Array.isArray(channels)) return channels.join(", ") || "-";
  if (!channels) return "-";
  try {
    const parsed = JSON.parse(channels);
    if (Array.isArray(parsed)) return parsed.join(", ") || "-";
  } catch {
    return channels;
  }
  return channels;
}

function groupLeadsByStage(leads: readonly Lead[]): Record<PipelineStageKey, Lead[]> {
  const groups = Object.fromEntries(
    PIPELINE_STAGES.map((stage) => [stage.key, [] as Lead[]]),
  ) as Record<PipelineStageKey, Lead[]>;
  for (const lead of leads) {
    const stage = stageForStatus(lead.lifecycleStatus);
    if (stage && stage !== DISCARDED_STAGE) groups[stage].push(lead);
  }
  return groups;
}

function sourceLabel(lead: Lead): string {
  const source = (lead.source || "").trim();
  if (!source) return "Fuente";
  if (source.toLowerCase().includes("apollo")) return "Apollo";
  if (source.toLowerCase().includes("linkedin")) return "LinkedIn";
  if (source.toLowerCase().includes("instantly")) return "Instantly";
  return source;
}

function outboundActionLabel(action: OutboundAction): string {
  if (action === "search") return "Buscar prospectos";
  if (action === "enrich") return "Completar datos";
  if (action === "approve") return "Aprobar secuencia";
  if (action === "dry-run") return "Enviar prueba";
  if (action === "publish") return "Crear campaña en Instantly";
  return "Activar envíos";
}

function outboundActionDescription(action: OutboundAction): string {
  if (action === "search") return "Trae más contactos desde la fuente conectada.";
  if (action === "enrich") return "Completa email, cargo, cuenta y señales de fit.";
  if (action === "approve") return "Bloquea la secuencia revisada para esta búsqueda.";
  if (action === "dry-run") return "Valida la campaña sin enviar emails reales.";
  if (action === "publish") return "Crea o actualiza la campaña en Instantly.";
  return "Deja la campaña lista para enviar.";
}

function scoreBandClass(score: number | null, size: "md" | "lg" = "md"): string {
  const band = qualityBand(score);
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-full border font-heading font-semibold",
    size === "lg" ? "h-14 w-14 text-xl" : "h-9 w-9 text-sm",
    band === "high" && "border-sage/60 bg-sage/15 text-sage",
    band === "medium" && "border-amber-400/60 bg-amber-100 text-amber-800",
    band === "low" && "border-destructive/50 bg-destructive/10 text-destructive",
    !band && "border-border bg-muted text-muted-foreground",
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeEmailItem(value: unknown): EmailSequenceEmail | null {
  const item = asRecord(value);
  if (!item) return null;
  const body =
    stringValue(item.body) ||
    stringValue(item.content) ||
    stringValue(item.message) ||
    stringValue(item.template);
  if (!body) return null;
  return {
    subject: stringValue(item.subject),
    body,
    delayDays:
      numberValue(item.delay_days) ??
      numberValue(item.delayDays) ??
      numberValue(item.dayOffset) ??
      numberValue(item.day),
  };
}

function sequenceFromInput(input: unknown): EmailSequenceEmail[] {
  const data = asRecord(input);
  if (!data) return [];
  for (const key of ["sequence", "emails", "emailSequence", "email_sequence", "steps", "messages"]) {
    const value = data[key];
    if (!Array.isArray(value)) continue;
    const emails = value.map(normalizeEmailItem).filter((item): item is EmailSequenceEmail => item !== null);
    if (emails.length > 0) return emails;
  }
  return [];
}

function extractEmailSequences(campaign?: CampaignDetail | null): EmailSequenceBlock[] {
  if (!campaign) return [];
  const blocks: EmailSequenceBlock[] = [];
  for (const step of campaign.steps || []) {
    const emails = sequenceFromInput(step.skillInput);
    if (emails.length === 0) continue;
    blocks.push({
      stepId: step.id,
      source: step.skillId || step.channel || "email-sequence",
      emails,
    });
  }
  return blocks;
}

function extractSequencePlaceholders(blocks: EmailSequenceBlock[]): string[] {
  const found = new Set<string>();
  const pattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  for (const block of blocks) {
    for (const email of block.emails) {
      for (const text of [email.subject, email.body]) {
        if (!text) continue;
        pattern.lastIndex = 0;
        let match = pattern.exec(text);
        while (match) {
          found.add(match[1]);
          match = pattern.exec(text);
        }
      }
    }
  }
  return [...found].sort();
}

function gateRunId(gate: GateItem): string {
  return gate.run_id || gate.runId || "";
}

function gateTitle(gate: GateItem): string {
  return gate.title || gate.message || gateRunId(gate) || "Aprobación pendiente";
}

export function OutboundB2BView() {
  const slug = useSlugSync();
  const router = useRouter();
  const openChat = useOpenChat();
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();

  const tabParam = queryValue(router.query.tab) as B2BTab;
  const tab: B2BTab = (["encuentra", "contactos", "inbox", "plantillas", "settings"] as const).includes(tabParam)
    ? tabParam
    : "encuentra";
  const vista: ContactosVista = queryValue(router.query.vista) === "lista" ? "lista" : "kanban";
  const busqueda = queryValue(router.query.busqueda);
  const stageParam = queryValue(router.query.stage) as StageFilterKey | "";

  const [roster, setRoster] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedTemplateCampaignId, setSelectedTemplateCampaignId] = useState("");

  function pushQuery(
    next: Partial<{
      tab: B2BTab;
      vista: ContactosVista;
      busqueda: string;
      stage: string;
    }>,
  ) {
    const merged = { tab, vista, busqueda, stage: stageParam, ...next };
    const query: Record<string, string> = { slug, tipo: "b2b" };
    if (merged.tab !== "encuentra") query.tab = merged.tab;
    if (merged.tab === "contactos" && merged.vista !== "kanban") query.vista = merged.vista;
    if (merged.tab === "contactos" && merged.busqueda) query.busqueda = merged.busqueda;
    if (merged.tab === "contactos" && merged.stage) query.stage = merged.stage;
    void router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
  }

  const overview = useQuery({
    queryKey: ["yalc", slug, "overview"],
    queryFn: () => fetchJson<OverviewPayload>(`/api/yalc/overview?slug=${encodeURIComponent(slug)}`),
    enabled: !!slug,
  });

  const campaignsQuery = useQuery({
    queryKey: ["yalc", slug, "b2b", "campaigns"],
    queryFn: () => fetchJson<CampaignPayload>(`/api/yalc/campaigns?slug=${encodeURIComponent(slug)}&type=B2B`),
    enabled: !!slug,
  });

  const activeLeadsKey = ["yalc", slug, "b2b", "leads", "active"] as const;
  const discardedLeadsKey = ["yalc", slug, "b2b", "leads", "discarded"] as const;

  const activeLeadsQuery = useQuery({
    queryKey: activeLeadsKey,
    queryFn: () => fetchJson<LeadsPayload>(`/api/yalc/leads?slug=${encodeURIComponent(slug)}&type=B2B`),
    enabled: !!slug,
  });

  const discardedLeadsQuery = useQuery({
    queryKey: discardedLeadsKey,
    queryFn: () =>
      fetchJson<LeadsPayload>(
        `/api/yalc/leads?slug=${encodeURIComponent(slug)}&type=B2B&lifecycleStatus=${DISQUALIFIED_STATUS}`,
      ),
    enabled: !!slug,
  });

  const gatesQuery = useQuery({
    queryKey: ["yalc", slug, "b2b", "gates"],
    queryFn: () => fetchJson<GatesPayload>(`/api/yalc/gates?slug=${encodeURIComponent(slug)}`),
    enabled: !!slug,
  });

  const providersQuery = useQuery({
    queryKey: ["yalc", slug, "b2b", "providers"],
    queryFn: () => fetchJson<ProvidersPayload>(`/api/yalc/providers?slug=${encodeURIComponent(slug)}`),
    enabled: !!slug,
  });

  const campaigns = useMemo(
    () => (campaignsQuery.data?.campaigns || []).filter(isB2BCampaign),
    [campaignsQuery.data],
  );
  const activeLeads = useMemo(() => activeLeadsQuery.data?.leads || [], [activeLeadsQuery.data]);
  const discardedLeads = useMemo(() => discardedLeadsQuery.data?.leads || [], [discardedLeadsQuery.data]);
  const allLeads = useMemo(() => [...activeLeads, ...discardedLeads], [activeLeads, discardedLeads]);
  const gates = useMemo(() => gatesQuery.data?.items || [], [gatesQuery.data]);
  const providers = useMemo(() => providersQuery.data?.providers || [], [providersQuery.data]);

  const selectedLead = useMemo(
    () => (selectedLeadId ? allLeads.find((lead) => lead.id === selectedLeadId) || null : null),
    [selectedLeadId, allLeads],
  );
  const busquedaCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === busqueda) || null,
    [campaigns, busqueda],
  );
  const templateCampaignId = selectedTemplateCampaignId || campaigns[0]?.id || "";

  useEffect(() => {
    if (!selectedTemplateCampaignId && campaigns[0]?.id) setSelectedTemplateCampaignId(campaigns[0].id);
  }, [campaigns, selectedTemplateCampaignId]);

  const campaignDetailQuery = useQuery({
    queryKey: ["yalc", slug, "b2b", "campaigns", templateCampaignId],
    queryFn: () =>
      fetchJson<CampaignDetail>(
        `/api/yalc/campaigns/${encodeURIComponent(templateCampaignId)}?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug && !!templateCampaignId,
  });

  const stageMutation = useMutation({
    mutationFn: ({ lead, target, note }: { lead: Lead; target: StageFilterKey; note?: string }) =>
      fetchJson(`/api/yalc/leads/${encodeURIComponent(lead.id)}/stage?slug=${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lifecycleStatus: canonicalStatusForStage(target),
          note,
        }),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: activeLeadsKey });
      void queryClient.invalidateQueries({ queryKey: discardedLeadsKey });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "b2b", "campaigns"] });
      showToast(`${leadDisplayName(variables.lead)} -> ${variables.target === DISCARDED_STAGE ? "Descartado" : variables.target}`);
    },
    onError: (error) =>
      showToast(`No se pudo mover: ${error instanceof Error ? error.message : "error"}`, "warn"),
  });

  const outboundAction = useMutation({
    mutationFn: ({ campaignId, action }: { campaignId: string; action: OutboundAction }) => {
      const campaign = campaigns.find((item) => item.id === campaignId) || campaignDetailQuery.data;
      if (action === "search") {
        return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/leads/search?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "apollo",
            query: campaign?.targetSegment || campaign?.hypothesis || campaign?.title || "B2B ICP",
            titles: ["Founder", "CEO", "Head of Growth", "Marketing Director"],
            limit: 25,
          }),
        });
      }
      if (action === "enrich") {
        return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/leads/enrich?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "apollo", limit: 25 }),
        });
      }
      if (action === "approve") {
        return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/sequence/approve?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actorLabel: "Sancho" }),
        });
      }
      if (action === "dry-run") {
        return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/dry-run?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      }
      if (action === "publish") {
        return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/publish?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmInstantlyPublish: true, actorLabel: "Sancho" }),
        });
      }
      return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/live?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmLiveLaunch: true, actorLabel: "Sancho" }),
      });
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug] });
      showToast(`Completado: ${outboundActionLabel(variables.action)}`);
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "Acción incompleta", "warn"),
  });

  const sequenceUpdateAction = useMutation({
    mutationFn: ({ campaignId, stepId, emails }: { campaignId: string; stepId?: string; emails: EmailSequenceEmail[] }) =>
      fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/sequence/update?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepId,
          actorLabel: "Sancho",
          sequence: emails.map((email) => ({
            subject: email.subject || undefined,
            body: email.body,
            delay_days: email.delayDays ?? undefined,
          })),
        }),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "b2b", "campaigns", variables.campaignId] });
      showToast("Secuencia guardada");
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "No se pudo guardar", "warn"),
  });

  function openB2BSearch(campaign?: Campaign) {
    if (!slug) return;
    const prompt = campaign
      ? `Continuar la búsqueda outbound B2B "${campaign.title || campaign.id}". Revisar ICP, priorización, scoring y secuencia de contacto.`
      : "Crear una búsqueda outbound B2B con ICP, criterios de scoring, canales, secuencia y límites de contacto.";
    openChat(slug, buildYalcThread(slug, prompt));
  }

  function openB2BReply(lead: Lead, draft?: string) {
    if (!slug) return;
    const prompt = [
      `Preparar respuesta outbound B2B para ${leadDisplayName(lead)}${lead.company ? ` (${lead.company})` : ""}.`,
      lead.email ? `Email: ${lead.email}.` : null,
      lead.campaignTitle || lead.campaignId ? `Búsqueda: ${lead.campaignTitle || lead.campaignId}.` : null,
      draft?.trim() ? `Borrador actual:\n${draft.trim()}` : "Revisar el hilo, proponer respuesta y siguiente acción.",
    ]
      .filter(Boolean)
      .join("\n");
    openChat(slug, buildYalcThread(slug, prompt));
  }

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ["yalc", slug] });
  }

  function moveLead(lead: Lead, target: StageFilterKey, note?: string) {
    stageMutation.mutate({ lead, target, note });
  }

  async function moveMany(leads: Lead[], target: StageFilterKey) {
    try {
      await Promise.all(
        leads.map((lead) =>
          fetchJson(`/api/yalc/leads/${encodeURIComponent(lead.id)}/stage?slug=${encodeURIComponent(slug)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lifecycleStatus: canonicalStatusForStage(target) }),
          }),
        ),
      );
      showToast(`${leads.length} contacto${leads.length === 1 ? "" : "s"} movido${leads.length === 1 ? "" : "s"} a ${target}`);
    } catch (error) {
      showToast(`Bulk incompleto: ${error instanceof Error ? error.message : "error"}`, "warn");
    } finally {
      void queryClient.invalidateQueries({ queryKey: activeLeadsKey });
      void queryClient.invalidateQueries({ queryKey: discardedLeadsKey });
    }
  }

  const notConfigured = overview.data?.configured === false;
  const header = HEADERS[tab];
  const activeCampaigns = campaigns.filter((campaign) => campaignState(campaign) !== "draft").length;
  const providerReadyCount = providers.filter((provider) => (provider.status || "").toLowerCase() === "green").length;
  const pageError = overview.error || campaignsQuery.error || activeLeadsQuery.error || discardedLeadsQuery.error;

  if (notConfigured) {
    return (
      <DashboardLayout>
        <Head>
          <title>{`Outbound B2B - ${slug || "cliente"} - Mission Control`}</title>
        </Head>
        <div className="op-shell min-h-[calc(100vh-48px)]">
          <header className="op-hero">
            <div className="op-kicker">Outreach · B2B</div>
            <h1 className="m-0 font-heading text-3xl leading-tight text-navy">Outbound no está activo</h1>
            <p className="mb-0 mt-1 max-w-2xl text-sm text-muted-foreground">
              Este entorno no está devolviendo datos del motor de Outreach. Cuando el runtime esté activo, acá se verá el flujo completo.
            </p>
          </header>
        <button
          type="button"
          onClick={refreshAll}
          className="rounded-lg border-2 border-rust bg-rust px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust/90"
        >
          Volver a verificar
        </button>
        <B2BOutreachStyles />
      </div>
    </DashboardLayout>
  );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>{`Outbound B2B - ${slug || "cliente"} - Mission Control`}</title>
      </Head>

      <div className="op-shell relative min-h-[calc(100vh-48px)] space-y-5" data-testid="outbound-b2b">
        <button
          type="button"
          onClick={() => pushQuery({ tab: "settings" })}
          title="Configurar Outreach"
          className={cn(
            "absolute right-0 top-0 z-10 grid h-9 w-9 place-items-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            tab === "settings" && "bg-muted text-foreground",
          )}
          data-testid="outbound-settings"
        >
          <Settings className="h-4 w-4" />
        </button>

        <header className="op-hero pr-12">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-[240px] flex-1">
              <div className="op-kicker">Outreach · B2B</div>
              <h1 className="m-0 font-heading text-3xl leading-tight text-navy">{header.title}</h1>
              <p className="mb-0 mt-1 max-w-2xl text-sm text-muted-foreground">{header.sub}</p>
            </div>
            <div className="op-stat-grid" aria-label="Resumen de Outbound B2B">
              <div>
                <span>{activeCampaigns}</span>
                <small>búsquedas</small>
              </div>
              <div>
                <span>{activeLeads.length}</span>
                <small>pipeline</small>
              </div>
              <div>
                <span>{providerReadyCount}/{providers.length || 0}</span>
                <small>conexiones</small>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {tab === "encuentra" && (
              <button
                type="button"
                onClick={() => openB2BSearch()}
                className="rounded-lg border-2 border-rust bg-rust px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust/90"
                data-testid="crear-busqueda-b2b"
              >
                + Nueva búsqueda
              </button>
            )}
            <div className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-bold text-rust">{slug || "cliente"}</span>
              <span>· Outreach</span>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex flex-wrap gap-2 overflow-x-auto" data-testid="outbound-b2b-tabs">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => pushQuery({ tab: item.key })}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-all",
                    tab === item.key ? "border-rust bg-rust text-white" : "border-border hover:border-rust",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <TipoSelector tipo="b2b" />
            <button
              type="button"
              onClick={refreshAll}
              title="Refrescar datos"
              className="inline-grid h-10 w-10 place-items-center rounded-md border-2 border-border bg-card text-muted-foreground hover:border-ink hover:text-foreground"
            >
              <RefreshCw className={cn("h-4 w-4", overview.isFetching && "animate-spin")} />
            </button>
          </div>
        </div>

        <B2BFlowStrip
          tab={tab}
          campaigns={campaigns}
          leads={activeLeads}
          gates={gates}
        />

        {pageError && (
          <div className="flex items-start gap-2 rounded-lg border-2 border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{String(pageError instanceof Error ? pageError.message : pageError)}</span>
          </div>
        )}

        {tab === "encuentra" && (
          <B2BEncuentraTab
            campaigns={campaigns}
            leads={allLeads}
            loading={campaignsQuery.isLoading}
            actionBusy={outboundAction.isPending}
            busyCampaignId={outboundAction.variables?.campaignId}
            onCreateSearch={() => openB2BSearch()}
            onContinueSearch={(campaign) => openB2BSearch(campaign)}
            onOpenSearch={(campaign) =>
              pushQuery({ tab: "contactos", vista: "lista", busqueda: campaign.id, stage: "" })
            }
            onRunAction={(campaignId, action) => outboundAction.mutate({ campaignId, action })}
          />
        )}

        {tab === "contactos" && (
          <div data-testid="outbound-contactos">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => pushQuery({ tab: "contactos", vista: "kanban" })}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors",
                  vista === "kanban" ? "border-rust bg-rust text-white" : "border-border bg-background hover:bg-muted",
                )}
              >
                Kanban
              </button>
              <button
                type="button"
                onClick={() => pushQuery({ tab: "contactos", vista: "lista" })}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors",
                  vista === "lista" ? "border-rust bg-rust text-white" : "border-border bg-background hover:bg-muted",
                )}
              >
                Lista
              </button>
              <label className="ml-2 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={roster}
                  onChange={(event) => setRoster(event.target.checked)}
                  className="h-4 w-4 accent-rust"
                />
                Solo ganados/activos
              </label>
              <span className="ml-auto text-xs text-muted-foreground">
                {activeLeadsQuery.isFetching || discardedLeadsQuery.isFetching ? "Actualizando..." : `${allLeads.length} contactos`}
              </span>
            </div>
            {vista === "kanban" ? (
              <B2BKanbanView
                leads={activeLeads}
                roster={roster}
                busyLeadId={stageMutation.variables?.lead.id}
                onMove={moveLead}
                onOpen={(lead) => setSelectedLeadId(lead.id)}
              />
            ) : (
              <B2BListaView
                leads={allLeads}
                busqueda={busqueda}
                busquedaLabel={busquedaCampaign?.title || null}
                initialStage={stageParam}
                busy={stageMutation.isPending}
                onClearBusqueda={() => pushQuery({ tab: "contactos", vista: "lista", busqueda: "", stage: "" })}
                onOpen={(lead) => setSelectedLeadId(lead.id)}
                onBulkMove={moveMany}
                onBulkDiscard={(leads) => void moveMany(leads, DISCARDED_STAGE)}
                onBulkContact={(leads) => void moveMany(leads, "Contacted")}
              />
            )}
          </div>
        )}

        {tab === "inbox" && (
          <B2BInboxTab
            slug={slug}
            leads={activeLeads}
            gates={gates}
            gatesLoading={gatesQuery.isLoading}
            busy={stageMutation.isPending}
            onMove={moveLead}
            onOpenLead={(lead) => setSelectedLeadId(lead.id)}
            onOpenSequence={() => pushQuery({ tab: "plantillas" })}
            onPrepareReply={openB2BReply}
          />
        )}

        {tab === "plantillas" && (
          <B2BPlantillasTab
            campaigns={campaigns}
            selectedCampaignId={templateCampaignId}
            onSelectCampaign={setSelectedTemplateCampaignId}
            campaignDetail={campaignDetailQuery.data || null}
            loading={campaignDetailQuery.isLoading}
            saving={sequenceUpdateAction.isPending}
            actionBusy={outboundAction.isPending}
            busyAction={outboundAction.variables?.action}
            onSave={(stepId, emails) =>
              sequenceUpdateAction.mutate({ campaignId: templateCampaignId, stepId, emails })
            }
            onEditContext={() => {
              const campaign = campaigns.find((item) => item.id === templateCampaignId) || campaignDetailQuery.data || undefined;
              openB2BSearch(campaign);
            }}
            onRunAction={(action) => outboundAction.mutate({ campaignId: templateCampaignId, action })}
          />
        )}

        {tab === "settings" && (
          <B2BSettingsTab providers={providers} loading={providersQuery.isLoading} onRefresh={refreshAll} refreshing={providersQuery.isFetching} />
        )}

        <B2BLeadDrawer
          slug={slug}
          lead={selectedLead}
          onClose={() => setSelectedLeadId(null)}
          onMove={moveLead}
          busy={stageMutation.isPending}
        />
        <ToastViewport toast={toast} />
        <B2BOutreachStyles />
      </div>
    </DashboardLayout>
  );
}

function B2BEncuentraTab({
  campaigns,
  leads,
  loading,
  actionBusy,
  busyCampaignId,
  onOpenSearch,
  onContinueSearch,
  onCreateSearch,
  onRunAction,
}: {
  campaigns: Campaign[];
  leads: Lead[];
  loading: boolean;
  actionBusy: boolean;
  busyCampaignId?: string;
  onOpenSearch: (campaign: Campaign) => void;
  onContinueSearch: (campaign: Campaign) => void;
  onCreateSearch: () => void;
  onRunAction: (campaignId: string, action: OutboundAction) => void;
}) {
  const [filter, setFilter] = useState<"todas" | "archivadas">("todas");
  const ordered = campaigns
    .slice()
    .sort((a, b) => {
      const order = { running: 0, done: 1, paused: 2, draft: 3 } as const;
      return order[campaignState(a)] - order[campaignState(b)];
    });

  if (filter === "archivadas") {
    return (
      <div data-testid="outbound-encuentra">
        <B2BFilterBar filter={filter} onFilter={setFilter} />
        <ZeroState
          title="Sin búsquedas archivadas"
          body="Cuando cierres una búsqueda, conservará sus contactos y la trazabilidad del score."
          action={{ label: "Volver a todas", onClick: () => setFilter("todas") }}
        />
      </div>
    );
  }

  return (
    <div data-testid="outbound-encuentra">
      <B2BFilterBar filter={filter} onFilter={setFilter} />
      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Cargando búsquedas...</p>
      ) : campaigns.length === 0 ? (
        <ZeroState
          title="Sin búsquedas todavía"
          body="Crea una búsqueda B2B para traer personas al pipeline con score, compañía y datos de contacto."
          action={{ label: "+ Nueva búsqueda", onClick: onCreateSearch }}
        />
      ) : (
        <div className="space-y-4">
          {ordered.map((campaign) => {
            const state = campaignState(campaign);
            const meta = campaignStateMeta(state);
            const campaignLeads = leads.filter((lead) => lead.campaignId === campaign.id);
            const candidateCount = campaignLeadCount(campaign, leads);
            const prioritized = campaignLeads.filter((lead) => {
              const stage = stageForStatus(lead.lifecycleStatus);
              return stage !== null && stage !== "Discovered" && stage !== DISCARDED_STAGE;
            }).length;
            const replied = campaignLeads.filter((lead) => stageForStatus(lead.lifecycleStatus) === "Replied").length;
            const isDraft = state === "draft";

            return (
              <section
                key={campaign.id}
                data-campaign-id={campaign.id}
                onClick={() => (isDraft ? onContinueSearch(campaign) : onOpenSearch(campaign))}
                className="cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-rust"
                title={isDraft ? "Completar búsqueda" : "Abrir Contactos filtrado por esta búsqueda"}
              >
                <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-muted/40 text-rust" aria-hidden>
                    {isDraft ? <Bot className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                  </div>
                  <div className="min-w-[240px] flex-1">
                    <h3 className="font-heading text-[15px] font-bold leading-tight text-foreground">
                      {campaign.title || campaign.id}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      B2B
                      {campaign.createdAt && ` · creada ${compactDate(campaign.createdAt)}`}
                      {campaign.targetSegment && ` · ${campaign.targetSegment}`}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <MiniMetric label="prospectos" value={candidateCount} muted={isDraft} />
                    <MiniMetric label="priorizados" value={prioritized} muted={isDraft} />
                    <MiniMetric label="replies" value={replied} muted={isDraft} />
                  </div>
                  <span className={cn("rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", meta.stampClass)}>
                    {meta.label}
                  </span>
                </div>

                <div className="px-5 pb-3">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", meta.barClass)}
                      style={{ width: isDraft ? "0%" : `${Math.max(12, Math.min(100, (prioritized / Math.max(candidateCount, 1)) * 100))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {isDraft
                      ? "Borrador pendiente de completar."
                      : `${candidateCount} prospectos en pipeline · ${prioritized} priorizados · canales ${channelText(campaign.channels)}`}
                  </p>
                </div>

                {!isDraft && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-2.5" onClick={(event) => event.stopPropagation()}>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Acciones</span>
                    {(["search", "enrich", "approve", "dry-run"] as const).map((action) => (
                      <button
                        key={action}
                        type="button"
                        disabled={actionBusy && busyCampaignId === campaign.id}
                        onClick={() => onRunAction(campaign.id, action)}
                        className="rounded-full border border-border bg-background px-3 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-rust hover:text-foreground disabled:opacity-50"
                      >
                        {actionBusy && busyCampaignId === campaign.id ? "..." : outboundActionLabel(action)}
                      </button>
                    ))}
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function B2BFilterBar({
  filter,
  onFilter,
}: {
  filter: "todas" | "archivadas";
  onFilter: (filter: "todas" | "archivadas") => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Filtrar</span>
      {(["todas", "archivadas"] as const).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onFilter(key)}
          className={cn(
            "rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-colors",
            filter === key ? "border-rust bg-rust text-white" : "border-border bg-background hover:bg-muted",
          )}
        >
          {key === "todas" ? "Todas" : "Archivadas"}
        </button>
      ))}
    </div>
  );
}

function MiniMetric({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div>
      <div className={cn("font-heading text-2xl leading-none", muted ? "text-muted-foreground/60" : "text-rust")}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function B2BFlowStrip({
  tab,
  campaigns,
  leads,
  gates,
}: {
  tab: B2BTab;
  campaigns: Campaign[];
  leads: Lead[];
  gates: GateItem[];
}) {
  const hasIcp = campaigns.some((campaign) => Boolean(campaign.targetSegment || campaign.hypothesis));
  const contacted = leads.filter((lead) => stageForStatus(lead.lifecycleStatus) === "Contacted").length;

  const steps: Array<{
    label: string;
    detail: string;
    target: B2BTab;
    icon: ReactNode;
  }> = [
    {
      label: "ICP",
      detail: hasIcp ? "Contexto definido" : "Falta contexto",
      target: "plantillas",
      icon: <Target className="h-4 w-4" />,
    },
    {
      label: "Encuentra",
      detail: "Búsquedas creadas",
      target: "encuentra",
      icon: <Search className="h-4 w-4" />,
    },
    {
      label: "Prioriza",
      detail: "Contactos trabajables",
      target: "contactos",
      icon: <Users className="h-4 w-4" />,
    },
    {
      label: "Personaliza",
      detail: "Secuencia y variables",
      target: "plantillas",
      icon: <Mail className="h-4 w-4" />,
    },
    {
      label: "Envía",
      detail: gates.length > 0 ? "Hay aprobaciones" : `${contacted} en seguimiento`,
      target: "plantillas",
      icon: <Send className="h-4 w-4" />,
    },
    {
      label: "Responde",
      detail: "Inbox y siguientes pasos",
      target: "inbox",
      icon: <Inbox className="h-4 w-4" />,
    },
  ];

  return (
    <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-6" data-testid="outbound-flow-strip" aria-label="Flujo Outbound B2B">
      {steps.map((step) => {
        const active = tab === step.target;
        return (
          <article
            key={step.label}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex min-h-[82px] items-start gap-3 rounded-lg border-2 bg-card p-3 text-left shadow-[var(--pop-xs)]",
              active ? "border-rust bg-rust/10" : "border-border",
            )}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-background text-rust">
              {step.icon}
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-sm font-bold text-foreground">{step.label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{step.detail}</span>
            </span>
          </article>
        );
      })}
    </section>
  );
}

function B2BKanbanView({
  leads,
  roster,
  busyLeadId,
  onMove,
  onOpen,
}: {
  leads: Lead[];
  roster: boolean;
  busyLeadId?: string;
  onMove: (lead: Lead, target: StageFilterKey, note?: string) => void;
  onOpen: (lead: Lead) => void;
}) {
  const groups = groupLeadsByStage(leads);
  const stages = roster ? PIPELINE_STAGES.filter((stage) => ROSTER_STAGES.includes(stage.key)) : PIPELINE_STAGES;
  const [dragOver, setDragOver] = useState<PipelineStageKey | null>(null);

  function handleDrop(event: DragEvent<HTMLDivElement>, target: PipelineStageKey) {
    event.preventDefault();
    setDragOver(null);
    const leadId = event.dataTransfer.getData("text/plain");
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return;
    if (stageForStatus(lead.lifecycleStatus) === target) return;
    onMove(lead, target);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" data-testid="outbound-kanban">
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
            <header className="flex items-start justify-between gap-2 border-b border-border px-3 py-2" title={stage.headTooltip || stage.label}>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-muted-foreground">{stage.label}</div>
              </div>
              <span className="rounded-full bg-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{items.length}</span>
            </header>
            <div
              className="flex-1 space-y-2 p-2"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dragOver !== stage.key) setDragOver(stage.key);
              }}
              onDragLeave={() => setDragOver((current) => (current === stage.key ? null : current))}
              onDrop={(event) => handleDrop(event, stage.key)}
            >
              {items.length === 0 && <p className="py-8 text-center text-[11px] text-muted-foreground">Vacío</p>}
              {items.map((lead) => (
                <B2BKanbanCard
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

function B2BKanbanCard({
  lead,
  stage,
  busy,
  onMove,
  onOpen,
}: {
  lead: Lead;
  stage: PipelineStageKey;
  busy: boolean;
  onMove: (lead: Lead, target: StageFilterKey, note?: string) => void;
  onOpen: (lead: Lead) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const score = leadScore(lead);

  function discard() {
    const note = window.prompt(`Descartar ${leadDisplayName(lead)} - nota opcional:`, "");
    if (note === null) return;
    onMove(lead, DISCARDED_STAGE, note.trim() || undefined);
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
          <div className="truncate text-sm font-semibold text-foreground">{leadDisplayName(lead)}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{lead.company || "Cuenta sin nombre"}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <SourceChip lead={lead} />
            {lead.email && <InfoChip icon={<Mail className="h-3 w-3" />} label="Email" />}
          </div>
        </div>
        <span className={scoreBandClass(score)}>{score == null ? "-" : Math.round(score)}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{leadRole(lead)}</p>
      {stage === "Discovered" && (
        <div className="mt-2 flex gap-1.5 border-t border-border pt-2">
          <button
            type="button"
            title="Mover a Shortlist"
            onClick={(event) => {
              event.stopPropagation();
              onMove(lead, "Shortlist");
            }}
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold transition-colors hover:border-rust hover:text-rust"
          >
            Shortlist
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
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </article>
  );
}

function B2BListaView({
  leads,
  busqueda,
  busquedaLabel,
  initialStage,
  onClearBusqueda,
  onOpen,
  onBulkMove,
  onBulkDiscard,
  onBulkContact,
  busy,
}: {
  leads: Lead[];
  busqueda: string;
  busquedaLabel?: string | null;
  initialStage?: StageFilterKey | "";
  onClearBusqueda: () => void;
  onOpen: (lead: Lead) => void;
  onBulkMove: (leads: Lead[], target: StageFilterKey) => void;
  onBulkDiscard: (leads: Lead[]) => void;
  onBulkContact: (leads: Lead[]) => void;
  busy?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<StageFilterKey | "">(initialStage ?? "");
  const [sortKey, setSortKey] = useState<"score" | "company" | null>("score");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const visible = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    const filtered = leads.filter((lead) => {
      if (busqueda && lead.campaignId !== busqueda) return false;
      const leadStage = stageForStatus(lead.lifecycleStatus);
      if (!stage && leadStage === DISCARDED_STAGE) return false;
      if (stage && leadStage !== stage) return false;
      if (searchValue) {
        const haystack = [leadDisplayName(lead), lead.company, lead.email, leadRole(lead), lead.source]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchValue)) return false;
      }
      return true;
    });
    if (!sortKey) return filtered;
    return filtered.slice().sort((a, b) => {
      if (sortKey === "score") return (((leadScore(a) ?? -1) - (leadScore(b) ?? -1)) * sortDir);
      return (a.company || "").localeCompare(b.company || "") * sortDir;
    });
  }, [leads, busqueda, search, sortKey, sortDir, stage]);

  const selectedLeads = useMemo(() => leads.filter((lead) => selected[lead.id]), [leads, selected]);
  const allVisibleChecked = visible.length > 0 && visible.every((lead) => selected[lead.id]);

  function toggleSort(key: "score" | "company") {
    if (sortKey === key) {
      setSortDir((dir) => (dir === -1 ? 1 : -1));
    } else {
      setSortKey(key);
      setSortDir(key === "score" ? -1 : 1);
    }
  }

  function toggleSelected(leadId: string) {
    setSelected((current) => {
      const next = { ...current };
      if (next[leadId]) delete next[leadId];
      else next[leadId] = true;
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelected((current) => {
      const next = { ...current };
      for (const lead of visible) {
        if (checked) next[lead.id] = true;
        else delete next[lead.id];
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected({});
  }

  return (
    <div>
      {busqueda && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border border-l-4 border-l-rust bg-card px-4 py-2 text-sm" data-testid="b2b-busqueda-banner">
          <Search className="h-4 w-4 text-rust" />
          Prospectos de la búsqueda: <b>{busquedaLabel || busqueda}</b>
          <button
            type="button"
            onClick={onClearBusqueda}
            className="ml-auto rounded-md border border-border bg-background px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-muted"
          >
            quitar filtro
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar contacto o cuenta..."
            className="w-64 rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm focus:border-rust focus:outline-none"
          />
        </label>
        <select
          value={stage}
          onChange={(event) => setStage(event.target.value as StageFilterKey | "")}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-rust focus:outline-none"
        >
          <option value="">Estado: todos</option>
          {PIPELINE_STAGES.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
          <option value={DISCARDED_STAGE}>Descartados</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[960px] text-left text-sm" data-testid="outbound-lista">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allVisibleChecked}
                  onChange={(event) => toggleAllVisible(event.target.checked)}
                  className="h-4 w-4 accent-rust"
                />
              </th>
              <th className="px-3 py-2.5">Contacto</th>
              <SortableTh label="Score" active={sortKey === "score"} dir={sortDir} onClick={() => toggleSort("score")} />
              <SortableTh label="Cuenta" active={sortKey === "company"} dir={sortDir} onClick={() => toggleSort("company")} />
              <th className="px-3 py-2.5">Rol</th>
              <th className="px-3 py-2.5">Fuente</th>
              <th className="px-3 py-2.5">Contacto</th>
              <th className="px-3 py-2.5">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm italic text-muted-foreground">
                  Ningún prospecto coincide con esos filtros.
                </td>
              </tr>
            )}
            {visible.map((lead) => {
              const discarded = stageForStatus(lead.lifecycleStatus) === DISCARDED_STAGE;
              return (
                <tr
                  key={lead.id}
                  data-lead-id={lead.id}
                  onClick={() => onOpen(lead)}
                  className={cn(
                    "cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/40",
                    selected[lead.id] && "bg-rust/5",
                    discarded && "opacity-60",
                  )}
                >
                  <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!selected[lead.id]}
                      onChange={() => toggleSelected(lead.id)}
                      className="h-4 w-4 accent-rust"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-full border border-border bg-muted/40 text-xs font-semibold text-rust">
                        {leadDisplayName(lead).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-foreground">{leadDisplayName(lead)}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{lead.email || lead.linkedinUrl || "sin contacto visible"}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={scoreBandClass(leadScore(lead))}>{leadScore(lead) == null ? "-" : Math.round(leadScore(lead)!)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-foreground">{lead.company || "-"}</div>
                    <div className="text-[11px] text-muted-foreground">{lead.companySize || lead.location || lead.companyDomain || ""}</div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{leadRole(lead)}</td>
                  <td className="px-3 py-2.5">
                    <SourceChip lead={lead} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {lead.email && <InfoChip icon={<Mail className="h-3 w-3" />} label="Email" />}
            {lead.linkedinUrl && <InfoChip icon={<ExternalLink className="h-3 w-3" />} label="LinkedIn" />}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", stageClasses(lead))}>
                      {stageLabel(lead)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Mostrando {visible.length} de {leads.length} prospectos{stage !== DISCARDED_STAGE && " · descartados excluidos por defecto"}
      </p>

      {selectedLeads.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-[550] flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-lg" data-testid="b2b-bulk-bar">
          <span className="text-sm font-semibold text-foreground">
            {selectedLeads.length} seleccionado{selectedLeads.length === 1 ? "" : "s"}
          </span>
          <select
            defaultValue=""
            disabled={busy}
            onChange={(event) => {
              const value = event.target.value as StageFilterKey | "";
              if (!value) return;
              onBulkMove(selectedLeads, value);
              event.target.value = "";
              clearSelection();
            }}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-rust focus:outline-none"
          >
            <option value="">Mover a estado...</option>
            {PIPELINE_STAGES.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onBulkContact(selectedLeads);
              clearSelection();
            }}
            className="rounded-lg border-2 border-rust bg-rust px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
          >
            Contactar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onBulkDiscard(selectedLeads);
              clearSelection();
            }}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            Descartar
          </button>
          <button type="button" onClick={clearSelection} className="text-lg text-muted-foreground transition-colors hover:text-foreground">
            x
          </button>
        </div>
      )}
    </div>
  );
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 1 | -1;
  onClick: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className={cn("cursor-pointer select-none px-3 py-2.5 transition-colors hover:text-foreground", active && "text-rust")}
      title={`Ordenar por ${label.toLowerCase()}`}
    >
      {label} <span className="text-[9px]">{active ? (dir === -1 ? "▼" : "▲") : "▲▼"}</span>
    </th>
  );
}

function B2BLeadDrawer({
  slug,
  lead,
  onClose,
  onMove,
  busy,
}: {
  slug: string;
  lead: Lead | null;
  onClose: () => void;
  onMove: (lead: Lead, target: StageFilterKey, note?: string) => void;
  busy?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const thread = useQuery({
    queryKey: ["yalc", slug, "b2b", "lead-messages", lead?.id],
    queryFn: () =>
      fetchJson<{ messages?: LeadMessage[] }>(
        `/api/yalc/leads/${encodeURIComponent(lead!.id)}/messages?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug && !!lead,
  });

  if (!lead) return null;

  const score = leadScore(lead);
  const components = lead.fitBreakdown || {};
  const messages = thread.data?.messages || [];
  const stage = stageForStatus(lead.lifecycleStatus);

  return (
    <SlideOver
      open={!!lead}
      onClose={() => {
        setExpanded(false);
        onClose();
      }}
      title={leadDisplayName(lead)}
      width={expanded ? "w-screen" : "w-[600px] max-w-[94vw]"}
      actions={
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="rounded-md border border-border px-2.5 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {expanded ? "Contraer" : "Expandir"}
        </button>
      }
    >
      <div className={cn("space-y-6", expanded && "mx-auto max-w-5xl")} data-testid="b2b-lead-drawer">
        <div className="flex flex-wrap items-center gap-2">
          <SourceChip lead={lead} />
          {lead.company && <InfoChip icon={<Building2 className="h-3 w-3" />} label={lead.company} />}
          {lead.email && <InfoChip icon={<Mail className="h-3 w-3" />} label="Email" />}
                      {lead.linkedinUrl && <InfoChip icon={<ExternalLink className="h-3 w-3" />} label="LinkedIn" />}
          <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", stageClasses(lead))}>
            {stageLabel(lead)}
          </span>
        </div>

        {(stage === "Discovered" || stage === DISCARDED_STAGE) && (
          <div className="flex flex-wrap gap-2">
            {stage === "Discovered" && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMove(lead, "Shortlist")}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold transition-colors hover:border-rust hover:text-rust disabled:opacity-50"
                >
                  Mover a Shortlist
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const note = window.prompt("Nota del descarte (opcional):", "");
                    if (note === null) return;
                    onMove(lead, DISCARDED_STAGE, note.trim() || undefined);
                  }}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  Descartar
                </button>
              </>
            )}
            {stage === DISCARDED_STAGE && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onMove(lead, "Discovered")}
                className="rounded-md border border-sage/50 bg-sage/10 px-3 py-1.5 text-sm font-semibold text-sage transition-colors hover:bg-sage/15 disabled:opacity-50"
              >
                Restaurar a Discovered
              </button>
            )}
          </div>
        )}

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Score B2B</h3>
          <div className="mt-3 flex items-start gap-4">
            <div className={scoreBandClass(score, "lg")} data-testid="b2b-score-total">
              {score == null ? "-" : Math.round(score)}
            </div>
            <div className="min-w-0 flex-1 space-y-2.5">
              {SCORE_ROWS.map((row) => {
                const value = typeof components[row.key] === "number" ? components[row.key] : null;
                return (
                  <div key={row.key} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-xs text-muted-foreground">{row.label}</span>
                    {value !== null ? (
                      <>
                        <ScoreBar value={value} className="flex-1" />
                        <span className="w-8 shrink-0 text-right font-heading text-sm font-semibold text-navy">{Math.round(value)}</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">sin señal</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Datos del contacto</h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <DataItem label="Nombre" value={leadDisplayName(lead)} />
            <DataItem label="Rol" value={leadRole(lead)} />
            <DataItem label="Cuenta" value={lead.company || "-"} />
            <DataItem label="Email" value={lead.email || "-"} />
            <DataItem label="LinkedIn" value={lead.linkedinUrl || "-"} />
            <DataItem label="Búsqueda" value={lead.campaignTitle || lead.campaignId || "-"} />
            <DataItem label="Fuente" value={sourceLabel(lead)} />
            <DataItem label="Ubicación" value={lead.location || "-"} />
            <DataItem label="Creado" value={compactDate(lead.createdAt)} />
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Historial</h3>
          <div className="mt-3 space-y-2">
            <LogRow icon={<Search className="h-4 w-4" />} title={`Descubierto vía ${lead.campaignTitle || lead.campaignId || "búsqueda B2B"}`} date={lead.createdAt} />
            {stage !== "Discovered" && (
              <LogRow icon={<CheckCircle2 className="h-4 w-4" />} title={`Último estado: ${stageLabel(lead)}`} date={lead.updatedAt} />
            )}
            {messages.map((message) => (
              <LogRow
                key={message.id}
                icon={message.direction === "out" ? <Send className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                title={`${message.direction === "out" ? "Mensaje enviado" : "Respuesta recibida"}${message.subject ? ` - ${message.subject}` : ""}`}
                date={message.createdAt}
              />
            ))}
            {messages.length === 0 && <p className="text-sm text-muted-foreground">Sin mensajes todavía.</p>}
          </div>
        </section>
      </div>
    </SlideOver>
  );
}

function B2BInboxTab({
  slug,
  leads,
  gates,
  gatesLoading,
  busy,
  onMove,
  onOpenLead,
  onOpenSequence,
  onPrepareReply,
}: {
  slug: string;
  leads: Lead[];
  gates: GateItem[];
  gatesLoading: boolean;
  busy: boolean;
  onMove: (lead: Lead, target: StageFilterKey, note?: string) => void;
  onOpenLead: (lead: Lead) => void;
  onOpenSequence: () => void;
  onPrepareReply: (lead: Lead, draft?: string) => void;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<B2BInboxFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const conversations = useMemo(() => {
    const rows = leads.filter((lead) => {
      const stage = stageForStatus(lead.lifecycleStatus);
      return (
        stage === "Contacted" ||
        stage === "Replied" ||
        stage === "Negotiating" ||
        stage === "Signed" ||
        stage === "Active" ||
        Boolean(lead.lastMessage)
      );
    });
    return rows.length > 0 ? rows : leads.slice(0, 5);
  }, [leads]);

  const visible = useMemo(
    () =>
      conversations.filter((lead) => {
        if (filter === "all") return true;
        const stage = stageForStatus(lead.lifecycleStatus);
        if (filter === "followup") return stage === "Contacted";
        if (filter === "replied") return stage === "Replied";
        if (filter === "meeting") return lead.lifecycleStatus === "Demo_Booked" || stage === "Negotiating";
        return lead.lifecycleStatus === "Deal_Created" || stage === "Signed" || stage === "Active";
      }),
    [conversations, filter],
  );
  const selected = useMemo(() => conversations.find((lead) => lead.id === selectedId) || visible[0] || null, [conversations, selectedId, visible]);

  const threadQuery = useQuery({
    queryKey: ["yalc", slug, "b2b", "lead-messages", selected?.id],
    queryFn: () =>
      fetchJson<{ messages?: LeadMessage[] }>(
        `/api/yalc/leads/${encodeURIComponent(selected!.id)}/messages?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug && !!selected,
  });
  const rawMessages = threadQuery.data?.messages || [];
  const messages = rawMessages.filter((message) => message.status !== "draft");
  const draftMessage = rawMessages.find((message) => message.status === "draft") || null;

  useEffect(() => {
    setDraft(draftMessage?.body || "");
  }, [draftMessage?.body, selected?.id]);

  const threadKey = ["yalc", slug, "b2b", "lead-messages", selected?.id] as const;
  const saveDraft = useMutation({
    mutationFn: () =>
      fetchJson(`/api/yalc/leads/${encodeURIComponent(selected!.id)}/messages?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: "out",
          body: draft,
          status: "draft",
          channel: "email",
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: threadKey });
    },
  });

  const counts = {
    all: conversations.length,
    followup: conversations.filter((lead) => stageForStatus(lead.lifecycleStatus) === "Contacted").length,
    replied: conversations.filter((lead) => stageForStatus(lead.lifecycleStatus) === "Replied").length,
    meeting: conversations.filter((lead) => lead.lifecycleStatus === "Demo_Booked" || stageForStatus(lead.lifecycleStatus) === "Negotiating").length,
    deal: conversations.filter((lead) => {
      const stage = stageForStatus(lead.lifecycleStatus);
      return lead.lifecycleStatus === "Deal_Created" || stage === "Signed" || stage === "Active";
    }).length,
  };
  const selectedStage = selected ? stageForStatus(selected.lifecycleStatus) : null;
  const lastMessage = messages[messages.length - 1] || selected?.lastMessage || null;

  const filters: Array<{ key: B2BInboxFilter; label: string }> = [
    { key: "all", label: "Todo" },
    { key: "followup", label: "Seguimiento" },
    { key: "replied", label: "Respondieron" },
    { key: "meeting", label: "Reuniones" },
    { key: "deal", label: "Deals" },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]" data-testid="outbound-inbox">
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-3">
          <div className="mb-3">
            <h3 className="font-heading text-lg text-navy">Seguimiento</h3>
            <p className="text-xs text-muted-foreground">Respuestas, follow-ups y oportunidades creadas desde la campaña.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filters.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                  filter === key ? "border-rust bg-rust text-white" : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {label} {counts[key]}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[620px] overflow-y-auto p-2">
          {visible.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">Sin conversaciones en este filtro.</p>}
          {visible.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => setSelectedId(lead.id)}
              className={cn(
                "mb-2 flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                selected?.id === lead.id ? "border-rust bg-rust/5" : "border-border bg-background hover:bg-muted/40",
              )}
            >
              <span className="grid h-9 w-9 place-items-center rounded-full border border-border bg-muted/40 text-xs font-semibold text-rust">
                {leadDisplayName(lead).slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-foreground">{leadDisplayName(lead)}</span>
                <span className="block truncate text-xs text-muted-foreground">{lead.company || leadRole(lead)}</span>
                <span className={cn("mt-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", stageClasses(lead))}>
                  {stageLabel(lead)}
                </span>
                {(lead.lastMessage || lead.emailStatus) && (
                  <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                    {lead.lastMessage?.body || lead.emailStatus}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="min-h-[520px] rounded-xl border border-border bg-card">
        <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-heading text-lg text-navy">{selected ? leadDisplayName(selected) : "Inbox B2B"}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {selected ? `${selected.company || "Cuenta"} · ${selected.email || selected.linkedinUrl || "sin contacto"}` : "Selecciona una conversación"}
            </p>
          </div>
          {selected && (
            <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", stageClasses(selected))}>
              {stageLabel(selected)}
            </span>
          )}
        </header>
        <div className="space-y-3 p-4">
          {gatesLoading && gates.length === 0 && (
            <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
              Cargando aprobaciones de envío...
            </div>
          )}
          {gates.length > 0 && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-yellow-900">Aprobaciones de envío</div>
              <div className="space-y-2">
                {gates.slice(0, 3).map((gate) => (
                  <div key={gateRunId(gate)} className="flex items-start gap-2 rounded-md border border-yellow-200 bg-white/60 p-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-yellow-700" />
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">{gateTitle(gate)}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(gate.created_at || gate.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {selected ? (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4 text-rust" />
                    <h4 className="font-semibold text-foreground">Siguiente paso</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selectedStage === "Contacted" && "La secuencia ya está en seguimiento. Revisa la cadencia o prepara un follow-up si corresponde."}
                    {selectedStage === "Replied" && "Hay respuesta. Prepara contestación, confirma fit y mueve a reunión si aplica."}
                    {selectedStage === "Negotiating" && "La conversación ya está en oportunidad. Registra reunión o crea deal cuando esté listo."}
                    {(selectedStage === "Signed" || selectedStage === "Active") && "La oportunidad ya está creada. Mantén el seguimiento comercial y actualiza cierre."}
                    {!selectedStage && "Este contacto todavía no tiene un estado claro de inbox. Abre la ficha para revisar datos y moverlo al pipeline."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onPrepareReply(selected, draft)}
                      className="inline-flex items-center gap-2 rounded-md border-2 border-rust bg-rust px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rust/90"
                    >
                      <Send className="h-4 w-4" />
                      Preparar respuesta
                    </button>
                    {selectedStage === "Contacted" && (
                      <button
                        type="button"
                        onClick={onOpenSequence}
                        className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:border-rust hover:text-rust"
                      >
                        Ver secuencia
                      </button>
                    )}
                    {selectedStage === "Replied" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onMove(selected, "Negotiating", "Marcado como reunión desde Inbox B2B")}
                        className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:border-rust hover:text-rust disabled:opacity-50"
                      >
                        Marcar reunión
                      </button>
                    )}
                    {selectedStage === "Negotiating" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onMove(selected, "Signed", "Deal creado desde Inbox B2B")}
                        className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:border-rust hover:text-rust disabled:opacity-50"
                      >
                        Crear deal
                      </button>
                    )}
                    {selectedStage === "Signed" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onMove(selected, "Active", "Marcado como ganado desde Inbox B2B")}
                        className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:border-rust hover:text-rust disabled:opacity-50"
                      >
                        Marcar ganado
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenLead(selected)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:border-rust hover:text-rust"
                    >
                      Ficha
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Estado de envío</div>
                  <dl className="mt-2 space-y-2 text-sm">
                    <DataItem label="Campaña" value={selected.campaignTitle || selected.campaignId || "-"} />
                    <DataItem label="Instantly" value={selected.instantlyCampaignId || "Sin campaña creada"} />
                    <DataItem label="Último evento" value={lastMessage ? formatDateTime(lastMessage.createdAt) : selected.emailStatus || "-"} />
                  </dl>
                </div>
              </div>
              <div className="min-h-[260px] space-y-3 rounded-lg border border-border bg-background p-3">
                {threadQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando hilo...</p>}
                {messages.length === 0 && !threadQuery.isLoading && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Sin mensajes todavía. Cuando se envíe la secuencia o llegue una respuesta, aparecerá aquí.
                  </p>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "max-w-[78%] rounded-lg border px-3 py-2 text-sm",
                      message.direction === "out"
                        ? "ml-auto border-rust/30 bg-rust/5"
                        : "border-border bg-card",
                    )}
                  >
                    {message.subject && <div className="mb-1 text-xs font-semibold text-foreground">{message.subject}</div>}
                    <p className="whitespace-pre-wrap text-muted-foreground">{message.body}</p>
                    <div className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(message.createdAt)}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={4}
                  placeholder="Escribe una respuesta o nota de seguimiento..."
                  className="w-full resize-none rounded-md border border-border bg-card p-3 text-sm focus:border-rust focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={!draft.trim() || saveDraft.isPending}
                    onClick={() => saveDraft.mutate()}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:border-rust hover:text-rust disabled:opacity-50"
                  >
                    {saveDraft.isPending ? "Guardando..." : "Guardar borrador"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onPrepareReply(selected, draft)}
                    className="rounded-lg border-2 border-rust bg-rust px-3 py-1.5 text-sm font-semibold text-white"
                  >
                    Preparar en chat
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="py-20 text-center text-sm text-muted-foreground">No hay conversación seleccionada.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function B2BPlantillasTab({
  campaigns,
  selectedCampaignId,
  onSelectCampaign,
  campaignDetail,
  loading,
  saving,
  actionBusy,
  busyAction,
  onSave,
  onEditContext,
  onRunAction,
}: {
  campaigns: Campaign[];
  selectedCampaignId: string;
  onSelectCampaign: (campaignId: string) => void;
  campaignDetail: CampaignDetail | null;
  loading: boolean;
  saving: boolean;
  actionBusy: boolean;
  busyAction?: OutboundAction;
  onSave: (stepId: string | undefined, emails: EmailSequenceEmail[]) => void;
  onEditContext: () => void;
  onRunAction: (action: OutboundAction) => void;
}) {
  const sequences = extractEmailSequences(campaignDetail);
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) || campaignDetail;
  const placeholders = extractSequencePlaceholders(sequences);

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]" data-testid="outbound-plantillas">
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-heading text-lg text-navy">Búsqueda</h3>
        <select
          value={selectedCampaignId}
          onChange={(event) => onSelectCampaign(event.target.value)}
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-rust focus:outline-none"
        >
          {campaigns.length === 0 && <option value="">Sin campañas</option>}
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.title || campaign.id}
            </option>
          ))}
        </select>
        {selectedCampaign && (
          <CampaignContextPanel
            campaign={selectedCampaign}
            placeholders={placeholders}
            onEditContext={onEditContext}
          />
        )}
        <div className="mt-5 grid gap-2">
          {(["approve", "dry-run", "publish", "live"] as const).map((action) => (
            <button
              key={action}
              type="button"
              disabled={!selectedCampaignId || actionBusy}
              onClick={() => onRunAction(action)}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:border-rust hover:text-rust disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-semibold">{outboundActionLabel(action)}</span>
                <span className="mt-0.5 block text-xs font-normal leading-snug text-muted-foreground">
                  {outboundActionDescription(action)}
                </span>
              </span>
              {actionBusy && busyAction === action ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg text-navy">Secuencia outbound</h3>
            <p className="text-sm text-muted-foreground">Edita 1 a 3 emails por campaña antes de aprobarla.</p>
          </div>
          {loading && <span className="text-xs text-muted-foreground">Cargando...</span>}
        </div>
        <div className="mt-4 space-y-4">
          {selectedCampaign && (
            <PersonalizationPanel
              campaign={selectedCampaign}
              placeholders={placeholders}
              onEditContext={onEditContext}
            />
          )}
          {sequences.length === 0 && !loading && (
            <ZeroState
              title="Sin secuencia todavía"
              body="Cuando la búsqueda tenga mensajes generados, aparecerán aquí para editar y aprobar."
            />
          )}
          {sequences.map((block, index) => (
            <SequenceBlockEditor
              key={block.stepId || `${block.source}-${index}`}
              block={block}
              saving={saving}
              onSave={(emails) => onSave(block.stepId, emails)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function CampaignContextPanel({
  campaign,
  placeholders,
  onEditContext,
}: {
  campaign: Campaign | CampaignDetail;
  placeholders: string[];
  onEditContext: () => void;
}) {
  return (
    <div className="mt-4 space-y-3" data-testid="b2b-context-panel">
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">1. ICP</span>
          <Target className="h-4 w-4 text-rust" />
        </div>
        <p className="text-sm font-semibold text-foreground">{campaign.targetSegment || "Sin segmento definido"}</p>
        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
          {campaign.hypothesis || "Sin hipótesis de dolor/propuesta todavía."}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">2. Target y canales</div>
        <DataItem label="Canales" value={channelText(campaign.channels)} />
        <DataItem label="Estado" value={campaign.status || "-"} />
      </div>
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">3. Variables</div>
        <div className="flex flex-wrap gap-1.5">
          {(placeholders.length ? placeholders : ["first_name", "company_name"]).map((placeholder) => (
            <span key={placeholder} className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
              {`{{${placeholder}}}`}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onEditContext}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold transition-colors hover:border-rust hover:text-rust"
      >
        Ajustar ICP y personalización
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function PersonalizationPanel({
  campaign,
  placeholders,
  onEditContext,
}: {
  campaign: Campaign | CampaignDetail;
  placeholders: string[];
  onEditContext: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4" data-testid="b2b-personalization-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-heading text-base text-navy">Contexto y personalización</h4>
          <p className="text-sm text-muted-foreground">Lo que alimenta la copia antes de enviar.</p>
        </div>
        <button
          type="button"
          onClick={onEditContext}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:border-rust hover:text-rust"
        >
          Ajustar
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <ContextSummary label="ICP" value={campaign.targetSegment || "Sin ICP definido"} />
        <ContextSummary label="Propuesta" value={campaign.hypothesis || "Sin hipótesis definida"} />
        <div className="rounded-md border border-border bg-card p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Variables</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(placeholders.length ? placeholders : ["first_name", "company_name"]).map((placeholder) => (
              <span key={placeholder} className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                {`{{${placeholder}}}`}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContextSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="mt-1 line-clamp-3 text-sm font-medium text-foreground" title={value}>{value}</p>
    </div>
  );
}

function SequenceBlockEditor({
  block,
  saving,
  onSave,
}: {
  block: EmailSequenceBlock;
  saving: boolean;
  onSave: (emails: EmailSequenceEmail[]) => void;
}) {
  const [emails, setEmails] = useState(block.emails);

  useEffect(() => {
    setEmails(block.emails);
  }, [block.emails]);

  function updateEmail(index: number, next: Partial<EmailSequenceEmail>) {
    setEmails((current) => current.map((email, i) => (i === index ? { ...email, ...next } : email)));
  }

  function addEmail() {
    setEmails((current) => {
      if (current.length >= 3) return current;
      return [
        ...current,
        {
          subject: current.length === 0 ? "" : `Follow-up ${current.length}`,
          body: "",
          delayDays: current.length === 0 ? 0 : 3,
        },
      ];
    });
  }

  function removeEmail(index: number) {
    setEmails((current) => {
      if (current.length <= 1) return current;
      return current.filter((_email, i) => i !== index);
    });
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {block.source}
        </span>
        <span className="text-xs text-muted-foreground">{emails.length} de 3 emails</span>
        <button
          type="button"
          onClick={addEmail}
          disabled={emails.length >= 3 || saving}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold transition-colors hover:border-rust hover:text-rust disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Añadir email
        </button>
      </div>
      <div className="space-y-3">
        {emails.map((email, index) => (
          <div key={`${block.stepId || block.source}-${index}`} className="rounded-md border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full border border-border bg-muted/40 text-xs font-semibold text-rust">
                {index + 1}
              </span>
              <span className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">
                {index === 0 ? "Email inicial" : `Follow-up ${index}`}
              </span>
              <input
                value={email.subject || ""}
                onChange={(event) => updateEmail(index, { subject: event.target.value })}
                placeholder="Asunto"
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-rust focus:outline-none"
              />
              <input
                type="number"
                value={email.delayDays ?? ""}
                onChange={(event) => updateEmail(index, { delayDays: event.target.value ? Number(event.target.value) : null })}
                placeholder="Días"
                className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-rust focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeEmail(index)}
                disabled={emails.length <= 1 || saving}
                title="Eliminar email"
                className="grid h-9 w-9 place-items-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={email.body}
              onChange={(event) => updateEmail(index, { body: event.target.value })}
              rows={5}
              className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm focus:border-rust focus:outline-none"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(emails)}
          className="rounded-lg border-2 border-rust bg-rust px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar secuencia"}
        </button>
      </div>
    </div>
  );
}

function B2BSettingsTab({
  providers,
  loading,
  onRefresh,
  refreshing,
}: {
  providers: Provider[];
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]" data-testid="outbound-settings-tab">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg text-navy">Conexiones</h3>
            <p className="text-sm text-muted-foreground">Estado operativo de fuentes usadas por Outbound B2B.</p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold transition-colors hover:border-rust hover:text-rust"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refrescar
          </button>
        </div>
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando conexiones...</p>
        ) : providers.length === 0 ? (
          <ZeroState title="Sin conexiones visibles" body="El runtime no devolvió proveedores para este cliente." />
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {providers.map((provider) => (
              <article key={provider.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-start gap-3">
                  <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", providerDot(provider.status))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-foreground">{provider.name || provider.id}</h4>
                      <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", providerClasses(provider.status))}>
                        {provider.status || "unknown"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{provider.description || provider.type || "Proveedor Outreach"}</p>
                    {provider.capabilities && provider.capabilities.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {provider.capabilities.map((capability) => (
                          <span key={capability} className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                            {capability}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <aside className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-heading text-lg text-navy">Flujo B2B</h3>
        <div className="mt-4 space-y-3 text-sm">
          <FlowRow icon={<Search className="h-4 w-4" />} title="Buscar" body="Apollo/LinkedIn alimentan prospectos." />
          <FlowRow icon={<Target className="h-4 w-4" />} title="Priorizar" body="Score ICP y señales de contacto." />
          <FlowRow icon={<Mail className="h-4 w-4" />} title="Contactar" body="Secuencia editable y aprobación humana." />
          <FlowRow icon={<Briefcase className="h-4 w-4" />} title="Cerrar" body="Reunión, deal y resultado final." />
        </div>
      </aside>
    </div>
  );
}

function SourceChip({ lead }: { lead: Lead }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Briefcase className="h-3 w-3" />
      {sourceLabel(lead)}
    </span>
  );
}

function InfoChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

function FlowRow({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-background p-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-muted/40 text-rust">{icon}</span>
      <div>
        <div className="font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{body}</div>
      </div>
    </div>
  );
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground" title={value}>
        {value}
      </dd>
    </div>
  );
}

function LogRow({
  icon,
  title,
  date,
}: {
  icon: ReactNode;
  title: string;
  date?: string | null;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2">
      <span className="mt-0.5 text-rust">{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {date && <div className="text-[11px] text-muted-foreground">{formatDateTime(date)}</div>}
      </div>
    </div>
  );
}

function ZeroState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <h3 className="font-heading text-lg text-navy">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-lg border-2 border-rust bg-rust px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust/90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function B2BOutreachStyles() {
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

      .op-shell [data-testid="outbound-settings"] {
        right: clamp(16px, 2vw, 28px);
        top: clamp(16px, 2vw, 28px);
        border: 2px solid var(--op-ink);
        background: var(--op-paper-3);
        color: var(--op-ink);
        box-shadow: var(--pop-xs);
      }

      .op-shell [data-testid="outbound-b2b-tabs"] button,
      .op-shell [data-testid="crear-busqueda-b2b"],
      .op-shell [data-testid="b2b-bulk-bar"] button,
      .op-shell [data-testid="outbound-plantillas"] button {
        border: 2px solid var(--op-ink);
        border-radius: var(--sc-r-md);
        font-family: var(--font-heading);
        font-weight: 800;
        box-shadow: var(--pop-xs);
      }

      .op-shell [data-testid="outbound-b2b-tabs"] button:hover,
      .op-shell [data-testid="crear-busqueda-b2b"]:hover,
      .op-shell [data-testid="b2b-bulk-bar"] button:hover,
      .op-shell [data-testid="outbound-plantillas"] button:hover {
        transform: translate(-1px, -1px);
        box-shadow: var(--pop-sm);
      }

      .op-shell [data-testid="outbound-b2b-tabs"] button:active,
      .op-shell [data-testid="crear-busqueda-b2b"]:active,
      .op-shell [data-testid="b2b-bulk-bar"] button:active,
      .op-shell [data-testid="outbound-plantillas"] button:active {
        transform: translate(2px, 2px);
        box-shadow: none;
      }

      .op-shell [data-testid="outbound-kanban"] section,
      .op-shell [data-testid="outbound-encuentra"] section,
      .op-shell [data-testid="outbound-inbox"] > section,
      .op-shell [data-testid="outbound-plantillas"] > section,
      .op-shell [data-testid="outbound-settings-tab"] > section,
      .op-shell [data-testid="outbound-settings-tab"] > aside,
      .op-shell [data-testid="b2b-busqueda-banner"],
      .op-shell [data-testid="b2b-bulk-bar"] {
        border: 2px solid var(--op-ink);
        border-radius: var(--sc-r-md);
        background: var(--op-paper-3);
        box-shadow: var(--pop-xs);
      }

      .op-shell [data-testid="outbound-kanban"] article {
        border: 2px solid var(--op-ink);
        border-radius: var(--sc-r-md);
        background: white;
        box-shadow: 2px 2px 0 0 rgba(31, 20, 16, 0.45);
      }

      .op-shell [data-testid="outbound-kanban"] header,
      .op-shell table thead tr {
        border-color: var(--op-ink);
        background: var(--op-paper-2);
      }

      .op-shell [data-testid="outbound-lista"] {
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
