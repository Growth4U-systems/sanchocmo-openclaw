"use client";

import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
import { buildB2BCampaignThread, buildYalcThread } from "@/lib/chat-openers";
import { cn } from "@/lib/utils";
import { isCampaignKind, type YalcCampaignKind } from "@/lib/yalc/campaign-kind";
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
type YalcJobStatus = "queued" | "running" | "succeeded" | "failed" | "interrupted";
type B2BInboxFilter = "needs_reply" | "got_reply" | "sent";
type B2BReplyCategoryKey =
  | "hot"
  | "out_of_office"
  | "not_interested"
  | "gdpr"
  | "email_changed"
  | "recipient_gone"
  | "auto_ack"
  | "reply";

interface YalcJobProgress {
  percent?: number;
  message?: string;
  done?: number;
  total?: number;
}

interface YalcJobRecord {
  id: string;
  type: string;
  status: YalcJobStatus;
  progress?: YalcJobProgress;
  output?: Record<string, unknown> | null;
  errorMessage?: string | null;
  retryable?: boolean;
}

interface YalcQueuedJobResponse {
  ok?: boolean;
  jobId?: string;
  status?: string;
  statusUrl?: string;
}

interface ActiveYalcJob {
  campaignId: string;
  action: OutboundAction;
  jobId: string;
  status: YalcJobStatus | string;
  progress?: YalcJobProgress;
  errorMessage?: string | null;
}

interface OverviewPayload {
  ok: boolean;
  configured?: boolean;
  runtime?: { baseUrl?: string; auth?: string };
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
  campaignKind?: YalcCampaignKind;
  campaignKindLabel?: string;
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
  channel?: string | null;
  provider?: string | null;
  createdAt?: string | null;
  meta?: Record<string, unknown> | null;
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
  { key: "encuentra", label: "Overview", icon: Search },
  { key: "plantillas", label: "Oferta", icon: FileText },
  { key: "contactos", label: "Leads", icon: Users },
  { key: "inbox", label: "Inbox", icon: Inbox },
];

const HEADERS: Record<B2BTab, { title: string; sub: string }> = {
  encuentra: {
    title: "Campaña B2B",
    sub: "Resultados, target, oferta y estado operativo de la campaña seleccionada.",
  },
  contactos: {
    title: "Leads",
    sub: "Personas y cuentas de la campaña seleccionada, con score y estado comercial.",
  },
  inbox: {
    title: "Inbox",
    sub: "Respuestas, pendientes y enviados de la campaña seleccionada.",
  },
  plantillas: {
    title: "Oferta y secuencia",
    sub: "Qué ofrecemos, a quién se lo decimos y cómo se personaliza la secuencia.",
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

const REPLY_CATEGORIES: Array<{ key: B2BReplyCategoryKey; label: string; icon: string }> = [
  { key: "hot", label: "Hot", icon: "↳" },
  { key: "out_of_office", label: "OOO", icon: "☂" },
  { key: "not_interested", label: "Not interested", icon: "☟" },
  { key: "gdpr", label: "GDPR", icon: "◈" },
  { key: "email_changed", label: "Email changed", icon: "⇄" },
  { key: "recipient_gone", label: "Recipient gone", icon: "♙" },
  { key: "auto_ack", label: "Auto-ack", icon: "□" },
  { key: "reply", label: "Reply", icon: "↲" },
];

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
  return isCampaignKind(campaign, "b2b");
}

function isB2BLead(lead: Lead, b2bCampaignIds: ReadonlySet<string>): boolean {
  if (!isCampaignKind(lead, "b2b")) return false;
  if (lead.campaignId && b2bCampaignIds.size > 0 && !b2bCampaignIds.has(lead.campaignId)) return false;
  return true;
}

function leadDisplayName(lead: Lead): string {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  return name || lead.email || lead.linkedinUrl || lead.id;
}

function uniqueLeads(leads: Lead[]): Lead[] {
  const seen = new Set<string>();
  return leads.filter((lead) => {
    if (seen.has(lead.id)) return false;
    seen.add(lead.id);
    return true;
  });
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

const CAMPAIGN_LAUNCHED_STATUS_RE = /(^|[\s_-])(published|live|sent|launched|completed|done|closed)([\s_-]|$)/;
const EXTERNAL_EMAIL_STATUS_RE = /\b(sent|delivered|opened|clicked|replied|bounced|unsubscribed|failed)\b/i;
const EXTERNAL_LIFECYCLE_STATUSES = new Set([
  "Connect_Sent",
  "Connected",
  "DM1_Sent",
  "DM2_Sent",
  "No_Reply",
  "Replied",
  "Negotiating",
  "Demo_Booked",
  "Deal_Created",
  "Closed_Won",
  "Closed_Lost",
  "Expired",
]);
const LEAD_LOCKED_MESSAGE =
  "Esta campaña ya fue lanzada o sincronizada con Instantly/Unipile. Los leads quedan bloqueados; duplica la campaña para cambios.";

function hasExternalSendSignal(lead: Lead): boolean {
  if (lead.instantlyCampaignId || lead.connectSentAt || lead.connectedAt || lead.dm1SentAt || lead.dm2SentAt || lead.repliedAt) {
    return true;
  }
  if (lead.lastMessage) return true;
  if (lead.lifecycleStatus && EXTERNAL_LIFECYCLE_STATUSES.has(lead.lifecycleStatus)) return true;
  if (EXTERNAL_EMAIL_STATUS_RE.test(lead.emailStatus || "")) return true;
  return /\b(instantly|unipile)\b/i.test(lead.source || "");
}

function campaignLocksLeadEdits(campaign: Campaign | CampaignDetail | null, leads: Lead[]): boolean {
  if (!campaign) return false;
  const status = (campaign.status || "").toLowerCase();
  if (CAMPAIGN_LAUNCHED_STATUS_RE.test(` ${status} `)) {
    return true;
  }
  return leads.some(hasExternalSendSignal);
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

function categoryClasses(category: B2BReplyCategoryKey | undefined, bucket: B2BInboxFilter): string {
  if (bucket === "sent") return "border-yellow-500/50 bg-yellow-100 text-yellow-800";
  if (category === "hot") return "border-rust/60 bg-rust/10 text-rust";
  if (category === "not_interested" || category === "gdpr" || category === "recipient_gone") {
    return "border-destructive/50 bg-destructive/10 text-destructive";
  }
  if (category === "out_of_office" || category === "auto_ack" || category === "email_changed") {
    return "border-amber-400/60 bg-amber-100 text-amber-800";
  }
  return "border-cyan-600/50 bg-cyan-50 text-cyan-800";
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
  if (source.toLowerCase().includes("unipile")) return "Unipile";
  return source;
}

function messageMetaValue(message: LeadMessage, key: string): string {
  const value = message.meta?.[key];
  return typeof value === "string" ? value : "";
}

function messageChannelLabel(message: LeadMessage, lead?: Lead | null): string {
  const raw = [
    message.channel,
    message.provider,
    messageMetaValue(message, "provider"),
    messageMetaValue(message, "source"),
    messageMetaValue(message, "channel"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (raw.includes("unipile") || raw.includes("linkedin")) return "LinkedIn · Unipile";
  if (raw.includes("instantly") || raw.includes("email")) return "Email · Instantly";
  if (lead?.instantlyCampaignId) return "Email · Instantly";
  if (lead?.linkedinUrl) return "LinkedIn · Unipile";
  return "Canal";
}

function leadChannelSummary(lead: Lead): string {
  const channels: string[] = [];
  if (lead.email || lead.instantlyCampaignId || /email|instantly/i.test(lead.emailStatus || "")) {
    channels.push("Email");
  }
  if (lead.linkedinUrl || /linkedin|unipile/i.test(lead.source || "")) {
    channels.push("LinkedIn");
  }
  return channels.length ? channels.join(" + ") : "Sin canal";
}

function replyText(lead: Lead): string {
  return [
    lead.lifecycleStatus,
    lead.emailStatus,
    lead.lastMessage?.subject,
    lead.lastMessage?.body,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function replyCategoryForLead(lead: Lead): { key: B2BReplyCategoryKey; label: string; icon: string } | null {
  const stage = stageForStatus(lead.lifecycleStatus);
  const text = replyText(lead);
  const hasReply =
    stage === "Replied" ||
    stage === "Negotiating" ||
    stage === "Signed" ||
    stage === "Active" ||
    lead.lifecycleStatus === "Demo_Booked" ||
    lead.lifecycleStatus === "Deal_Created" ||
    lead.lastMessage?.direction === "in" ||
    /\brepl(y|ied)\b|respond/i.test(lead.emailStatus || "");

  if (!hasReply) return null;
  if (/\booo\b|out of office|fuera de oficina|vacation|holiday|ausente/.test(text)) return REPLY_CATEGORIES[1];
  if (/not interested|no interesa|no estoy interesado|unsubscribe|stop contacting|do not contact/.test(text)) return REPLY_CATEGORIES[2];
  if (/gdpr|privacy|data protection|proteccion de datos|protección de datos/.test(text)) return REPLY_CATEGORIES[3];
  if (/email changed|new email|wrong email|use this email|correo nuevo|nuevo correo/.test(text)) return REPLY_CATEGORIES[4];
  if (/left the company|no longer|ya no trabajo|ha finalizado|sustituye|replacement|reemplaza|recipient gone/.test(text)) return REPLY_CATEGORIES[5];
  if (/auto.?ack|automatic reply|respuesta automatica|respuesta automática|acknowledge/.test(text)) return REPLY_CATEGORIES[6];
  if (
    leadScore(lead) !== null && leadScore(lead)! >= 75 ||
    stage === "Negotiating" ||
    stage === "Signed" ||
    stage === "Active" ||
    /interested|meeting|call|demo|reunion|reunión|agenda|calendly|gracias/.test(text)
  ) {
    return REPLY_CATEGORIES[0];
  }
  return REPLY_CATEGORIES[7];
}

function inboxBucketForLead(lead: Lead): B2BInboxFilter | null {
  const category = replyCategoryForLead(lead);
  const stage = stageForStatus(lead.lifecycleStatus);
  if (category?.key === "hot" || stage === "Replied" || stage === "Negotiating") return "needs_reply";
  if (category) return "got_reply";
  if (stage === "Contacted" || /sent|delivered|opened|contacted/i.test(lead.emailStatus || "")) return "sent";
  return null;
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

function isQueuedJobResponse(value: unknown): value is YalcQueuedJobResponse & { jobId: string } {
  return !!value && typeof value === "object" && typeof (value as { jobId?: unknown }).jobId === "string";
}

function jobProgressText(job: Pick<ActiveYalcJob, "status" | "progress">): string {
  const progress = job.progress;
  if (progress?.message) return progress.message;
  if (typeof progress?.percent === "number") return `${Math.round(progress.percent)}% completado`;
  if (typeof progress?.done === "number" && typeof progress?.total === "number") return `${progress.done}/${progress.total}`;
  if (job.status === "queued") return "En cola";
  if (job.status === "running") return "Ejecutando";
  return String(job.status);
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
  const campaignParam = queryValue(router.query.campaign);

  const [roster, setRoster] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveYalcJob | null>(null);

  function pushQuery(
    next: Partial<{
      tab: B2BTab;
      vista: ContactosVista;
      busqueda: string;
      stage: string;
      campaign: string;
    }>,
  ) {
    const merged = { tab, vista, busqueda, stage: stageParam, campaign: campaignParam, ...next };
    const query: Record<string, string> = { slug, tipo: "b2b" };
    if (merged.tab !== "encuentra") query.tab = merged.tab;
    if (merged.campaign) query.campaign = merged.campaign;
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
    queryFn: () => fetchJson<LeadsPayload>(`/api/yalc/leads?slug=${encodeURIComponent(slug)}&type=B2B&include=lastMessage`),
    enabled: !!slug,
  });

  const discardedLeadsQuery = useQuery({
    queryKey: discardedLeadsKey,
    queryFn: () =>
      fetchJson<LeadsPayload>(
        `/api/yalc/leads?slug=${encodeURIComponent(slug)}&type=B2B&include=lastMessage&lifecycleStatus=${DISQUALIFIED_STATUS}`,
      ),
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
  const b2bCampaignIds = useMemo(() => new Set(campaigns.map((campaign) => campaign.id)), [campaigns]);
  const activeLeads = useMemo(
    () => (activeLeadsQuery.data?.leads || []).filter((lead) => isB2BLead(lead, b2bCampaignIds)),
    [activeLeadsQuery.data, b2bCampaignIds],
  );
  const discardedLeads = useMemo(
    () => (discardedLeadsQuery.data?.leads || []).filter((lead) => isB2BLead(lead, b2bCampaignIds)),
    [discardedLeadsQuery.data, b2bCampaignIds],
  );
  const allLeads = useMemo(() => uniqueLeads([...activeLeads, ...discardedLeads]), [activeLeads, discardedLeads]);
  const providers = useMemo(() => providersQuery.data?.providers || [], [providersQuery.data]);

  const selectedLead = useMemo(
    () => (selectedLeadId ? allLeads.find((lead) => lead.id === selectedLeadId) || null : null),
    [selectedLeadId, allLeads],
  );
  const selectedCampaignId = useMemo(() => {
    const preferred = campaignParam || busqueda;
    if (preferred && campaigns.some((campaign) => campaign.id === preferred)) return preferred;
    return campaigns[0]?.id || "";
  }, [campaignParam, busqueda, campaigns]);
  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId],
  );
  const selectedActiveLeads = useMemo(
    () => (selectedCampaignId ? activeLeads.filter((lead) => lead.campaignId === selectedCampaignId) : activeLeads),
    [activeLeads, selectedCampaignId],
  );
  const selectedDiscardedLeads = useMemo(
    () => (selectedCampaignId ? discardedLeads.filter((lead) => lead.campaignId === selectedCampaignId) : discardedLeads),
    [discardedLeads, selectedCampaignId],
  );
  const selectedAllLeads = useMemo(
    () => uniqueLeads([...selectedActiveLeads, ...selectedDiscardedLeads]),
    [selectedActiveLeads, selectedDiscardedLeads],
  );
  const templateCampaignId = selectedCampaignId;

  const campaignDetailQuery = useQuery({
    queryKey: ["yalc", slug, "b2b", "campaigns", templateCampaignId],
    queryFn: () =>
      fetchJson<CampaignDetail>(
        `/api/yalc/campaigns/${encodeURIComponent(templateCampaignId)}?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug && !!templateCampaignId,
  });
  const icpCampaign = useMemo(
    () =>
      (campaignDetailQuery.data?.id === templateCampaignId ? campaignDetailQuery.data : null) ||
      selectedCampaign ||
      campaigns[0] ||
      null,
    [campaignDetailQuery.data, selectedCampaign, campaigns, templateCampaignId],
  );
  const selectedLeadEditsLocked = useMemo(
    () => campaignLocksLeadEdits(icpCampaign, selectedAllLeads),
    [icpCampaign, selectedAllLeads],
  );

  const stageMutation = useMutation({
    mutationFn: ({ lead, target, note }: { lead: Lead; target: StageFilterKey; note?: string }) =>
      fetchJson(`/api/yalc/leads/${encodeURIComponent(lead.id)}/stage?slug=${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: lead.campaignId,
          expectedKind: "b2b",
          lifecycleStatus: canonicalStatusForStage(target),
          note,
        }),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: activeLeadsKey });
      void queryClient.invalidateQueries({ queryKey: discardedLeadsKey });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "b2b", "campaigns"] });
      showToast(
        variables.target === "Contacted"
          ? `${leadDisplayName(variables.lead)} marcado como Contacted. Esto no crea ni envía la campaña.`
          : `${leadDisplayName(variables.lead)} -> ${variables.target === DISCARDED_STAGE ? "Descartado" : variables.target}`,
      );
    },
    onError: (error) =>
      showToast(`No se pudo mover: ${error instanceof Error ? error.message : "error"}`, "warn"),
  });

  const outboundAction = useMutation<unknown, Error, { campaignId: string; action: OutboundAction }>({
    mutationFn: ({ campaignId, action }: { campaignId: string; action: OutboundAction }) => {
      const campaign = campaigns.find((item) => item.id === campaignId) || campaignDetailQuery.data;
      const campaignLeads = allLeads.filter((lead) => lead.campaignId === campaignId);
      if ((action === "search" || action === "enrich") && campaignLocksLeadEdits(campaign || null, campaignLeads)) {
        throw new Error(LEAD_LOCKED_MESSAGE);
      }
      if (action === "search") {
        return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/leads/search?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedKind: "b2b",
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
          body: JSON.stringify({ expectedKind: "b2b", provider: "apollo", limit: 25 }),
        });
      }
      if (action === "approve") {
        return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/sequence/approve?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedKind: "b2b", actorLabel: "Sancho" }),
        });
      }
      if (action === "dry-run") {
        return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/dry-run?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedKind: "b2b" }),
        });
      }
      if (action === "publish") {
        return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/publish?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedKind: "b2b", confirmInstantlyPublish: true, actorLabel: "Sancho" }),
        });
      }
      return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/live?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedKind: "b2b", confirmLiveLaunch: true, actorLabel: "Sancho" }),
      });
    },
    onSuccess: (data, variables) => {
      if (isQueuedJobResponse(data)) {
        setActiveJob({
          campaignId: variables.campaignId,
          action: variables.action,
          jobId: data.jobId,
          status: data.status || "queued",
        });
        showToast(`En cola: ${outboundActionLabel(variables.action)}`);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug] });
      showToast(`Completado: ${outboundActionLabel(variables.action)}`);
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "Acción incompleta", "warn"),
  });

  useEffect(() => {
    if (!slug || !activeJob?.jobId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const { jobId, action } = activeJob;

    const poll = async () => {
      try {
        const job = await fetchJson<YalcJobRecord>(
          `/api/yalc/jobs/${encodeURIComponent(jobId)}?slug=${encodeURIComponent(slug)}`,
        );
        if (cancelled) return;
        failures = 0;
        setActiveJob((current) =>
          current?.jobId === jobId
            ? {
                ...current,
                status: job.status,
                progress: job.progress,
                errorMessage: job.errorMessage,
              }
            : current,
        );

        if (job.status === "succeeded") {
          void queryClient.invalidateQueries({ queryKey: ["yalc", slug] });
          showToast(`Completado: ${outboundActionLabel(action)}`);
          setActiveJob(null);
          return;
        }

        if (job.status === "failed" || job.status === "interrupted") {
          void queryClient.invalidateQueries({ queryKey: ["yalc", slug] });
          const message = job.errorMessage || "La integración externa no completó la acción.";
          showToast(`${outboundActionLabel(action)} incompleto: ${message}`, "warn");
          setActiveJob(null);
          return;
        }

        timer = setTimeout(poll, 1500);
      } catch (error) {
        if (cancelled) return;
        failures += 1;
        if (failures >= 3) {
          showToast(
            `No pude leer el estado de ${outboundActionLabel(action)}: ${error instanceof Error ? error.message : "error"}`,
            "warn",
          );
          setActiveJob(null);
          return;
        }
        timer = setTimeout(poll, 2000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeJob?.jobId, queryClient, showToast, slug]);

  const sequenceUpdateAction = useMutation({
    mutationFn: ({ campaignId, stepId, emails }: { campaignId: string; stepId?: string; emails: EmailSequenceEmail[] }) =>
      fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/sequence/update?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedKind: "b2b",
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

  const campaignUpdateAction = useMutation({
    mutationFn: ({ campaignId, title }: { campaignId: string; title: string }) =>
      fetchJson<Campaign>(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}?slug=${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, expectedKind: "b2b" }),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "b2b", "campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "b2b", "campaigns", variables.campaignId] });
      showToast("Campaña renombrada");
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "No se pudo renombrar la campaña", "warn"),
  });

  const campaignDeleteAction = useMutation({
    mutationFn: ({ campaignId }: { campaignId: string }) =>
      fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}?slug=${encodeURIComponent(slug)}&expectedKind=b2b`, {
        method: "DELETE",
      }),
    onSuccess: (_data, variables) => {
      const nextCampaign = campaigns.find((campaign) => campaign.id !== variables.campaignId);
      pushQuery({ campaign: nextCampaign?.id || "", busqueda: "", stage: "" });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "b2b"] });
      showToast("Campaña borrada");
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "No se pudo borrar la campaña", "warn"),
  });

  function openB2BSearch(campaign?: Campaign) {
    if (!slug) return;
    if (!campaign) {
      openChat(slug, buildB2BCampaignThread(slug));
      return;
    }
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
    if (selectedLeadEditsLocked) {
      showToast(LEAD_LOCKED_MESSAGE, "warn");
      return;
    }
    stageMutation.mutate({ lead, target, note });
  }

  async function moveMany(leads: Lead[], target: StageFilterKey) {
    if (selectedLeadEditsLocked) {
      showToast(LEAD_LOCKED_MESSAGE, "warn");
      return;
    }
    try {
      await Promise.all(
        leads.map((lead) =>
          fetchJson(`/api/yalc/leads/${encodeURIComponent(lead.id)}/stage?slug=${encodeURIComponent(slug)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              campaignId: lead.campaignId,
              expectedKind: "b2b",
              lifecycleStatus: canonicalStatusForStage(target),
            }),
          }),
        ),
      );
      showToast(
        target === "Contacted"
          ? `${leads.length} contacto${leads.length === 1 ? "" : "s"} marcado${leads.length === 1 ? "" : "s"} como Contacted. Esto no crea ni envía la campaña.`
          : `${leads.length} contacto${leads.length === 1 ? "" : "s"} movido${leads.length === 1 ? "" : "s"} a ${target}`,
      );
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
  const actionBusy = outboundAction.isPending || !!activeJob;
  const busyAction = outboundAction.isPending ? outboundAction.variables?.action : activeJob?.action;

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
                <small>campañas</small>
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
                Generar nueva campaña
              </button>
            )}
            <div className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-bold text-rust">{slug || "cliente"}</span>
              <span>· Outreach</span>
            </div>
          </div>
        </header>

        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <B2BCampaignSelector
              campaigns={campaigns}
              selectedCampaignId={selectedCampaignId}
              loading={campaignsQuery.isLoading}
              onSelect={(campaignId) => pushQuery({ campaign: campaignId, busqueda: "", stage: "" })}
              onRename={(campaign, title) => campaignUpdateAction.mutate({ campaignId: campaign.id, title })}
              onDelete={(campaign) => campaignDeleteAction.mutate({ campaignId: campaign.id })}
              busy={campaignUpdateAction.isPending || campaignDeleteAction.isPending}
            />
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

          <main className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <nav className="flex flex-wrap gap-2 overflow-x-auto" data-testid="outbound-b2b-tabs">
                {TABS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => pushQuery({ tab: item.key, campaign: selectedCampaignId })}
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
            </div>

            {pageError && (
              <div className="flex items-start gap-2 rounded-lg border-2 border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{String(pageError instanceof Error ? pageError.message : pageError)}</span>
              </div>
            )}

            {activeJob && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-rust" />
                <div className="min-w-0">
                  <div className="font-semibold">{outboundActionLabel(activeJob.action)}</div>
                  <div className="truncate text-xs text-muted-foreground">{jobProgressText(activeJob)}</div>
                </div>
              </div>
            )}

            {tab === "encuentra" && (
              <B2BCampaignOverviewTab
                campaign={icpCampaign}
                leads={selectedAllLeads}
                loading={campaignsQuery.isLoading || campaignDetailQuery.isLoading}
                onCreateSearch={() => openB2BSearch()}
                actionBusy={actionBusy}
                busyAction={busyAction}
                onRunAction={(action) => outboundAction.mutate({ campaignId: selectedCampaignId, action })}
              />
            )}

            {tab === "contactos" && (
              <div data-testid="outbound-contactos">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => pushQuery({ tab: "contactos", vista: "kanban", campaign: selectedCampaignId })}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors",
                      vista === "kanban" ? "border-rust bg-rust text-white" : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    Kanban
                  </button>
                  <button
                    type="button"
                    onClick={() => pushQuery({ tab: "contactos", vista: "lista", campaign: selectedCampaignId, busqueda: selectedCampaignId })}
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
                    {activeLeadsQuery.isFetching || discardedLeadsQuery.isFetching ? "Actualizando..." : `${selectedAllLeads.length} leads`}
                  </span>
                </div>
                {vista === "kanban" ? (
                  <B2BKanbanView
                    leads={selectedActiveLeads}
                    roster={roster}
                    busyLeadId={stageMutation.variables?.lead.id}
                    locked={selectedLeadEditsLocked}
                    onMove={moveLead}
                    onOpen={(lead) => setSelectedLeadId(lead.id)}
                  />
                ) : (
                  <B2BListaView
                    leads={selectedAllLeads}
                    busqueda={selectedCampaignId}
                    busquedaLabel={selectedCampaign?.title || null}
                    initialStage={stageParam}
                    busy={stageMutation.isPending}
                    locked={selectedLeadEditsLocked}
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
                leads={selectedActiveLeads}
                onOpenLead={(lead) => setSelectedLeadId(lead.id)}
                onPrepareReply={openB2BReply}
              />
            )}

            {tab === "plantillas" && (
              <B2BPlantillasTab
                campaigns={campaigns}
                selectedCampaignId={templateCampaignId}
                onSelectCampaign={(campaignId) => pushQuery({ campaign: campaignId, busqueda: "", stage: "" })}
                campaignDetail={campaignDetailQuery.data || null}
                loading={campaignDetailQuery.isLoading}
                saving={sequenceUpdateAction.isPending}
                locked={selectedLeadEditsLocked}
                actionBusy={actionBusy}
                busyAction={busyAction}
                onSave={(stepId, emails) =>
                  sequenceUpdateAction.mutate({ campaignId: templateCampaignId, stepId, emails })
                }
                onRunAction={(action) => outboundAction.mutate({ campaignId: templateCampaignId, action })}
              />
            )}

            {tab === "settings" && (
              <B2BSettingsTab providers={providers} loading={providersQuery.isLoading} onRefresh={refreshAll} refreshing={providersQuery.isFetching} />
            )}
          </main>
        </div>

        <B2BLeadDrawer
          slug={slug}
          lead={selectedLead}
          onClose={() => setSelectedLeadId(null)}
          onMove={moveLead}
          busy={stageMutation.isPending}
          locked={selectedLeadEditsLocked}
        />
        <ToastViewport toast={toast} />
        <B2BOutreachStyles />
      </div>
    </DashboardLayout>
  );
}

function B2BCampaignSelector({
  campaigns,
  selectedCampaignId,
  loading,
  onSelect,
  onRename,
  onDelete,
  busy,
}: {
  campaigns: Campaign[];
  selectedCampaignId: string;
  loading: boolean;
  onSelect: (campaignId: string) => void;
  onRename: (campaign: Campaign, title: string) => void;
  onDelete: (campaign: Campaign) => void;
  busy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const ordered = campaigns
    .slice()
    .sort((a, b) => {
      const order = { running: 0, draft: 1, paused: 2, done: 3 } as const;
      return order[campaignState(a)] - order[campaignState(b)];
    });
  const selectedCampaign = ordered.find((campaign) => campaign.id === selectedCampaignId) || ordered[0] || null;

  function startEditing() {
    if (!selectedCampaign) return;
    setTitleDraft(selectedCampaign.title || selectedCampaign.id);
    setEditing(true);
  }

  function saveTitle() {
    if (!selectedCampaign) return;
    const next = titleDraft.trim();
    if (!next || next === (selectedCampaign.title || selectedCampaign.id)) {
      setEditing(false);
      return;
    }
    onRename(selectedCampaign, next);
    setEditing(false);
  }

  function deleteCampaign() {
    if (!selectedCampaign) return;
    const name = selectedCampaign.title || selectedCampaign.id;
    if (!window.confirm(`Borrar la campaña B2B "${name}"? Esta acción no se puede deshacer.`)) return;
    onDelete(selectedCampaign);
  }

  return (
    <div className="min-w-[280px] flex-1 sm:max-w-[640px]" data-testid="b2b-campaign-selector">
      <label>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Campaña
        </span>
        <select
          value={selectedCampaign?.id || ""}
          disabled={loading || ordered.length === 0 || busy}
          onChange={(event) => onSelect(event.target.value)}
          className="h-10 w-full rounded-md border-2 border-border bg-card px-3 text-sm font-semibold text-foreground focus:border-rust focus:outline-none"
        >
          {loading && <option value="">Cargando campañas...</option>}
          {!loading && ordered.length === 0 && <option value="">Sin campañas B2B</option>}
          {ordered.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.title || campaign.id}
            </option>
          ))}
        </select>
      </label>
      {selectedCampaign && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveTitle();
                  if (event.key === "Escape") setEditing(false);
                }}
                className="h-9 min-w-[220px] flex-1 rounded-md border border-border bg-background px-3 text-sm focus:border-rust focus:outline-none"
                autoFocus
              />
              <button type="button" disabled={busy} onClick={saveTitle} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:border-rust">
                Guardar
              </button>
              <button type="button" disabled={busy} onClick={() => setEditing(false)} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
                Cancelar
              </button>
            </>
          ) : (
            <details className="relative">
              <summary className="list-none rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-rust hover:text-rust [&::-webkit-details-marker]:hidden">
                Gestionar campaña
              </summary>
              <div className="absolute left-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-card shadow-md">
                <button
                  type="button"
                  disabled={busy}
                  onClick={startEditing}
                  className="block w-full px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-muted"
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={deleteCampaign}
                  className="block w-full px-3 py-2 text-left text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                >
                  Borrar
                </button>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function B2BCampaignOverviewTab({
  campaign,
  leads,
  loading,
  onCreateSearch,
  actionBusy,
  busyAction,
  onRunAction,
}: {
  campaign: Campaign | CampaignDetail | null;
  leads: Lead[];
  loading: boolean;
  onCreateSearch: () => void;
  actionBusy: boolean;
  busyAction?: OutboundAction;
  onRunAction: (action: OutboundAction) => void;
}) {
  if (loading && !campaign) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Cargando campaña...</p>;
  }

  if (!campaign) {
    return (
      <ZeroState
        title="Sin campaña B2B"
        body="Crea una campaña B2B para definir target, oferta, audiencia, secuencia y conectar leads."
        action={{ label: "Nueva campaña", onClick: onCreateSearch }}
      />
    );
  }

  const state = campaignState(campaign);
  const meta = campaignStateMeta(state);
  const contacts = campaignLeadCount(campaign, leads);
  const discovered = leads.filter((lead) => stageForStatus(lead.lifecycleStatus) === "Discovered").length;
  const shortlisted = leads.filter((lead) => stageForStatus(lead.lifecycleStatus) === "Shortlist").length;
  const contacted = leads.filter((lead) => stageForStatus(lead.lifecycleStatus) === "Contacted").length;
  const replies = leads.filter((lead) => stageForStatus(lead.lifecycleStatus) === "Replied").length;
  const meetings = leads.filter((lead) => stageForStatus(lead.lifecycleStatus) === "Negotiating").length;
  const won = leads.filter((lead) => ["Signed", "Active"].includes(stageForStatus(lead.lifecycleStatus) || "")).length;
  const channelSummary = channelText(campaign.channels);
  const segment = campaign.targetSegment || "Target por definir";
  const offer = campaign.hypothesis || "Oferta, dolor y posicionamiento pendientes de definir para esta campaña.";
  const leadEditsLocked = campaignLocksLeadEdits(campaign, leads);

  return (
    <div className="space-y-4" data-testid="outbound-encuentra">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-[240px] flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={cn("rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", meta.stampClass)}>
                {meta.label}
              </span>
              <span className="rounded border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {campaign.campaignKindLabel || "Campaña B2B"}
              </span>
            </div>
            <h3 className="font-heading text-2xl leading-tight text-navy">{campaign.title || campaign.id}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{offer}</p>
          </div>
          <div className="grid min-w-[320px] grid-cols-3 gap-3 text-center">
            <MiniMetric label="leads" value={contacts} />
            <MiniMetric label="replies" value={replies} />
            <MiniMetric label="reuniones" value={meetings} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <ContextSummary label="Target" value={segment} />
          <ContextSummary label="Oferta" value={offer} />
          <ContextSummary label="Canales" value={channelSummary} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-3">
          <div className="min-w-[260px] flex-1">
            <div className="text-xs font-semibold text-foreground">Cohorte de leads</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {leadEditsLocked
                ? "Esta campaña ya fue lanzada o sincronizada con Instantly/Unipile. La cohorte queda bloqueada para no desalinear lo enviado."
                : "Puedes buscar más leads o enriquecer los existentes antes de enviar la campaña."}
            </p>
          </div>
          <button
            type="button"
            disabled={actionBusy || leadEditsLocked}
            onClick={() => onRunAction("search")}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:border-rust hover:text-rust disabled:opacity-50"
            title={leadEditsLocked ? "Duplica la campaña para cambiar leads." : "Busca nuevos leads para esta campaña antes de enviarla."}
          >
            {actionBusy && busyAction === "search" ? "Buscando..." : "Buscar leads"}
          </button>
          <button
            type="button"
            disabled={actionBusy || leadEditsLocked || leads.length === 0}
            onClick={() => onRunAction("enrich")}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:border-rust hover:text-rust disabled:opacity-50"
            title={leadEditsLocked ? "Los leads ya enviados no se modifican." : "Completa email, LinkedIn, cargo, cuenta y señales de score para leads existentes."}
          >
            {actionBusy && busyAction === "enrich" ? "Enriqueciendo..." : "Enriquecer leads"}
          </button>
        </div>

      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg text-navy">Embudo de campaña</h3>
            <p className="text-sm text-muted-foreground">Estados reales de los leads de esta campaña B2B.</p>
          </div>
          <span className="text-xs text-muted-foreground">{contacts} leads totales</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-6">
          <MiniMetric label="descubiertos" value={discovered} />
          <MiniMetric label="shortlist" value={shortlisted} />
          <MiniMetric label="contactados" value={contacted} />
          <MiniMetric label="replies" value={replies} />
          <MiniMetric label="meetings" value={meetings} />
          <MiniMetric label="ganados" value={won} />
        </div>
        <div className="mt-4 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
          <p><b className="text-foreground">Discovered</b>: lead encontrado, aún puede faltarle enrichment/score.</p>
          <p><b className="text-foreground">Shortlist</b>: lead priorizado para entrar en secuencia.</p>
          <p><b className="text-foreground">Contacted</b>: listo para contacto o en cola; se bloquea cuando se lanza/sincroniza fuera de Sancho.</p>
        </div>
      </section>
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

function B2BKanbanView({
  leads,
  roster,
  busyLeadId,
  locked,
  onMove,
  onOpen,
}: {
  leads: Lead[];
  roster: boolean;
  busyLeadId?: string;
  locked?: boolean;
  onMove: (lead: Lead, target: StageFilterKey, note?: string) => void;
  onOpen: (lead: Lead) => void;
}) {
  const groups = groupLeadsByStage(leads);
  const stages = roster ? PIPELINE_STAGES.filter((stage) => ROSTER_STAGES.includes(stage.key)) : PIPELINE_STAGES;
  const [dragOver, setDragOver] = useState<PipelineStageKey | null>(null);

  function handleDrop(event: DragEvent<HTMLDivElement>, target: PipelineStageKey) {
    event.preventDefault();
    setDragOver(null);
    if (locked) return;
    const leadId = event.dataTransfer.getData("text/plain");
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return;
    if (stageForStatus(lead.lifecycleStatus) === target) return;
    onMove(lead, target);
  }

  return (
    <div data-testid="outbound-kanban">
      {locked && (
        <div className="mb-3 rounded-lg border border-yellow-500/30 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
          Campaña lanzada o sincronizada: los leads quedan en solo lectura.
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-4">
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
                  if (locked) return;
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
                    locked={locked}
                    onMove={onMove}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function B2BKanbanCard({
  lead,
  stage,
  busy,
  locked,
  onMove,
  onOpen,
}: {
  lead: Lead;
  stage: PipelineStageKey;
  busy: boolean;
  locked?: boolean;
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
      draggable={!locked}
      data-lead-id={lead.id}
      onDragStart={(event) => {
        if (locked) {
          event.preventDefault();
          return;
        }
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
      {stage === "Discovered" && !locked && (
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
  onOpen,
  onBulkMove,
  onBulkDiscard,
  onBulkContact,
  busy,
  locked,
}: {
  leads: Lead[];
  busqueda: string;
  busquedaLabel?: string | null;
  initialStage?: StageFilterKey | "";
  onOpen: (lead: Lead) => void;
  onBulkMove: (leads: Lead[], target: StageFilterKey) => void;
  onBulkDiscard: (leads: Lead[]) => void;
  onBulkContact: (leads: Lead[]) => void;
  busy?: boolean;
  locked?: boolean;
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
  const allVisibleChecked = !locked && visible.length > 0 && visible.every((lead) => selected[lead.id]);

  useEffect(() => {
    if (locked) setSelected({});
  }, [locked]);

  function toggleSort(key: "score" | "company") {
    if (sortKey === key) {
      setSortDir((dir) => (dir === -1 ? 1 : -1));
    } else {
      setSortKey(key);
      setSortDir(key === "score" ? -1 : 1);
    }
  }

  function toggleSelected(leadId: string) {
    if (locked) return;
    setSelected((current) => {
      const next = { ...current };
      if (next[leadId]) delete next[leadId];
      else next[leadId] = true;
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    if (locked) return;
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
          Leads de la campaña: <b>{busquedaLabel || busqueda}</b>
        </div>
      )}
      {locked && (
        <div className="mb-3 rounded-lg border border-yellow-500/30 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
          Campaña lanzada o sincronizada: los leads quedan en solo lectura.
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
                  disabled={locked}
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
                      disabled={locked}
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

      {selectedLeads.length > 0 && !locked && (
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
            title="Solo cambia el estado. No crea campaña ni envía emails."
            onClick={() => {
              onBulkContact(selectedLeads);
              clearSelection();
            }}
            className="rounded-lg border-2 border-rust bg-rust px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
          >
            Marcar Contacted
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
  locked,
}: {
  slug: string;
  lead: Lead | null;
  onClose: () => void;
  onMove: (lead: Lead, target: StageFilterKey, note?: string) => void;
  busy?: boolean;
  locked?: boolean;
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

        {locked && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
            Campaña lanzada o sincronizada con Instantly/Unipile: esta ficha queda en solo lectura.
          </div>
        )}

        {!locked && (stage === "Discovered" || stage === DISCARDED_STAGE) && (
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
  onOpenLead,
  onPrepareReply,
}: {
  slug: string;
  leads: Lead[];
  onOpenLead: (lead: Lead) => void;
  onPrepareReply: (lead: Lead, draft?: string) => void;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<B2BInboxFilter>("needs_reply");
  const [channelFilter, setChannelFilter] = useState<"all" | "email" | "linkedin">("all");
  const [categoryFilter, setCategoryFilter] = useState<B2BReplyCategoryKey | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setCategoryFilter("all");
  }, [filter]);

  const rows = useMemo(() => {
    return leads
      .map((lead) => ({
        lead,
        category: replyCategoryForLead(lead),
        bucket: inboxBucketForLead(lead),
      }))
      .filter((row): row is { lead: Lead; category: ReturnType<typeof replyCategoryForLead>; bucket: B2BInboxFilter } =>
        Boolean(row.bucket),
      );
  }, [leads]);

  const counts = {
    needs_reply: rows.filter((row) => row.bucket === "needs_reply").length,
    got_reply: rows.filter((row) => row.bucket === "got_reply").length,
    sent: rows.filter((row) => row.bucket === "sent").length,
  };

  const bucketRows = useMemo(() => {
    return rows
      .filter((row) => row.bucket === filter)
      .filter((row) => {
        if (channelFilter === "all") return true;
        const summary = leadChannelSummary(row.lead).toLowerCase();
        return channelFilter === "email" ? summary.includes("email") : summary.includes("linkedin");
      });
  }, [channelFilter, filter, rows]);
  const categoryCounts = useMemo(() => {
    const entries = REPLY_CATEGORIES.map((category) => [
      category.key,
      bucketRows.filter((row) => row.category?.key === category.key).length,
    ]);
    return Object.fromEntries(entries) as Record<B2BReplyCategoryKey, number>;
  }, [bucketRows]);

  const visibleRows = useMemo(
    () =>
      filter === "sent" || categoryFilter === "all"
        ? bucketRows
        : bucketRows.filter((row) => row.category?.key === categoryFilter),
    [bucketRows, categoryFilter, filter],
  );
  const selectedRow = useMemo(
    () => visibleRows.find((row) => row.lead.id === selectedId) || visibleRows[0] || null,
    [selectedId, visibleRows],
  );
  const selected = selectedRow?.lead || null;

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

  const lastMessage = messages[messages.length - 1] || selected?.lastMessage || null;

  const filters: Array<{ key: B2BInboxFilter; label: string }> = [
    { key: "needs_reply", label: "Needs reply" },
    { key: "got_reply", label: "Got reply" },
    { key: "sent", label: "Sent" },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]" data-testid="outbound-inbox">
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-3">
          <div className="mb-3">
            <h3 className="font-heading text-lg text-navy">Inbox</h3>
            <p className="text-xs text-muted-foreground">Respuestas clasificadas, pendientes de acción y emails enviados.</p>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {filters.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-md border px-2.5 py-2 text-left text-xs font-semibold transition-colors",
                  filter === key ? "border-rust bg-rust text-white" : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="block">{label}</span>
                <span className={cn("mt-0.5 block font-heading text-base", filter === key ? "text-white" : "text-navy")}>
                  {counts[key]}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {([
              { key: "all", label: "Todos" },
              { key: "email", label: "Email" },
              { key: "linkedin", label: "LinkedIn" },
            ] as const).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setChannelFilter(item.key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                  channelFilter === item.key
                    ? "border-rust bg-rust text-white"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {filter !== "sent" && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                  categoryFilter === "all"
                    ? "border-rust bg-rust text-white"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                All {bucketRows.length}
              </button>
              {REPLY_CATEGORIES.filter((category) => categoryCounts[category.key] > 0).map((category) => (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setCategoryFilter(category.key)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                    categoryFilter === category.key
                      ? "border-rust bg-rust text-white"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  <span aria-hidden>{category.icon}</span> {category.label} {categoryCounts[category.key]}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="max-h-[620px] overflow-y-auto p-2">
          {visibleRows.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">Sin conversaciones en esta vista.</p>}
          {visibleRows.map(({ lead, category, bucket }) => (
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
                <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {leadChannelSummary(lead)}
                </span>
                <span className={cn("mt-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", categoryClasses(category?.key, bucket))}>
                  {category ? `${category.icon} ${category.label}` : "Sent"}
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
          {selected ? (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Inbox className="h-4 w-4 text-rust" />
                    <h4 className="font-semibold text-foreground">Conversación</h4>
                  </div>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <DataItem label="Canal" value={leadChannelSummary(selected)} />
                    <DataItem label="Estado" value={stageLabel(selected)} />
                    <DataItem label="Email" value={selected.email || "-"} />
                    <DataItem label="LinkedIn" value={selected.linkedinUrl || "-"} />
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onPrepareReply(selected, draft)}
                      className="inline-flex items-center gap-2 rounded-md border-2 border-rust bg-rust px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rust/90"
                    >
                      <Send className="h-4 w-4" />
                      Preparar respuesta
                    </button>
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
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Origen de mensajes</div>
                  <dl className="mt-2 space-y-2 text-sm">
                    <DataItem label="Campaña" value={selected.campaignTitle || selected.campaignId || "-"} />
                    <DataItem label="Instantly" value={selected.instantlyCampaignId || "Sin campaña creada"} />
                    <DataItem label="Unipile" value={selected.linkedinUrl ? "LinkedIn disponible" : "Sin LinkedIn"} />
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
                    <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>{message.direction === "out" ? "Enviado" : "Recibido"}</span>
                      <span>{messageChannelLabel(message, selected)}</span>
                    </div>
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
  locked,
  actionBusy,
  busyAction,
  onSave,
  onRunAction,
}: {
  campaigns: Campaign[];
  selectedCampaignId: string;
  onSelectCampaign: (campaignId: string) => void;
  campaignDetail: CampaignDetail | null;
  loading: boolean;
  saving: boolean;
  locked: boolean;
  actionBusy: boolean;
  busyAction?: OutboundAction;
  onSave: (stepId: string | undefined, emails: EmailSequenceEmail[]) => void;
  onRunAction: (action: OutboundAction) => void;
}) {
  const sequences = extractEmailSequences(campaignDetail);
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) || campaignDetail;
  const placeholders = extractSequencePlaceholders(sequences);
  const emailCount = sequences.reduce((count, block) => count + block.emails.length, 0);

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]" data-testid="outbound-plantillas">
      <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg text-navy">Brief de personalización</h3>
            <p className="text-sm text-muted-foreground">La secuencia sale del ICP, la oferta y las variables de cada campaña.</p>
          </div>
          <select
            value={selectedCampaignId}
            onChange={(event) => onSelectCampaign(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-rust focus:outline-none sm:w-80"
          >
            {campaigns.length === 0 && <option value="">Sin campañas</option>}
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.title || campaign.id}
              </option>
            ))}
          </select>
        </div>
        {selectedCampaign ? (
          <PersonalizationWorkspace
            campaign={selectedCampaign}
            placeholders={placeholders}
            emailCount={emailCount}
          />
        ) : (
          <ZeroState
            title="Sin campaña seleccionada"
            body="Crea o selecciona una búsqueda para trabajar el contexto y generar la secuencia."
          />
        )}
      </section>

        <aside className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-heading text-lg text-navy">Salida</h3>
          <p className="text-sm text-muted-foreground">Estado operativo después de revisar contexto y mensajes.</p>
          {locked && (
            <div className="mt-3 rounded-md border border-yellow-500/40 bg-yellow-50 px-3 py-2 text-xs font-semibold text-yellow-800">
              Campaña lanzada o sincronizada: la secuencia queda en solo lectura.
            </div>
          )}
          <div className="mt-4 rounded-lg border border-border bg-background p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Estado de campaña</div>
            <div className="mt-2 grid gap-2 text-sm">
              <DataItem label="Estado" value={selectedCampaign?.status || "-"} />
              <DataItem label="Emails" value={emailCount ? `${emailCount} generados` : "Sin emails"} />
              <DataItem label="Canales" value={selectedCampaign ? channelText(selectedCampaign.channels) : "-"} />
            </div>
          </div>
          <details className="mt-4 rounded-lg border border-border bg-background p-3">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Acciones de envío
            </summary>
            <div className="mt-3 grid gap-2">
              {(["approve", "dry-run", "publish", "live"] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={!selectedCampaignId || actionBusy || locked}
                  onClick={() => onRunAction(action)}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-rust hover:text-rust disabled:opacity-50"
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
          </details>
        </aside>
      </div>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-heading text-lg text-navy">Secuencia generada</h3>
              <p className="text-sm text-muted-foreground">Edita emails y follow-ups antes de aprobar el envío.</p>
            </div>
            {loading && <span className="text-xs text-muted-foreground">Cargando...</span>}
          </div>
          <div className="mt-4 space-y-4">
            {sequences.length === 0 && !loading && (
              <ZeroState
                title="Sin secuencia todavía"
                body="Cuando el contexto genere mensajes, aparecerán aquí para editar asuntos, cuerpos y tiempos."
              />
            )}
            {sequences.map((block, index) => (
              <SequenceBlockEditor
                key={block.stepId || `${block.source}-${index}`}
                block={block}
                saving={saving}
                locked={locked}
                onSave={(emails) => onSave(block.stepId, emails)}
              />
            ))}
          </div>
        </section>
    </div>
  );
}

function PersonalizationWorkspace({
  campaign,
  placeholders,
  emailCount,
}: {
  campaign: Campaign | CampaignDetail;
  placeholders: string[];
  emailCount: number;
}) {
  const tokens = placeholders.length ? placeholders : ["first_name", "company_name", "pain_point"];

  return (
    <div className="mt-4 space-y-3" data-testid="b2b-personalization-workspace">
      <div className="grid gap-3">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card text-rust">
              <Target className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Contexto base</div>
              <h4 className="mt-1 font-heading text-base text-navy">{campaign.title || "Campaña outbound"}</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {campaign.hypothesis || "Sin propuesta o hipótesis definida para esta campaña."}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            <ContextSummary label="ICP" value={campaign.targetSegment || "Sin ICP definido"} />
            <ContextSummary label="Propuesta" value={campaign.hypothesis || "Sin propuesta definida"} />
          </div>
          <div className="mt-4 grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2">
            <DataItem label="Tipo" value={campaign.campaignKindLabel || "Campaña B2B"} />
            <DataItem label="Canales" value={channelText(campaign.channels)} />
            <DataItem label="Leads" value={typeof campaign.leadCount === "number" ? `${campaign.leadCount}` : "-"} />
            <DataItem label="Secuencia" value={emailCount ? `${emailCount} emails` : "Pendiente"} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Personalización</div>
              <h4 className="mt-1 font-heading text-base text-navy">Variables y ángulos</h4>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tokens.map((placeholder) => (
              <span key={placeholder} className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                {`{{${placeholder}}}`}
              </span>
            ))}
          </div>
          <div className="mt-4 grid gap-2">
            <PersonalizationCue label="Dolor" value={campaign.hypothesis || "Pendiente de definir"} />
            <PersonalizationCue label="Persona" value={campaign.targetSegment || "Pendiente de definir"} />
            <PersonalizationCue label="Canal" value={channelText(campaign.channels)} />
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <BriefStep number="1" title="ICP" body={campaign.targetSegment || "Definir segmento y rol comprador."} />
        <BriefStep number="2" title="Oferta" body={campaign.hypothesis || "Definir dolor, promesa y prueba."} />
        <BriefStep number="3" title="Mensajes" body={emailCount ? `${emailCount} emails listos para editar.` : "Generar email inicial y follow-ups."} />
        <BriefStep number="4" title="Envío" body={campaign.status || "Revisar, probar y activar."} />
      </div>
    </div>
  );
}

function BriefStep({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full border border-border bg-card font-heading text-sm font-bold text-rust">
          {number}
        </span>
        <h4 className="font-heading text-sm text-navy">{title}</h4>
      </div>
      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground" title={body}>
        {body}
      </p>
    </div>
  );
}

function PersonalizationCue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="mt-1 line-clamp-2 text-sm font-medium text-foreground" title={value}>
        {value}
      </p>
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
  locked,
  onSave,
}: {
  block: EmailSequenceBlock;
  saving: boolean;
  locked: boolean;
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
          disabled={emails.length >= 3 || saving || locked}
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
                disabled={locked || saving}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-rust focus:outline-none"
              />
              <input
                type="number"
                value={email.delayDays ?? ""}
                onChange={(event) => updateEmail(index, { delayDays: event.target.value ? Number(event.target.value) : null })}
                placeholder="Días"
                disabled={locked || saving}
                className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-rust focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeEmail(index)}
                disabled={emails.length <= 1 || saving || locked}
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
              disabled={locked || saving}
              className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm focus:border-rust focus:outline-none"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={saving || locked}
          onClick={() => onSave(emails)}
          className="rounded-lg border-2 border-rust bg-rust px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
        >
          {locked ? "Secuencia bloqueada" : saving ? "Guardando..." : "Guardar secuencia"}
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
      <aside className="space-y-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-heading text-lg text-navy">Flujo B2B</h3>
          <div className="mt-4 space-y-3 text-sm">
            <FlowRow icon={<Search className="h-4 w-4" />} title="Buscar" body="Apollo/LinkedIn alimentan prospectos." />
            <FlowRow icon={<Target className="h-4 w-4" />} title="Priorizar" body="Score ICP y señales de contacto." />
            <FlowRow icon={<Mail className="h-4 w-4" />} title="Contactar" body="Secuencia editable y aprobación humana." />
            <FlowRow icon={<Briefcase className="h-4 w-4" />} title="Cerrar" body="Reunión, deal y resultado final." />
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-heading text-lg text-navy">Sync externo</h3>
          <div className="mt-4 space-y-3 text-sm">
            <FlowRow icon={<Send className="h-4 w-4" />} title="Webhooks" body="Instantly/Unipile empujan replies, sends, opens, bounces y mensajes nuevos en tiempo casi real." />
            <FlowRow icon={<RefreshCw className="h-4 w-4" />} title="Reconciliación" body="Job incremental cada hora por campaña/account para recuperar eventos perdidos o reintentos." />
            <FlowRow icon={<CheckCircle2 className="h-4 w-4" />} title="Rollup diario" body="Yalc consolida snapshots para dashboard, funnel e inbox sin hacer polling constante." />
          </div>
        </section>
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
