import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import Head from "next/head";
import {
  Activity,
  Bot,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileText,
  Inbox,
  ListChecks,
  Search,
  Pause,
  Play,
  RefreshCw,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Target,
  Users,
  X,
  Plug,
  Loader2,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useOpenChat } from "@/hooks/useChat";
import { buildYalcThread } from "@/lib/chat-openers";
import { PartnershipsView } from "@/components/partnerships/partnerships-view";
import { OutboundB2BView } from "@/components/outbound-b2b/outbound-b2b-view";
import { TipoSelector, tipoFromQuery } from "@/components/partnerships/tipo-selector";
import { cn } from "@/lib/utils";
import { isCampaignKind, type YalcCampaignKind } from "@/lib/yalc/campaign-kind";

type TabKey = "overview" | "campaigns" | "leads" | "gates" | "templates" | "providers";

interface RuntimeInfo {
  baseUrl?: string;
  auth?: "bearer" | "none" | string;
}

interface OverviewCheck {
  ok: boolean;
  count: number | null;
  data?: unknown;
  error?: string;
}

interface OverviewPayload {
  ok: boolean;
  // Whether Outreach (YALC) is wired up at all. false → show the setup
  // placeholder rather than a wall of "unreachable" errors.
  configured?: boolean;
  runtime?: RuntimeInfo;
  checks?: Record<string, OverviewCheck>;
}

interface Campaign {
  id: string;
  type?: string | null;
  campaignKind?: YalcCampaignKind;
  campaignKindLabel?: string;
  title?: string;
  status?: string;
  hypothesis?: string | null;
  targetSegment?: string | null;
  channels?: string[] | string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  leadCount?: number;
  variantCount?: number;
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
  dependsOn?: string[];
  approvalRequired?: boolean;
  resultSetId?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
}

interface SuccessMetric {
  metric?: string;
  target?: number;
  baseline?: number | null;
  actual?: number | null;
}

interface CampaignDetail extends Campaign {
  successMetrics?: SuccessMetric[];
  steps?: CampaignStep[];
}

interface CampaignReadiness {
  campaignId: string;
  state: string;
  readyForReview: boolean;
  readyForDryRun: boolean;
  readyForPublish: boolean;
  readyForLive: boolean;
  blockers: Array<{ code: string; message: string; nextAction: string }>;
  checklist: Array<{ id: string; label: string; passed: boolean; blocking: boolean }>;
}

interface CampaignEvent {
  id: string;
  campaignId: string;
  type: string;
  message: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

interface CampaignEventsPayload {
  events?: CampaignEvent[];
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

interface CampaignPayload {
  campaigns?: Campaign[];
}

interface Lead {
  id: string;
  email?: string | null;
  emailStatus?: string | null;
  instantlyCampaignId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  headline?: string | null;
  company?: string | null;
  linkedinUrl?: string | null;
  lifecycleStatus?: string | null;
  variantId?: string | null;
  variantName?: string | null;
  qualificationScore?: number | null;
  source?: string | null;
  connectSentAt?: string | null;
  connectedAt?: string | null;
  dm1SentAt?: string | null;
  dm2SentAt?: string | null;
  repliedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface LeadDetail extends Lead {
  tags?: string[];
  variant?: {
    name?: string | null;
    connectNote?: string | null;
    dm1Template?: string | null;
    dm2Template?: string | null;
  } | null;
  content?: Array<{
    contentType?: string | null;
    content?: string | null;
    status?: string | null;
    sentAt?: string | null;
  }>;
}

interface LeadsPayload {
  leads?: Lead[];
}

interface GateItem {
  run_id?: string;
  runId?: string;
  framework?: string;
  gate_id?: string;
  gateId?: string;
  title?: string;
  message?: string;
  created_at?: string;
  createdAt?: string;
  timeout_hours?: number;
  stale?: boolean;
  payload?: Record<string, unknown>;
  vars?: Record<string, unknown>;
}

interface GatesPayload {
  items?: GateItem[];
  total?: number;
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

interface ProviderEnvVar {
  name: string;
  description: string;
  example: string;
  required: boolean;
}

interface ProviderKnowledge {
  id: string;
  display_name: string;
  homepage?: string | null;
  docs_url?: string | null;
  key_acquisition_url?: string | null;
  integration_kind?: string;
  env_vars: ProviderEnvVar[];
  install_steps?: string[];
}

interface KnowledgePayload {
  providers?: ProviderKnowledge[];
}

interface SaveResult {
  status: string;
  provider: string;
  healthcheck?: { ok: boolean; status: string; detail: string };
  custom?: boolean;
}

type OutboundAction = "search" | "enrich" | "approve" | "dry-run" | "publish" | "live";

const TABS: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: "overview", label: "Encuentra", icon: Search },
  { key: "campaigns", label: "Campanas", icon: Target },
  { key: "leads", label: "Leads", icon: Users },
  { key: "gates", label: "Inbox", icon: Inbox },
  { key: "templates", label: "Plantillas", icon: FileText },
  { key: "providers", label: "Settings", icon: Settings },
];

const MANUAL_STATUSES = ["Demo_Booked", "Deal_Created", "Closed_Won", "Closed_Lost"];

const B2B_HEADERS: Record<TabKey, { title: string; sub: string }> = {
  overview: {
    title: "Encuentra cuentas",
    sub: "Crea busquedas B2B, revisa salud del motor y abre las campanas recientes.",
  },
  campaigns: {
    title: "Campanas B2B",
    sub: "Drafts, readiness, operaciones de Apollo/Instantly y timeline de cada campana.",
  },
  leads: {
    title: "Leads",
    sub: "Contactos por campana, score, estado, variante y siguiente accion.",
  },
  gates: {
    title: "Inbox",
    sub: "Aprobaciones humanas pendientes antes de enviar, publicar o lanzar.",
  },
  templates: {
    title: "Plantillas",
    sub: "Secuencias outbound editables antes de aprobarlas y probarlas en Instantly.",
  },
  providers: {
    title: "Settings",
    sub: "Conexiones del motor B2B: Apollo, Instantly y proveedores auxiliares.",
  },
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

function asCampaigns(value: unknown): Campaign[] {
  if (!value || typeof value !== "object") return [];
  const campaigns = (value as CampaignPayload).campaigns;
  return Array.isArray(campaigns) ? campaigns : [];
}

function isB2BCampaign(campaign: Campaign): boolean {
  return isCampaignKind(campaign, "b2b");
}

function asGates(value: unknown): GateItem[] {
  if (!value || typeof value !== "object") return [];
  const items = (value as GatesPayload).items;
  return Array.isArray(items) ? items : [];
}

function asProviders(value: unknown): Provider[] {
  if (!value || typeof value !== "object") return [];
  const providers = (value as ProvidersPayload).providers;
  return Array.isArray(providers) ? providers : [];
}

function healthCheckLabel(name: string): string {
  const labels: Record<string, string> = {
    skills: "Skills",
    today: "Today",
    campaigns: "Campanas",
    gates: "Inbox",
    providers: "Conexiones",
  };
  return labels[name] || name;
}

function formatDate(value?: string | null): string {
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

function compactDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function leadName(lead: Lead): string {
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.id;
}

function scoreLabel(score?: number | null): string {
  if (score == null) return "-";
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function statusTone(status?: string | null) {
  const value = (status || "").toLowerCase();
  if (["active", "running", "green", "connected"].includes(value)) return "ok";
  if (["paused", "awaiting", "gray", "pending"].includes(value)) return "warn";
  if (["failed", "error", "red", "closed_lost"].includes(value)) return "bad";
  if (["closed_won", "demo_booked", "deal_created", "replied"].includes(value)) return "ok";
  return "neutral";
}

function statusClasses(status?: string | null) {
  const tone = statusTone(status);
  if (tone === "ok") return "border-sage/40 bg-sage/10 text-sage";
  if (tone === "warn") return "border-yellow-500/50 bg-yellow-100 text-yellow-800";
  if (tone === "bad") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-border bg-muted/50 text-muted-foreground";
}

function providerDot(status?: string) {
  const tone = statusTone(status);
  if (tone === "ok") return "bg-sage";
  if (tone === "warn") return "bg-yellow-500";
  if (tone === "bad") return "bg-destructive";
  return "bg-muted-foreground";
}

function metricValue(campaign: Campaign, key: string): string {
  const value = campaign.metrics?.[key];
  if (typeof value === "number") {
    if (key.toLowerCase().includes("rate")) return `${Math.round(value * 1000) / 10}%`;
    return value.toLocaleString("es-ES");
  }
  return typeof value === "string" && value ? value : "-";
}

function channelText(channels?: string[] | string | null): string {
  if (Array.isArray(channels)) return channels.join(", ") || "-";
  if (!channels) return "-";
  try {
    const parsed = JSON.parse(channels);
    if (Array.isArray(parsed)) return parsed.join(", ") || "-";
  } catch {
    // Fall through to returning the raw value.
  }
  return channels;
}

function compactJson(value: unknown): string {
  if (!value || typeof value !== "object") return "{}";
  const text = JSON.stringify(value, null, 2);
  return text.length > 1600 ? `${text.slice(0, 1600)}\n...` : text;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
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

function normalizeEmailArray(value: unknown): EmailSequenceEmail[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeEmailItem).filter((item): item is EmailSequenceEmail => item !== null);
}

function sequenceFromInput(input: unknown): EmailSequenceEmail[] {
  const data = asRecord(input);
  if (!data) return [];
  for (const key of ["sequence", "emails", "emailSequence", "email_sequence", "steps", "messages"]) {
    const emails = normalizeEmailArray(data[key]);
    if (emails.length > 0) return emails;
  }
  return [];
}

function extractEmailSequences(campaign: CampaignDetail): EmailSequenceBlock[] {
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

function gateRunId(gate: GateItem): string {
  return gate.run_id || gate.runId || "";
}

function gateTitle(gate: GateItem): string {
  return gate.title || gate.message || gate.gate_id || gate.gateId || gateRunId(gate) || "Gate pendiente";
}

function outboundActionLabel(action: OutboundAction): string {
  if (action === "search") return "Buscar leads";
  if (action === "enrich") return "Enriquecer";
  if (action === "approve") return "Aprobar";
  if (action === "dry-run") return "Prueba seca";
  if (action === "publish") return "Crear en Instantly";
  return "Lanzar";
}

/**
 * Outreach (= la UI de Yalc, SAN-115/SAN-78). Partnerships es un TIPO de
 * campaña, no un módulo aparte: el selector Tipo filtra la página.
 *
 *  - tipo=partnerships (default) → Encuentra · Contactos · Inbox · Plantillas
 *    (SAN-78, mockups OUTPUTS/sanchocmo/mockups-partnerships como spec).
 *  - tipo=b2b → B2B con la misma lógica visual/operativa de Partnerships.
 */
export default function OutreachPage() {
  const router = useRouter();
  const tipo = tipoFromQuery(router.query.tipo);
  if (tipo === "b2b") return <OutboundB2BView />;
  return <PartnershipsView />;
}

function YalcCockpitView() {
  const slug = useSlugSync();
  const openChat = useOpenChat();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [gateReasons, setGateReasons] = useState<Record<string, string>>({});

  const overview = useQuery({
    queryKey: ["yalc", slug, "overview"],
    queryFn: () => fetchJson<OverviewPayload>(`/api/yalc/overview?slug=${encodeURIComponent(slug)}`),
    enabled: !!slug,
    refetchInterval: 30000,
  });

  const campaignsQuery = useQuery({
    queryKey: ["yalc", slug, "campaigns"],
    queryFn: () => fetchJson<CampaignPayload>(`/api/yalc/campaigns?slug=${encodeURIComponent(slug)}&type=B2B`),
    enabled: !!slug,
  });

  const gatesQuery = useQuery({
    queryKey: ["yalc", slug, "gates"],
    queryFn: () => fetchJson<GatesPayload>(`/api/yalc/gates?slug=${encodeURIComponent(slug)}`),
    enabled: !!slug,
    initialData: () => overview.data?.checks?.gates?.data as GatesPayload | undefined,
  });

  const providersQuery = useQuery({
    queryKey: ["yalc", slug, "providers"],
    queryFn: () => fetchJson<ProvidersPayload>(`/api/yalc/providers?slug=${encodeURIComponent(slug)}`),
    enabled: !!slug,
    initialData: () => overview.data?.checks?.providers?.data as ProvidersPayload | undefined,
  });

  const campaigns = useMemo(
    () => (campaignsQuery.data?.campaigns || asCampaigns(overview.data?.checks?.campaigns?.data)).filter(isB2BCampaign),
    [campaignsQuery.data, overview.data],
  );
  const gates = useMemo(
    () => gatesQuery.data?.items || asGates(overview.data?.checks?.gates?.data),
    [gatesQuery.data, overview.data],
  );
  const providers = useMemo(
    () => providersQuery.data?.providers || asProviders(overview.data?.checks?.providers?.data),
    [providersQuery.data, overview.data],
  );

  useEffect(() => {
    if (!selectedCampaignId && campaigns.length > 0) setSelectedCampaignId(campaigns[0].id);
  }, [campaigns, selectedCampaignId]);

  const campaignDetailQuery = useQuery({
    queryKey: ["yalc", slug, "campaigns", selectedCampaignId],
    queryFn: () =>
      fetchJson<CampaignDetail>(
        `/api/yalc/campaigns/${encodeURIComponent(selectedCampaignId)}?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug && !!selectedCampaignId,
  });

  const readinessQuery = useQuery({
    queryKey: ["yalc", slug, "campaigns", selectedCampaignId, "readiness"],
    queryFn: () =>
      fetchJson<CampaignReadiness>(
        `/api/yalc/campaigns/${encodeURIComponent(selectedCampaignId)}/readiness?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug && !!selectedCampaignId,
  });

  const eventsQuery = useQuery({
    queryKey: ["yalc", slug, "campaigns", selectedCampaignId, "events"],
    queryFn: () =>
      fetchJson<CampaignEventsPayload>(
        `/api/yalc/campaigns/${encodeURIComponent(selectedCampaignId)}/events?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug && !!selectedCampaignId,
  });

  const leadsQuery = useQuery({
    queryKey: ["yalc", slug, "campaigns", selectedCampaignId, "leads"],
    queryFn: () =>
      fetchJson<LeadsPayload>(
        `/api/yalc/campaigns/${encodeURIComponent(selectedCampaignId)}/leads?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug && !!selectedCampaignId,
  });

  const leads = useMemo(() => leadsQuery.data?.leads || [], [leadsQuery.data]);

  useEffect(() => {
    setSelectedLeadId((current) => {
      if (!current) return leads[0]?.id || "";
      return leads.some((lead) => lead.id === current) ? current : leads[0]?.id || "";
    });
  }, [leads]);

  const leadDetailQuery = useQuery({
    queryKey: ["yalc", slug, "campaigns", selectedCampaignId, "leads", selectedLeadId],
    queryFn: () =>
      fetchJson<LeadDetail>(
        `/api/yalc/campaigns/${encodeURIComponent(selectedCampaignId)}/leads/${encodeURIComponent(
          selectedLeadId,
        )}?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug && !!selectedCampaignId && !!selectedLeadId,
  });

  const campaignAction = useMutation({
    mutationFn: ({ campaignId, action }: { campaignId: string; action: "pause" | "resume" }) =>
      fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns", variables.campaignId] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "overview"] });
    },
  });

  const createCampaignAction = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<{ campaignId: string }>(`/api/yalc/campaigns?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setSelectedCampaignId(data.campaignId);
      setActiveTab("campaigns");
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug] });
    },
  });

  const outboundAction = useMutation({
    mutationFn: ({ campaignId, action }: { campaignId: string; action: OutboundAction }) => {
      if (action === "search") {
        const campaign = campaignDetailQuery.data || selectedCampaign;
        return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/leads/search?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "apollo",
            query: campaign?.targetSegment || campaign?.hypothesis || campaign?.title || "B2B founder",
            titles: ["Founder", "CEO", "Co-Founder"],
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
        if (!window.confirm("Esto creara la campana y cargara leads en Instantly, pero no la lanzara. Continuar?")) {
          return Promise.resolve({ cancelled: true });
        }
        return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/publish?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmInstantlyPublish: true, actorLabel: "Sancho" }),
        });
      }
      if (!window.confirm("Esto lanzara la campana ya creada en Instantly. Continuar?")) {
        return Promise.resolve({ cancelled: true });
      }
      return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/live?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmLiveLaunch: true, actorLabel: "Sancho" }),
      });
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns", variables.campaignId] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns", variables.campaignId, "readiness"] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns", variables.campaignId, "events"] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns", variables.campaignId, "leads"] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "overview"] });
    },
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
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns", variables.campaignId] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns", variables.campaignId, "readiness"] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns", variables.campaignId, "events"] });
    },
  });

  const leadStatusAction = useMutation({
    mutationFn: ({ leadId, lifecycleStatus }: { leadId: string; lifecycleStatus: string }) =>
      fetchJson(
        `/api/yalc/campaigns/${encodeURIComponent(selectedCampaignId)}/leads/${encodeURIComponent(
          leadId,
        )}?slug=${encodeURIComponent(slug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lifecycleStatus }),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns", selectedCampaignId, "leads"] });
      void queryClient.invalidateQueries({
        queryKey: ["yalc", slug, "campaigns", selectedCampaignId, "leads", selectedLeadId],
      });
    },
  });

  const gateAction = useMutation({
    mutationFn: ({ runId, action, reason }: { runId: string; action: "approve" | "reject"; reason?: string }) =>
      fetchJson(`/api/yalc/gates?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, action, reason }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "gates"] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "overview"] });
    },
  });

  const totals = useMemo(() => {
    const leadCount = campaigns.reduce((sum, campaign) => sum + (campaign.leadCount || 0), 0);
    const activeCampaigns = campaigns.filter((campaign) => statusTone(campaign.status) === "ok").length;
    const readyProviders = providers.filter((provider) => provider.status === "green").length;
    return { leadCount, activeCampaigns, readyProviders };
  }, [campaigns, providers]);

  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) || null;
  const selectedCampaignDetail = campaignDetailQuery.data || selectedCampaign;
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) || null;

  function openYalcAgent(prompt?: string) {
    if (!slug) return;
    openChat(slug, buildYalcThread(slug, prompt));
  }

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ["yalc", slug] });
  }

  // Outreach is an opt-in service. When it isn't wired up, show a calm setup
  // placeholder instead of the cockpit's "unreachable" errors and empty tiles.
  const notConfigured = overview.data?.configured === false;
  const header = B2B_HEADERS[activeTab];
  if (notConfigured) {
    return (
      <DashboardLayout>
        <Head>
          <title>{`Outreach - ${slug || "cliente"} - Mission Control`}</title>
        </Head>
        <div className="min-h-[calc(100vh-48px)]">
          <header className="mb-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <Plug className="h-4 w-4" />
              Outreach
            </div>
            <h1 className="mt-1 font-heading text-2xl text-navy">Outreach (YALC)</h1>
          </header>
          <div className="mx-auto max-w-2xl rounded-xl border-2 border-border bg-card p-8 text-center shadow-comic-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink bg-sage/20">
              <Rocket className="h-6 w-6 text-sage" />
            </div>
            <h2 className="font-heading text-xl text-navy">Outreach no está activado</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              YALC es el motor de outbound (campañas, leads, secuencias). Es un servicio
              opcional: cuando lo activás, este panel se convierte en el cockpit para operarlo.
            </p>
            <div className="mx-auto mt-5 max-w-md rounded-lg border-2 border-border bg-background p-4 text-left text-sm">
              <p className="font-semibold text-navy">Para activarlo:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>
                  Reinstalá con Outreach activado (<code className="rounded bg-muted px-1">./install.sh --yalc</code>)
                  o levantá el overlay <code className="rounded bg-muted px-1">docker-compose.yalc.yml</code>.
                </li>
                <li>
                  Verificá que <code className="rounded bg-muted px-1">YALC_BASE_URL</code> y{" "}
                  <code className="rounded bg-muted px-1">YALC_API_TOKEN</code> estén en tu <code className="rounded bg-muted px-1">.env</code>.
                </li>
                <li>Después, cargá tu proveedor de email (ej. Instantly) desde acá mismo.</li>
              </ol>
            </div>
            <button
              type="button"
              onClick={() => refreshAll()}
              className="mt-5 inline-flex items-center gap-2 rounded-md border-2 border-border bg-card px-3 py-2 text-sm font-semibold hover:border-ink"
            >
              <RefreshCw className={cn("h-4 w-4", overview.isFetching && "animate-spin")} />
              Volver a verificar
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>{`Outbound - ${slug || "cliente"} - Mission Control`}</title>
      </Head>

      <div className="relative min-h-[calc(100vh-48px)] space-y-4" data-testid="outbound-b2b">
        <button
          type="button"
          onClick={() => setActiveTab("providers")}
          title="Settings de Outbound B2B"
          className={cn(
            "absolute right-0 top-0 z-10 grid h-9 w-9 place-items-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            activeTab === "providers" && "bg-muted text-foreground",
          )}
          data-testid="outbound-settings"
        >
          <Settings className="h-4 w-4" />
        </button>

        <header className="pr-12">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sage">
              <ShieldCheck className="h-4 w-4" />
              GTM-OS conectado
            </div>
            <h1 className="m-0 font-heading text-2xl text-navy">Outbound B2B · {header.title}</h1>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-bold text-rust">{slug || "cliente"}</span>
              <span>· Outreach</span>
            </div>
            {activeTab === "overview" && (
              <button
                type="button"
                onClick={() => setActiveTab("campaigns")}
                className="ml-auto inline-flex items-center gap-2 rounded-lg border-2 border-rust bg-rust px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust/90"
              >
                <Target className="h-4 w-4" />
                Crear campana
              </button>
            )}
          </div>
          <p className="mb-0 mt-1 max-w-3xl text-sm text-muted-foreground">{header.sub}</p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex flex-wrap gap-2 overflow-x-auto" data-testid="outbound-tabs">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-all",
                    activeTab === tab.key ? "border-rust bg-rust text-white" : "border-border hover:border-rust",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <TipoSelector tipo="b2b" />
            <button
              type="button"
              onClick={() => openYalcAgent()}
              className="inline-flex items-center gap-2 rounded-md border-2 border-ink bg-navy px-3 py-2 text-sm font-bold text-white shadow-comic-sm transition-transform hover:-translate-y-0.5"
            >
              <Bot className="h-4 w-4" />
              Rocinante
            </button>
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

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatusTile
            icon={<Server className="h-5 w-5" />}
            label="Motor"
            value={overview.data?.ok ? "Online" : overview.isError ? "Error" : "Checking"}
            detail="motor outbound"
            tone={overview.data?.ok ? "ok" : overview.isError ? "bad" : "warn"}
          />
          <StatusTile
            icon={<Target className="h-5 w-5" />}
            label="Campanas"
            value={campaigns.length.toLocaleString("es-ES")}
            detail={`${totals.activeCampaigns} activas`}
            tone={campaigns.length ? "ok" : "neutral"}
          />
          <StatusTile
            icon={<Users className="h-5 w-5" />}
            label="Leads"
            value={totals.leadCount.toLocaleString("es-ES")}
            detail="en campanas B2B"
            tone={totals.leadCount ? "ok" : "neutral"}
          />
          <StatusTile
            icon={<ListChecks className="h-5 w-5" />}
            label="Inbox"
            value={gates.length.toLocaleString("es-ES")}
            detail={gates.some((gate) => gate.stale) ? "hay aprobaciones vencidas" : "aprobaciones"}
            tone={gates.length ? "warn" : "ok"}
          />
          <StatusTile
            icon={<Activity className="h-5 w-5" />}
            label="Conexiones"
            value={`${totals.readyProviders}/${providers.length || 0}`}
            detail={overview.data?.runtime?.auth === "bearer" ? "token activo" : "sin bearer"}
            tone={providers.length && totals.readyProviders === providers.length ? "ok" : "warn"}
          />
        </section>

        {(overview.error || campaignsQuery.error || gatesQuery.error || providersQuery.error) && (
          <div className="flex items-start gap-2 rounded-lg border-2 border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{String((overview.error || campaignsQuery.error || gatesQuery.error || providersQuery.error)?.message)}</span>
          </div>
        )}

        {activeTab === "overview" && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
            <CreateOutboundCampaignPanel
              busy={createCampaignAction.isPending}
              error={createCampaignAction.error instanceof Error ? createCampaignAction.error.message : null}
              onCreate={(body) => createCampaignAction.mutate(body)}
            />

            <Panel title="Estado del motor" action={overview.isFetching ? "syncing" : "30s refresh"}>
              <div className="space-y-2">
                {Object.entries(overview.data?.checks || {}).map(([name, check]) => (
                  <div key={name} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {check.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-sage" />
                        ) : (
                          <CircleAlert className="h-4 w-4 text-destructive" />
                        )}
                        <span className="font-semibold">{healthCheckLabel(name)}</span>
                      </div>
                      {check.error && <p className="mt-1 text-xs text-destructive">{check.error}</p>}
                    </div>
                    <span className="rounded-md border border-border bg-card px-2 py-1 text-xs font-bold">
                      {check.count ?? "-"}
                    </span>
                  </div>
                ))}
                {!overview.data?.checks && (
                  <EmptyLine text={overview.isLoading ? "Conectando con el motor outbound..." : "Sin datos de runtime."} />
                )}
              </div>
            </Panel>

            <Panel title="Campanas recientes">
              <CampaignTable
                campaigns={campaigns.slice(0, 5)}
                onSelect={(id) => {
                  setSelectedCampaignId(id);
                  setActiveTab("leads");
                }}
                onAction={(campaignId, action) => campaignAction.mutate({ campaignId, action })}
                busyId={campaignAction.isPending ? campaignAction.variables?.campaignId : undefined}
              />
            </Panel>

            <Panel title="Inbox pendiente">
              <GateList
                gates={gates.slice(0, 4)}
                gateReasons={gateReasons}
                setGateReasons={setGateReasons}
                onApprove={(runId) => gateAction.mutate({ runId, action: "approve" })}
                onReject={(runId, reason) => gateAction.mutate({ runId, action: "reject", reason })}
                busy={gateAction.isPending}
              />
            </Panel>
          </div>
        )}

        {activeTab === "campaigns" && (
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_440px]">
            <div className="space-y-4">
              <CreateOutboundCampaignPanel
                busy={createCampaignAction.isPending}
                error={createCampaignAction.error instanceof Error ? createCampaignAction.error.message : null}
                onCreate={(body) => createCampaignAction.mutate(body)}
              />
              <Panel title="Campanas B2B" action={`${campaigns.length} total`}>
                <CampaignTable
                  campaigns={campaigns}
                  onSelect={setSelectedCampaignId}
                  onAction={(campaignId, action) => campaignAction.mutate({ campaignId, action })}
                  busyId={campaignAction.isPending ? campaignAction.variables?.campaignId : undefined}
                />
              </Panel>
            </div>

            <Panel
              title="Revision de campana"
              action={campaignDetailQuery.isFetching ? "loading" : selectedCampaignDetail?.status || "sin campana"}
            >
              <CampaignDetailPanel
                campaign={selectedCampaignDetail}
                readiness={readinessQuery.data || null}
                events={eventsQuery.data?.events || []}
                onOpenAgent={(prompt) => openYalcAgent(prompt)}
                onViewLeads={() => setActiveTab("leads")}
                onSaveSequence={(stepId, emails) => {
                  if (selectedCampaignDetail?.id) {
                    sequenceUpdateAction.mutate({ campaignId: selectedCampaignDetail.id, stepId, emails });
                  }
                }}
                onOutboundAction={(action) => {
                  if (selectedCampaignDetail?.id) outboundAction.mutate({ campaignId: selectedCampaignDetail.id, action });
                }}
                busySequenceStepId={
                  sequenceUpdateAction.isPending && sequenceUpdateAction.variables?.campaignId === selectedCampaignDetail?.id
                    ? sequenceUpdateAction.variables?.stepId || "__default__"
                    : undefined
                }
                busyAction={
                  outboundAction.isPending && outboundAction.variables?.campaignId === selectedCampaignDetail?.id
                    ? outboundAction.variables?.action
                    : undefined
                }
                actionError={
                  outboundAction.error instanceof Error
                    ? outboundAction.error.message
                    : sequenceUpdateAction.error instanceof Error ? sequenceUpdateAction.error.message : null
                }
              />
            </Panel>
          </div>
        )}

        {activeTab === "leads" && (
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
            <Panel
              title="Lista de leads"
              action={selectedCampaign ? selectedCampaign.title || selectedCampaign.id : "sin campana"}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select
                  value={selectedCampaignId}
                  onChange={(event) => {
                    setSelectedCampaignId(event.target.value);
                    setSelectedLeadId("");
                  }}
                  className="min-w-[260px] rounded-md border-2 border-border bg-card px-3 py-2 text-sm font-semibold focus:border-rust focus:outline-none"
                >
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.title || campaign.id}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-semibold text-muted-foreground">
                  {leadsQuery.isFetching ? "Actualizando..." : `${leads.length} leads`}
                </span>
              </div>
              <LeadTable
                leads={leads}
                selectedLeadId={selectedLeadId}
                onSelect={setSelectedLeadId}
                onStatus={(leadId, lifecycleStatus) => leadStatusAction.mutate({ leadId, lifecycleStatus })}
                busyId={leadStatusAction.isPending ? leadStatusAction.variables?.leadId : undefined}
              />
            </Panel>

            <Panel
              title={selectedLead ? leadName(selectedLead) : "Detalle"}
              action={leadDetailQuery.isFetching ? "loading" : selectedLead?.company || ""}
            >
              <LeadDetailPanel
                lead={leadDetailQuery.data || selectedLead}
                onOpenAgent={(prompt) => openYalcAgent(prompt)}
              />
            </Panel>
          </div>
        )}

        {activeTab === "gates" && (
          <Panel title="Inbox de aprobaciones" action={`${gates.length} pendientes`}>
            <GateList
              gates={gates}
              gateReasons={gateReasons}
              setGateReasons={setGateReasons}
              onApprove={(runId) => gateAction.mutate({ runId, action: "approve" })}
              onReject={(runId, reason) => gateAction.mutate({ runId, action: "reject", reason })}
              busy={gateAction.isPending}
            />
          </Panel>
        )}

        {activeTab === "templates" && (
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
            <Panel
              title="Secuencias outbound"
              action={campaignDetailQuery.isFetching ? "loading" : selectedCampaignDetail?.title || "sin campana"}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select
                  value={selectedCampaignId}
                  onChange={(event) => setSelectedCampaignId(event.target.value)}
                  className="min-w-[260px] rounded-md border-2 border-border bg-card px-3 py-2 text-sm font-semibold focus:border-rust focus:outline-none"
                >
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.title || campaign.id}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-semibold text-muted-foreground">
                  Edita antes de aprobar o hacer dry-run.
                </span>
              </div>
              <OutboundTemplatesPanel
                campaign={selectedCampaignDetail}
                busySequenceStepId={
                  sequenceUpdateAction.isPending && sequenceUpdateAction.variables?.campaignId === selectedCampaignDetail?.id
                    ? sequenceUpdateAction.variables?.stepId || "__default__"
                    : undefined
                }
                error={sequenceUpdateAction.error instanceof Error ? sequenceUpdateAction.error.message : null}
                onOpenAgent={(prompt) => openYalcAgent(prompt)}
                onSaveSequence={(stepId, emails) => {
                  if (selectedCampaignDetail?.id) {
                    sequenceUpdateAction.mutate({ campaignId: selectedCampaignDetail.id, stepId, emails });
                  }
                }}
              />
            </Panel>

            <Panel title="Operacion de plantilla" action={selectedCampaignDetail?.status || "draft"}>
              <CampaignTemplateActions
                campaign={selectedCampaignDetail}
                readiness={readinessQuery.data || null}
                busyAction={
                  outboundAction.isPending && outboundAction.variables?.campaignId === selectedCampaignDetail?.id
                    ? outboundAction.variables?.action
                    : undefined
                }
                error={outboundAction.error instanceof Error ? outboundAction.error.message : null}
                onOutboundAction={(action) => {
                  if (selectedCampaignDetail?.id) outboundAction.mutate({ campaignId: selectedCampaignDetail.id, action });
                }}
              />
            </Panel>
          </div>
        )}

        {activeTab === "providers" && (
          <ProviderConnectTab slug={slug} providers={providers} onRefresh={() => providersQuery.refetch()} />
        )}
      </div>
    </DashboardLayout>
  );
}

function OutboundTemplatesPanel({
  campaign,
  busySequenceStepId,
  error,
  onOpenAgent,
  onSaveSequence,
}: {
  campaign: CampaignDetail | Campaign | null;
  busySequenceStepId?: string;
  error: string | null;
  onOpenAgent: (prompt: string) => void;
  onSaveSequence: (stepId: string | undefined, emails: EmailSequenceEmail[]) => void;
}) {
  if (!campaign) return <EmptyLine text="Selecciona una campana para editar sus plantillas." />;

  const detail = campaign as CampaignDetail;
  const emailSequences = extractEmailSequences(detail);

  if (emailSequences.length === 0) {
    return (
      <div className="rounded-lg border border-yellow-500/50 bg-yellow-100 p-4 text-sm text-yellow-900">
        <div className="flex items-start gap-2">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-bold">Esta campana no tiene secuencia editable.</div>
            <p className="mt-1 text-xs">
              Pide a Rocinante que genere o reconstruya la secuencia y la guarde en el draft antes de aprobar.
            </p>
            <button
              type="button"
              onClick={() =>
                onOpenAgent(
                  `Genera una secuencia outbound B2B para la campana YALC ${campaign.id} y guardala como paso send-email-sequence con dryRun true. No crees una campana nueva.`,
                )
              }
              className="mt-3 inline-flex items-center gap-1 rounded-md border border-yellow-700 bg-white/70 px-2 py-1 text-xs font-bold text-yellow-900 hover:bg-white"
            >
              <Bot className="h-3.5 w-3.5" />
              Pedir secuencia
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {emailSequences.map((block, blockIndex) => (
        <EmailSequenceEditor
          key={`${block.source}-${block.stepId || blockIndex}`}
          block={block}
          busy={busySequenceStepId === (block.stepId || "__default__")}
          onSave={(emails) => onSaveSequence(block.stepId, emails)}
        />
      ))}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

function CampaignTemplateActions({
  campaign,
  readiness,
  busyAction,
  error,
  onOutboundAction,
}: {
  campaign: CampaignDetail | Campaign | null;
  readiness: CampaignReadiness | null;
  busyAction?: OutboundAction;
  error: string | null;
  onOutboundAction: (action: OutboundAction) => void;
}) {
  if (!campaign) return <EmptyLine text="Selecciona una campana para operar la secuencia." />;

  const emailSequences = extractEmailSequences(campaign as CampaignDetail);
  const actions: OutboundAction[] = ["approve", "dry-run", "publish", "live"];

  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="font-heading text-base text-foreground">{campaign.title || campaign.id}</h3>
        <p className="mt-1 text-muted-foreground">
          {emailSequences.length} bloque{emailSequences.length === 1 ? "" : "s"} de email guardado
          {emailSequences.length === 1 ? "" : "s"} en el motor outbound.
        </p>
      </div>

      {readiness && (
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["Review", readiness.readyForReview],
            ["Dry-run", readiness.readyForDryRun],
            ["Publish", readiness.readyForPublish],
            ["Live", readiness.readyForLive],
          ].map(([label, ok]) => (
            <div
              key={String(label)}
              className={cn(
                "rounded-md border px-3 py-2 text-xs font-bold",
                ok ? "border-sage/40 bg-sage/10 text-sage" : "border-border bg-card text-muted-foreground",
              )}
            >
              {ok ? "✓" : "•"} {label}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const disabled =
            !!busyAction ||
            (action === "approve" && emailSequences.length === 0) ||
            (action === "dry-run" && !readiness?.readyForDryRun) ||
            (action === "publish" && (!readiness?.readyForPublish || readiness?.readyForLive)) ||
            (action === "live" && !readiness?.readyForLive);
          return (
            <button
              key={action}
              type="button"
              disabled={disabled}
              onClick={() => onOutboundAction(action)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-bold disabled:opacity-50",
                action === "live"
                  ? "border-rust bg-rust text-white"
                  : "border-border bg-background hover:border-ink",
              )}
            >
              {busyAction === action && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {outboundActionLabel(action)}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

function ProviderConnectTab({
  slug,
  providers,
  onRefresh,
}: {
  slug: string;
  providers: Provider[];
  onRefresh: () => void;
}) {
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; detail: string }>>({});

  const knowledgeQuery = useQuery({
    queryKey: ["yalc", slug, "providers-knowledge"],
    queryFn: () => fetchJson<KnowledgePayload>(`/api/yalc/providers/knowledge?slug=${encodeURIComponent(slug)}`),
    staleTime: 5 * 60 * 1000,
  });

  const knowledgeMap = useMemo(() => {
    const map = new Map<string, ProviderKnowledge>();
    for (const k of knowledgeQuery.data?.providers || []) map.set(k.id, k);
    return map;
  }, [knowledgeQuery.data]);

  const handleTest = async (providerId: string) => {
    setTestingId(providerId);
    try {
      const result = await fetchJson<{ ok: boolean; detail: string }>(`/api/yalc/providers/test?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId }),
      });
      setTestResult((prev) => ({ ...prev, [providerId]: result }));
    } catch (err) {
      setTestResult((prev) => ({ ...prev, [providerId]: { ok: false, detail: err instanceof Error ? err.message : "Error" } }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <>
      <Panel title="Conexiones de Outbound" action={`${providers.length} registradas`}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((provider) => {
            const knowledge = knowledgeMap.get(provider.id);
            const test = testResult[provider.id];
            return (
              <div key={provider.id} className="rounded-lg border-2 border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full", providerDot(provider.status))} />
                      <h3 className="truncate font-heading text-base text-navy">{provider.name || provider.id}</h3>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{provider.description || provider.id}</p>
                  </div>
                  <span className={cn("rounded-md border px-2 py-1 text-xs font-bold", statusClasses(provider.status))}>
                    {provider.status || "unknown"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(provider.capabilities || []).slice(0, 5).map((capability) => (
                    <span key={capability} className="rounded border border-border bg-card px-2 py-1 text-[11px] font-semibold">
                      {capability}
                    </span>
                  ))}
                </div>
                {test && (
                  <div className={cn("mt-2 rounded border px-2 py-1 text-xs", test.ok ? "border-sage/40 bg-sage/10 text-sage" : "border-destructive/40 bg-destructive/10 text-destructive")}>
                    {test.ok ? "OK" : "Error"}: {test.detail}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  {knowledge && (
                    <button
                      type="button"
                      onClick={() => setConnectingId(provider.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-rust bg-rust/10 px-2 py-1 text-xs font-bold text-rust hover:bg-rust/20"
                    >
                      <Plug className="h-3 w-3" />
                      {provider.status === "green" ? "Reconfigurar" : "Conectar"}
                    </button>
                  )}
                  {provider.hasHealthProbe && (
                    <button
                      type="button"
                      disabled={testingId === provider.id}
                      onClick={() => handleTest(provider.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-bold hover:bg-card disabled:opacity-50"
                    >
                      {testingId === provider.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
                      Test
                    </button>
                  )}
                  {knowledge?.key_acquisition_url && (
                    <a
                      href={knowledge.key_acquisition_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-bold hover:bg-card"
                    >
                      <ExternalLink className="h-3 w-3" /> Get key
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          {providers.length === 0 && <EmptyLine text="No hay conexiones disponibles o el motor no responde." />}
        </div>
      </Panel>

      {connectingId && knowledgeMap.has(connectingId) && (
        <ProviderConnectModal
          slug={slug}
          knowledge={knowledgeMap.get(connectingId)!}
          currentStatus={providers.find((p) => p.id === connectingId)?.status}
          onClose={() => setConnectingId(null)}
          onSaved={() => {
            setConnectingId(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
}

function ProviderConnectModal({
  slug,
  knowledge,
  currentStatus,
  onClose,
  onSaved,
}: {
  slug: string;
  knowledge: ProviderKnowledge;
  currentStatus?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of knowledge.env_vars) init[v.name] = "";
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSave = knowledge.env_vars.filter((v) => v.required).every((v) => values[v.name]?.trim());

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetchJson<SaveResult>(`/api/yalc/providers/save?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: knowledge.id, env: values }),
      });
      setResult(res);
      if (res.healthcheck?.ok) {
        setTimeout(onSaved, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando keys");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border-2 border-border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-heading text-xl text-foreground">{knowledge.display_name || knowledge.id}</h2>
            {currentStatus === "green" && (
              <span className="text-xs text-sage font-bold">Conectado — reconfigurar keys</span>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-card">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {knowledge.env_vars.map((envVar) => (
            <div key={envVar.name}>
              <label className="mb-1 block text-sm font-bold text-foreground">
                {envVar.name}
                {envVar.required && <span className="ml-1 text-destructive">*</span>}
              </label>
              <p className="mb-1.5 text-xs text-muted-foreground">{envVar.description}</p>
              <input
                type="password"
                value={values[envVar.name] || ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [envVar.name]: e.target.value }))}
                placeholder={envVar.example || envVar.name}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-rust focus:outline-none"
                autoComplete="off"
              />
            </div>
          ))}

          {knowledge.key_acquisition_url && (
            <a
              href={knowledge.key_acquisition_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-rust hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Obtener API key
            </a>
          )}

          {result && (
            <div className={cn("rounded-md border p-3 text-sm", result.healthcheck?.ok ? "border-sage/40 bg-sage/10" : "border-destructive/40 bg-destructive/10")}>
              <div className="font-bold">{result.healthcheck?.ok ? "Conectado correctamente" : "Keys guardadas pero health check fallo"}</div>
              <div className="mt-1 text-xs">{result.healthcheck?.detail}</div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={!canSave || saving}
              onClick={handleSave}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border-2 border-ink bg-rust px-4 py-2 text-sm font-bold text-white shadow-comic-sm disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Guardando..." : "Guardar y verificar"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-card"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateOutboundCampaignPanel({
  busy,
  error,
  onCreate,
}: {
  busy: boolean;
  error: string | null;
  onCreate: (body: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState("Growth4U - Programa 6 meses");
  const [hypothesis, setHypothesis] = useState(
    "B2B founders with stalled outbound will respond to a six-month execution program.",
  );
  const [targetSegment, setTargetSegment] = useState("B2B founders in Spain doing founder-led sales");
  const [query, setQuery] = useState("B2B SaaS founder Spain");
  const [subject, setSubject] = useState("Sistema outbound en 6 meses");
  const [email1, setEmail1] = useState(
    "Hola {{first_name}}, vi que {{company_name}} esta en una fase donde outbound repetible puede cambiar el ritmo comercial. En Growth4U construimos el sistema completo en 6 meses: ICP, datos, secuencias, testing y operacion semanal.",
  );
  const [email2, setEmail2] = useState(
    "Te comparto la idea concreta: en vez de contratar piezas sueltas, montamos contigo el motor outbound hasta que haya cadencia, reporting y aprendizaje real. Si tiene sentido, revisamos si aplica a {{company_name}}.",
  );

  return (
    <Panel title="Crear campana B2B" action="draft">
      <div className="grid gap-3 md:grid-cols-2">
        <LabeledInput label="Titulo" value={title} onChange={setTitle} />
        <LabeledInput label="Busqueda Apollo" value={query} onChange={setQuery} />
        <LabeledInput label="ICP" value={targetSegment} onChange={setTargetSegment} className="md:col-span-2" />
        <LabeledTextarea label="Hipotesis" value={hypothesis} onChange={setHypothesis} className="md:col-span-2" />
        <LabeledInput label="Asunto email 1" value={subject} onChange={setSubject} className="md:col-span-2" />
        <LabeledTextarea label="Email 1" value={email1} onChange={setEmail1} />
        <LabeledTextarea label="Email 2" value={email2} onChange={setEmail2} />
      </div>
      {error && <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !title.trim() || !hypothesis.trim()}
          onClick={() =>
            onCreate({
              type: "B2B",
              campaignKind: "b2b",
              title,
              hypothesis,
              targetSegment,
              channels: ["email"],
              successMetrics: [
                { metric: "reply_rate", target: 0.08, baseline: null, actual: null },
                { metric: "positive_reply_rate", target: 0.03, baseline: null, actual: null },
              ],
              steps: [
                {
                  skillId: "find-companies",
                  channel: "apollo",
                  skillInput: { query, maxCompanies: 25 },
                  approvalRequired: true,
                },
                {
                  skillId: "send-email-sequence",
                  channel: "email",
                  skillInput: {
                    provider: "instantly",
                    dryRun: true,
                    sequence: [
                      { subject, body: email1, delay_days: 0 },
                      { subject: "Seguimiento Growth4U", body: email2, delay_days: 3 },
                    ],
                  },
                  approvalRequired: true,
                },
              ],
            })
          }
          className="inline-flex items-center gap-2 rounded-md border-2 border-ink bg-rust px-3 py-2 text-sm font-bold text-white shadow-comic-sm disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
          Crear draft
        </button>
        <span className="text-xs font-semibold text-muted-foreground">Despues usa buscar, enriquecer, aprobar y lanzar.</span>
      </div>
    </Panel>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-rust focus:outline-none"
      />
    </label>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-rust focus:outline-none"
      />
    </label>
  );
}

function StatusTile({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "ok" | "warn" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "ok"
      ? "border-sage"
      : tone === "warn"
        ? "border-yellow-500"
        : tone === "bad"
          ? "border-destructive"
          : "border-border";
  return (
    <div className={cn("rounded-lg border-2 bg-card p-4", toneClass)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-navy">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-heading font-bold text-foreground">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border-2 border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg text-navy">{title}</h2>
        {action && <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{action}</span>}
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background px-3 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function CampaignTable({
  campaigns,
  onSelect,
  onAction,
  busyId,
}: {
  campaigns: Campaign[];
  onSelect: (id: string) => void;
  onAction: (campaignId: string, action: "pause" | "resume") => void;
  busyId?: string;
}) {
  if (campaigns.length === 0) return <EmptyLine text="No hay campanas B2B todavia." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr className="border-b-2 border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 pr-3">Campana</th>
            <th className="pb-2 pr-3">Estado</th>
            <th className="pb-2 pr-3">Leads</th>
            <th className="pb-2 pr-3">Funnel</th>
            <th className="pb-2 pr-3">Reply</th>
            <th className="pb-2 pr-3">Actualizada</th>
            <th className="pb-2 pr-0 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const isPaused = (campaign.status || "").toLowerCase() === "paused";
            return (
              <tr key={campaign.id} className="border-b border-border/70 last:border-0">
                <td className="max-w-[300px] py-3 pr-3">
                  <button type="button" onClick={() => onSelect(campaign.id)} className="text-left">
                    <div className="font-semibold text-foreground hover:text-rust">{campaign.title || campaign.id}</div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {campaign.targetSegment || campaign.hypothesis || campaign.id}
                    </div>
                  </button>
                </td>
                <td className="py-3 pr-3">
                  <span className={cn("rounded-md border px-2 py-1 text-xs font-bold", statusClasses(campaign.status))}>
                    {campaign.status || "unknown"}
                  </span>
                </td>
                <td className="py-3 pr-3 font-semibold">{campaign.leadCount ?? 0}</td>
                <td className="py-3 pr-3">
                  <FunnelMini funnel={campaign.funnel || {}} />
                </td>
                <td className="py-3 pr-3">{metricValue(campaign, "replyRate")}</td>
                <td className="py-3 pr-3 text-muted-foreground">{compactDate(campaign.updatedAt || campaign.createdAt)}</td>
                <td className="py-3 pr-0">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(campaign.id)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs font-bold hover:border-ink"
                    >
                      Revisar
                    </button>
                    <button
                      type="button"
                      disabled={busyId === campaign.id}
                      onClick={() => onAction(campaign.id, isPaused ? "resume" : "pause")}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-bold hover:border-ink disabled:opacity-50"
                    >
                      {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      {isPaused ? "Resume" : "Pause"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CampaignDetailPanel({
  campaign,
  readiness,
  events,
  onOpenAgent,
  onViewLeads,
  onSaveSequence,
  onOutboundAction,
  busySequenceStepId,
  busyAction,
  actionError,
}: {
  campaign: CampaignDetail | null;
  readiness: CampaignReadiness | null;
  events: CampaignEvent[];
  onOpenAgent: (prompt: string) => void;
  onViewLeads: () => void;
  onSaveSequence: (stepId: string | undefined, emails: EmailSequenceEmail[]) => void;
  onOutboundAction: (action: OutboundAction) => void;
  busySequenceStepId?: string;
  busyAction?: OutboundAction;
  actionError: string | null;
}) {
  if (!campaign) return <EmptyLine text="Selecciona una campana para revisar el draft." />;

  const steps = campaign.steps || [];
  const successMetrics = campaign.successMetrics || [];
  const emailSequences = extractEmailSequences(campaign);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-md border px-2 py-1 text-xs font-bold", statusClasses(campaign.status))}>
            {campaign.status || "unknown"}
          </span>
          <span className="rounded-md border border-border bg-background px-2 py-1 text-xs font-bold">
            {channelText(campaign.channels)}
          </span>
        </div>
        <h3 className="mt-3 font-heading text-base text-foreground">{campaign.title || campaign.id}</h3>
        <p className="mt-1 text-muted-foreground">{campaign.hypothesis || "Sin hipotesis guardada."}</p>
        {campaign.targetSegment && (
          <p className="mt-2 text-xs font-semibold text-muted-foreground">ICP: {campaign.targetSegment}</p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-background p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Leads</div>
          <div className="mt-1 text-lg font-heading text-foreground">{campaign.leadCount ?? 0}</div>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Actualizada</div>
          <div className="mt-1 text-sm font-semibold text-foreground">
            {formatDate(campaign.updatedAt || campaign.createdAt)}
          </div>
        </div>
      </div>

      {successMetrics.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            Metricas objetivo
          </div>
          <div className="flex flex-wrap gap-2">
            {successMetrics.map((metric, index) => (
              <span key={`${metric.metric || "metric"}-${index}`} className="rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold">
                {metric.metric || "metric"}: {typeof metric.target === "number" ? metric.target : "-"}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" />
          Readiness
        </div>
        {readiness ? (
          <div className="rounded-md border border-border bg-background p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className={cn("rounded-md border px-2 py-1 text-xs font-bold", statusClasses(readiness.state))}>
                {readiness.state}
              </span>
              <div className="flex flex-wrap gap-1.5">
                <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-bold", readiness.readyForReview ? "border-sage/40 bg-sage/10 text-sage" : "border-border bg-card text-muted-foreground")}>
                  review
                </span>
                <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-bold", readiness.readyForDryRun ? "border-sage/40 bg-sage/10 text-sage" : "border-border bg-card text-muted-foreground")}>
                  dry-run
                </span>
                <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-bold", readiness.readyForPublish ? "border-sage/40 bg-sage/10 text-sage" : "border-border bg-card text-muted-foreground")}>
                  publish
                </span>
                <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-bold", readiness.readyForLive ? "border-sage/40 bg-sage/10 text-sage" : "border-border bg-card text-muted-foreground")}>
                  live
                </span>
              </div>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {readiness.checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-xs">
                  {item.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-sage" /> : <CircleAlert className="h-3.5 w-3.5 text-yellow-700" />}
                  <span className={item.passed ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                </div>
              ))}
            </div>
            {readiness.blockers.length > 0 && (
              <div className="mt-3 space-y-1">
                {readiness.blockers.slice(0, 3).map((blocker) => (
                  <div key={blocker.code} className="rounded border border-yellow-500/50 bg-yellow-100 px-2 py-1 text-xs text-yellow-900">
                    <span className="font-bold">{blocker.code}:</span> {blocker.nextAction || blocker.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyLine text="Readiness no disponible todavia." />
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Rocket className="h-3.5 w-3.5" />
          Operacion outbound
        </div>
        <div className="flex flex-wrap gap-2">
          {(["search", "enrich", "approve", "dry-run", "publish", "live"] as OutboundAction[]).map((action) => {
            const disabled =
              !!busyAction ||
              (action === "approve" && emailSequences.length === 0) ||
              (action === "dry-run" && !readiness?.readyForDryRun) ||
              (action === "publish" && (!readiness?.readyForPublish || readiness?.readyForLive)) ||
              (action === "live" && !readiness?.readyForLive);
            return (
              <button
                key={action}
                type="button"
                disabled={disabled}
                onClick={() => onOutboundAction(action)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold disabled:opacity-50",
                  action === "live"
                    ? "border-rust bg-rust text-white"
                    : "border-border bg-background hover:border-ink",
                )}
              >
                {busyAction === action && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {outboundActionLabel(action)}
              </button>
            );
          })}
        </div>
        {actionError && (
          <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {actionError}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          Timeline
        </div>
        {events.length === 0 ? (
          <EmptyLine text="Sin eventos registrados." />
        ) : (
          <div className="max-h-72 space-y-2 overflow-auto rounded-md border border-border bg-background p-2">
            {events.slice().reverse().slice(0, 12).map((event) => (
              <div key={event.id} className="rounded border border-border bg-card p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground">{event.type}</span>
                  <span className="text-[11px] font-semibold text-muted-foreground">{formatDate(event.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{event.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Send className="h-3.5 w-3.5" />
          Secuencia de emails para aprobar
        </div>
        {emailSequences.length === 0 ? (
          <div className="rounded-md border border-yellow-500/50 bg-yellow-100 p-3 text-sm text-yellow-900">
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-bold">No hay secuencia guardada en este draft.</div>
                <p className="mt-1 text-xs">
                  La campana existe en el motor outbound, pero no tiene emails revisables. Pide a Rocinante que genere la secuencia y la anada a este draft antes de probar Instantly.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenAgent(`La campana YALC ${campaign.id} no tiene secuencia de emails guardada. Genera una secuencia de outbound email para Growth4U y anadela al draft existente como paso send-email-sequence con dryRun true para poder aprobarla antes de Instantly. No crees una campana nueva.`)}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-yellow-700 bg-white/70 px-2 py-1 text-xs font-bold text-yellow-900 hover:bg-white"
                >
                  <Bot className="h-3.5 w-3.5" />
                  Pedir secuencia
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {emailSequences.map((block, blockIndex) => (
              <EmailSequenceEditor
                key={`${block.source}-${block.stepId || blockIndex}`}
                block={block}
                busy={busySequenceStepId === (block.stepId || "__default__")}
                onSave={(emails) => onSaveSequence(block.stepId, emails)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpenAgent(`Revisa la campana YALC ${campaign.id} y dime que falta antes de probarla en Instantly.`)}
          className="inline-flex items-center gap-1 rounded-md border border-rust bg-rust/10 px-2 py-1 text-xs font-bold text-rust hover:bg-rust/20"
        >
          <Bot className="h-3.5 w-3.5" />
          Revisar en chat
        </button>
        <button
          type="button"
          onClick={onViewLeads}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-bold hover:border-ink"
        >
          <Users className="h-3.5 w-3.5" />
          Ver leads
        </button>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" />
          Pasos guardados
        </div>
        {steps.length === 0 ? (
          <EmptyLine text="Esta campana todavia no tiene pasos guardados." />
        ) : (
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div key={step.id || `${step.skillId}-${index}`} className="rounded-md border border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-foreground">
                    {(step.stepIndex ?? index) + 1}. {step.skillId || "step"}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {step.channel && (
                      <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-bold">
                        {step.channel}
                      </span>
                    )}
                    <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-bold", statusClasses(step.status))}>
                      {step.status || "pending"}
                    </span>
                    {step.approvalRequired && (
                      <span className="rounded border border-yellow-500/50 bg-yellow-100 px-1.5 py-0.5 text-[11px] font-bold text-yellow-800">
                        approval
                      </span>
                    )}
                  </div>
                </div>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-border bg-card p-2 text-[11px] leading-relaxed text-muted-foreground">
                  {compactJson(step.skillInput)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FunnelMini({ funnel }: { funnel: Record<string, number> }) {
  const entries = Object.entries(funnel).filter(([, count]) => count > 0);
  if (entries.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="flex max-w-[240px] flex-wrap gap-1">
      {entries.slice(0, 3).map(([status, count]) => (
        <span key={status} className={cn("rounded border px-1.5 py-0.5 text-[11px] font-bold", statusClasses(status))}>
          {status.replace(/_/g, " ")} {count}
        </span>
      ))}
      {entries.length > 3 && <span className="text-xs text-muted-foreground">+{entries.length - 3}</span>}
    </div>
  );
}

function LeadTable({
  leads,
  selectedLeadId,
  onSelect,
  onStatus,
  busyId,
}: {
  leads: Lead[];
  selectedLeadId: string;
  onSelect: (id: string) => void;
  onStatus: (leadId: string, status: string) => void;
  busyId?: string;
}) {
  if (leads.length === 0) return <EmptyLine text="Esta campana no tiene leads o el motor no devolvio registros." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead>
          <tr className="border-b-2 border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 pr-3">Lead</th>
            <th className="pb-2 pr-3">Empresa</th>
            <th className="pb-2 pr-3">Email</th>
            <th className="pb-2 pr-3">Status</th>
            <th className="pb-2 pr-3">Score</th>
            <th className="pb-2 pr-3">Variant</th>
            <th className="pb-2 pr-3">Ultimo toque</th>
            <th className="pb-2 pr-0">Manual</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              onClick={() => onSelect(lead.id)}
              className={cn(
                "cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/40",
                selectedLeadId === lead.id && "bg-muted/60",
              )}
            >
              <td className="max-w-[260px] py-3 pr-3">
                <div className="font-semibold text-foreground">{leadName(lead)}</div>
                <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{lead.headline || lead.source || lead.id}</div>
              </td>
              <td className="py-3 pr-3">{lead.company || "-"}</td>
              <td className="py-3 pr-3">
                <div className="font-semibold text-foreground">{lead.email || "-"}</div>
                {lead.emailStatus && <div className="mt-0.5 text-xs text-muted-foreground">{lead.emailStatus}</div>}
              </td>
              <td className="py-3 pr-3">
                <span className={cn("rounded-md border px-2 py-1 text-xs font-bold", statusClasses(lead.lifecycleStatus))}>
                  {lead.lifecycleStatus || "unknown"}
                </span>
              </td>
              <td className="py-3 pr-3 font-semibold">{scoreLabel(lead.qualificationScore)}</td>
              <td className="py-3 pr-3 text-muted-foreground">{lead.variantName || lead.variantId || "-"}</td>
              <td className="py-3 pr-3 text-muted-foreground">
                {compactDate(lead.repliedAt || lead.dm2SentAt || lead.dm1SentAt || lead.connectedAt || lead.connectSentAt || lead.updatedAt)}
              </td>
              <td className="py-3 pr-0" onClick={(event) => event.stopPropagation()}>
                <select
                  value=""
                  disabled={busyId === lead.id}
                  onChange={(event) => {
                    if (event.target.value) onStatus(lead.id, event.target.value);
                  }}
                  className="w-[150px] rounded-md border border-border bg-card px-2 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  <option value="">Cambiar...</option>
                  {MANUAL_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadDetailPanel({
  lead,
  onOpenAgent,
}: {
  lead: LeadDetail | Lead | null | undefined;
  onOpenAgent: (prompt: string) => void;
}) {
  if (!lead) return <EmptyLine text="Selecciona un lead para ver su detalle." />;
  const detail = lead as LeadDetail;
  const linkedinUrl = lead.linkedinUrl || "";
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-xl text-foreground">{leadName(lead)}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{lead.headline || lead.company || lead.id}</p>
          </div>
          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-bold hover:border-ink"
            >
              LinkedIn <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <InfoCell label="Status" value={lead.lifecycleStatus || "-"} />
          <InfoCell label="Score" value={scoreLabel(lead.qualificationScore)} />
          <InfoCell label="Email" value={lead.email || "-"} />
          <InfoCell label="Email status" value={lead.emailStatus || "-"} />
          <InfoCell label="Source" value={lead.source || "-"} />
          <InfoCell label="Updated" value={formatDate(lead.updatedAt)} />
        </div>
      </div>

      <div className="rounded-md border border-border bg-background p-3">
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Variant</h4>
        <div className="font-semibold">{detail.variant?.name || lead.variantName || lead.variantId || "-"}</div>
        {detail.variant?.connectNote && <TemplateBlock label="Connect note" text={detail.variant.connectNote} />}
        {detail.variant?.dm1Template && <TemplateBlock label="DM1" text={detail.variant.dm1Template} />}
        {detail.variant?.dm2Template && <TemplateBlock label="DM2" text={detail.variant.dm2Template} />}
      </div>

      <div className="rounded-md border border-border bg-background p-3">
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Mensajes enviados</h4>
        {detail.content && detail.content.length > 0 ? (
          <div className="space-y-2">
            {detail.content.map((item, index) => (
              <div key={`${item.contentType || "content"}-${index}`} className="rounded border border-border bg-card p-2">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground">
                  <span>{item.contentType || "content"}</span>
                  <span>{formatDate(item.sentAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{item.content || "-"}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin mensajes registrados para este lead.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() =>
          onOpenAgent(
            `Analiza este lead de YALC y recomienda siguiente accion: ${leadName(lead)} (${lead.company || "sin empresa"}), status ${lead.lifecycleStatus || "unknown"}.`,
          )
        }
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border-2 border-ink bg-rust px-3 py-2 text-sm font-bold text-white shadow-comic-sm"
      >
        <Bot className="h-4 w-4" />
        Pedir siguiente accion
      </button>
    </div>
  );
}

function EmailSequenceEditor({
  block,
  busy,
  onSave,
}: {
  block: EmailSequenceBlock;
  busy: boolean;
  onSave: (emails: EmailSequenceEmail[]) => void;
}) {
  const sourceSignature = JSON.stringify(block.emails);
  const [emails, setEmails] = useState<EmailSequenceEmail[]>(block.emails);

  useEffect(() => {
    setEmails(block.emails);
  }, [block.stepId, sourceSignature]);

  const changed = JSON.stringify(emails) !== sourceSignature;
  const valid =
    emails.length > 0 &&
    emails.every((email) => email.body.trim().length > 0) &&
    Boolean(emails[0]?.subject?.trim());

  const updateEmail = (index: number, patch: Partial<EmailSequenceEmail>) => {
    setEmails((current) => current.map((email, currentIndex) => (
      currentIndex === index ? { ...email, ...patch } : email
    )));
  };

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-foreground">{block.source}</div>
        <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-bold">
          {emails.length} emails
        </span>
      </div>
      <div className="space-y-2">
        {emails.map((email, index) => (
          <div key={`${block.stepId || block.source}-${index}`} className="rounded border border-border bg-card p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Email {index + 1}</div>
              <label className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Dia
                <input
                  type="number"
                  value={email.delayDays ?? 0}
                  onChange={(event) => updateEmail(index, { delayDays: Number(event.target.value) })}
                  className="h-7 w-16 rounded border border-border bg-background px-2 text-xs font-semibold text-foreground focus:border-rust focus:outline-none"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Asunto</span>
              <input
                value={email.subject || ""}
                onChange={(event) => updateEmail(index, { subject: event.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold focus:border-rust focus:outline-none"
              />
            </label>
            <label className="mt-2 block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Cuerpo</span>
              <textarea
                value={email.body}
                onChange={(event) => updateEmail(index, { body: event.target.value })}
                rows={5}
                className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:border-rust focus:outline-none"
              />
            </label>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !changed || !valid}
          onClick={() => onSave(emails)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-bold hover:border-ink disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Guardar cambios
        </button>
        {!valid && <span className="text-xs font-semibold text-yellow-800">El primer email necesita asunto y todos necesitan cuerpo.</span>}
        {changed && valid && <span className="text-xs font-semibold text-muted-foreground">Al guardar, la secuencia vuelve a requerir aprobacion.</span>}
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card px-2 py-1.5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate font-semibold">{value}</div>
    </div>
  );
}

function TemplateBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-2 rounded border border-border bg-card p-2">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="whitespace-pre-wrap text-sm">{text}</p>
    </div>
  );
}

function GateList({
  gates,
  gateReasons,
  setGateReasons,
  onApprove,
  onReject,
  busy,
}: {
  gates: GateItem[];
  gateReasons: Record<string, string>;
  setGateReasons: Dispatch<SetStateAction<Record<string, string>>>;
  onApprove: (runId: string) => void;
  onReject: (runId: string, reason: string) => void;
  busy: boolean;
}) {
  if (gates.length === 0) return <EmptyLine text="No hay gates pendientes." />;
  return (
    <div className="space-y-3">
      {gates.map((gate) => {
        const runId = gateRunId(gate);
        const reason = gateReasons[runId] || "";
        return (
          <div key={runId || gateTitle(gate)} className="rounded-lg border-2 border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-base text-foreground">{gateTitle(gate)}</h3>
                  {gate.stale && (
                    <span className="rounded-md border border-destructive bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">
                      vencido
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {gate.framework || "framework"} - {formatDate(gate.created_at || gate.createdAt)} - {runId}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !runId}
                  onClick={() => onApprove(runId)}
                  className="rounded-md border border-sage bg-sage px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
                >
                  Aprobar
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={reason}
                onChange={(event) => setGateReasons((current) => ({ ...current, [runId]: event.target.value }))}
                placeholder="Motivo de rechazo"
                className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-rust focus:outline-none"
              />
              <button
                type="button"
                disabled={busy || !runId || !reason.trim()}
                onClick={() => onReject(runId, reason.trim())}
                className="rounded-md border border-destructive bg-card px-3 py-2 text-sm font-bold text-destructive disabled:opacity-50"
              >
                Rechazar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
