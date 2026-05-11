import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Head from "next/head";
import {
  Check,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  MessageSquareText,
  RefreshCw,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ActivityBar } from "@/components/dashboard/activity-bar";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useClients } from "@/hooks/useClients";
import { cn } from "@/lib/utils";

type View = "overview" | "sources" | "meetings" | "decisions" | "pov" | "impact" | "proposals";
type Status = "processed" | "needs review" | "duplicate" | "low confidence";
type ImpactStatus = "no impact" | "possible update" | "conflict" | "proposal ready";
type Priority = "high" | "medium" | "low";
type Meeting = (typeof meetings)[number];

interface SourceScope {
  id: string;
  name: string;
  url?: string;
  notes?: string;
  filter?: {
    property?: string;
    operator?: string;
    value?: string;
  };
}

interface MeetingIntelligenceConfig {
  slug: string;
  enabled: boolean;
  updatedAt: string | null;
  sources: {
    googleDrive: { enabled: boolean; includeSubfolders: boolean; folders: SourceScope[] };
    notion: { enabled: boolean; databases: SourceScope[]; pages: SourceScope[] };
    slack: { enabled: boolean; channels: SourceScope[]; includeThreads: boolean };
    discord: { enabled: boolean; channels: SourceScope[]; includeThreads: boolean };
    manualUpload: { enabled: boolean };
  };
  routing: {
    publishChannel: string;
    reviewOwner: string;
    defaultTimezone: string;
  };
}

interface ChannelOption {
  transport: "discord" | "slack";
  id: string;
  name: string;
  configured: boolean;
}

interface ServiceConnection {
  status: string;
  account?: string | null;
  botName?: string | null;
  lastCheck?: string | null;
  details?: Record<string, unknown>;
}

interface ConnectionStatus {
  googleWorkspace?: ServiceConnection;
  notion?: ServiceConnection;
}

interface PickerItem {
  id: string;
  name: string;
  url?: string;
  object?: string;
  modifiedTime?: string | null;
  lastEditedTime?: string | null;
}

interface NotionProperty {
  id: string;
  name: string;
  type: string;
}

interface GooglePickerConfig {
  configured: boolean;
  apiKey: string;
  clientId: string;
  appId?: string;
  scope: string;
  missing?: string[];
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

interface GooglePickerView {
  setEnableDrives?: (enabled: boolean) => GooglePickerView;
  setIncludeFolders: (included: boolean) => GooglePickerView;
  setMimeTypes: (mimeTypes: string) => GooglePickerView;
  setSelectFolderEnabled: (enabled: boolean) => GooglePickerView;
}

interface GooglePickerBuilder {
  addView: (view: GooglePickerView) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
  enableFeature: (feature: unknown) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  setCallback: (callback: (data: GooglePickerResponse) => void) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
}

type GooglePickerResponse = Record<string, unknown>;

interface GooglePickerNamespace {
  Action: { PICKED: string };
  DocsView: new (viewId: string) => GooglePickerView;
  Document: { ID: string; NAME: string; URL: string; MIME_TYPE: string };
  Feature?: { SUPPORT_DRIVES?: unknown };
  PickerBuilder: new () => GooglePickerBuilder;
  Response: { ACTION: string; DOCUMENTS: string };
  ViewId: { FOLDERS: string };
}

declare global {
  interface Window {
    gapi?: {
      load: (
        api: string,
        options: { callback: () => void; onerror?: () => void; timeout?: number; ontimeout?: () => void }
      ) => void;
    };
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: unknown) => void;
          }) => GoogleTokenClient;
        };
      };
      picker?: GooglePickerNamespace;
    };
  }
}

const meetings = [
  {
    id: "m-001",
    title: "Lead-Nurturing Madrid",
    date: "2026-03-18",
    time: "10:30",
    source: "Drive",
    status: "processed" as Status,
    type: "technical-operational",
    participants: ["Ramiro", "Alfonso", "Heiver"],
    decisions: 5,
    actions: 6,
  },
  {
    id: "m-002",
    title: "Analisis de Mercado y Competidores",
    date: "2026-03-10",
    time: "16:00",
    source: "Notion",
    status: "needs review" as Status,
    type: "strategic-market-analysis",
    participants: ["Ramiro", "Growth4U"],
    decisions: 7,
    actions: 20,
  },
  {
    id: "m-003",
    title: "Status arquitectura Hospital Capilar",
    date: "2026-03-04",
    time: "09:15",
    source: "Slack",
    status: "low confidence" as Status,
    type: "strategic-planning",
    participants: ["Tech", "Growth"],
    decisions: 6,
    actions: 11,
  },
  {
    id: "m-004",
    title: "GTM Hospital Capilar",
    date: "2026-02-27",
    time: "12:00",
    source: "Manual",
    status: "duplicate" as Status,
    type: "internal-growth4u",
    participants: ["Alfonso"],
    decisions: 5,
    actions: 8,
  },
];

function meetingDateTime(meeting: Meeting) {
  return `${meeting.date} · ${meeting.time}`;
}

function emptyScope(): SourceScope {
  return { id: "", name: "", url: "", notes: "" };
}

function localDefaultConfig(slug: string): MeetingIntelligenceConfig {
  return {
    slug,
    enabled: true,
    updatedAt: null,
    sources: {
      googleDrive: { enabled: false, includeSubfolders: true, folders: [emptyScope()] },
      notion: { enabled: false, databases: [emptyScope()], pages: [] },
      slack: { enabled: false, channels: [], includeThreads: true },
      discord: { enabled: false, channels: [], includeThreads: true },
      manualUpload: { enabled: true },
    },
    routing: {
      publishChannel: "intelligence",
      reviewOwner: "Alfonso",
      defaultTimezone: "Europe/Madrid",
    },
  };
}

function loadScript(src: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser scripts can only load client-side."));
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = existing || document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`Could not load ${src}`)), { once: true });
    if (!existing) document.head.appendChild(script);
  });
}

async function loadGooglePickerLibraries() {
  await Promise.all([
    loadScript("https://apis.google.com/js/api.js"),
    loadScript("https://accounts.google.com/gsi/client"),
  ]);
  const gapi = window.gapi;
  if (!gapi) throw new Error("Google API script did not initialize.");
  await new Promise<void>((resolve, reject) => {
    gapi.load("picker", {
      callback: resolve,
      onerror: () => reject(new Error("Google Drive Picker could not be loaded.")),
      ontimeout: () => reject(new Error("Google Drive Picker timed out.")),
      timeout: 10_000,
    });
  });
}

function requestGoogleDriveToken(config: GooglePickerConfig) {
  return new Promise<string>((resolve, reject) => {
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth) {
      reject(new Error("Google Identity Services is not available in this browser."));
      return;
    }
    const tokenClient = oauth.initTokenClient({
      client_id: config.clientId,
      scope: config.scope,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error("Google did not return an access token."));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: () => reject(new Error("Google sign-in popup was closed or blocked.")),
    });
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

function readPickerDocString(doc: Record<string, unknown>, key: string) {
  const value = doc[key];
  return typeof value === "string" ? value : "";
}

async function openGoogleDriveFolderPicker(config: GooglePickerConfig) {
  if (!config.configured) {
    const missing = config.missing?.join(", ") || "Google Picker credentials";
    throw new Error(`Google Drive Picker is not configured. Missing: ${missing}.`);
  }
  await loadGooglePickerLibraries();
  const pickerApi = window.google?.picker;
  if (!pickerApi) throw new Error("Google Drive Picker is not available.");
  const token = await requestGoogleDriveToken(config);

  return new Promise<PickerItem | null>((resolve, reject) => {
    const folderView = new pickerApi.DocsView(pickerApi.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes("application/vnd.google-apps.folder");
    if (folderView.setEnableDrives) folderView.setEnableDrives(true);

    let builder = new pickerApi.PickerBuilder()
      .setDeveloperKey(config.apiKey)
      .setOAuthToken(token)
      .addView(folderView)
      .setCallback((data) => {
        const action = data[pickerApi.Response.ACTION];
        if (action !== pickerApi.Action.PICKED) {
          resolve(null);
          return;
        }

        const docsValue = data[pickerApi.Response.DOCUMENTS];
        const docs = Array.isArray(docsValue) ? docsValue : [];
        const firstDoc = docs[0];
        if (!firstDoc || typeof firstDoc !== "object") {
          reject(new Error("Google Picker returned no folder."));
          return;
        }

        const doc = firstDoc as Record<string, unknown>;
        const id = readPickerDocString(doc, pickerApi.Document.ID);
        const name = readPickerDocString(doc, pickerApi.Document.NAME) || "Untitled Drive folder";
        const url = readPickerDocString(doc, pickerApi.Document.URL) || (id ? `https://drive.google.com/drive/folders/${id}` : "");
        if (!id) {
          reject(new Error("Google Picker returned a folder without ID."));
          return;
        }
        resolve({ id, name, url });
      });

    if (config.appId) builder = builder.setAppId(config.appId);
    if (pickerApi.Feature?.SUPPORT_DRIVES) builder = builder.enableFeature(pickerApi.Feature.SUPPORT_DRIVES);
    builder.build().setVisible(true);
  });
}

const intelligence = [
  { type: "Decision", title: "Actualizar criterio operativo desde la reunion", source: "Drive", date: "2026-03-18", confidence: "92%", tone: "ok" },
  { type: "Decision", title: "Revisar implicaciones para StrategyPlan", source: "Drive", date: "2026-03-18", confidence: "86%", tone: "critical" },
  { type: "Insight", title: "Convertir insight en propuesta para POV", source: "Notion", date: "2026-03-10", confidence: "81%", tone: "proposal" },
  { type: "Action", title: "Asignar owner y deadline", source: "Slack", date: "2026-03-04", confidence: "78%", tone: "warn" },
  { type: "Quote", title: "Nuevo lenguaje de cliente para objeciones", source: "Manual", date: "2026-02-27", confidence: "73%", tone: "ok" },
  { type: "Risk", title: "Posible contradiccion con posicionamiento", source: "Notion", date: "2026-03-10", confidence: "69%", tone: "critical" },
];

const documents = [
  { name: "StrategyPlan", area: "Prioridades, horizonte y apuestas activas", health: "Needs review", status: "conflict" as ImpactStatus, proposals: 2, conflicts: 1, critical: true },
  { name: "Company Brief", area: "Contexto canonico de compania", health: "Stable", status: "possible update" as ImpactStatus, proposals: 1, conflicts: 0 },
  { name: "Positioning", area: "Diferenciacion y tesis comercial", health: "Watch", status: "possible update" as ImpactStatus, proposals: 2, conflicts: 1 },
  { name: "Brand Voice", area: "Lenguaje, tono y reglas editoriales", health: "Stable", status: "no impact" as ImpactStatus, proposals: 0, conflicts: 0 },
  { name: "Content Pillars", area: "Temas, angulos y prioridades", health: "Proposal ready", status: "proposal ready" as ImpactStatus, proposals: 3, conflicts: 0 },
  { name: "POV Bank", area: "Creencias, pruebas, objeciones y quotes", health: "Needs review", status: "proposal ready" as ImpactStatus, proposals: 4, conflicts: 1 },
];

const proposals = [
  { id: "PROP-001", title: "Revisar StrategyPlan por decision reciente", priority: "high" as Priority, doc: "StrategyPlan", source: "Lead-Nurturing Madrid" },
  { id: "PROP-002", title: "Anadir proof point a POV Bank", priority: "medium" as Priority, doc: "POV Bank", source: "Analisis de Mercado" },
  { id: "PROP-003", title: "Actualizar customer language", priority: "low" as Priority, doc: "Brand Voice", source: "GTM Hospital Capilar" },
];

const povPillars = [
  { name: "Systems over tactics", belief: "Growth es un sistema repetible, no una coleccion de hacks.", suggestions: ["New proof point", "New customer language", "Stronger angle"] },
  { name: "Trust-based acquisition", belief: "La adquisicion duradera crea activos de confianza.", suggestions: ["New proof point", "Objections detected"] },
  { name: "Regulated growth", belief: "Compliance puede ser ventaja competitiva cuando el sistema lo incorpora desde el inicio.", suggestions: ["Potential contradiction", "New proof point"] },
  { name: "Anti-retainer agency model", belief: "El retainer premia entregables, no transferencia de capacidad.", suggestions: ["Stronger angle", "New customer language"] },
];

const viewLabels: { key: View; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "sources", label: "Sources" },
  { key: "meetings", label: "Meeting Detail" },
  { key: "decisions", label: "Decision Log" },
  { key: "pov", label: "POV Database" },
  { key: "impact", label: "Document Impact" },
  { key: "proposals", label: "Proposal Review" },
];

const hashToView: Record<string, View> = {
  overview: "overview",
  sources: "sources",
  meetings: "meetings",
  decisions: "decisions",
  "pov-database": "pov",
  pov: "pov",
  "document-impact": "impact",
  impact: "impact",
  proposals: "proposals",
};

function viewToHash(view: View) {
  if (view === "pov") return "pov-database";
  if (view === "impact") return "document-impact";
  if (view === "meetings") return "meetings";
  if (view === "decisions") return "decisions";
  if (view === "proposals") return "proposals";
  if (view === "sources") return "sources";
  return "overview";
}

export default function IntelligencePage() {
  const slug = useSlugSync();
  const { data: clients } = useClients();
  const [view, setView] = useState<View>("overview");
  const [selectedMeeting, setSelectedMeeting] = useState(meetings[0]);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sourceConfig, setSourceConfig] = useState<MeetingIntelligenceConfig>(() => localDefaultConfig(""));
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesSaving, setSourcesSaving] = useState(false);
  const [sourcesSavedAt, setSourcesSavedAt] = useState<string | null>(null);
  const [channelOptions, setChannelOptions] = useState<ChannelOption[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({});

  const clientName = useMemo(() => {
    const client = clients?.find((c) => c.slug === slug);
    return client?.name || slug.replace(/-/g, " ");
  }, [clients, slug]);

  const filteredMeetings = sourceFilter === "all"
    ? meetings
    : meetings.filter((meeting) => meeting.source === sourceFilter);

  useEffect(() => {
    const syncHash = () => {
      const key = window.location.hash.replace(/^#/, "");
      if (hashToView[key]) setView(hashToView[key]);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setSourcesLoading(true);
    Promise.all([
      fetch(`/api/meeting-intelligence/config?slug=${slug}`).then((res) => res.json()),
      fetch(`/api/meeting-intelligence/options?slug=${slug}`).then((res) => res.json()).catch(() => ({ channels: [] })),
      fetch(`/api/meeting-intelligence/status?slug=${slug}`).then((res) => res.json()).catch(() => ({ services: {} })),
    ])
      .then(([data, options, status]) => {
        if (!cancelled) setSourceConfig(data.config || localDefaultConfig(slug));
        if (!cancelled) setChannelOptions(options.channels || []);
        if (!cancelled) setConnectionStatus(status.services || {});
      })
      .catch(() => {
        if (!cancelled) setSourceConfig(localDefaultConfig(slug));
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  async function saveSourceConfig() {
    if (!slug) return;
    setSourcesSaving(true);
    const res = await fetch(`/api/meeting-intelligence/config?slug=${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: sourceConfig }),
    });
    const data = await res.json();
    if (data.config) {
      setSourceConfig(data.config);
      setSourcesSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }
    setSourcesSaving(false);
  }

  const configuredSourceCount = [
    sourceConfig.sources.googleDrive.enabled && sourceConfig.sources.googleDrive.folders.some((s) => s.id || s.url),
    sourceConfig.sources.notion.enabled && [...sourceConfig.sources.notion.databases, ...sourceConfig.sources.notion.pages].some((s) => s.id || s.url),
    sourceConfig.sources.slack.enabled && sourceConfig.sources.slack.channels.length > 0,
    sourceConfig.sources.discord.enabled && sourceConfig.sources.discord.channels.length > 0,
    sourceConfig.sources.manualUpload.enabled,
  ].filter(Boolean).length;

  return (
    <DashboardLayout fullBleed>
      <Head>
        <title>Intelligence — {clientName} — Mission Control</title>
      </Head>
      <div className="min-h-screen bg-background px-6 py-5">
        {slug && <ActivityBar slug={slug} />}
        <header className="mb-4 border-b border-border pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-rust">
                Meeting Notes Intelligence
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-[28px] leading-tight text-navy">
                  Intelligence Center — {clientName}
                </h1>
                <Badge tone="proposal">Review-first</Badge>
              </div>
              <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
                Command center visual para convertir reuniones en decisiones, mejoras de POV y propuestas sobre documentos canonicos. Nada aplica cambios sin aprobacion humana.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat value={meetings.length} label="Meetings" />
              <Stat value={58} label="Decisions" />
              <Stat value={91} label="Actions" />
              <Stat value={proposals.length} label="Proposals" />
              <Stat value={configuredSourceCount} label="Sources" />
            </div>
          </div>
        </header>

        <div className="mb-3 flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[12px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-sage shadow-[0_0_8px_var(--sage)]" />
          <strong className="text-foreground">Activity</strong>
          <span>Listo para revisar meetings, decisiones e impactos.</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-rust">
            <RefreshCw className="h-3 w-3" /> sync idle
          </span>
        </div>

        <nav className="mb-3 flex flex-wrap gap-1.5">
          {viewLabels.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setView(tab.key);
                window.history.replaceState(null, "", `#${viewToHash(tab.key)}`);
              }}
              className={cn(
                "rounded-md border border-border bg-card px-3 py-2 text-[12px] font-bold text-muted-foreground transition-colors",
                view === tab.key && "border-rust bg-rust text-white"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {view === "overview" && (
          <Overview
            meetings={filteredMeetings}
            selectedMeetingId={selectedMeeting.id}
            sourceFilter={sourceFilter}
            onFilter={setSourceFilter}
            onSelect={(meeting) => {
              setSelectedMeeting(meeting);
              setView("meetings");
            }}
            onView={setView}
          />
        )}
        {view === "sources" && (
          <SourcesSetup
            config={sourceConfig}
            channelOptions={channelOptions}
            connectionStatus={connectionStatus}
            loading={sourcesLoading}
            saving={sourcesSaving}
            savedAt={sourcesSavedAt}
            setConfig={setSourceConfig}
            onSave={saveSourceConfig}
          />
        )}
        {view === "meetings" && <MeetingDetail meeting={selectedMeeting} onView={setView} />}
        {view === "decisions" && <DecisionLog onSelect={(meeting) => { setSelectedMeeting(meeting); setView("meetings"); }} />}
        {view === "pov" && <PovDatabase meetingTitle={selectedMeeting.title} onView={setView} />}
        {view === "impact" && <DocumentImpact onView={setView} />}
        {view === "proposals" && <ProposalReview meeting={selectedMeeting} />}
      </div>
    </DashboardLayout>
  );
}

function Overview({
  meetings,
  selectedMeetingId,
  sourceFilter,
  onFilter,
  onSelect,
  onView,
}: {
  meetings: Meeting[];
  selectedMeetingId: string;
  sourceFilter: string;
  onFilter: (source: string) => void;
  onSelect: (meeting: Meeting) => void;
  onView: (view: View) => void;
}) {
  return (
    <div className="grid min-h-[620px] grid-cols-1 overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[1.05fr_1.15fr_.95fr_1.05fr]">
      <Column title="Meeting Feed" meta={String(meetings.length)}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {["all", "Drive", "Notion", "Slack", "Manual"].map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => onFilter(source)}
              className={cn(
                "rounded-full border border-border bg-background px-2 py-1 text-[10px] font-bold text-muted-foreground",
                sourceFilter === source && "border-navy bg-navy text-white"
              )}
            >
              {source}
            </button>
          ))}
        </div>
        {meetings.length === 0 ? (
          <EmptyState />
        ) : (
          meetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} active={meeting.id === selectedMeetingId} onClick={() => onSelect(meeting)} />
          ))
        )}
      </Column>
      <Column title="Extracted Intelligence" meta={`${intelligence.length} items`}>
        {intelligence.map((item) => (
          <MiniRow key={`${item.type}-${item.title}`} title={item.title} eyebrow={item.type} meta={`${item.source} · ${item.date} · ${item.confidence}`} tone={item.tone} />
        ))}
      </Column>
      <Column title="Document Impact" meta="StrategyPlan">
        {documents.slice(0, 5).map((doc) => (
          <button
            key={doc.name}
            type="button"
            onClick={() => onView("impact")}
            className={cn(
              "mb-2 w-full rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-rust",
              doc.critical && "border-rust shadow-[inset_3px_0_0_var(--rust)]"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <strong className="text-[13px] text-foreground">{doc.name}</strong>
              <Badge tone={doc.critical ? "critical" : doc.status === "no impact" ? "ok" : "proposal"}>{doc.critical ? "Critical" : doc.status}</Badge>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{doc.area}</p>
            <div className="mt-2 flex gap-2 text-[10px] text-muted-foreground">
              <span>{doc.proposals} proposals</span>
              <span>{doc.conflicts} conflicts</span>
            </div>
          </button>
        ))}
      </Column>
      <Column title="Pending Proposals" meta={String(proposals.length)}>
        {proposals.map((proposal) => (
          <div key={proposal.id} className={cn("mb-2 rounded-lg border border-border bg-background p-3", proposal.priority === "high" && "border-rust")}>
            <div className="flex items-start justify-between gap-2">
              <strong className="text-[13px] text-foreground">{proposal.title}</strong>
              <Badge tone={proposal.priority === "high" ? "critical" : "proposal"}>{proposal.priority}</Badge>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{proposal.doc} · {proposal.source}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <ActionButton onClick={() => onView("proposals")}>Review</ActionButton>
              <ActionButton primary>Approve</ActionButton>
              <ActionButton>Reject</ActionButton>
            </div>
          </div>
        ))}
      </Column>
    </div>
  );
}

function SourcesSetup({
  config,
  channelOptions,
  connectionStatus,
  loading,
  saving,
  savedAt,
  setConfig,
  onSave,
}: {
  config: MeetingIntelligenceConfig;
  channelOptions: ChannelOption[];
  connectionStatus: ConnectionStatus;
  loading: boolean;
  saving: boolean;
  savedAt: string | null;
  setConfig: (config: MeetingIntelligenceConfig) => void;
  onSave: () => void;
}) {
  const update = (next: Partial<MeetingIntelligenceConfig>) => setConfig({ ...config, ...next });
  const updateSources = (sources: Partial<MeetingIntelligenceConfig["sources"]>) => setConfig({
    ...config,
    sources: { ...config.sources, ...sources },
  });
  const updateRouting = (routing: Partial<MeetingIntelligenceConfig["routing"]>) => setConfig({
    ...config,
    routing: { ...config.routing, ...routing },
  });
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveQuery, setDriveQuery] = useState("");
  const [driveItems, setDriveItems] = useState<PickerItem[]>([]);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [drivePickerConfig, setDrivePickerConfig] = useState<GooglePickerConfig | null>(null);
  const [drivePickerLoading, setDrivePickerLoading] = useState(false);
  const [drivePickerMessage, setDrivePickerMessage] = useState<string | null>(null);
  const [notionOpen, setNotionOpen] = useState(false);
  const [notionQuery, setNotionQuery] = useState("");
  const [notionItems, setNotionItems] = useState<PickerItem[]>([]);
  const [notionError, setNotionError] = useState<string | null>(null);
  const [notionLoading, setNotionLoading] = useState(false);
  const [notionProperties, setNotionProperties] = useState<Record<string, NotionProperty[]>>({});
  const drivePickerReady = drivePickerConfig?.configured === true;

  useEffect(() => {
    if (!config.slug) return;
    let cancelled = false;
    fetch(`/api/meeting-intelligence/drive/picker-config?slug=${config.slug}`)
      .then((res) => res.json())
      .then((data: GooglePickerConfig) => {
        if (!cancelled) setDrivePickerConfig(data);
      })
      .catch(() => {
        if (!cancelled) setDrivePickerConfig({
          configured: false,
          apiKey: "",
          clientId: "",
          scope: "https://www.googleapis.com/auth/drive.metadata.readonly",
          missing: ["GOOGLE_PICKER_API_KEY", "GOOGLE_PICKER_CLIENT_ID"],
        });
      });
    return () => { cancelled = true; };
  }, [config.slug]);

  const addDriveFolder = (item: PickerItem) => {
    if (config.sources.googleDrive.folders.some((folder) => folder.id === item.id)) return;
    const folders = config.sources.googleDrive.folders.filter((folder) => folder.id || folder.name || folder.url);
    updateSources({
      googleDrive: {
        ...config.sources.googleDrive,
        enabled: true,
        folders: [...folders, { id: item.id, name: item.name, url: item.url || "", notes: "Selected from Google Drive Picker" }],
      },
    });
  };

  const addNotionDatabase = (item: PickerItem) => {
    if (config.sources.notion.databases.some((database) => database.id === item.id)) return;
    const databases = config.sources.notion.databases.filter((database) => database.id || database.name || database.url);
    updateSources({
      notion: {
        ...config.sources.notion,
        enabled: true,
        databases: [...databases, { id: item.id, name: item.name, url: item.url || "", notes: "Selected from Notion browser", filter: { property: "", operator: "equals", value: "" } }],
      },
    });
    void loadNotionProperties(item.id);
  };

  const refreshDrivePickerConfig = async () => {
    const res = await fetch(`/api/meeting-intelligence/drive/picker-config?slug=${config.slug}`);
    const data = await res.json() as GooglePickerConfig;
    setDrivePickerConfig(data);
    return data;
  };

  const selectDriveFolderWithGooglePicker = async () => {
    setDrivePickerLoading(true);
    setDrivePickerMessage(null);
    try {
      const pickerConfig = drivePickerConfig || await refreshDrivePickerConfig();
      const folder = await openGoogleDriveFolderPicker(pickerConfig);
      if (folder) {
        addDriveFolder(folder);
        setDrivePickerMessage(`Selected: ${folder.name}`);
      } else {
        setDrivePickerMessage("Google Drive Picker closed without selecting a folder.");
      }
    } catch (error) {
      setDrivePickerMessage(error instanceof Error ? error.message : "Google Drive Picker could not be opened.");
    } finally {
      setDrivePickerLoading(false);
    }
  };

  const searchDriveFolders = async () => {
    setDriveLoading(true);
    setDriveError(null);
    const params = new URLSearchParams({ slug: config.slug });
    if (driveQuery.trim()) params.set("q", driveQuery.trim());
    const res = await fetch(`/api/meeting-intelligence/drive/folders?${params.toString()}`);
    const data = await res.json();
    setDriveItems(data.folders || []);
    setDriveError(data.ok ? null : data.error || "Google Drive browse failed");
    setDriveLoading(false);
  };

  const searchNotionDatabases = async () => {
    setNotionLoading(true);
    setNotionError(null);
    const params = new URLSearchParams({ slug: config.slug, object: "database" });
    if (notionQuery.trim()) params.set("q", notionQuery.trim());
    const res = await fetch(`/api/meeting-intelligence/notion/search?${params.toString()}`);
    const data = await res.json();
    setNotionItems(data.results || []);
    setNotionError(data.ok ? null : data.error || "Notion search failed");
    setNotionLoading(false);
  };

  const loadNotionProperties = async (databaseId: string) => {
    if (!databaseId || notionProperties[databaseId]) return;
    const params = new URLSearchParams({ slug: config.slug, databaseId });
    const res = await fetch(`/api/meeting-intelligence/notion/database?${params.toString()}`);
    const data = await res.json();
    if (data.ok) setNotionProperties((prev) => ({ ...prev, [databaseId]: data.properties || [] }));
  };
  const addChannel = (option: ChannelOption) => {
    const scope = { id: option.id, name: option.name, notes: option.configured ? "Configured channel" : "Known channel" };
    if (option.transport === "discord") {
      if (config.sources.discord.channels.some((channel) => channel.id === option.id)) return;
      updateSources({ discord: { ...config.sources.discord, enabled: true, channels: [...config.sources.discord.channels, scope] } });
    } else {
      if (config.sources.slack.channels.some((channel) => channel.id === option.id)) return;
      updateSources({ slack: { ...config.sources.slack, enabled: true, channels: [...config.sources.slack.channels, scope] } });
    }
  };
  const removeChannel = (option: ChannelOption) => {
    if (option.transport === "discord") {
      updateSources({ discord: { ...config.sources.discord, channels: config.sources.discord.channels.filter((channel) => channel.id !== option.id) } });
    } else {
      updateSources({ slack: { ...config.sources.slack, channels: config.sources.slack.channels.filter((channel) => channel.id !== option.id) } });
    }
  };
  const isChannelSelected = (option: ChannelOption) => {
    const list = option.transport === "discord" ? config.sources.discord.channels : config.sources.slack.channels;
    return list.some((channel) => channel.id === option.id);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_.75fr]">
      <section className="space-y-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl text-navy">Meeting Sources</h2>
              <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
                Aqui no basta con conectar una cuenta: hay que decirle a Sancho exactamente que carpetas, bases de datos y canales debe mirar para convertir reuniones en inteligencia.
              </p>
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[12px] font-bold">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => update({ enabled: e.target.checked })}
              />
              Meeting Intelligence active
            </label>
          </div>
        </div>

        <SourceCard
          title="Google Drive"
          description="Carpetas donde viven notas, docs exportados, transcripciones o resúmenes de meetings."
          enabled={config.sources.googleDrive.enabled}
          onEnabled={(enabled) => updateSources({ googleDrive: { ...config.sources.googleDrive, enabled } })}
          footer={
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={config.sources.googleDrive.includeSubfolders}
                onChange={(e) => updateSources({ googleDrive: { ...config.sources.googleDrive, includeSubfolders: e.target.checked } })}
              />
              Include subfolders
            </label>
          }
        >
          <ConnectionStrip
            label="Google Workspace / Drive"
            connection={connectionStatus.googleWorkspace}
            connectedText={connectionStatus.googleWorkspace?.account || "Connected in APIs"}
            missingText="Connect Google Workspace in APIs before browsing Drive."
          />
          <div className={cn(
            "mb-3 rounded-lg border p-3 text-[12px] leading-relaxed",
            drivePickerReady ? "border-sage/30 bg-sage/10 text-muted-foreground" : "border-yellow-400/40 bg-yellow-50 text-muted-foreground"
          )}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong className="block text-foreground">Official Google Drive Picker</strong>
                <span>
                  {drivePickerReady
                    ? "Use the native Google popup to choose the exact Drive folder Sancho should monitor."
                    : `Add ${drivePickerConfig?.missing?.join(" + ") || "Google Picker credentials"} to enable the native folder popup.`}
                </span>
              </div>
              <Badge tone={drivePickerReady ? "ok" : "proposal"}>{drivePickerReady ? "ready" : "setup needed"}</Badge>
            </div>
            {drivePickerMessage && (
              <div className="mt-2 rounded-md border border-border bg-card px-3 py-2 text-[11px] text-foreground">
                {drivePickerMessage}
              </div>
            )}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <ActionButton
              onClick={() => void selectDriveFolderWithGooglePicker()}
              primary={connectionStatus.googleWorkspace?.status === "ok"}
              disabled={drivePickerLoading}
            >
              <FolderOpen className="h-3 w-3" /> {drivePickerLoading ? "Opening..." : "Open Google Drive Picker"}
            </ActionButton>
            <ActionButton onClick={() => void refreshDrivePickerConfig()}>
              <RefreshCw className="h-3 w-3" /> Check Picker setup
            </ActionButton>
            <ActionButton
              onClick={() => {
                setDriveOpen((v) => !v);
                if (!driveOpen && driveItems.length === 0) void searchDriveFolders();
              }}
            >
              MCP fallback list
            </ActionButton>
          </div>
          {driveOpen && (
            <PickerPanel
              query={driveQuery}
              setQuery={setDriveQuery}
              loading={driveLoading}
              error={driveError}
              items={driveItems}
              placeholder="Search folders: meetings, calls, Fathom..."
              emptyText="No Drive folders found."
              onSearch={searchDriveFolders}
              onSelect={addDriveFolder}
            />
          )}
          <ScopeList
            scopes={config.sources.googleDrive.folders}
            idLabel="Folder ID or URL"
            nameLabel="Folder name"
            emptyLabel="Add Drive folder"
            onChange={(folders) => updateSources({ googleDrive: { ...config.sources.googleDrive, folders } })}
          />
        </SourceCard>

        <SourceCard
          title="Notion"
          description="Bases de datos o páginas donde se guardan actas, notas de llamadas o syncs desde herramientas tipo Granola/Fathom."
          enabled={config.sources.notion.enabled}
          onEnabled={(enabled) => updateSources({ notion: { ...config.sources.notion, enabled } })}
        >
          <ConnectionStrip
            label="Notion API"
            connection={connectionStatus.notion}
            connectedText={connectionStatus.notion?.botName || "Connected in APIs"}
            missingText="Connect Notion in APIs before selecting databases."
          />
          <div className="mb-3 flex flex-wrap gap-2">
            <ActionButton
              onClick={() => {
                setNotionOpen((v) => !v);
                if (!notionOpen && notionItems.length === 0) void searchNotionDatabases();
              }}
              primary={connectionStatus.notion?.status === "ok"}
            >
              Select Notion database
            </ActionButton>
            <ActionButton onClick={() => void searchNotionDatabases()}>
              <RefreshCw className="h-3 w-3" /> Refresh
            </ActionButton>
          </div>
          {notionOpen && (
            <PickerPanel
              query={notionQuery}
              setQuery={setNotionQuery}
              loading={notionLoading}
              error={notionError}
              items={notionItems}
              placeholder="Search databases: meetings, calls, notes..."
              emptyText="No Notion databases found."
              onSearch={searchNotionDatabases}
              onSelect={addNotionDatabase}
            />
          )}
          <NotionDatabaseList
            title="Databases"
            scopes={config.sources.notion.databases}
            properties={notionProperties}
            loadProperties={loadNotionProperties}
            onChange={(databases) => updateSources({ notion: { ...config.sources.notion, databases } })}
          />
          <ScopeList
            title="Pages"
            scopes={config.sources.notion.pages}
            idLabel="Page ID or URL"
            nameLabel="Page name"
            emptyLabel="Add Notion page"
            onChange={(pages) => updateSources({ notion: { ...config.sources.notion, pages } })}
          />
        </SourceCard>

        <SourceCard
          title="Conversation Channels"
          description="Canales donde Sancho debe detectar contexto hablado alrededor de meetings: follow-ups, decisiones confirmadas, owner missing, o cambios de scope."
          enabled={config.sources.slack.enabled || config.sources.discord.enabled}
          onEnabled={(enabled) => updateSources({
            slack: { ...config.sources.slack, enabled },
            discord: { ...config.sources.discord, enabled },
          })}
        >
          {channelOptions.length > 0 && (
            <div className="mb-4 rounded-lg border border-border bg-background p-3">
              <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Quick add from configured channels</div>
              <div className="flex flex-wrap gap-1.5">
                {channelOptions.map((option) => {
                  const selected = isChannelSelected(option);
                  return (
                    <button
                      key={`${option.transport}-${option.id}`}
                      type="button"
                      onClick={() => selected ? removeChannel(option) : addChannel(option)}
                      className={cn(
                        "rounded-full border px-2.5 py-1.5 text-[11px] font-bold",
                        selected ? "border-rust bg-rust/10 text-rust" : "border-border bg-card text-muted-foreground hover:border-rust hover:text-foreground"
                      )}
                    >
                      {option.transport === "discord" ? "Discord" : "Slack"} · {option.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <ScopeList
            title="Slack channels"
            scopes={config.sources.slack.channels}
            idLabel="Channel ID"
            nameLabel="Channel name"
            emptyLabel="Add Slack channel"
            onChange={(channels) => updateSources({ slack: { ...config.sources.slack, channels } })}
          />
          <label className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={config.sources.slack.includeThreads}
              onChange={(e) => updateSources({ slack: { ...config.sources.slack, includeThreads: e.target.checked } })}
            />
            Include Slack threads
          </label>
          <ScopeList
            title="Discord channels"
            scopes={config.sources.discord.channels}
            idLabel="Channel ID"
            nameLabel="Channel name"
            emptyLabel="Add Discord channel"
            onChange={(channels) => updateSources({ discord: { ...config.sources.discord, channels } })}
          />
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={config.sources.discord.includeThreads}
              onChange={(e) => updateSources({ discord: { ...config.sources.discord, includeThreads: e.target.checked } })}
            />
            Include Discord threads
          </label>
        </SourceCard>
      </section>

      <aside className="space-y-3">
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-heading text-base text-navy">Review destination</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Esto no decide que fuentes leer. Solo define donde avisa Sancho cuando encuentre reuniones nuevas o propuestas pendientes.
          </p>
          <div className="mt-3 space-y-3">
            <Field label="Channel for review alerts">
              <input
                value={config.routing.publishChannel}
                onChange={(e) => updateRouting({ publishChannel: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-rust"
                placeholder="intelligence"
              />
            </Field>
            <Field label="Review owner">
              <input
                value={config.routing.reviewOwner}
                onChange={(e) => updateRouting({ reviewOwner: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-rust"
                placeholder="Alfonso"
              />
            </Field>
            <Field label="Timezone">
              <input
                value={config.routing.defaultTimezone}
                onChange={(e) => updateRouting({ defaultTimezone: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-rust"
                placeholder="Europe/Madrid"
              />
            </Field>
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={config.sources.manualUpload.enabled}
                onChange={(e) => updateSources({ manualUpload: { enabled: e.target.checked } })}
              />
              Allow manual upload of meeting notes
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-rust bg-card p-4 shadow-[inset_3px_0_0_var(--rust)]">
          <h3 className="font-heading text-base text-navy">Next ingestion rule</h3>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            Sancho solo debe procesar reuniones que vengan de scopes aprobados aqui. Si una nota aparece fuera de estas carpetas/canales, queda como <strong>needs review</strong>.
          </p>
          <div className="mt-3 rounded-md border border-border bg-background p-3 text-[11px] leading-relaxed text-muted-foreground">
            Drive folders: {config.sources.googleDrive.folders.filter((s) => s.id || s.url).length}<br />
            Notion scopes: {[...config.sources.notion.databases, ...config.sources.notion.pages].filter((s) => s.id || s.url).length}<br />
            Conversation channels: {config.sources.slack.channels.length + config.sources.discord.channels.length}
          </div>
        </section>

        <div className="sticky bottom-3 rounded-lg border border-border bg-card p-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || loading}
            className="w-full rounded-md border border-rust bg-rust px-3 py-2 text-[12px] font-extrabold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : loading ? "Loading..." : "Save sources"}
          </button>
          {savedAt && <p className="mt-2 text-center text-[11px] text-muted-foreground">Saved at {savedAt}</p>}
          {config.updatedAt && !savedAt && <p className="mt-2 text-center text-[11px] text-muted-foreground">Last saved {new Date(config.updatedAt).toLocaleString()}</p>}
        </div>
      </aside>
    </div>
  );
}

function ConnectionStrip({
  label,
  connection,
  connectedText,
  missingText,
}: {
  label: string;
  connection?: ServiceConnection;
  connectedText: string;
  missingText: string;
}) {
  const connected = connection?.status === "ok";
  const statusText = connected ? connectedText : connection?.status || "unknown";
  return (
    <div className={cn(
      "mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-[12px]",
      connected ? "border-sage/30 bg-sage/10" : "border-yellow-400/40 bg-yellow-50"
    )}>
      <div>
        <div className="font-extrabold text-foreground">{label}</div>
        <div className="mt-0.5 text-muted-foreground">
          {connected ? statusText : missingText}
        </div>
      </div>
      <Badge tone={connected ? "ok" : "proposal"}>{connection?.status || "unknown"}</Badge>
    </div>
  );
}

function PickerPanel({
  query,
  setQuery,
  loading,
  error,
  items,
  placeholder,
  emptyText,
  onSearch,
  onSelect,
}: {
  query: string;
  setQuery: (value: string) => void;
  loading: boolean;
  error: string | null;
  items: PickerItem[];
  placeholder: string;
  emptyText: string;
  onSearch: () => void;
  onSelect: (item: PickerItem) => void;
}) {
  return (
    <div className="mb-4 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-col gap-2 md:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSearch();
            }
          }}
          className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-[12px] outline-none focus:border-rust"
          placeholder={placeholder}
        />
        <ActionButton onClick={onSearch} primary>
          {loading ? "Searching..." : "Search"}
        </ActionButton>
      </div>
      {error && (
        <div className="mt-3 rounded-md border border-rust/30 bg-rust/10 p-3 text-[12px] leading-relaxed text-rust">
          {error}
        </div>
      )}
      {!error && !loading && items.length === 0 && (
        <div className="mt-3 rounded-md border border-border bg-card p-3 text-[12px] text-muted-foreground">
          {emptyText}
        </div>
      )}
      {items.length > 0 && (
        <div className="mt-3 max-h-72 overflow-auto rounded-md border border-border bg-card">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="flex w-full items-start justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-background"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold text-foreground">{item.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{item.id}</span>
              </span>
              <span className="rounded-md border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground">
                Select
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotionDatabaseList({
  title,
  scopes,
  properties,
  loadProperties,
  onChange,
}: {
  title: string;
  scopes: SourceScope[];
  properties: Record<string, NotionProperty[]>;
  loadProperties: (databaseId: string) => Promise<void>;
  onChange: (scopes: SourceScope[]) => void;
}) {
  const rows = scopes.length ? scopes : [emptyScope()];
  const updateRow = (index: number, patch: Partial<SourceScope>) => {
    const next = rows.map((scope, i) => i === index ? { ...scope, ...patch } : scope);
    onChange(next);
  };
  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length ? next : [emptyScope()]);
  };

  return (
    <div className="mb-3">
      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="space-y-2">
        {rows.map((scope, index) => {
          const props = scope.id ? (properties[scope.id] || []) : [];
          return (
            <div key={index} className="rounded-lg border border-border bg-background p-3">
              <div className="grid gap-2 md:grid-cols-[1fr_1.15fr_auto]">
                <Field label="Database name">
                  <input
                    value={scope.name}
                    onChange={(e) => updateRow(index, { name: e.target.value })}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-rust"
                    placeholder="Board meetings"
                  />
                </Field>
                <Field label="Database ID or URL">
                  <input
                    value={scope.id || scope.url || ""}
                    onChange={(e) => updateRow(index, { id: e.target.value })}
                    onBlur={() => { if (scope.id) void loadProperties(scope.id); }}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-rust"
                    placeholder="ID or URL"
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="self-end rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-rust"
                >
                  Remove
                </button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_.8fr_1fr]">
                <Field label="Filter property">
                  <select
                    value={scope.filter?.property || ""}
                    onFocus={() => { if (scope.id) void loadProperties(scope.id); }}
                    onChange={(e) => updateRow(index, { filter: { ...(scope.filter || {}), property: e.target.value } })}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-rust"
                  >
                    <option value="">No filter</option>
                    {props.map((prop) => (
                      <option key={prop.id} value={prop.name}>{prop.name} ({prop.type})</option>
                    ))}
                  </select>
                </Field>
                <Field label="Condition">
                  <select
                    value={scope.filter?.operator || "equals"}
                    onChange={(e) => updateRow(index, { filter: { ...(scope.filter || {}), operator: e.target.value } })}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-rust"
                  >
                    <option value="equals">equals</option>
                    <option value="contains">contains</option>
                    <option value="is_not_empty">is not empty</option>
                    <option value="on_or_after">date on/after</option>
                  </select>
                </Field>
                <Field label="Value">
                  <input
                    value={scope.filter?.value || ""}
                    onChange={(e) => updateRow(index, { filter: { ...(scope.filter || {}), value: e.target.value } })}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-rust"
                    placeholder="Meeting Notes / done / 2026-01-01"
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Notes">
                  <input
                    value={scope.notes || ""}
                    onChange={(e) => updateRow(index, { notes: e.target.value })}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-rust"
                    placeholder="Granola sync, Fathom exports, only accepted meetings..."
                  />
                </Field>
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onChange([...rows, emptyScope()])}
        className="mt-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-extrabold text-foreground hover:border-rust"
      >
        + Add Notion database
      </button>
    </div>
  );
}

function SourceCard({
  title,
  description,
  enabled,
  onEnabled,
  footer,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", enabled && "border-rust/60")}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-base text-navy">{title}</h3>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-bold">
          <input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
          Enabled
        </label>
      </div>
      <div className={cn(!enabled && "opacity-55")}>{children}</div>
      {footer && <div className="mt-3 border-t border-border pt-3">{footer}</div>}
    </section>
  );
}

function ScopeList({
  title,
  scopes,
  idLabel,
  nameLabel,
  emptyLabel,
  onChange,
}: {
  title?: string;
  scopes: SourceScope[];
  idLabel: string;
  nameLabel: string;
  emptyLabel: string;
  onChange: (scopes: SourceScope[]) => void;
}) {
  const rows = scopes.length ? scopes : [emptyScope()];
  const updateRow = (index: number, patch: Partial<SourceScope>) => {
    const next = rows.map((scope, i) => i === index ? { ...scope, ...patch } : scope);
    onChange(next);
  };
  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length ? next : [emptyScope()]);
  };

  return (
    <div className="mb-3">
      {title && <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{title}</div>}
      <div className="space-y-2">
        {rows.map((scope, index) => (
          <div key={index} className="grid gap-2 rounded-lg border border-border bg-background p-3 md:grid-cols-[1fr_1.15fr_auto]">
            <Field label={nameLabel}>
              <input
                value={scope.name}
                onChange={(e) => updateRow(index, { name: e.target.value })}
                className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-rust"
                placeholder="Board meetings"
              />
            </Field>
            <Field label={idLabel}>
              <input
                value={scope.id || scope.url || ""}
                onChange={(e) => updateRow(index, { id: e.target.value })}
                className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-rust"
                placeholder="ID or URL"
              />
            </Field>
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="self-end rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-rust"
            >
              Remove
            </button>
            <div className="md:col-span-3">
              <Field label="Notes / filter">
                <input
                  value={scope.notes || ""}
                  onChange={(e) => updateRow(index, { notes: e.target.value })}
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-rust"
                  placeholder="Only docs tagged Meeting Notes, include Fathom exports, etc."
                />
              </Field>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...rows, emptyScope()])}
        className="mt-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-extrabold text-foreground hover:border-rust"
      >
        + {emptyLabel}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function MeetingDetail({ meeting, onView }: { meeting: Meeting; onView: (view: View) => void }) {
  const [tab, setTab] = useState("Summary");
  const tabs = ["Summary", "Transcript / Raw", "Decisions", "Actions", "Insights", "Impact"];
  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-2xl text-navy">{meeting.title}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>{meetingDateTime(meeting)}</span><span>{meeting.source}</span><span>{meeting.participants.join(", ")}</span><span>{meeting.type}</span>
            </div>
          </div>
          <Badge tone={meeting.status === "processed" ? "ok" : "proposal"}>{meeting.status}</Badge>
        </div>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tabs.map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={cn("rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground", tab === item && "border-navy bg-navy text-white")}>{item}</button>
          ))}
        </div>
        {tab === "Impact" ? (
          <div className="grid gap-3 md:grid-cols-2">
            {documents.slice(0, 4).map((doc) => <DocumentTile key={doc.name} doc={doc} />)}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-background p-4 text-[13px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground">{tab}</strong>
            <p className="mt-2">Vista visual de {tab.toLowerCase()} para revisar fuente, decisiones, acciones, insights, quotes y riesgos antes de generar propuestas.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="proposal">StrategyPlan contradiction check</Badge>
              <Badge tone="ok">POV impact</Badge>
              <Badge tone="proposal">proposals generated</Badge>
            </div>
          </div>
        )}
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 font-heading text-base text-navy">Generated Proposals</h3>
        {proposals.map((proposal) => (
          <button key={proposal.id} type="button" onClick={() => onView("proposals")} className="mb-2 w-full rounded-lg border border-border bg-background p-3 text-left hover:border-rust">
            <strong className="text-[13px] text-foreground">{proposal.title}</strong>
            <div className="mt-2 flex gap-2 text-[10px] text-muted-foreground"><Badge tone={proposal.priority === "high" ? "critical" : "proposal"}>{proposal.priority}</Badge><span>{proposal.doc}</span></div>
          </button>
        ))}
      </section>
    </div>
  );
}

function DecisionLog({ onSelect }: { onSelect: (meeting: Meeting) => void }) {
  const statuses = ["Logged", "Linked", "Proposal pending", "Applied", "Rejected"];
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="font-heading text-xl text-navy">Decision Log</h2>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase text-muted-foreground">
        <span>Timeline</span><span>Fecha</span><span>Decision</span><span>Rationale</span><span>Owner</span><span>Fuente</span><span>Documentos afectados</span><span>Estado</span>
      </div>
      <div className="mt-4 border-l-2 border-border pl-4">
        {meetings.flatMap((meeting, index) => [0, 1].map((offset) => ({ meeting, status: statuses[(index + offset) % statuses.length], offset }))).map((row) => (
          <button key={`${row.meeting.id}-${row.offset}`} type="button" onClick={() => onSelect(row.meeting)} className="relative mb-3 w-full rounded-lg border border-border bg-background p-3 text-left before:absolute before:-left-[23px] before:top-4 before:h-2.5 before:w-2.5 before:rounded-full before:bg-rust">
            <div className="font-bold text-foreground">{meetingDateTime(row.meeting)} · {row.meeting.title}</div>
            <p className="mt-1 text-[12px] text-muted-foreground"><strong>Decision:</strong> {row.offset + 1} · <strong>Rationale:</strong> pendiente de validar contra fuente. <strong>Owner:</strong> {row.meeting.participants[0] || "TBD"}.</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>{row.meeting.source}</span><span>StrategyPlan / POV Bank</span><Badge tone={row.status === "Rejected" ? "low" : row.status === "Proposal pending" ? "proposal" : "ok"}>{row.status}</Badge></div>
          </button>
        ))}
      </div>
    </section>
  );
}

function PovDatabase({ meetingTitle, onView }: { meetingTitle: string; onView: (view: View) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {povPillars.map((pillar) => (
        <section key={pillar.name} className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-heading text-base text-navy">{pillar.name}</h3>
          <p className="mt-2 text-[12px] text-muted-foreground"><strong className="text-foreground">Core belief:</strong> {pillar.belief}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["We say yes / no", "Preferred angles", "Evidence", "Quotes from meetings", "Objections detected"].map((tag) => <Badge key={tag} tone="low">{tag}</Badge>)}
          </div>
          <div className="mt-4 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Suggestions from meetings</div>
          {pillar.suggestions.map((suggestion) => (
            <MiniRow key={suggestion} title={suggestion} eyebrow="Suggestion" meta={`Extracted from ${meetingTitle}`} tone={suggestion.includes("contradiction") ? "critical" : "proposal"} />
          ))}
          <ActionButton primary onClick={() => onView("proposals")}>Send to proposal</ActionButton>
        </section>
      ))}
    </div>
  );
}

function DocumentImpact({ onView }: { onView: (view: View) => void }) {
  return (
    <>
      <section className="mb-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-heading text-xl text-navy">Canonical Documents</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">StrategyPlan is Critical and never auto-apply: every pending impact requires review before a document changes.</p>
      </section>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {documents.map((doc) => (
          <section key={doc.name} className={cn("rounded-lg border border-border bg-card p-4", doc.critical && "border-rust shadow-[inset_3px_0_0_var(--rust)]")}>
            <div className="flex items-start justify-between gap-2"><h3 className="font-heading text-base text-navy">{doc.name}</h3><Badge tone={doc.critical ? "critical" : doc.status === "no impact" ? "ok" : "proposal"}>{doc.critical ? "Critical" : doc.status}</Badge></div>
            <p className="mt-2 text-[12px] text-muted-foreground">{doc.area}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-rust" style={{ width: doc.critical ? "78%" : "46%" }} /></div>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>Health: {doc.health}</span><span>{doc.proposals} pending</span><span>{doc.conflicts} conflicts</span></div>
            <div className="mt-3 flex gap-2"><ActionButton primary onClick={() => onView("proposals")}>Review</ActionButton><ActionButton><ExternalLink className="h-3 w-3" /> Open doc</ActionButton></div>
          </section>
        ))}
      </div>
    </>
  );
}

function ProposalReview({ meeting }: { meeting: Meeting }) {
  return (
    <>
      <div className="grid min-h-[520px] gap-3 xl:grid-cols-[1fr_1.1fr_1fr]">
        <ReviewColumn title="Evidence from meeting">
          <div className="font-bold text-foreground">{meeting.title}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>{meetingDateTime(meeting)}</span><span>{meeting.source}</span><span>confidence 92%</span></div>
          <ReviewBox>Decision detected: actualizar documento canonico solo despues de review humana. La evidencia queda enlazada a meeting notes y fuente original.</ReviewBox>
          <ActionButton><ExternalLink className="h-3 w-3" /> Open source meeting</ActionButton>
        </ReviewColumn>
        <ReviewColumn title="Proposed change">
          <Badge tone="critical">high</Badge>
          <ReviewBox><strong>Revisar StrategyPlan por decision reciente</strong><br /><br />Actualizar la seccion de prioridades para reflejar la decision aprobada en la reunion.</ReviewBox>
          <ReviewBox>Para POV Bank: Anadir proof point / Actualizar core belief / Mover evidence / Marcar contradiccion.<br /><br />Para StrategyPlan: Seccion afectada, texto actual, cambio propuesto, razon y fuente.</ReviewBox>
        </ReviewColumn>
        <ReviewColumn title="Affected document">
          <div className="rounded-lg border border-rust bg-background p-3 shadow-[inset_3px_0_0_var(--rust)]">
            <div className="font-bold text-foreground">StrategyPlan</div>
            <p className="mt-1 text-[12px] text-muted-foreground">Documento critico. No hay aplicacion directa sin aprobacion explicita.</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone="critical">Critical</Badge><Badge tone="low">backup required</Badge><Badge tone="low">change-log required</Badge></div>
          </div>
          <ReviewBox><strong>Current text</strong><br />Resumen estrategico actual pendiente de review.<br /><br /><strong>Proposed text</strong><br />Actualizar criterio segun decision aprobada en meeting.</ReviewBox>
        </ReviewColumn>
      </div>
      <footer className="sticky bottom-0 mt-3 flex flex-wrap justify-end gap-2 border-t border-border bg-background py-3">
        <ActionButton><RefreshCw className="h-3 w-3" /> Ask Sancho to revise</ActionButton>
        <ActionButton><X className="h-3 w-3" /> Reject</ActionButton>
        <ActionButton primary><Check className="h-3 w-3" /> Approve</ActionButton>
      </footer>
    </>
  );
}

function Column({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <section className="min-w-0 border-b border-border lg:border-b-0 lg:border-r lg:last:border-r-0">
      <div className="flex h-11 items-center justify-between border-b border-border px-3 text-[12px] font-extrabold text-foreground">
        <span>{title}</span><span>{meta}</span>
      </div>
      <div className="max-h-[580px] overflow-auto p-3">{children}</div>
    </section>
  );
}

function MeetingCard({ meeting, active, onClick }: { meeting: Meeting; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("mb-2 w-full rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-rust", active && "border-rust bg-card shadow-[inset_3px_0_0_var(--rust)]", meeting.status === "needs review" && "bg-[#FFF8E5]")}>
      <div className="font-bold text-foreground">{meeting.title}</div>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>{meetingDateTime(meeting)}</span><span>{meeting.source}</span><Badge tone={meeting.status === "processed" ? "ok" : meeting.status === "needs review" ? "proposal" : "low"}>{meeting.status}</Badge></div>
      <div className="mt-2 text-[12px] text-muted-foreground">{meeting.type} · {meeting.decisions} decisions · {meeting.actions} actions</div>
    </button>
  );
}

function MiniRow({ title, eyebrow, meta, tone }: { title: string; eyebrow: string; meta: string; tone: string }) {
  return (
    <div className="flex gap-2 border-b border-border py-2 last:border-b-0">
      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-rust/10 text-rust", tone === "critical" && "bg-rust/15")}>{tone === "critical" ? "!" : <ChevronRight className="h-3 w-3" />}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{eyebrow}</div>
        <div className="text-[12px] font-bold leading-snug text-foreground">{title}</div>
        <div className="mt-1 text-[10px] text-muted-foreground">{meta}</div>
      </div>
    </div>
  );
}

function DocumentTile({ doc }: { doc: typeof documents[number] }) {
  return (
    <div className={cn("rounded-lg border border-border bg-background p-3", doc.critical && "border-rust")}>
      <div className="flex items-start justify-between gap-2"><strong className="text-[13px]">{doc.name}</strong><Badge tone={doc.critical ? "critical" : "proposal"}>{doc.status}</Badge></div>
      <p className="mt-1 text-[11px] text-muted-foreground">{doc.area}</p>
      <div className="mt-2 text-[10px] text-muted-foreground">POV affected · contradiction check · proposals generated</div>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="min-w-[92px] rounded-lg border border-border bg-card px-3 py-2">
      <div className="font-heading text-[21px] leading-none text-navy">{value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: "ok" | "proposal" | "critical" | "low" }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide",
      tone === "ok" && "border-sage/30 bg-sage/10 text-sage",
      tone === "proposal" && "border-yellow-400/40 bg-yellow-100 text-yellow-800",
      tone === "critical" && "border-rust/40 bg-rust/10 text-rust",
      tone === "low" && "border-border bg-background text-muted-foreground"
    )}>{children}</span>
  );
}

function ActionButton({ children, primary, disabled, onClick }: { children: ReactNode; primary?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-extrabold text-foreground",
        primary && "border-rust bg-rust text-white",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      {children}
    </button>
  );
}

function ReviewColumn({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-lg border border-border bg-card p-4"><h3 className="mb-3 font-heading text-base text-navy">{title}</h3>{children}</section>;
}

function ReviewBox({ children }: { children: ReactNode }) {
  return <div className="mt-3 rounded-lg border border-border bg-background p-3 text-[12px] leading-relaxed text-muted-foreground">{children}</div>;
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
      <MessageSquareText className="mx-auto mb-3 h-8 w-8 text-rust" />
      <strong className="block text-foreground">No meetings processed yet</strong>
      <div className="mt-3 flex justify-center gap-2">
        <ActionButton primary><RefreshCw className="h-3 w-3" /> Connect source</ActionButton>
        <ActionButton><FileText className="h-3 w-3" /> Upload notes</ActionButton>
      </div>
    </div>
  );
}
