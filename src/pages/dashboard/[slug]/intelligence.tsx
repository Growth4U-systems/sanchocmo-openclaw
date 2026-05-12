import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Head from "next/head";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  ExternalLink,
  FileText,
  MessageSquareText,
  RefreshCw,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useClients } from "@/hooks/useClients";
import { useOpenChat } from "@/hooks/useChat";
import { buildTaskThread } from "@/lib/chat-openers";
import { cn } from "@/lib/utils";
import type { Project, Task } from "@/types";

type View = "overview" | "sources" | "meetings" | "decisions" | "pov" | "impact" | "proposals";
type Status = "processed" | "needs review" | "duplicate" | "low confidence";
type ImpactStatus = "no impact" | "possible update" | "conflict" | "proposal ready";
type Priority = "high" | "medium" | "low";

interface Meeting {
  id: string;
  title: string;
  date: string;
  time: string;
  source: string;
  status: Status;
  type: string;
  participants: string[];
  decisions: number;
  actions: number;
  file?: string;
  sourceId?: string;
}

interface SourceScope {
  id: string;
  name: string;
  url?: string;
  notes?: string;
  filter?: {
    property?: string;
    propertyId?: string;
    propertyType?: string;
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
  slack?: ServiceConnection;
  discord?: ServiceConnection;
}

interface SetupTaskInfo {
  project: Project;
  task: Task;
  projectDirName: string;
  legacyTaskCount: number;
  created: boolean;
}

interface IntelligenceItem {
  type: "Decision" | "Action" | "Insight" | "Quote" | "Risk" | "Run";
  title: string;
  source: string;
  date: string;
  confidence: string;
  tone: "ok" | "warn" | "critical" | "proposal";
}

interface DecisionEntry {
  date: string;
  decision: string;
  rationale: string;
  owner: string;
  source: string;
  documents: string[];
  status: "Logged" | "Linked" | "Proposal pending" | "Applied" | "Rejected";
}

interface ProposalEntry {
  id: string;
  title: string;
  priority: Priority;
  doc: string;
  source: string;
}

interface DocumentRecord {
  name: string;
  area: string;
  health: string;
  status: ImpactStatus;
  proposals: number;
  conflicts: number;
  critical?: boolean;
}

interface MeetingIntelligenceState {
  meetings: Meeting[];
  totals: {
    meetings: number;
    decisions: number;
    actions: number;
  };
  intelligence: IntelligenceItem[];
  decisions: DecisionEntry[];
  proposals: ProposalEntry[];
  lastSync: string | null;
  lastCheckStatus: string | null;
  lastRun: {
    date: string;
    status: string;
    file: string;
    contentPreview?: string;
  } | null;
}

const fallbackMeetings: Meeting[] = [
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
  return meeting.time ? `${meeting.date} · ${meeting.time}` : meeting.date;
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

function normalizeClientScope(input: unknown): SourceScope {
  if (!input || typeof input !== "object") return emptyScope();
  const scope = input as Record<string, unknown>;
  const id = typeof scope.id_dashed === "string" ? scope.id_dashed : typeof scope.id === "string" ? scope.id : "";
  return {
    id,
    name: typeof scope.name === "string" ? scope.name : "",
    url: typeof scope.url === "string" ? scope.url : "",
    notes: typeof scope.notes === "string"
      ? scope.notes
      : typeof scope.description === "string"
        ? scope.description
        : "",
    filter: scope.filter && typeof scope.filter === "object" ? scope.filter as SourceScope["filter"] : undefined,
  };
}

function normalizeClientScopes(input: unknown, fallback: SourceScope[], keepEmpty = true) {
  const scopes = Array.isArray(input) ? input.map(normalizeClientScope) : fallback;
  if (scopes.length) return scopes;
  return keepEmpty ? [emptyScope()] : [];
}

function normalizeClientConfig(slug: string, input: Partial<MeetingIntelligenceConfig> & Record<string, unknown>): MeetingIntelligenceConfig {
  const base = localDefaultConfig(slug);
  const rawSources = (input.sources && typeof input.sources === "object" ? input.sources : {}) as Record<string, unknown>;
  const legacyDrive = (rawSources.google_drive && typeof rawSources.google_drive === "object" ? rawSources.google_drive : {}) as Record<string, unknown>;
  const rawGoogleDrive = (rawSources.googleDrive && typeof rawSources.googleDrive === "object" ? rawSources.googleDrive : {}) as Partial<MeetingIntelligenceConfig["sources"]["googleDrive"]>;
  const rawNotion = (rawSources.notion && typeof rawSources.notion === "object" ? rawSources.notion : {}) as Partial<MeetingIntelligenceConfig["sources"]["notion"]>;
  const rawSlack = (rawSources.slack && typeof rawSources.slack === "object" ? rawSources.slack : {}) as Partial<MeetingIntelligenceConfig["sources"]["slack"]>;
  const rawDiscord = (rawSources.discord && typeof rawSources.discord === "object" ? rawSources.discord : {}) as Partial<MeetingIntelligenceConfig["sources"]["discord"]>;
  const rawManualUpload = (rawSources.manualUpload && typeof rawSources.manualUpload === "object" ? rawSources.manualUpload : {}) as Partial<MeetingIntelligenceConfig["sources"]["manualUpload"]>;

  return {
    ...base,
    ...input,
    slug,
    enabled: Boolean(input.enabled ?? base.enabled),
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : base.updatedAt,
    sources: {
      googleDrive: {
        ...base.sources.googleDrive,
        ...rawGoogleDrive,
        enabled: Boolean(rawGoogleDrive.enabled ?? legacyDrive.enabled ?? base.sources.googleDrive.enabled),
        includeSubfolders: Boolean(rawGoogleDrive.includeSubfolders ?? base.sources.googleDrive.includeSubfolders),
        folders: normalizeClientScopes(rawGoogleDrive.folders ?? legacyDrive.folders, base.sources.googleDrive.folders),
      },
      notion: {
        ...base.sources.notion,
        ...rawNotion,
        enabled: Boolean(rawNotion.enabled ?? base.sources.notion.enabled),
        databases: normalizeClientScopes(rawNotion.databases, base.sources.notion.databases),
        pages: normalizeClientScopes(rawNotion.pages, [], false),
      },
      slack: {
        ...base.sources.slack,
        ...rawSlack,
        enabled: Boolean(rawSlack.enabled ?? base.sources.slack.enabled),
        channels: normalizeClientScopes(rawSlack.channels, [], false).filter((scope) => scope.id || scope.name || scope.url),
        includeThreads: Boolean(rawSlack.includeThreads ?? base.sources.slack.includeThreads),
      },
      discord: {
        ...base.sources.discord,
        ...rawDiscord,
        enabled: Boolean(rawDiscord.enabled ?? base.sources.discord.enabled),
        channels: normalizeClientScopes(rawDiscord.channels, [], false).filter((scope) => scope.id || scope.name || scope.url),
        includeThreads: Boolean(rawDiscord.includeThreads ?? base.sources.discord.includeThreads),
      },
      manualUpload: {
        ...base.sources.manualUpload,
        ...rawManualUpload,
        enabled: Boolean(rawManualUpload.enabled ?? base.sources.manualUpload.enabled),
      },
    },
    routing: { ...base.routing, ...(input.routing || {}) },
  };
}

const fallbackIntelligence: IntelligenceItem[] = [
  { type: "Decision", title: "Actualizar criterio operativo desde la reunion", source: "Drive", date: "2026-03-18", confidence: "92%", tone: "ok" },
  { type: "Decision", title: "Revisar implicaciones para StrategyPlan", source: "Drive", date: "2026-03-18", confidence: "86%", tone: "critical" },
  { type: "Insight", title: "Convertir insight en propuesta para POV", source: "Notion", date: "2026-03-10", confidence: "81%", tone: "proposal" },
  { type: "Action", title: "Asignar owner y deadline", source: "Slack", date: "2026-03-04", confidence: "78%", tone: "warn" },
  { type: "Quote", title: "Nuevo lenguaje de cliente para objeciones", source: "Manual", date: "2026-02-27", confidence: "73%", tone: "ok" },
  { type: "Risk", title: "Posible contradiccion con posicionamiento", source: "Notion", date: "2026-03-10", confidence: "69%", tone: "critical" },
];

const documents: DocumentRecord[] = [
  { name: "StrategyPlan", area: "Prioridades, horizonte y apuestas activas", health: "Needs review", status: "conflict" as ImpactStatus, proposals: 2, conflicts: 1, critical: true },
  { name: "Company Brief", area: "Contexto canonico de compania", health: "Stable", status: "possible update" as ImpactStatus, proposals: 1, conflicts: 0 },
  { name: "Positioning", area: "Diferenciacion y tesis comercial", health: "Watch", status: "possible update" as ImpactStatus, proposals: 2, conflicts: 1 },
  { name: "Brand Voice", area: "Lenguaje, tono y reglas editoriales", health: "Stable", status: "no impact" as ImpactStatus, proposals: 0, conflicts: 0 },
  { name: "Content Pillars", area: "Temas, angulos y prioridades", health: "Proposal ready", status: "proposal ready" as ImpactStatus, proposals: 3, conflicts: 0 },
  { name: "POV Bank", area: "Creencias, pruebas, objeciones y quotes", health: "Needs review", status: "proposal ready" as ImpactStatus, proposals: 4, conflicts: 1 },
];

const fallbackProposals: ProposalEntry[] = [
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
  const openChat = useOpenChat();
  const [view, setView] = useState<View>("overview");
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting>(fallbackMeetings[0]);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sourceConfig, setSourceConfig] = useState<MeetingIntelligenceConfig>(() => localDefaultConfig(""));
  const [meetingState, setMeetingState] = useState<MeetingIntelligenceState | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesSaving, setSourcesSaving] = useState(false);
  const [sourcesSavedAt, setSourcesSavedAt] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({});
  const [setupTask, setSetupTask] = useState<SetupTaskInfo | null>(null);
  const [setupTaskLoading, setSetupTaskLoading] = useState(false);
  const [setupTaskSaving, setSetupTaskSaving] = useState(false);

  const clientName = useMemo(() => {
    const client = clients?.find((c) => c.slug === slug);
    return client?.name || slug.replace(/-/g, " ");
  }, [clients, slug]);
  const effectiveSourceConfig = useMemo(
    () => normalizeClientConfig(slug, sourceConfig as Partial<MeetingIntelligenceConfig> & Record<string, unknown>),
    [slug, sourceConfig]
  );
  const activeMeetings = meetingState ? meetingState.meetings : fallbackMeetings;
  const activeIntelligence = meetingState ? meetingState.intelligence : fallbackIntelligence;
  const activeProposals = meetingState ? meetingState.proposals : fallbackProposals;
  const activeDecisions = meetingState ? meetingState.decisions : [];
  const activeDocuments = useMemo(() => documents.map((doc) => {
    const proposalCount = activeProposals.filter((proposal) => proposal.doc === doc.name).length;
    return {
      ...doc,
      proposals: proposalCount,
      conflicts: 0,
      health: proposalCount > 0 ? "Proposal pending" : doc.critical ? "Critical, no pending impact" : "Stable",
      status: proposalCount > 0 ? "proposal ready" as ImpactStatus : "no impact" as ImpactStatus,
    };
  }), [activeProposals]);
  const activeTotals = {
    meetings: meetingState?.totals.meetings ?? activeMeetings.length,
    decisions: meetingState?.totals.decisions ?? activeMeetings.reduce((sum, meeting) => sum + meeting.decisions, 0),
    actions: meetingState?.totals.actions ?? activeMeetings.reduce((sum, meeting) => sum + meeting.actions, 0),
  };

  const filteredMeetings = sourceFilter === "all"
    ? activeMeetings
    : activeMeetings.filter((meeting) => meeting.source === sourceFilter || meeting.source.includes(sourceFilter));

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
    setSetupTaskLoading(true);
    Promise.all([
      fetch(`/api/meeting-intelligence/config?slug=${slug}`).then((res) => res.json()),
      fetch(`/api/meeting-intelligence/status?slug=${slug}`).then((res) => res.json()).catch(() => ({ services: {} })),
      fetch(`/api/meeting-intelligence/setup-task?slug=${slug}`).then((res) => res.json()).catch(() => ({ setupTask: null })),
      fetch(`/api/meeting-intelligence/state?slug=${slug}&v=${Date.now()}`).then((res) => res.json()).catch(() => ({ meetings: [], intelligence: [], decisions: [], proposals: [], totals: null })),
    ])
      .then(([data, status, setup, state]) => {
        if (!cancelled) setSourceConfig(normalizeClientConfig(slug, data.config || localDefaultConfig(slug)));
        if (!cancelled) setConnectionStatus(status.services || {});
        if (!cancelled) setSetupTask(setup.setupTask || null);
        if (!cancelled) {
          const nextState = {
            meetings: Array.isArray(state.meetings) ? state.meetings : [],
            totals: state.totals || { meetings: 0, decisions: 0, actions: 0 },
            intelligence: Array.isArray(state.intelligence) ? state.intelligence : [],
            decisions: Array.isArray(state.decisions) ? state.decisions : [],
            proposals: Array.isArray(state.proposals) ? state.proposals : [],
            lastSync: state.lastSync || null,
            lastCheckStatus: state.lastCheckStatus || null,
            lastRun: state.lastRun || null,
          } satisfies MeetingIntelligenceState;
          setMeetingState(nextState);
          if (nextState.meetings[0]) setSelectedMeeting(nextState.meetings[0]);
        }
      })
      .catch(() => {
        if (!cancelled) setSourceConfig(localDefaultConfig(slug));
        if (!cancelled) setMeetingState(null);
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
        if (!cancelled) setSetupTaskLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  async function saveSourceConfig() {
    if (!slug) return;
    setSourcesSaving(true);
    const res = await fetch(`/api/meeting-intelligence/config?slug=${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: effectiveSourceConfig }),
    });
    const data = await res.json();
    if (data.config) {
      setSourceConfig(normalizeClientConfig(slug, data.config));
      setSourcesSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }
    setSourcesSaving(false);
  }

  async function ensureSetupTask() {
    if (!slug) return null;
    setSetupTaskSaving(true);
    const res = await fetch(`/api/meeting-intelligence/setup-task?slug=${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    const next = data.setupTask || null;
    setSetupTask(next);
    setSetupTaskSaving(false);
    return next as SetupTaskInfo | null;
  }

  async function openSetupTaskChat() {
    if (!slug) return;
    const info = setupTask || await ensureSetupTask();
    if (!info) return;
    openChat(slug, buildTaskThread(slug, info.task.id, info.task.name, info.project.id, {
      taskSkill: info.task.skill,
      taskChannel: info.task.channel,
      taskStatus: info.task.status,
      taskType: info.task.type,
      pillar: info.task.pillar,
      deliverableFile: typeof info.task.deliverable_file === "string" ? info.task.deliverable_file : undefined,
    }));
  }

  const configuredDriveCount = effectiveSourceConfig.sources.googleDrive.enabled
    ? effectiveSourceConfig.sources.googleDrive.folders.filter((s) => s.id || s.url).length
    : 0;
  const configuredNotionCount = effectiveSourceConfig.sources.notion.enabled
    ? [...effectiveSourceConfig.sources.notion.databases, ...effectiveSourceConfig.sources.notion.pages].filter((s) => s.id || s.url).length
    : 0;
  const configuredConversationCount =
    (effectiveSourceConfig.sources.slack.enabled ? effectiveSourceConfig.sources.slack.channels.length : 0) +
    (effectiveSourceConfig.sources.discord.enabled ? effectiveSourceConfig.sources.discord.channels.length : 0);
  const configuredSourceCount = configuredDriveCount + configuredNotionCount + configuredConversationCount;
  const setupConfigured = configuredSourceCount > 0;

  return (
    <DashboardLayout>
      <Head>
        <title>Intelligence — {clientName} — Mission Control</title>
      </Head>
      <div className="space-y-5">
        <header className="border-b-2 border-border pb-5">
          <div className="flex items-start justify-between gap-4">
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
          </div>
          <MetricStrip
            stats={[
              { value: activeTotals.meetings, label: "Meetings" },
              { value: activeTotals.decisions, label: "Decisions" },
              { value: activeTotals.actions, label: "Actions" },
              { value: activeProposals.length, label: "Proposals" },
              { value: configuredSourceCount, label: "Sources" },
            ]}
          />
        </header>

        <SetupTaskCard
          slug={slug}
          setupTask={setupTask}
          loading={setupTaskLoading}
          saving={setupTaskSaving}
          compact={setupConfigured}
          configuredSourceCount={configuredSourceCount}
          googleStatus={connectionStatus.googleWorkspace?.status || "unknown"}
          notionStatus={connectionStatus.notion?.status || "unknown"}
          onOpenChat={() => void openSetupTaskChat()}
        />

        <nav className="flex gap-2 overflow-x-auto">
          {viewLabels.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setView(tab.key);
                window.history.replaceState(null, "", `#${viewToHash(tab.key)}`);
              }}
              className={cn(
                "whitespace-nowrap rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-all",
                view === tab.key
                  ? "border-rust bg-rust text-white"
                  : "border-border bg-transparent text-muted-foreground hover:border-rust hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {view === "overview" && (
          <Overview
            meetings={filteredMeetings}
            intelligence={activeIntelligence}
            documents={activeDocuments}
            proposals={activeProposals}
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
            config={effectiveSourceConfig}
            connectionStatus={connectionStatus}
            loading={sourcesLoading}
            saving={sourcesSaving}
            savedAt={sourcesSavedAt}
            setConfig={setSourceConfig}
            onSave={saveSourceConfig}
            onOpenSetupChat={() => void openSetupTaskChat()}
          />
        )}
        {view === "meetings" && <MeetingDetail meeting={selectedMeeting} documents={activeDocuments} proposals={activeProposals} onView={setView} />}
        {view === "decisions" && <DecisionLog decisions={activeDecisions} meetings={activeMeetings} onSelect={(meeting) => { setSelectedMeeting(meeting); setView("meetings"); }} />}
        {view === "pov" && <PovDatabase meetingTitle={selectedMeeting.title} onView={setView} />}
        {view === "impact" && <DocumentImpact documents={activeDocuments} onView={setView} />}
        {view === "proposals" && <ProposalReview meeting={selectedMeeting} proposals={activeProposals} />}
      </div>
    </DashboardLayout>
  );
}

function Overview({
  meetings,
  intelligence,
  documents,
  proposals,
  selectedMeetingId,
  sourceFilter,
  onFilter,
  onSelect,
  onView,
}: {
  meetings: Meeting[];
  intelligence: IntelligenceItem[];
  documents: DocumentRecord[];
  proposals: ProposalEntry[];
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
          {["all", "Google Drive", "Notion", "Slack", "Discord", "Manual"].map((source) => (
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
        {intelligence.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background p-4 text-[12px] leading-relaxed text-muted-foreground">
            No extracted intelligence yet. Run the setup task scan to populate decisions, actions, insights, quotes and risks.
          </div>
        ) : intelligence.map((item) => (
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
        {proposals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background p-4 text-[12px] leading-relaxed text-muted-foreground">
            No pending proposals. Sancho creates proposals only after a reviewed scan finds document impact.
          </div>
        ) : proposals.map((proposal) => (
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

function SetupTaskCard({
  slug,
  setupTask,
  loading,
  saving,
  compact,
  configuredSourceCount,
  googleStatus,
  notionStatus,
  onOpenChat,
}: {
  slug: string;
  setupTask: SetupTaskInfo | null;
  loading: boolean;
  saving: boolean;
  compact: boolean;
  configuredSourceCount: number;
  googleStatus: string;
  notionStatus: string;
  onOpenChat: () => void;
}) {
  const taskHref = setupTask
    ? `/dashboard/${slug}/projects/${setupTask.project.id}/tasks/${setupTask.task.id}`
    : "";
  const sourceTone = configuredSourceCount > 1 ? "ok" : "proposal";
  const sourceLabel = configuredSourceCount > 1 ? `${configuredSourceCount} sources configured` : "sources pending";

  const description = compact
    ? "Disponible para reabrir el setup desde el chat de la tarea cuando haya que cambiar fuentes o filtros."
    : "El setup vive como tarea normal de Foundation/Onboarding. Desde su chat, Sancho verifica APIs, busca carpetas con Google Workspace, selecciona Notion, guarda filtros y ejecuta el primer run.";

  return (
    <section
      className="rounded-sc-md border-[2px] p-3"
      style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-base text-navy">Setup task</h2>
            <Badge tone={setupTask ? "ok" : "proposal"}>{setupTask ? setupTask.task.status : "not created"}</Badge>
            <Badge tone={sourceTone}>{sourceLabel}</Badge>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {description}
          </p>
          <div className={cn("flex flex-wrap gap-1.5 text-[10px] text-muted-foreground", compact ? "mt-1" : "mt-2")}>
            <span className="rounded-full border border-border bg-background px-2 py-1">Google: {googleStatus}</span>
            <span className="rounded-full border border-border bg-background px-2 py-1">Notion: {notionStatus}</span>
            {setupTask?.legacyTaskCount ? (
              <span className="rounded-full border border-border bg-background px-2 py-1">legacy untouched: {setupTask.legacyTaskCount}</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {setupTask ? (
            <>
              <Link
                href={taskHref}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-[12px] font-extrabold text-foreground hover:border-rust"
              >
                <FileText className="h-3 w-3" /> Open task
              </Link>
              <ActionButton primary onClick={onOpenChat}>
                <MessageSquareText className="h-3 w-3" /> Open setup chat
              </ActionButton>
            </>
          ) : (
            <ActionButton primary disabled={loading || saving} onClick={onOpenChat}>
              {loading ? "Checking..." : saving ? "Creating..." : "Create + open setup chat"}
            </ActionButton>
          )}
        </div>
      </div>
    </section>
  );
}

function SourcesSetup({
  config,
  connectionStatus,
  loading,
  saving,
  savedAt,
  setConfig,
  onSave,
  onOpenSetupChat,
}: {
  config: MeetingIntelligenceConfig;
  connectionStatus: ConnectionStatus;
  loading: boolean;
  saving: boolean;
  savedAt: string | null;
  setConfig: (config: MeetingIntelligenceConfig) => void;
  onSave: () => void;
  onOpenSetupChat: () => void;
}) {
  const update = (next: Partial<MeetingIntelligenceConfig>) => setConfig({ ...config, ...next });
  const updateSources = (sources: Partial<MeetingIntelligenceConfig["sources"]>) => setConfig({
    ...config,
    sources: { ...config.sources, ...sources },
  });
  const driveConnected = connectionStatus.googleWorkspace?.status === "ok" || connectionStatus.googleWorkspace?.status === "connected";
  const selectedNotionDatabases = useMemo(
    () => config.sources.notion.databases.filter((database) => database.id || database.url),
    [config.sources.notion.databases]
  );

  return (
    <div className="space-y-4">
      <section
        className="rounded-sc-md border-[2px] p-4"
        style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl text-navy">Meeting Sources</h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
              Aqui se ve que fuentes reales puede leer Sancho. Para cambiarlas, abre el hilo de setup y el agente las valida con la skill meeting-intelligence.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border-2 border-border bg-background px-3 py-2 text-[12px] font-bold">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => update({ enabled: e.target.checked })}
              />
              Meeting Intelligence active
            </label>
            <ActionButton primary onClick={onOpenSetupChat}>
              <MessageSquareText className="h-3 w-3" /> Change with Sancho
            </ActionButton>
          </div>
        </div>
      </section>

      <SourceCard
        title="Google Drive"
        description="Carpetas donde viven notas, docs exportados, transcripciones o resumenes de meetings."
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
          driveConnected ? "border-sage/30 bg-sage/10 text-muted-foreground" : "border-yellow-400/40 bg-yellow-50 text-muted-foreground"
        )}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong className="block text-foreground">Agent-driven Google Workspace</strong>
              <span>
                {driveConnected
                  ? "Workspace/GOG is connected. Sancho can browse Drive from the setup chat and save approved folder IDs here."
                  : "Connect Google Workspace in APIs before Sancho browses Drive folders."}
              </span>
            </div>
            <Badge tone={driveConnected ? "ok" : "proposal"}>
              {driveConnected ? "connected" : "setup needed"}
            </Badge>
          </div>
        </div>
        <div className="mb-3">
          <ActionButton primary onClick={onOpenSetupChat}>
            <MessageSquareText className="h-3 w-3" /> Change Drive sources with Sancho
          </ActionButton>
        </div>
        <SourceSummaryList
          title="Approved Drive folders"
          scopes={config.sources.googleDrive.folders}
          emptyText="No Drive folders approved yet. Open the setup chat so Sancho can search Drive and save the exact folder IDs."
        />
      </SourceCard>

      <SourceCard
        title="Notion"
        description="Bases de datos donde se guardan actas, notas de llamadas o syncs desde herramientas tipo Granola/Fathom."
        enabled={config.sources.notion.enabled}
        onEnabled={(enabled) => updateSources({ notion: { ...config.sources.notion, enabled } })}
      >
        <ConnectionStrip
          label="Notion API"
          connection={connectionStatus.notion}
          connectedText={connectionStatus.notion?.botName || "Connected in APIs"}
          missingText="Connect Notion in APIs before selecting databases."
        />
        <div className="mb-3">
          <ActionButton primary onClick={onOpenSetupChat}>
            <MessageSquareText className="h-3 w-3" /> Change Notion sources with Sancho
          </ActionButton>
        </div>
        <SourceSummaryList
          title="Approved Notion databases"
          scopes={selectedNotionDatabases}
          emptyText="No Notion database selected yet. Open the setup chat so Sancho can validate access and save filters such as clients relation."
        />
      </SourceCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SourceCard
          title="Slack"
          description="Canales conectados en APIs donde Sancho debe detectar follow-ups, decisiones confirmadas y cambios de scope."
          enabled={config.sources.slack.enabled}
          onEnabled={(enabled) => updateSources({ slack: { ...config.sources.slack, enabled } })}
        >
          <ConnectionStrip
            label="Slack API"
            connection={connectionStatus.slack}
            connectedText="Connected in APIs"
            missingText="Connect Slack in APIs before selecting channels."
          />
          <AgenticChannelSummary
            label="Slack"
            channels={config.sources.slack.channels}
            includeThreads={config.sources.slack.includeThreads}
            onOpenSetupChat={onOpenSetupChat}
          />
        </SourceCard>

        <SourceCard
          title="Discord"
          description="Canales conectados en APIs para contexto conversacional alrededor de meetings y revisiones."
          enabled={config.sources.discord.enabled}
          onEnabled={(enabled) => updateSources({ discord: { ...config.sources.discord, enabled } })}
        >
          <ConnectionStrip
            label="Discord API"
            connection={connectionStatus.discord}
            connectedText="Connected in APIs"
            missingText="Connect Discord in APIs before selecting channels."
          />
          <AgenticChannelSummary
            label="Discord"
            channels={config.sources.discord.channels}
            includeThreads={config.sources.discord.includeThreads}
            onOpenSetupChat={onOpenSetupChat}
          />
        </SourceCard>
      </div>

      <div
        className="rounded-sc-md border-[2px] p-3"
        style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-muted-foreground">
            These sources only decide where Sancho reads meeting context. Document changes remain review-first.
          </p>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || loading}
            className="rounded-lg border-2 border-rust bg-rust px-5 py-2 text-[12px] font-extrabold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : loading ? "Loading..." : "Save sources"}
          </button>
        </div>
        {savedAt && <p className="mt-2 text-right text-[11px] text-muted-foreground">Saved at {savedAt}</p>}
        {config.updatedAt && !savedAt && <p className="mt-2 text-right text-[11px] text-muted-foreground">Last saved {new Date(config.updatedAt).toLocaleString()}</p>}
      </div>
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
  const connected = connection?.status === "ok" || connection?.status === "connected";
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
    <section
      className={cn("rounded-sc-md border-[2px] p-4", enabled && "shadow-[inset_4px_0_0_var(--rust)]")}
      style={{ background: "var(--sc-paper-3)", borderColor: enabled ? "var(--sc-rust-500)" : "var(--sc-ink)", boxShadow: enabled ? "var(--pop-xs), inset 4px 0 0 var(--rust)" : "var(--pop-xs)" }}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-base text-navy">{title}</h3>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <label className="flex items-center gap-2 rounded-md border-2 border-border bg-background px-2.5 py-1.5 text-[11px] font-bold">
          <input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
          Enabled
        </label>
      </div>
      <div className={cn(!enabled && "opacity-55")}>{children}</div>
      {footer && <div className="mt-3 border-t border-border pt-3">{footer}</div>}
    </section>
  );
}

function AgenticChannelSummary({
  label,
  channels,
  includeThreads,
  onOpenSetupChat,
}: {
  label: "Slack" | "Discord";
  channels: SourceScope[];
  includeThreads: boolean;
  onOpenSetupChat: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
            Approved {label} channels
          </div>
          <Badge tone={includeThreads ? "ok" : "proposal"}>{includeThreads ? "threads included" : "threads off"}</Badge>
        </div>
        <SourceSummaryRows
          scopes={channels}
          emptyText={`No ${label} channels approved yet. Open the setup chat so Sancho can inspect the connected workspace and save the right channel IDs.`}
        />
      </div>
      <ActionButton primary onClick={onOpenSetupChat}>
        <MessageSquareText className="h-3 w-3" /> Change {label} channels with Sancho
      </ActionButton>
    </div>
  );
}

function SourceSummaryList({
  title,
  scopes,
  emptyText,
}: {
  title?: string;
  scopes: SourceScope[];
  emptyText: string;
}) {
  return (
    <div className="mb-3">
      {title && <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{title}</div>}
      <SourceSummaryRows scopes={scopes} emptyText={emptyText} />
    </div>
  );
}

function SourceSummaryRows({
  scopes,
  emptyText,
}: {
  scopes: SourceScope[];
  emptyText: string;
}) {
  const rows = scopes.filter((scope) => scope.id || scope.url || scope.name);
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-4 text-[12px] leading-relaxed text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((scope, index) => (
        <div key={`${scope.id || scope.url || scope.name}-${index}`} className="rounded-lg border border-border bg-background p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-extrabold text-foreground">{scope.name || "Approved source"}</div>
              <div className="mt-1 max-w-full truncate text-[10px] text-muted-foreground">{scope.id || scope.url || "No ID saved"}</div>
            </div>
            {scope.filter?.property ? <Badge tone="proposal">{scope.filter.property}</Badge> : null}
          </div>
          {scope.filter?.property ? (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Filter: {scope.filter.property} {scope.filter.operator || "equals"} {scope.filter.value || "configured in setup"}
            </p>
          ) : null}
          {scope.notes ? (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{scope.notes}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MeetingDetail({
  meeting,
  documents,
  proposals,
  onView,
}: {
  meeting: Meeting;
  documents: DocumentRecord[];
  proposals: ProposalEntry[];
  onView: (view: View) => void;
}) {
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
        {proposals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background p-4 text-[12px] leading-relaxed text-muted-foreground">
            No proposals generated for the current reviewed intelligence yet.
          </div>
        ) : proposals.map((proposal) => (
          <button key={proposal.id} type="button" onClick={() => onView("proposals")} className="mb-2 w-full rounded-lg border border-border bg-background p-3 text-left hover:border-rust">
            <strong className="text-[13px] text-foreground">{proposal.title}</strong>
            <div className="mt-2 flex gap-2 text-[10px] text-muted-foreground"><Badge tone={proposal.priority === "high" ? "critical" : "proposal"}>{proposal.priority}</Badge><span>{proposal.doc}</span></div>
          </button>
        ))}
      </section>
    </div>
  );
}

function DecisionLog({
  decisions,
  meetings,
  onSelect,
}: {
  decisions: DecisionEntry[];
  meetings: Meeting[];
  onSelect: (meeting: Meeting) => void;
}) {
  const meetingBySource = (source: string) => meetings.find((meeting) => source.includes(meeting.title) || source.includes(meeting.id)) || meetings[0];
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="font-heading text-xl text-navy">Decision Log</h2>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase text-muted-foreground">
        <span>Timeline</span><span>Fecha</span><span>Decision</span><span>Rationale</span><span>Owner</span><span>Fuente</span><span>Documentos afectados</span><span>Estado</span>
      </div>
      <div className="mt-4 border-l-2 border-border pl-4">
        {decisions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background p-4 text-[12px] leading-relaxed text-muted-foreground">
            No decisions logged yet. The next scan will write decisions here before any document proposal is created.
          </div>
        ) : decisions.map((decision, index) => {
          const meeting = meetingBySource(decision.source);
          return (
            <button key={`${decision.date}-${index}`} type="button" onClick={() => meeting && onSelect(meeting)} className="relative mb-3 w-full rounded-lg border border-border bg-background p-3 text-left before:absolute before:-left-[23px] before:top-4 before:h-2.5 before:w-2.5 before:rounded-full before:bg-rust">
              <div className="font-bold text-foreground">{decision.date} · {decision.decision}</div>
              <p className="mt-1 text-[12px] text-muted-foreground"><strong>Rationale:</strong> {decision.rationale} <strong>Owner:</strong> {decision.owner}.</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>{decision.source}</span><span>{decision.documents.join(" / ")}</span><Badge tone={decision.status === "Rejected" ? "low" : decision.status === "Proposal pending" ? "proposal" : "ok"}>{decision.status}</Badge></div>
            </button>
          );
        })}
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

function DocumentImpact({ documents, onView }: { documents: DocumentRecord[]; onView: (view: View) => void }) {
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

function ProposalReview({ meeting, proposals }: { meeting: Meeting; proposals: ProposalEntry[] }) {
  const proposal = proposals[0];
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
          {proposal ? (
            <>
              <Badge tone={proposal.priority === "high" ? "critical" : "proposal"}>{proposal.priority}</Badge>
              <ReviewBox><strong>{proposal.title}</strong><br /><br />Documento afectado: {proposal.doc}. Fuente: {proposal.source}.</ReviewBox>
            </>
          ) : (
            <ReviewBox><strong>No pending proposal</strong><br /><br />Cuando un scan detecte impacto documental, Sancho lo convertira aqui en una propuesta revisable antes de tocar StrategyPlan, POV Bank u otro documento canonico.</ReviewBox>
          )}
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

function DocumentTile({ doc }: { doc: DocumentRecord }) {
  return (
    <div className={cn("rounded-lg border border-border bg-background p-3", doc.critical && "border-rust")}>
      <div className="flex items-start justify-between gap-2"><strong className="text-[13px]">{doc.name}</strong><Badge tone={doc.critical ? "critical" : "proposal"}>{doc.status}</Badge></div>
      <p className="mt-1 text-[11px] text-muted-foreground">{doc.area}</p>
      <div className="mt-2 text-[10px] text-muted-foreground">POV affected · contradiction check · proposals generated</div>
    </div>
  );
}

function MetricStrip({ stats }: { stats: { value: number | string; label: string }[] }) {
  return (
    <div className="mt-5 flex max-w-full gap-2 overflow-x-auto pb-1">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex min-w-[132px] items-center justify-between gap-3 rounded-sc-md border-[2px] px-3 py-2"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
        >
          <div className="font-heading text-[24px] leading-none text-navy">{stat.value}</div>
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{stat.label}</div>
        </div>
      ))}
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
