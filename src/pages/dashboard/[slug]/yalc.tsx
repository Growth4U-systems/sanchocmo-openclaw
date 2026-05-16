import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import Head from "next/head";
import {
  Activity,
  Bot,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  ListChecks,
  Pause,
  Play,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Target,
  Users,
  X,
  Plug,
  Loader2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useOpenChat } from "@/hooks/useChat";
import { buildYalcThread } from "@/lib/chat-openers";
import { cn } from "@/lib/utils";

type TabKey = "overview" | "campaigns" | "leads" | "gates" | "providers";

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
  runtime?: RuntimeInfo;
  checks?: Record<string, OverviewCheck>;
}

interface Campaign {
  id: string;
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

interface CampaignPayload {
  campaigns?: Campaign[];
}

interface Lead {
  id: string;
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

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "campaigns", label: "Campanas" },
  { key: "leads", label: "Leads" },
  { key: "gates", label: "Gates" },
  { key: "providers", label: "Providers" },
];

const MANUAL_STATUSES = ["Demo_Booked", "Deal_Created", "Closed_Won", "Closed_Lost"];

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

function gateRunId(gate: GateItem): string {
  return gate.run_id || gate.runId || "";
}

function gateTitle(gate: GateItem): string {
  return gate.title || gate.message || gate.gate_id || gate.gateId || gateRunId(gate) || "Gate pendiente";
}

export default function YalcCockpitPage() {
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
    queryFn: () => fetchJson<CampaignPayload>(`/api/yalc/campaigns?slug=${encodeURIComponent(slug)}`),
    enabled: !!slug,
    initialData: () => overview.data?.checks?.campaigns?.data as CampaignPayload | undefined,
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
    () => campaignsQuery.data?.campaigns || asCampaigns(overview.data?.checks?.campaigns?.data),
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "overview"] });
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
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) || null;

  function openYalcAgent(prompt?: string) {
    if (!slug) return;
    openChat(slug, buildYalcThread(slug, prompt));
  }

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ["yalc", slug] });
  }

  return (
    <DashboardLayout>
      <Head>
        <title>{`YALC - ${slug || "cliente"} - Mission Control`}</title>
      </Head>

      <div className="min-h-[calc(100vh-48px)] space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sage">
              <ShieldCheck className="h-4 w-4" />
              GTM-OS conectado a Sancho
            </div>
            <h1 className="mt-1 font-heading text-2xl text-navy">YALC Cockpit</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Operacion de campanas, leads, gates humanos y providers desde Mission Control.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openYalcAgent()}
              className="inline-flex items-center gap-2 rounded-md border-2 border-ink bg-rust px-3 py-2 text-sm font-bold text-white shadow-comic-sm transition-transform hover:-translate-y-0.5"
            >
              <Bot className="h-4 w-4" />
              Abrir Yalc Agent
            </button>
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex items-center gap-2 rounded-md border-2 border-border bg-card px-3 py-2 text-sm font-semibold hover:border-ink"
            >
              <RefreshCw className={cn("h-4 w-4", overview.isFetching && "animate-spin")} />
              Refrescar
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatusTile
            icon={<Server className="h-5 w-5" />}
            label="Runtime"
            value={overview.data?.ok ? "Online" : overview.isError ? "Error" : "Checking"}
            detail={overview.data?.runtime?.baseUrl || "YALC_BASE_URL"}
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
            detail="en campanas YALC"
            tone={totals.leadCount ? "ok" : "neutral"}
          />
          <StatusTile
            icon={<ListChecks className="h-5 w-5" />}
            label="Gates"
            value={gates.length.toLocaleString("es-ES")}
            detail={gates.some((gate) => gate.stale) ? "hay gates vencidos" : "pendientes"}
            tone={gates.length ? "warn" : "ok"}
          />
          <StatusTile
            icon={<Activity className="h-5 w-5" />}
            label="Providers"
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

        <nav className="flex flex-wrap gap-2 border-b-2 border-border pb-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-bold transition-colors",
                activeTab === tab.key
                  ? "border-ink bg-navy text-white"
                  : "border-border bg-card text-foreground hover:border-ink",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "overview" && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
            <Panel title="Health checks" action={overview.isFetching ? "syncing" : "30s refresh"}>
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
                        <span className="font-semibold capitalize">{name}</span>
                      </div>
                      {check.error && <p className="mt-1 text-xs text-destructive">{check.error}</p>}
                    </div>
                    <span className="rounded-md border border-border bg-card px-2 py-1 text-xs font-bold">
                      {check.count ?? "-"}
                    </span>
                  </div>
                ))}
                {!overview.data?.checks && (
                  <EmptyLine text={overview.isLoading ? "Conectando con YALC..." : "Sin datos de runtime."} />
                )}
              </div>
            </Panel>

            <Panel title="Siguiente accion" action="Yalc Agent">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Usa el agente para lanzar o diagnosticar workflows. El cockpit queda para ver estado, revisar leads y aprobar gates.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    openYalcAgent(
                      "Revisa el estado completo de YALC para este cliente: providers, campanas, gates pendientes y proximas acciones.",
                    )
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border-2 border-ink bg-sage px-3 py-2 text-sm font-bold text-white shadow-comic-sm"
                >
                  <Send className="h-4 w-4" />
                  Pedir diagnostico completo
                </button>
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
                busyId={campaignAction.variables?.campaignId}
              />
            </Panel>

            <Panel title="Gates pendientes">
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
          <Panel title="Campanas YALC" action={`${campaigns.length} total`}>
            <CampaignTable
              campaigns={campaigns}
              onSelect={(id) => {
                setSelectedCampaignId(id);
                setActiveTab("leads");
              }}
              onAction={(campaignId, action) => campaignAction.mutate({ campaignId, action })}
              busyId={campaignAction.variables?.campaignId}
            />
          </Panel>
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
                busyId={leadStatusAction.variables?.leadId}
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
          <Panel title="Aprobaciones humanas" action={`${gates.length} pendientes`}>
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

        {activeTab === "providers" && (
          <ProviderConnectTab slug={slug} providers={providers} onRefresh={() => providersQuery.refetch()} />
        )}
      </div>
    </DashboardLayout>
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
      <Panel title="Providers YALC" action={`${providers.length} registrados`}>
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
          {providers.length === 0 && <EmptyLine text="No hay providers disponibles o YALC no responde." />}
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
  if (campaigns.length === 0) return <EmptyLine text="No hay campanas en YALC todavia." />;
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
                      Ver leads
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
  if (leads.length === 0) return <EmptyLine text="Esta campana no tiene leads o YALC no devolvio registros." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead>
          <tr className="border-b-2 border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 pr-3">Lead</th>
            <th className="pb-2 pr-3">Empresa</th>
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
