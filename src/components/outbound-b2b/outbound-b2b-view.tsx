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
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Network,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { OutreachTabs, type OutreachTabKey } from "@/components/outreach/outreach-tabs";
import { SlideOver } from "@/components/shared/slide-over";
import { ScoreBar, ToastViewport, useToast } from "@/components/partnerships/ui";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useOpenChat } from "@/hooks/useChat";
import { buildYalcThread } from "@/lib/chat-openers";
import { linkedInFirstContactCandidates } from "@/lib/outreach/linkedin-first-contact";
import {
  NewCampaignPanel,
  type OutboundCampaignSetupChoices,
} from "@/components/outbound-b2b/new-campaign-panel";
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

type B2BTab = OutreachTabKey | "settings";
type ContactosVista = "kanban" | "lista";
type LinkedInMessageApproach = "conversational" | "direct" | "commercial" | "organic";
type OutboundAction =
  | "workflow-start"
  | "approve"
  | "dry-run"
  | "publish"
  | "live"
  | "email-dry-run"
  | "email-send"
  | "linkedin-personalize"
  | "linkedin-dry-run"
  | "linkedin-send";
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
  customVariables?: Record<string, string> | null;
  icebreaker?: string | null;
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

interface SequencePreviewItem {
  key: string;
  channel: "LinkedIn" | "Email";
  title: string;
  timing: string;
  subject?: string | null;
  body: string;
  status?: string;
}

interface OutboundWorkflowBatchItem {
  leadId: string;
  variantId?: string | null;
  variantLabel?: string | null;
  selectionReason?: string | null;
  included: boolean;
  status: string;
  strategyId: string;
  hook: string;
  hookStatus: "verified" | "fallback" | string;
  messageBody: string;
  evidence?: Array<{
    provider: string;
    label: string;
    sourceUrl?: string | null;
  }>;
  contentHash: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

interface OutboundWorkflowStatusResponse {
  ok: boolean;
  command: string;
  campaignId: string;
  run: {
    id: string;
    status: string;
    currentStep?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    updatedAt?: string | null;
  };
  blocked?: Array<{ leadId: string; reason: string }>;
  targetingAudit?: {
    sourceRunId: string;
    discoveryStrategy: string;
    declaredAccountDescription?: string | null;
    operationalAccountDescription?: string | null;
    accountFilters: {
      keywords?: string | null;
      industries: string[];
      locations: string[];
      employeeRanges: string[];
      providedDomainCount: number;
    };
    personFilters: {
      titles: string[];
      seniorities: string[];
      locations: string[];
      emailStatuses: string[];
    };
    unappliedCriteria: string[];
    coverage: { applied: number; declared: number; percent: number };
    providers: { accounts: string; people: string; enrichment: string };
    results: {
      accountsRequested?: number | null;
      accountsFound?: number | null;
      usableDomains?: number | null;
      accountsDropped?: number | null;
      peopleFound?: number | null;
      peopleRequested?: number | null;
      peopleDropped?: number | null;
      qualified?: number | null;
      blocked?: number | null;
      targetVerified?: number | null;
      targetMismatches?: number | null;
      accountsInMemory?: number | null;
      accountsFromProvider?: number | null;
      accountsReused?: number | null;
      accountsNew?: number | null;
    };
    validation: { accounts: string; people: string };
  } | null;
  batch?: {
    id: string;
    status: string;
    channel: string;
    itemCount: number;
    contentHash: string;
    personalization?: {
      approach: LinkedInMessageApproach;
      campaignReason: string;
      framework?: "observation_relevance_value_cta_v1";
      playbook?: {
        id: string;
        version: string;
        owner?: "dulcinea";
      };
      ecp?: {
        id: string;
        name: string;
        source: string;
      };
      variants?: Array<{
        id: string;
        label: string;
        angle: string;
        selectionRule?: string;
        messageCore: string;
        cta: string;
        sourceAngleId?: string | null;
        assigned: number;
      }>;
      source: "ai_grounded" | "deterministic_fallback";
      provider?: string | null;
      generatedAt: string;
      generated: number;
      fallback: number;
    } | null;
    approvedAt?: string | null;
    approvedBy?: string | null;
    summary?: {
      included: number;
      approved: number;
      sending: number;
      sent: number;
      failed: number;
      uncertain: number;
      pending: number;
    };
    items: OutboundWorkflowBatchItem[];
    returnedItems: number;
    totalItems: number;
  } | null;
}

type OutboundTargetingAudit = NonNullable<OutboundWorkflowStatusResponse["targetingAudit"]>;

interface OutboundWorkflowPrepareResponse {
  ok: boolean;
  command: string;
  campaignId: string;
  runId: string;
  status: string;
  batch?: {
    id: string;
    itemCount: number;
    contentHash: string;
    sample: Array<{
      leadId: string;
      strategyId: string;
      hook: string;
      hookStatus: string;
      messageBody: string;
    }>;
  };
  blocked?: Array<{ leadId: string; reason: string }>;
  signalFailures?: Array<{ entityId: string; capability: string; message: string }>;
}

interface OutboundWorkflowPersonalizeResponse extends YalcQueuedJobResponse {
  ok?: boolean;
  campaignId?: string;
  runId?: string;
  personalization?: {
    generated?: number;
    fallback?: number;
  } | null;
  batch?: { itemCount?: number };
}

interface OutboundWorkflowExecuteResponse extends YalcQueuedJobResponse {
  ok?: boolean;
  command?: string;
  runId?: string;
  mode?: "dry_run" | "live";
  noExternalWrite?: boolean;
  summary?: {
    total: number;
    sent: number;
    failed: number;
    uncertain: number;
    pending: number;
  };
}

interface OutboundCampaignStartResponse extends YalcQueuedJobResponse {
  campaignId: string;
  runId: string;
  reused?: boolean;
  batch?: { itemCount?: number };
}

function workflowBlockReasonLabel(reason?: string | null): string {
  if (!reason) return "No disponible";
  if (reason.includes("connection_already_sent")) return "Conexión ya enviada";
  if (reason.includes("daily_capacity_exhausted")) return "Diferido por el cupo diario de LinkedIn";
  if (reason.includes("missing_linkedin_identity")) return "Falta identificar el perfil de LinkedIn";
  if (reason.includes("title_outside_target_roles")) return "El cargo no coincide con el target";
  if (reason.includes("company_outside_target_accounts")) return "La empresa no pertenece al target";
  if (reason.includes("missing_company_domain")) return "No se pudo verificar la empresa";
  if (reason.includes("lifecycle_sourced")) return "Pendiente de aprobación";
  if (reason.includes("lifecycle_disqualified")) return "Descartado";
  if (reason.includes("No eligible evidence")) return "Faltan empresa o motivo de contacto";
  return reason;
}

const HEADERS: Record<B2BTab, { title: string; sub: string }> = {
  encuentra: {
    title: "Encuentra personas",
    sub: "Crea una campaña y continúa siempre desde su siguiente acción.",
  },
  contactos: {
    title: "Contactos",
    sub: "Revisa las personas, sus mensajes y el estado de cada contacto.",
  },
  inbox: {
    title: "Inbox",
    sub: "Atiende solo las conversaciones que necesitan una decisión humana.",
  },
  plantillas: {
    title: "Plantillas",
    sub: "Edita las plantillas base de LinkedIn y email.",
  },
  settings: {
    title: "Settings",
    sub: "Conexiones del motor B2B y estado de proveedores de Outreach.",
  },
};

const SCORE_ROWS: Array<{ key: string; aliases?: string[]; label: string }> = [
  { key: "roleFit", aliases: ["icpFit"], label: "Rol" },
  { key: "seniorityFit", aliases: ["seniority"], label: "Seniority" },
  { key: "companyFit", label: "Empresa" },
  { key: "contactability", label: "Datos de contacto" },
  { key: "sourceConfidence", aliases: ["intent"], label: "Calidad de fuente" },
];

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

function leadPersonalization(lead: Lead): string | null {
  const variables = lead.customVariables || {};
  return variables.personalization || variables.icebreaker || lead.icebreaker || null;
}

function externalHref(value?: string | null): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.|linkedin\.com\/)/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function leadContactChannels(lead: Lead): string {
  const channels: string[] = [];
  if (lead.linkedinUrl || /linkedin|unipile/i.test(lead.source || "")) channels.push("LinkedIn");
  if (lead.email) channels.push("Email");
  return channels.length ? channels.join(" + ") : "Sin canal confirmado";
}

function leadOriginSummary(lead: Lead): string {
  const source = sourceLabel(lead);
  const campaign = lead.campaignTitle || lead.campaignId;
  return campaign ? `${source} · ${campaign}` : source;
}

function leadContactReason(lead: Lead): string {
  const role = leadRole(lead);
  const company = lead.company ? ` en ${lead.company}` : "";
  if (leadScore(lead) !== null) {
    return `Tiene fit estimado ${Math.round(leadScore(lead)!)} y encaja como ${role}${company}.`;
  }
  return `Aparece en esta campaña por su rol de ${role}${company}.`;
}

function personalizedLeadCount(leads: readonly Lead[]): number {
  return leads.filter((lead) => Boolean(leadPersonalization(lead))).length;
}

function emailLeadCount(leads: readonly Lead[]): number {
  return leads.filter((lead) => Boolean(lead.email)).length;
}

type CampaignNextAction =
  | { kind: "action"; action: "search" | "enrich"; label: string; description: string }
  | { kind: "tab"; tab: "contactos" | "plantillas" | "inbox"; label: string; description: string };

function campaignContactableLeadCount(campaign: Campaign | CampaignDetail, leads: readonly Lead[]): number {
  const channels = channelText(campaign.channels).toLowerCase();
  const wantsLinkedIn = channels.includes("linkedin");
  const wantsEmail = channels.includes("email") || !wantsLinkedIn;
  return leads.filter((lead) =>
    (wantsLinkedIn && Boolean(lead.linkedinUrl)) || (wantsEmail && Boolean(lead.email)),
  ).length;
}

function campaignNextAction(campaign: Campaign | CampaignDetail, leads: readonly Lead[]): CampaignNextAction {
  const replies = leads.filter((lead) => replyCategoryForLead(lead)).length;
  if (replies > 0) {
    return {
      kind: "tab",
      tab: "inbox",
      label: `Ver ${replies} respuesta${replies === 1 ? "" : "s"}`,
      description: "Hay conversaciones que necesitan revisión.",
    };
  }

  if (leads.some(hasExternalSendSignal)) {
    return {
      kind: "tab",
      tab: "contactos",
      label: "Ver campaña en marcha",
      description: "Los envíos ya comenzaron. Revisa el avance por persona.",
    };
  }

  if (leads.length === 0) {
    return {
      kind: "action",
      action: "search",
      label: "Buscar personas",
      description: "Encuentra personas que encajan con el target de la campaña.",
    };
  }

  const contactable = campaignContactableLeadCount(campaign, leads);
  if (contactable < leads.length) {
    return {
      kind: "action",
      action: "enrich",
      label: "Completar datos",
      description: `${leads.length - contactable} persona${leads.length - contactable === 1 ? "" : "s"} todavía no tiene un canal utilizable.`,
    };
  }

  return {
    kind: "tab",
    tab: "contactos",
    label: "Revisar y contactar",
    description: "Define por qué los contactas y revisa el mensaje de cada persona antes de enviarlo.",
  };
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
  "Esta campaña ya fue lanzada o sincronizada. Las personas quedan bloqueadas; duplica la campaña para cambios.";

function hasExternalSendSignal(lead: Lead): boolean {
  if (lead.instantlyCampaignId || lead.connectSentAt || lead.connectedAt || lead.dm1SentAt || lead.dm2SentAt || lead.repliedAt) {
    return true;
  }
  if (lead.lastMessage && lead.lastMessage.status?.toLowerCase() !== "dry_run") return true;
  if (lead.lifecycleStatus && EXTERNAL_LIFECYCLE_STATUSES.has(lead.lifecycleStatus)) return true;
  if (EXTERNAL_EMAIL_STATUS_RE.test(lead.emailStatus || "")) return true;
  return false;
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
  return stageDisplayLabel(stage || lead.lifecycleStatus);
}

function stageDisplayLabel(stage?: string | null): string {
  if (!stage) return "-";
  if (stage === DISCARDED_STAGE) return "Descartado";
  if (stage === "Discovered") return "Descubiertos";
  if (stage === "Shortlist") return "Aprobados · sin enviar";
  if (stage === "Contacted") return "Contactados";
  if (stage === "Replied") return "Respondieron";
  if (stage === "Negotiating") return "En negociación";
  if (stage === "Signed") return "Firmados";
  if (stage === "Active") return "Activos";
  if (stage === "Closed") return "Cerrados";
  return stage;
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

function campaignHasLinkedIn(campaign?: Campaign | CampaignDetail | null): boolean {
  return channelText(campaign?.channels).toLowerCase().includes("linkedin");
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

function messageEventLabel(message: LeadMessage): string {
  const status = (message.status || "").toLowerCase();
  if (message.direction === "in") return "Respuesta recibida";
  if (status === "dry_run") return "Mensaje preparado";
  if (status === "draft") return "Borrador guardado";
  if (status === "sent") return "Mensaje enviado";
  return "Mensaje saliente";
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
  if (lead.lifecycleStatus === "Connected" && !lead.dm1SentAt) return "needs_reply";
  if (category?.key === "hot" || stage === "Replied" || stage === "Negotiating") return "needs_reply";
  if (category) return "got_reply";
  if (stage === "Contacted" || /sent|delivered|opened|contacted/i.test(lead.emailStatus || "")) return "sent";
  return null;
}

function outboundActionLabel(action: OutboundAction): string {
  if (action === "workflow-start") return "Buscar y preparar campaña";
  if (action === "approve") return "Personalizar mensajes";
  if (action === "dry-run") return "Simular envíos";
  if (action === "publish") return "Contactar por email";
  if (action === "email-dry-run") return "Simular email";
  if (action === "email-send") return "Activar email";
  if (action === "linkedin-personalize") return "Generar mensajes de LinkedIn";
  if (action === "linkedin-dry-run") return "Personalizar LinkedIn";
  if (action === "linkedin-send") return "Contactar por LinkedIn";
  return "Contactar";
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

function leadTemplateVariables(lead: Lead): Record<string, string> {
  const custom = lead.customVariables || {};
  const fullName = leadDisplayName(lead);
  const role = leadRole(lead);
  const personalization = leadPersonalization(lead) || "";
  return {
    ...custom,
    yalc_lead_id: lead.id,
    leadId: lead.id,
    firstName: lead.firstName || fullName.split(/\s+/)[0] || "",
    first_name: lead.firstName || fullName.split(/\s+/)[0] || "",
    lastName: lead.lastName || "",
    last_name: lead.lastName || "",
    name: fullName,
    fullName,
    full_name: fullName,
    company: lead.company || "",
    companyName: lead.company || "",
    company_name: lead.company || "",
    title: role,
    headline: lead.headline || role,
    role,
    email: lead.email || "",
    linkedinUrl: lead.linkedinUrl || "",
    linkedin_url: lead.linkedinUrl || "",
    source: lead.source || "",
    personalization,
    icebreaker: custom.icebreaker || personalization,
  };
}

function renderLeadTemplate(template: string | null | undefined, lead: Lead): string {
  if (!template) return "";
  const variables = leadTemplateVariables(lead);
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key: string) => {
    const value = variables[key];
    return typeof value === "string" && value.trim() ? value : match;
  });
}

function scoreComponentValue(
  components: Record<string, number | null>,
  row: { key: string; aliases?: string[] },
): number | null {
  for (const key of [row.key, ...(row.aliases || [])]) {
    const value = components[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function contactStepStatus(lead: Lead, key: SequencePreviewItem["key"]): string {
  if (key === "linkedin-connect") return lead.connectSentAt ? "Enviado" : "Pendiente";
  if (key === "linkedin-dm1") return lead.dm1SentAt ? "Enviado" : lead.connectedAt ? "Listo cuando toque" : "Espera aceptación";
  if (key === "linkedin-dm2") return lead.dm2SentAt ? "Enviado" : lead.repliedAt ? "Cancelado por respuesta" : "Pendiente";
  return lead.emailStatus && /sent|delivered|opened|replied/i.test(lead.emailStatus) ? "Enviado" : "Pendiente";
}

function sequencePreviewForLead(lead: Lead, campaign?: CampaignDetail | null): SequencePreviewItem[] {
  if (!campaign) return [];
  const items: SequencePreviewItem[] = [];
  for (const block of extractEmailSequences(campaign)) {
    block.emails.forEach((email, index) => {
      const delayDays = email.delayDays ?? 0;
      items.push({
        key: `email-${block.stepId || block.source}-${index}`,
        channel: "Email",
        title: index === 0 ? "Email inicial" : `Follow-up ${index}`,
        timing: index === 0 ? "Día 0" : `+${delayDays} día${delayDays === 1 ? "" : "s"}`,
        subject: renderLeadTemplate(email.subject, lead),
        body: renderLeadTemplate(email.body, lead),
      });
    });
  }

  return items.map((item) => ({ ...item, status: contactStepStatus(lead, item.key) }));
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
  const vista: ContactosVista = queryValue(router.query.vista) === "kanban" ? "kanban" : "lista";
  const busqueda = queryValue(router.query.busqueda);
  const stageParam = queryValue(router.query.stage) as StageFilterKey | "";
  const campaignParam = queryValue(router.query.campaign);

  const [roster, setRoster] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveYalcJob | null>(null);
  const [workflowBlocked, setWorkflowBlocked] = useState<Array<{ leadId: string; reason: string }>>([]);
  const [campaignSetupOpen, setCampaignSetupOpen] = useState(false);
  const [campaignSetupOptionId, setCampaignSetupOptionId] = useState("");

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
    if (merged.tab === "contactos" && merged.vista === "kanban") query.vista = merged.vista;
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

  const campaignSetupQuery = useQuery({
    queryKey: ["yalc", slug, "b2b", "campaign-setup"],
    queryFn: () =>
      fetchJson<OutboundCampaignSetupChoices>(
        `/api/outbound/campaign-setup?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug && (campaignSetupOpen || tab === "contactos"),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!campaignSetupOpen || campaignSetupOptionId || !campaignSetupQuery.data) return;
    const recommended = campaignSetupQuery.data.options.find((option) => option.recommended);
    setCampaignSetupOptionId(recommended?.id || campaignSetupQuery.data.options[0]?.id || "");
  }, [campaignSetupOpen, campaignSetupOptionId, campaignSetupQuery.data]);

  const campaigns = useMemo(
    () => (campaignsQuery.data?.campaigns || [])
      .filter(isB2BCampaign)
      .filter((campaign) => String(campaign.status || "").toLowerCase() !== "archived"),
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
  const selectedCampaignSetupOption = useMemo(() => {
    const title = String(selectedCampaign?.title || "").toLowerCase();
    return campaignSetupQuery.data?.options.find((option) => title.startsWith(option.title.toLowerCase())) || null;
  }, [campaignSetupQuery.data?.options, selectedCampaign?.title]);
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
  const selectedLinkedInLeads = useMemo(
    () => linkedInFirstContactCandidates(selectedActiveLeads),
    [selectedActiveLeads],
  );
  const selectedLinkedInLeadIds = selectedLinkedInLeads.map((lead) => lead.id).sort().join(",");
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
  const contactReason = icpCampaign?.hypothesis ?? "";
  const workflowStatusQuery = useQuery({
    queryKey: ["yalc", slug, "b2b", "workflow", selectedCampaignId],
    queryFn: () =>
      fetchJson<OutboundWorkflowStatusResponse>(`/api/outbound/command?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "outbound.workflow.status",
          campaignId: selectedCampaignId,
          limit: 2_000,
        }),
      }),
    enabled: !!slug && !!selectedCampaignId && campaignHasLinkedIn(icpCampaign),
    retry: false,
  });
  const workflowBatchItemsByLead = useMemo(
    () => new Map((workflowStatusQuery.data?.batch?.items || []).map((item) => [item.leadId, item])),
    [workflowStatusQuery.data?.batch?.items],
  );
  const targetingAuditForDisplay = useMemo(() => {
    const audit = workflowStatusQuery.data?.targetingAudit;
    if (!audit) return null;
    const unappliedCriteria = [...new Set([
      ...audit.unappliedCriteria,
      ...(selectedCampaignSetupOption?.unappliedCriteria || []),
    ])];
    return {
      ...audit,
      declaredAccountDescription: selectedCampaignSetupOption?.declaredAccountDescription
        || audit.declaredAccountDescription,
      unappliedCriteria,
      coverage: {
        applied: audit.coverage.applied,
        declared: audit.coverage.applied + unappliedCriteria.length,
        percent: Math.round((audit.coverage.applied / Math.max(1, audit.coverage.applied + unappliedCriteria.length)) * 100),
      },
    } satisfies OutboundTargetingAudit;
  }, [selectedCampaignSetupOption, workflowStatusQuery.data?.targetingAudit]);
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
      setWorkflowBlocked([]);
      void queryClient.invalidateQueries({ queryKey: activeLeadsKey });
      void queryClient.invalidateQueries({ queryKey: discardedLeadsKey });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "b2b", "campaigns"] });
      showToast(variables.target === "Shortlist"
        ? `${leadDisplayName(variables.lead)}: aprobado. No se envió nada.`
        : variables.target === "Contacted"
          ? `${leadDisplayName(variables.lead)} marcado como contactado. Esto no crea ni envía la campaña.`
          : `${leadDisplayName(variables.lead)} -> ${stageDisplayLabel(variables.target)}`);
    },
    onError: (error) =>
      showToast(`No se pudo mover: ${error instanceof Error ? error.message : "error"}`, "warn"),
  });

  const outboundAction = useMutation<unknown, Error, { campaignId: string; action: OutboundAction }>({
    mutationFn: ({ campaignId, action }: { campaignId: string; action: OutboundAction }) => {
      if (action === "email-dry-run" || action === "email-send") {
        return fetchJson(`/api/outbound/command?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: "outbound.approve_and_publish",
            campaignId,
            channel: "email",
            profileKind: "b2b_contact",
            dryRun: action === "email-dry-run",
          }),
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
      if (action === "linkedin-dry-run" || action === "linkedin-send") {
        return fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}/linkedin-contact?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedKind: "b2b",
            action: "connect",
            dryRun: action === "linkedin-dry-run",
            ...(action === "linkedin-send" ? { confirmLinkedInSend: true } : {}),
          }),
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

  const linkedinWorkflowPrepareAction = useMutation<
    OutboundWorkflowPrepareResponse,
    Error,
    { campaignId: string; contactReason: string }
  >({
    mutationFn: async ({ campaignId, contactReason: reason }) => {
      if (!reason.trim()) throw new Error("Escribe por qué quieres contactar a estas personas.");
      const leadIds = selectedLinkedInLeads.map((lead) => lead.id);
      if (leadIds.length === 0) throw new Error("No hay personas con LinkedIn en esta campaña.");
      await fetchJson(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}?slug=${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedKind: "b2b", hypothesis: reason.trim() }),
      });
      return fetchJson<OutboundWorkflowPrepareResponse>(
        `/api/outbound/command?slug=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: "outbound.workflow.prepare",
            campaignId,
            sync: true,
            spec: {
              channels: ["linkedin"],
              contactReason: reason.trim(),
              leadIds,
              source: { enabled: false, provider: "apollo", limit: 25, criteria: {} },
              enrichment: { enabled: false },
              strategyPack: {
                strategies: [
                  { id: "company_reason_v1", version: 1, priority: 100, enabled: true, parameters: {} },
                ],
                minimumScore: 0.65,
                allowFallback: true,
              },
              approval: { required: true, sampleSize: 3 },
              sender: {},
            },
          }),
        },
      );
    },
    onSuccess: (data) => {
      setWorkflowBlocked(data.blocked || []);
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "b2b", "campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "b2b", "workflow", selectedCampaignId] });
      showToast(`${data.batch?.itemCount ?? 0} mensajes preparados. No se envió nada.`);
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "No se pudo preparar el lote LinkedIn", "warn"),
  });

  const linkedinWorkflowPersonalizeAction = useMutation<
    OutboundWorkflowPersonalizeResponse,
    Error,
    {
      campaignId: string;
      runId: string;
      approach: LinkedInMessageApproach;
      variantRules?: Record<string, string>;
    }
  >({
    mutationFn: ({ campaignId, runId, approach, variantRules }) =>
      fetchJson<OutboundWorkflowPersonalizeResponse>(
        `/api/outbound/command?slug=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: "outbound.workflow.personalize",
            campaignId,
            runId,
            approach,
            ...(variantRules && Object.keys(variantRules).length > 0 ? { variantRules } : {}),
            requestId: crypto.randomUUID(),
          }),
        },
      ),
    onSuccess: (data, variables) => {
      if (isQueuedJobResponse(data)) {
        setActiveJob({
          campaignId: variables.campaignId,
          action: "linkedin-personalize",
          jobId: data.jobId,
          status: data.status || "queued",
        });
        showToast("Generando mensajes personalizados. No se enviará nada.");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "b2b", "workflow", selectedCampaignId] });
      const generated = data.personalization?.generated ?? data.batch?.itemCount ?? 0;
      const fallback = data.personalization?.fallback ?? 0;
      showToast(`${generated} mensajes generados${fallback ? ` · ${fallback} requieren revisión` : ""}. No se envió nada.`);
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "No se pudieron generar los mensajes", "warn"),
  });

  const linkedinWorkflowSelectionAction = useMutation<
    { batch?: { itemCount?: number } },
    Error,
    { campaignId: string; runId: string; leadIds: string[] }
  >({
    mutationFn: ({ campaignId, runId, leadIds }) =>
      fetchJson<{ batch?: { itemCount?: number } }>(
        `/api/outbound/command?slug=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: "outbound.workflow.select",
            campaignId,
            runId,
            leadIds,
          }),
        },
      ),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "b2b", "workflow", selectedCampaignId] });
      showToast(`${data.batch?.itemCount ?? 0} contactos guardados para revisión. No se envió nada.`);
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "No se pudo guardar la selección", "warn"),
  });

  const linkedinWorkflowApproveAction = useMutation<
    Record<string, unknown>,
    Error,
    { campaignId: string; runId: string; silent?: boolean }
  >({
    mutationFn: ({ campaignId, runId }) =>
      fetchJson<Record<string, unknown>>(
        `/api/outbound/command?slug=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: "outbound.workflow.approve",
            campaignId,
            runId,
            actor: "Sancho",
          }),
        },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "b2b", "workflow", selectedCampaignId] });
      if (!variables.silent) showToast("Lote aprobado. Todavía no se envió nada.");
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "No se pudo aprobar el lote", "warn"),
  });

  const linkedinWorkflowExecuteAction = useMutation<
    OutboundWorkflowExecuteResponse,
    Error,
    { campaignId: string; runId: string; dryRun: boolean; itemCount: number }
  >({
    mutationFn: ({ campaignId, runId, dryRun }) =>
      fetchJson<OutboundWorkflowExecuteResponse>(
        `/api/outbound/command?slug=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: "outbound.workflow.execute",
            campaignId,
            runId,
            dryRun,
            confirmLinkedInSend: !dryRun,
          }),
        },
      ),
    onSuccess: (data, variables) => {
      if (isQueuedJobResponse(data)) {
        setActiveJob({
          campaignId: variables.campaignId,
          action: "linkedin-send",
          jobId: data.jobId,
          status: data.status || "queued",
        });
        showToast(`En cola: ${variables.itemCount} contactos por LinkedIn`);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug] });
      if (variables.dryRun) {
        showToast(`Simulación OK: ${variables.itemCount} mensajes. No se envió nada.`);
      } else {
        const sent = data.summary?.sent ?? 0;
        showToast(`LinkedIn enviado: ${sent} persona${sent === 1 ? "" : "s"}`);
      }
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "No se pudo ejecutar LinkedIn", "warn"),
  });

  useEffect(() => {
    setWorkflowBlocked([]);
  }, [selectedCampaignId, selectedLinkedInLeadIds]);

  function prepareLinkedInContact() {
    setSelectedLeadId(null);
    window.requestAnimationFrame(() => {
      document.getElementById("linkedin-contact-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const activeJobId = activeJob?.jobId;
  const activeJobAction = activeJob?.action;

  useEffect(() => {
    if (!slug || !activeJobId || !activeJobAction) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const jobId = activeJobId;
    const action = activeJobAction;

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
  }, [activeJobAction, activeJobId, queryClient, showToast, slug]);

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

  const campaignArchiveAction = useMutation({
    mutationFn: ({ campaignId }: { campaignId: string }) =>
      fetchJson<Campaign>(`/api/yalc/campaigns/${encodeURIComponent(campaignId)}?slug=${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived", expectedKind: "b2b" }),
      }),
    onSuccess: (_data, variables) => {
      const nextCampaign = campaigns.find((campaign) => campaign.id !== variables.campaignId);
      pushQuery({ campaign: nextCampaign?.id || "", busqueda: "", stage: "" });
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug, "b2b"] });
      showToast("Campaña archivada");
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "No se pudo archivar la campaña", "warn"),
  });

  const campaignStartAction = useMutation<OutboundCampaignStartResponse, Error, { optionId: string }>({
    mutationFn: ({ optionId }) =>
      fetchJson<OutboundCampaignStartResponse>(
        `/api/outbound/campaign-setup?slug=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            optionId,
            requestId: globalThis.crypto.randomUUID(),
          }),
        },
      ),
    onSuccess: (data) => {
      setCampaignSetupOpen(false);
      setCampaignSetupOptionId("");
      void queryClient.invalidateQueries({ queryKey: ["yalc", slug] });
      if (isQueuedJobResponse(data)) {
        setActiveJob({
          campaignId: data.campaignId,
          action: "workflow-start",
          jobId: data.jobId,
          status: data.status || "queued",
        });
        showToast("Buscando empresas, contactos y preparando mensajes.");
        return;
      }
      if (data.campaignId) {
        pushQuery({
          campaign: data.campaignId,
          tab: data.batch?.itemCount ? "contactos" : "encuentra",
          busqueda: "",
          stage: "",
        });
      }
      showToast(data.reused
        ? "Abrí la campaña equivalente que ya estaba preparada."
        : `${data.batch?.itemCount ?? 0} contactos preparados. No se envió nada.`);
    },
    onError: (error) => showToast(error.message || "No se pudo preparar la campaña", "warn"),
  });

  async function openB2BSearch(campaign?: Campaign, action?: "search" | "enrich" | "personalize") {
    if (!slug) return;
    if (!campaign) {
      setCampaignSetupOpen(true);
      return;
    }
    const campaignRef = `"${campaign.title || campaign.id}" (${campaign.id})`;
    const prompt = action === "search"
      ? `Continúa la campaña B2B ${campaignRef}. Usa su ICP para recomendar y buscar las personas con mejor encaje, enriquécelas si hace falta y deja una muestra de mensajes preparada. Ejecuta los pasos internos sin preguntarme qué técnica o proveedor usar. No envíes contactos reales.`
      : action === "enrich"
        ? `Continúa la campaña B2B ${campaignRef}. Completa los datos necesarios de las personas encontradas, prioriza las contactables y prepara el siguiente lote de mensajes. Ejecuta los pasos internos sin preguntarme qué técnica usar. No envíes contactos reales.`
        : action === "personalize"
          ? `Continúa la campaña B2B ${campaignRef}. Elige automáticamente la mejor personalización verificable para cada persona, prepara los mensajes a escala y enséñame tres ejemplos y las excepciones. Si no hay señales fiables, usa empresa, rol y motivo de contacto sin inventar hechos. No envíes contactos reales.`
        : `Lee el estado de la campaña B2B ${campaignRef} y continúa con el siguiente paso lógico: audiencia, enriquecimiento, personalización o muestra. Recomienda una única estrategia y ejecútala; no me presentes un menú técnico. No envíes contactos reales sin mi confirmación explícita.`;
    try {
      const context = await fetchJson<{ threadId: string }>(
        `/api/outbound/chat-context?slug=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: campaign.id }),
        },
      );
      const thread = buildYalcThread(slug, action ? prompt : undefined);
      thread.threadId = context.threadId;
      thread.threadName = campaign.title || "Campaña B2B";
      thread.threadState = "continue";
      openChat(slug, thread);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "No se pudo abrir el workflow en chat",
        "warn",
      );
    }
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
          ? `${leads.length} contacto${leads.length === 1 ? "" : "s"} marcado${leads.length === 1 ? "" : "s"} como contactado${leads.length === 1 ? "" : "s"}. Esto no crea ni envía la campaña.`
          : `${leads.length} contacto${leads.length === 1 ? "" : "s"} movido${leads.length === 1 ? "" : "s"} a ${stageDisplayLabel(target)}`,
      );
    } catch (error) {
      showToast(`Bulk incompleto: ${error instanceof Error ? error.message : "error"}`, "warn");
    } finally {
      void queryClient.invalidateQueries({ queryKey: activeLeadsKey });
      void queryClient.invalidateQueries({ queryKey: discardedLeadsKey });
    }
  }

  async function executeLinkedInWorkflow(dryRun: boolean) {
    const workflow = workflowStatusQuery.data;
    const count = workflow?.batch?.itemCount ?? 0;
    if (!selectedCampaignId || !workflow?.run.id || count === 0) return;
    if (!dryRun) {
      const confirmation = window.prompt(
        `Esto enviará ${count} mensaje${count === 1 ? "" : "s"} reales por LinkedIn. Escribe ENVIAR para continuar.`,
      );
      if (confirmation !== "ENVIAR") return;
    }
    if (!dryRun && (workflow.batch?.status === "draft" || workflow.run.status === "awaiting_approval")) {
      try {
        await linkedinWorkflowApproveAction.mutateAsync({
          campaignId: selectedCampaignId,
          runId: workflow.run.id,
          silent: true,
        });
      } catch {
        return;
      }
    }
    linkedinWorkflowExecuteAction.mutate({
      campaignId: selectedCampaignId,
      runId: workflow.run.id,
      dryRun,
      itemCount: count,
    });
  }

  function executeEmailCampaign(dryRun: boolean) {
    if (!selectedCampaignId) return;
    if (!dryRun) {
      const count = emailLeadCount(selectedActiveLeads);
      const confirmation = window.prompt(
        `Esto activará la secuencia de email para ${count} persona${count === 1 ? "" : "s"}. Escribe ENVIAR para continuar.`,
      );
      if (confirmation !== "ENVIAR") return;
    }
    outboundAction.mutate({
      campaignId: selectedCampaignId,
      action: dryRun ? "email-dry-run" : "email-send",
    });
  }

  const notConfigured = overview.data?.configured === false;
  const header = HEADERS[tab];
  const pageError = overview.error || campaignsQuery.error || activeLeadsQuery.error || discardedLeadsQuery.error;
  const actionBusy = outboundAction.isPending || !!activeJob;
  const busyAction = outboundAction.isPending ? outboundAction.variables?.action : activeJob?.action;
  const linkedinBusy =
    linkedinWorkflowPrepareAction.isPending ||
    linkedinWorkflowPersonalizeAction.isPending ||
    linkedinWorkflowSelectionAction.isPending ||
    linkedinWorkflowApproveAction.isPending ||
    linkedinWorkflowExecuteAction.isPending ||
    activeJob?.action === "linkedin-personalize" ||
    activeJob?.action === "linkedin-send";

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
          <div className="min-w-[240px]">
            <div className="op-kicker">Outreach · B2B</div>
            <h1 className="m-0 font-heading text-3xl leading-tight text-navy">{header.title}</h1>
            <p className="mb-0 mt-1 max-w-2xl text-sm text-muted-foreground">{header.sub}</p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {tab === "encuentra" && (
              <button
                type="button"
                onClick={() => void openB2BSearch()}
                className="rounded-lg border-2 border-rust bg-rust px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust/90"
                data-testid="crear-busqueda-b2b"
              >
                Nueva campaña
              </button>
            )}
            <div className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-bold text-rust">{slug || "cliente"}</span>
              <span>· Outreach</span>
            </div>
          </div>
        </header>

        <div className="space-y-4">
          <OutreachTabs
            active={tab === "settings" ? null : tab}
            tipo="b2b"
            testId="outbound-b2b-tabs"
            hidden={channelText(icpCampaign?.channels).toLowerCase().includes("email") ? [] : ["plantillas"]}
            onChange={(nextTab) => pushQuery({ tab: nextTab, campaign: selectedCampaignId })}
          />

          <div className="flex flex-wrap items-end gap-3">
            {tab !== "encuentra" && (
              <B2BCampaignSelector
                campaigns={campaigns}
                selectedCampaignId={selectedCampaignId}
                loading={campaignsQuery.isLoading}
                onSelect={(campaignId) => pushQuery({ campaign: campaignId, busqueda: "", stage: "" })}
                onRename={(campaign, title) => campaignUpdateAction.mutate({ campaignId: campaign.id, title })}
                onArchive={(campaign) => campaignArchiveAction.mutate({ campaignId: campaign.id })}
                busy={campaignUpdateAction.isPending || campaignArchiveAction.isPending}
              />
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {tab !== "encuentra" && icpCampaign && (
                <button
                  type="button"
                  onClick={() => void openB2BSearch(icpCampaign)}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:border-rust hover:text-rust"
                >
                  <MessageSquare className="h-4 w-4" />
                  Abrir en chat
                </button>
              )}
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

            {tab === "encuentra" && campaignSetupOpen && (
              <NewCampaignPanel
                choices={campaignSetupQuery.data}
                selectedId={campaignSetupOptionId}
                loading={campaignSetupQuery.isLoading}
                starting={campaignStartAction.isPending}
                error={campaignSetupQuery.error instanceof Error ? campaignSetupQuery.error.message : null}
                onSelect={setCampaignSetupOptionId}
                onStart={() => {
                  if (campaignSetupOptionId) campaignStartAction.mutate({ optionId: campaignSetupOptionId });
                }}
                onClose={() => {
                  if (campaignStartAction.isPending) return;
                  setCampaignSetupOpen(false);
                  setCampaignSetupOptionId("");
                }}
              />
            )}

            {tab === "encuentra" && (
              <B2BCampaignsTab
                campaigns={campaigns}
                leads={allLeads}
                loading={campaignsQuery.isLoading}
                actionBusy={actionBusy}
                busyCampaignId={outboundAction.variables?.campaignId || activeJob?.campaignId}
                onCreate={() => void openB2BSearch()}
                onOpen={(campaign, next) => {
                  pushQuery({ campaign: campaign.id, tab: next.tab, busqueda: "", stage: "" });
                }}
                onRunAction={(campaign, action) => {
                  pushQuery({ campaign: campaign.id, busqueda: "", stage: "" });
                  void openB2BSearch(campaign, action);
                }}
              />
            )}

            {tab === "contactos" && (
              <div className="space-y-4" data-testid="outbound-contactos">
                {campaignHasLinkedIn(icpCampaign) && (
                  <OutboundTargetingAuditPanel audit={targetingAuditForDisplay} />
                )}
                {channelText(icpCampaign?.channels).toLowerCase().includes("email") && (
                  <EmailCampaignPanel
                    leads={selectedActiveLeads}
                    personalized={personalizedLeadCount(selectedActiveLeads)}
                    busy={actionBusy}
                    busyAction={busyAction}
                    disabled={!selectedCampaignId || selectedLeadEditsLocked}
                    onPersonalize={() => {
                      if (icpCampaign) void openB2BSearch(icpCampaign, "personalize");
                    }}
                    onSimulate={() => executeEmailCampaign(true)}
                    onExecute={() => executeEmailCampaign(false)}
                  />
                )}
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
                    {activeLeadsQuery.isFetching || discardedLeadsQuery.isFetching ? "Actualizando..." : `${selectedAllLeads.length} persona${selectedAllLeads.length === 1 ? "" : "s"}`}
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
                    workflowReviewMode={campaignHasLinkedIn(icpCampaign)}
                    batchItems={workflowBatchItemsByLead}
                    selectionVersion={workflowStatusQuery.data?.batch?.contentHash}
                    selectionEditable={
                      workflowStatusQuery.data?.batch?.status === "draft"
                      && workflowStatusQuery.data?.run.status === "awaiting_approval"
                      && !linkedinBusy
                    }
                    selectionSaving={linkedinWorkflowSelectionAction.isPending}
                    busqueda={selectedCampaignId}
                    busquedaLabel={selectedCampaign?.title || null}
                    initialStage={stageParam}
                    busy={stageMutation.isPending || linkedinBusy}
                    locked={selectedLeadEditsLocked}
                    onOpen={(lead) => setSelectedLeadId(lead.id)}
                    onBulkMove={moveMany}
                    onBulkDiscard={(leads) => void moveMany(leads, DISCARDED_STAGE)}
                    onBulkContact={(leads) => void moveMany(leads, "Contacted")}
                    onSaveSelection={(leadIds) => {
                      const runId = workflowStatusQuery.data?.run.id;
                      if (!runId) return;
                      linkedinWorkflowSelectionAction.mutate({
                        campaignId: selectedCampaignId,
                        runId,
                        leadIds,
                      });
                    }}
                  />
                )}
                {campaignHasLinkedIn(icpCampaign) && (
                  <div id="linkedin-contact-panel" className="scroll-mt-4">
                    <LinkedInWorkflowPanel
                      campaign={icpCampaign}
                      leads={selectedLinkedInLeads}
                      contactReason={contactReason}
                      workflow={workflowStatusQuery.data || null}
                      blocked={workflowStatusQuery.data?.blocked || workflowBlocked}
                      loadingStatus={workflowStatusQuery.isLoading}
                      planning={linkedinWorkflowPrepareAction.isPending}
                      personalizing={
                        linkedinWorkflowPersonalizeAction.isPending ||
                        activeJob?.action === "linkedin-personalize"
                      }
                      executing={
                        linkedinWorkflowApproveAction.isPending ||
                        linkedinWorkflowExecuteAction.isPending ||
                        activeJob?.action === "linkedin-send"
                      }
                      disabled={!selectedCampaignId || linkedinBusy}
                      onPrepare={() => linkedinWorkflowPrepareAction.mutate({ campaignId: selectedCampaignId, contactReason })}
                      onPersonalize={(approach, variantRules) => {
                        const runId = workflowStatusQuery.data?.run.id;
                        if (!runId) return;
                        linkedinWorkflowPersonalizeAction.mutate({
                          campaignId: selectedCampaignId,
                          runId,
                          approach,
                          variantRules,
                        });
                      }}
                      onSimulate={() => void executeLinkedInWorkflow(true)}
                      onExecute={() => void executeLinkedInWorkflow(false)}
                    />
                  </div>
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
              <div className="space-y-4">
                <B2BPlantillasTab
                  campaign={icpCampaign}
                  campaignDetail={campaignDetailQuery.data || null}
                  leads={selectedAllLeads}
                  loading={campaignDetailQuery.isLoading}
                  saving={sequenceUpdateAction.isPending}
                  locked={selectedLeadEditsLocked}
                  onSave={(stepId, emails) =>
                    sequenceUpdateAction.mutate({ campaignId: templateCampaignId, stepId, emails })
                  }
                />
              </div>
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
          onPrepareContact={prepareLinkedInContact}
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
  onArchive,
  busy,
}: {
  campaigns: Campaign[];
  selectedCampaignId: string;
  loading: boolean;
  onSelect: (campaignId: string) => void;
  onRename: (campaign: Campaign, title: string) => void;
  onArchive: (campaign: Campaign) => void;
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

  function archiveCampaign() {
    if (!selectedCampaign) return;
    const name = selectedCampaign.title || selectedCampaign.id;
    if (!window.confirm(`Archivar la campaña B2B "${name}"? No se borra; solo deja de aparecer en la vista principal.`)) return;
    onArchive(selectedCampaign);
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
                  onClick={archiveCampaign}
                  className="block w-full px-3 py-2 text-left text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Archivar
                </button>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function B2BCampaignsTab({
  campaigns,
  leads,
  loading,
  actionBusy,
  busyCampaignId,
  onCreate,
  onOpen,
  onRunAction,
}: {
  campaigns: Campaign[];
  leads: Lead[];
  loading: boolean;
  actionBusy: boolean;
  busyCampaignId?: string;
  onCreate: () => void;
  onOpen: (campaign: Campaign, next: Extract<CampaignNextAction, { kind: "tab" }>) => void;
  onRunAction: (campaign: Campaign, action: Extract<CampaignNextAction, { kind: "action" }>["action"]) => void;
}) {
  if (loading && campaigns.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Cargando campañas...</p>;
  }

  if (campaigns.length === 0) {
    return (
      <ZeroState
        title="Sin campaña B2B"
        body="Crea una campaña para definir el target y avanzar por búsqueda, mensaje y contacto."
        action={{ label: "Nueva campaña", onClick: onCreate }}
      />
    );
  }

  const ordered = campaigns.slice().sort((a, b) =>
    String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")),
  );

  return (
    <div className="space-y-3" data-testid="outbound-campaigns">
      {ordered.map((campaign) => {
        const campaignLeads = leads.filter((lead) => lead.campaignId === campaign.id);
        const next = campaignNextAction(campaign, campaignLeads);
        const state = campaignStateMeta(campaignState(campaign));
        const replies = campaignLeads.filter((lead) => replyCategoryForLead(lead)).length;
        const isBusy = actionBusy && busyCampaignId === campaign.id;
        return (
          <article key={campaign.id} className="rounded-lg border border-border bg-card px-5 py-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-[260px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", state.stampClass)}>
                    {state.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{channelText(campaign.channels)}</span>
                </div>
                <h2 className="mt-2 font-heading text-xl text-navy">{campaign.title || campaign.id}</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  {campaign.targetSegment || "Target pendiente de definir"}
                </p>
              </div>
              <div className="flex shrink-0 gap-6 text-center">
                <MiniMetric label="personas" value={campaignLeadCount(campaign, campaignLeads)} />
                <MiniMetric
                  label="con canal"
                  value={campaignContactableLeadCount(campaign, campaignLeads)}
                  muted={campaignLeads.length === 0}
                />
                <MiniMetric label="respuestas" value={replies} muted={replies === 0} />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <div className="min-w-[260px] flex-1">
                <div className="text-sm font-semibold text-foreground">{next.label}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">{next.description}</p>
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => next.kind === "action" ? onRunAction(campaign, next.action) : onOpen(campaign, next)}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-rust bg-rust px-4 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
                data-testid={`campaign-next-${campaign.id}`}
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isBusy ? "Procesando..." : next.label}
                {!isBusy && <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function providerDisplayName(provider?: string | null): string {
  const value = String(provider || "").toLowerCase();
  if (value === "database") return "Base propia";
  if (value === "database+crustdata") return "Base propia + Crustdata";
  if (value === "database+apollo") return "Base propia + Apollo";
  if (value === "crustdata") return "Crustdata";
  if (value === "apollo") return "Apollo";
  if (value === "provided") return "Dominios definidos";
  return provider || "Sin confirmar";
}

function selectionReasonDisplay(reason?: string | null, variantLabel?: string | null): string {
  const clean = String(reason || "").trim();
  if (!clean) return "Se usó el ángulo base porque no hay una señal específica.";
  if (!/selectionRule|\bv[1-3]\b/i.test(clean)) return clean;
  const profileContext = clean.split(",")[0]?.trim().replace(/[.;:]+$/, "");
  const angle = variantLabel ? `«${variantLabel}»` : "este ángulo";
  return `${profileContext || "El perfil"}. Se eligió ${angle} como hipótesis para este perfil.`;
}

function OutboundTargetingAuditPanel({ audit }: { audit: OutboundTargetingAudit | null }) {
  if (!audit) return null;
  const accountFilters = [
    ...audit.accountFilters.industries,
    ...audit.accountFilters.locations,
    ...audit.accountFilters.employeeRanges.map((range) => `${range.replace(",", "-")} empleados`),
    ...(audit.accountFilters.keywords ? [audit.accountFilters.keywords] : []),
  ];
  const personFilters = [
    ...audit.personFilters.titles,
    ...audit.personFilters.seniorities,
    ...audit.personFilters.locations,
  ];
  const verified = audit.validation.people === "provider_and_server";

  return (
    <section className="rounded-lg border border-border bg-card p-4" data-testid="outbound-targeting-audit">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-rust" />
            <h3 className="text-sm font-semibold text-foreground">Búsqueda aplicada</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{audit.declaredAccountDescription}</p>
        </div>
        <span className={cn(
          "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-semibold",
          audit.unappliedCriteria.length === 0
            ? "border-sage/40 bg-sage/10 text-sage"
            : "border-yellow-500/40 bg-yellow-50 text-yellow-900",
        )}>
          {audit.unappliedCriteria.length === 0 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
          {audit.coverage.applied}/{audit.coverage.declared} criterios operativos
        </span>
      </div>

      <div className="mt-4 grid gap-4 border-y border-border py-3 md:grid-cols-2 md:divide-x md:divide-border">
        <div className="md:pr-4">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-foreground">Empresas</span>
            <span className="font-semibold text-muted-foreground">{providerDisplayName(audit.providers.accounts)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {accountFilters.map((filter) => (
              <span key={filter} className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground">{filter}</span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {audit.results.accountsFound ?? "-"} cumplen de hasta {audit.results.accountsRequested ?? "-"} evaluadas · {audit.results.accountsDropped ?? "-"} descartadas · {audit.results.usableDomains ?? "-"} con dominio
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Es el límite de esta búsqueda, no el total del mercado.</p>
        </div>
        <div className="md:pl-4">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-foreground">Personas</span>
            <span className="font-semibold text-muted-foreground">{providerDisplayName(audit.providers.people)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {personFilters.map((filter) => (
              <span key={filter} className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground">{filter}</span>
            ))}
          </div>
          <p className={cn("mt-2 flex items-center gap-1.5 text-xs", verified ? "text-sage" : "text-yellow-900")}>
            {verified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
            Lote solicitado: {audit.results.peopleRequested ?? "-"} · {audit.results.targetVerified ?? audit.results.qualified ?? "-"} verificadas por cargo y empresa
          </p>
        </div>
      </div>

      {audit.unappliedCriteria.length > 0 && (
        <div className="mt-3 flex items-start gap-2 text-xs text-yellow-900">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>No verificado todavía: {audit.unappliedCriteria.join(" · ")}</span>
        </div>
      )}
    </section>
  );
}

const LINKEDIN_MESSAGE_APPROACH_OPTIONS: Array<{
  id: LinkedInMessageApproach;
  name: string;
  description: string;
  recommended?: boolean;
}> = [
  { id: "conversational", name: "Conversacional", description: "Observación concreta y apertura ligera.", recommended: true },
  { id: "direct", name: "Directo", description: "Relevancia y motivo sin rodeos." },
  { id: "commercial", name: "Más comercial", description: "Problema y valor potencial más explícitos." },
  { id: "organic", name: "Orgánico", description: "Networking entre pares, con mínima presión." },
];

function LinkedInWorkflowPanel({
  campaign,
  leads,
  contactReason,
  workflow,
  blocked,
  loadingStatus,
  planning,
  personalizing,
  executing,
  disabled,
  onPrepare,
  onPersonalize,
  onSimulate,
  onExecute,
}: {
  campaign: Campaign | CampaignDetail | null;
  leads: Lead[];
  contactReason: string;
  workflow: OutboundWorkflowStatusResponse | null;
  blocked: Array<{ leadId: string; reason: string }>;
  loadingStatus: boolean;
  planning: boolean;
  personalizing: boolean;
  executing: boolean;
  disabled: boolean;
  onPrepare: () => void;
  onPersonalize: (approach: LinkedInMessageApproach, variantRules?: Record<string, string>) => void;
  onSimulate: () => void;
  onExecute: () => void;
}) {
  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  const batch = workflow?.batch || null;
  const items = batch?.items || [];
  const includedItems = items.filter((item) => item.included);
  const variantExamples = (batch?.personalization?.variants || [])
    .map((variant) => includedItems.find((item) => item.variantId === variant.id))
    .filter((item): item is OutboundWorkflowBatchItem => Boolean(item));
  const sampleItems = variantExamples.length > 0 ? variantExamples : includedItems.slice(0, 3);
  const [approach, setApproach] = useState<LinkedInMessageApproach>("conversational");
  const [variantRules, setVariantRules] = useState<Record<string, string>>({});
  const failedCount = (batch?.summary?.failed ?? 0) + (batch?.summary?.uncertain ?? 0);
  const sentCount = batch?.summary?.sent ?? items.filter((item) => item.status === "sent").length;
  const itemCount = batch?.itemCount ?? 0;
  const verifiedCount = includedItems.filter((item) => item.hookStatus === "verified").length;
  const roleOnlyCount = Math.max(0, itemCount - verifiedCount);
  const hasCampaign = !!campaign;
  const hasReason = Boolean(contactReason.trim());
  const awaitingApproval = batch?.status === "draft" || workflow?.run.status === "awaiting_approval";
  const approved = batch?.status === "approved" || workflow?.run.status === "approved";
  const finished = batch?.status === "completed" || batch?.status === "completed_with_errors";
  const reviewReady = Boolean(batch?.personalization) && itemCount > 0;
  const appliedApproach = batch?.personalization?.approach;
  const appliedVariantRules = useMemo(
    () => Object.fromEntries(
      (batch?.personalization?.variants || []).map((variant) => [variant.id, variant.selectionRule || ""]),
    ),
    [batch?.personalization?.variants],
  );
  const variantRulesDirty = JSON.stringify(variantRules) !== JSON.stringify(appliedVariantRules);
  const validVariantRules = useMemo(
    () => Object.fromEntries(
      Object.entries(variantRules).filter(([, rule]) => rule.trim().length >= 20),
    ),
    [variantRules],
  );
  const hasInvalidVariantRule = Object.values(variantRules)
    .some((rule) => rule.trim().length < 20);

  useEffect(() => {
    setApproach(batch?.personalization?.approach ?? "conversational");
  }, [campaign?.id, batch?.personalization?.approach]);

  useEffect(() => {
    setVariantRules(appliedVariantRules);
  }, [campaign?.id, batch?.personalization?.generatedAt, appliedVariantRules]);

  return (
    <section className="rounded-lg border border-border bg-card p-4" data-testid="linkedin-workflow-panel">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[260px] flex-1">
          <div className="mb-2 inline-flex items-center gap-2 rounded border border-cyan-600/30 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-cyan-800">
            <Network className="h-3 w-3" />
            LinkedIn
          </div>
          <h3 className="font-heading text-lg text-navy">Mensajes de conexión</h3>
          <p className="mt-1 text-xs text-muted-foreground">Una estrategia común, variantes controladas y un hook factual por persona.</p>
        </div>
        <p className="text-sm font-semibold text-foreground">
          {loadingStatus
            ? "Leyendo estado..."
            : personalizing
              ? "Generando mensajes…"
              : finished
                ? `${sentCount} enviados · ${failedCount} con incidencia`
                : approved
                  ? `${itemCount} aprobados · sin enviar`
                  : batch
                    ? `${itemCount} preparados · sin enviar`
                    : `${leads.length} contacto${leads.length === 1 ? "" : "s"} · sin enviar`}
        </p>
      </div>

      {!batch && (
        <div className="mt-4 flex flex-col gap-3 border-y border-border py-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-foreground">Motivo de la campaña</div>
            <p className="mb-0 mt-1 text-sm leading-relaxed text-muted-foreground">
              {contactReason || "La campaña no tiene todavía un motivo definido."}
            </p>
          </div>
          <button
            type="button"
            disabled={disabled || planning || !hasCampaign || leads.length === 0 || !hasReason}
            onClick={onPrepare}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-rust bg-rust px-4 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
            data-testid="outbound-prepare-messages"
          >
            {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
            {planning ? "Preparando..." : `Preparar ${leads.length}`}
          </button>
        </div>
      )}

      {batch && awaitingApproval && (
        <div className="mt-4 border-t border-border pt-4" data-testid="outbound-personalization-controls">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Tono de comunicación</h4>
              <p className="mb-0 mt-1 text-xs text-muted-foreground">
                {batch.personalization
                  ? `${verifiedCount} con evidencia guardada${roleOnlyCount ? ` · ${roleOnlyCount} basados solo en rol y empresa` : ""}`
                  : "Genera la versión personalizada antes de aprobar o enviar."}
              </p>
            </div>
            {batch.personalization?.source === "ai_grounded" && roleOnlyCount === 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sage">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Datos reales
              </span>
            )}
          </div>

          <div className="mt-3 grid overflow-hidden rounded-md border border-border sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Enfoque del mensaje">
            {LINKEDIN_MESSAGE_APPROACH_OPTIONS.map((option) => {
              const selected = approach === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={personalizing || executing}
                  onClick={() => setApproach(option.id)}
                  className={cn(
                    "min-h-[72px] border-b border-border px-3 py-2 text-left transition-colors last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0",
                    selected ? "bg-rust/10 text-foreground" : "bg-background text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {option.name}
                    {option.recommended && <span className="text-[10px] uppercase text-rust">Recomendado</span>}
                  </span>
                  <span className="mt-1 block text-xs leading-snug">{option.description}</span>
                </button>
              );
            })}
          </div>

          {batch.personalization?.campaignReason && (
            <div className="mt-3 border-y border-border py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
                <span>Estrategia de campaña</span>
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                  {batch.personalization.ecp && (
                    <span title={batch.personalization.ecp.source}>Foundation · {batch.personalization.ecp.name}</span>
                  )}
                  {batch.personalization.playbook && (
                    <span title={batch.personalization.playbook.id}>
                      {batch.personalization.playbook.owner === "dulcinea" ? "Playbook de Dulcinea" : "Playbook de copy"}
                      {" · "}v{batch.personalization.playbook.version}
                    </span>
                  )}
                </div>
              </div>
              <p className="mb-0 mt-1 text-sm leading-relaxed text-foreground">{batch.personalization.campaignReason}</p>
              {batch.personalization.framework === "observation_relevance_value_cta_v1" && (
                <p className="mb-0 mt-1 text-[11px] font-semibold text-muted-foreground">
                  Observación → relevancia → valor → CTA
                </p>
              )}
            </div>
          )}

          {batch.personalization?.variants && batch.personalization.variants.length > 0 && (
            <div className="mt-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
                <span>Ángulos y criterios</span>
                <span>Foundation + workflow</span>
              </div>
              <div className="mt-1 divide-y divide-border border-y border-border">
                {batch.personalization.variants.map((variant, index) => (
                  <div key={variant.id} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[160px_minmax(0,1fr)_80px] sm:gap-4">
                    <div className="font-semibold text-foreground">{String.fromCharCode(65 + index)} · {variant.label}</div>
                    <div className="min-w-0">
                      <div className="break-words text-xs text-muted-foreground">{variant.angle}</div>
                      <label className="mt-2 block text-[10px] font-semibold uppercase text-muted-foreground" htmlFor={`variant-rule-${variant.id}`}>
                        {index === 0 ? "Usar como ángulo base" : "Activar solo cuando"}
                      </label>
                      <textarea
                        id={`variant-rule-${variant.id}`}
                        value={variantRules[variant.id] ?? variant.selectionRule ?? ""}
                        disabled={personalizing || executing}
                        rows={2}
                        maxLength={220}
                        aria-invalid={Boolean(
                          (variantRules[variant.id] ?? variant.selectionRule ?? "").trim().length < 20
                        )}
                        onChange={(event) => setVariantRules((current) => ({
                          ...current,
                          [variant.id]: event.target.value,
                        }))}
                        className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-xs leading-relaxed text-foreground focus:border-rust focus:outline-none focus-visible:ring-2 focus-visible:ring-rust/30 disabled:opacity-60"
                      />
                      <div className="mt-2 break-words text-xs text-foreground">
                        <span className="font-semibold">Mensaje común:</span> {variant.messageCore}
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-muted-foreground sm:text-right">{variant.assigned} contactos</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {hasInvalidVariantRule
                ? "Cada regla necesita al menos 20 caracteres."
                : appliedApproach && appliedApproach !== approach
                ? "El enfoque elegido se aplicará al regenerar."
                : variantRulesDirty
                  ? "Las reglas nuevas se aplicarán a todo el lote."
                  : "Se actualizarán todos los mensajes incluidos; no se enviará nada."}
            </span>
            <button
              type="button"
              disabled={disabled || personalizing || executing || itemCount === 0 || hasInvalidVariantRule}
              onClick={() => onPersonalize(approach, validVariantRules)}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-rust bg-rust px-4 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
              data-testid="outbound-generate-messages"
            >
              {personalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {personalizing
                ? "Generando…"
                : variantRulesDirty
                  ? `Aplicar y regenerar ${itemCount}`
                  : batch.personalization
                    ? `Regenerar ${itemCount}`
                    : `Generar ${itemCount}`}
            </button>
          </div>
        </div>
      )}

      {leads.length === 0 && (
        <div className="mt-4 border-y border-dashed border-border py-4 text-sm text-muted-foreground">
          No hay personas aprobadas con LinkedIn. Selecciona primero los contactos del lote.
        </div>
      )}

      {workflow?.run.status === "failed" && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{workflow.run.errorMessage || "No se pudo preparar el lote."}</span>
        </div>
      )}

      {batch && (
        <div className="mt-4 border-y border-border py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span><strong className="text-foreground">{itemCount}</strong> incluidos</span>
            <span><strong className="text-foreground">{verifiedCount}</strong> con evidencia</span>
            {blocked.length > 0 && <span className="text-yellow-800"><strong>{blocked.length}</strong> fuera del lote</span>}
            {failedCount > 0 && <span className="text-destructive"><strong>{failedCount}</strong> con incidencia</span>}
          </div>
        </div>
      )}

      {batch && sampleItems.length > 0 && (
        <div className="mt-4" data-testid="outbound-message-sample">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-foreground">Previsualización</h4>
            <span className="text-xs text-muted-foreground">1 ejemplo real por ángulo aplicado</span>
          </div>
          <div className="mt-2 divide-y divide-border border-y border-border">
            {sampleItems.map((item) => {
              const lead = leadById.get(item.leadId);
              const evidence = item.evidence?.[0];
              return (
                <div key={item.leadId} className="grid gap-3 py-4 text-sm md:grid-cols-[minmax(180px,0.55fr)_minmax(0,1.45fr)] md:gap-5">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">{leadDisplayName(lead || { id: item.leadId })}</div>
                    <div className="truncate text-xs text-muted-foreground">{lead?.company || lead?.headline || item.leadId}</div>
                    <div className={cn(
                      "mt-2 flex items-start gap-1.5 text-[11px] font-semibold",
                      item.hookStatus === "verified" ? "text-sage" : "text-yellow-900",
                    )}>
                      {item.hookStatus === "verified"
                        ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                      <span>
                        {evidence
                          ? `${evidence.label} · ${providerDisplayName(evidence.provider)}`
                          : "Solo rol y empresa confirmados"}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {item.variantLabel && (
                      <div className="mb-2 text-[11px] font-semibold uppercase text-rust">Variante · {item.variantLabel}</div>
                    )}
                    {item.selectionReason && (
                      <p className="mb-2 mt-0 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-foreground">Por qué este ángulo:</span>{" "}
                        {selectionReasonDisplay(item.selectionReason, item.variantLabel)}
                      </p>
                    )}
                    <div className="text-[11px] font-semibold uppercase text-muted-foreground">Apertura personalizada</div>
                    <p className="mb-0 mt-1 leading-relaxed text-foreground">{item.hook}</p>
                    <div className="mt-3 text-[11px] font-semibold uppercase text-muted-foreground">Mensaje final</div>
                    <p className="mb-0 mt-1 whitespace-pre-wrap leading-relaxed text-foreground">{item.messageBody}</p>
                    <div className="mt-1 text-right text-[11px] text-muted-foreground">{item.messageBody.length}/280</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {blocked.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-yellow-800">Ver {blocked.length} fuera del lote</summary>
          <div className="mt-2 divide-y divide-border border-y border-border">
            {blocked.slice(0, 25).map((item) => (
              <div key={item.leadId} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{leadDisplayName(leadById.get(item.leadId) || { id: item.leadId })}</span>
                <span className="text-xs text-yellow-800">{workflowBlockReasonLabel(item.reason)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {batch && (awaitingApproval || approved) && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {!reviewReady && (
            <span className="mr-auto text-xs font-semibold text-yellow-900">Genera los mensajes antes de probar o enviar.</span>
          )}
          <button
            type="button"
            disabled={disabled || personalizing || executing || !reviewReady}
            onClick={onSimulate}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold transition-colors hover:border-sage hover:text-sage disabled:opacity-50"
            data-testid="outbound-test-messages"
          >
            {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Probar sin enviar
          </button>
          <button
            type="button"
            disabled={disabled || personalizing || executing || !reviewReady}
            onClick={onExecute}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-rust bg-rust px-4 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
            data-testid="outbound-send-messages"
          >
            {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar {itemCount}
          </button>
        </div>
      )}
    </section>
  );
}

function EmailCampaignPanel({
  leads,
  personalized,
  busy,
  busyAction,
  disabled,
  onPersonalize,
  onSimulate,
  onExecute,
}: {
  leads: Lead[];
  personalized: number;
  busy: boolean;
  busyAction?: OutboundAction;
  disabled: boolean;
  onPersonalize: () => void;
  onSimulate: () => void;
  onExecute: () => void;
}) {
  const emailLeads = emailLeadCount(leads);
  const ready = emailLeads > 0 && personalized >= emailLeads;
  return (
    <section className="rounded-lg border border-border bg-card p-4" data-testid="email-campaign-panel">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[260px] flex-1">
          <div className="mb-2 inline-flex items-center gap-2 rounded border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Mail className="h-3 w-3" />
            Contactar por email
          </div>
          <h3 className="font-heading text-lg text-navy">Personalizar y activar</h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Revisa la secuencia de arriba. Sancho publicará la campaña en la herramienta de email conectada.
          </p>
        </div>
        <p className="text-sm font-semibold text-foreground">
          {personalized} de {emailLeads} personalizados
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || busy || emailLeads === 0}
          onClick={onPersonalize}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold transition-colors hover:border-rust hover:text-rust disabled:opacity-50"
        >
          <MessageSquare className="h-4 w-4" />
          {personalized > 0 ? "Actualizar en chat" : "Preparar en chat"}
        </button>
        <button
          type="button"
          disabled={disabled || busy || !ready}
          onClick={onSimulate}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-sage bg-sage/10 px-3 text-sm font-semibold text-sage transition-colors hover:bg-sage/15 disabled:opacity-50"
        >
          {busy && busyAction === "email-dry-run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Simular
        </button>
        <button
          type="button"
          disabled={disabled || busy || !ready}
          onClick={onExecute}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-rust bg-rust px-3 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
        >
          {busy && busyAction === "email-send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Aprobar y activar
        </button>
      </div>
      {emailLeads === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">No hay personas con email utilizable. Completa sus datos antes de activar la campaña.</p>
      )}
    </section>
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
          Campaña lanzada o sincronizada: las personas quedan en solo lectura.
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
                  <div className="text-xs font-semibold text-muted-foreground">
                    {stageDisplayLabel(stage.key)}
                  </div>
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
  const linkedinHref = externalHref(lead.linkedinUrl);

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
            {linkedinHref && <InfoChip icon={<ExternalLink className="h-3 w-3" />} label="LinkedIn" href={linkedinHref} />}
          </div>
        </div>
        <span className={scoreBandClass(score)}>{score == null ? "-" : Math.round(score)}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{leadRole(lead)}</p>
      {stage === "Discovered" && !locked && (
        <div className="mt-2 flex gap-1.5 border-t border-border pt-2">
          <button
            type="button"
            title="Aprobar sin enviar"
            onClick={(event) => {
              event.stopPropagation();
              onMove(lead, "Shortlist");
            }}
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold transition-colors hover:border-rust hover:text-rust"
          >
            Aprobar sin enviar
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
  workflowReviewMode,
  batchItems,
  selectionVersion,
  selectionEditable,
  selectionSaving,
  busqueda,
  busquedaLabel,
  initialStage,
  onOpen,
  onBulkMove,
  onBulkDiscard,
  onBulkContact,
  onSaveSelection,
  busy,
  locked,
}: {
  leads: Lead[];
  workflowReviewMode?: boolean;
  batchItems?: Map<string, OutboundWorkflowBatchItem>;
  selectionVersion?: string;
  selectionEditable?: boolean;
  selectionSaving?: boolean;
  busqueda: string;
  busquedaLabel?: string | null;
  initialStage?: StageFilterKey | "";
  onOpen: (lead: Lead) => void;
  onBulkMove: (leads: Lead[], target: StageFilterKey) => void;
  onBulkDiscard: (leads: Lead[]) => void;
  onBulkContact: (leads: Lead[]) => void;
  onSaveSelection?: (leadIds: string[]) => void;
  busy?: boolean;
  locked?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<StageFilterKey | "">(initialStage ?? "");
  const [sortKey, setSortKey] = useState<"score" | "company" | null>("score");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const workflowReview = Boolean(workflowReviewMode || (batchItems && batchItems.size > 0));
  const selectionLocked = Boolean(locked || (workflowReview && !selectionEditable));
  const persistedSelection = useMemo(() => {
    const next: Record<string, boolean> = {};
    for (const [leadId, item] of batchItems || []) {
      if (item.included) next[leadId] = true;
    }
    return next;
  }, [batchItems, selectionVersion]);

  const visible = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    const filtered = leads.filter((lead) => {
      if (busqueda && lead.campaignId !== busqueda) return false;
      const leadStage = stageForStatus(lead.lifecycleStatus);
      if (!stage && leadStage === DISCARDED_STAGE) return false;
      if (stage && leadStage !== stage) return false;
      if (searchValue) {
        const batchItem = batchItems?.get(lead.id);
        const haystack = [
          leadDisplayName(lead),
          lead.company,
          lead.email,
          leadRole(lead),
          lead.source,
          batchItem?.variantLabel,
          batchItem?.selectionReason,
          batchItem?.hook,
          batchItem?.messageBody,
        ]
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
  }, [leads, batchItems, busqueda, search, sortKey, sortDir, stage]);

  const pageSize = 100;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * pageSize;
  const pageRows = visible.slice(pageStart, pageStart + pageSize);

  const selectedLeads = useMemo(() => leads.filter((lead) => selected[lead.id]), [leads, selected]);
  const selectableVisible = useMemo(
    () => workflowReview ? pageRows.filter((lead) => batchItems?.has(lead.id)) : pageRows,
    [batchItems, pageRows, workflowReview],
  );
  const allVisibleChecked = !selectionLocked
    && selectableVisible.length > 0
    && selectableVisible.every((lead) => selected[lead.id]);
  const persistedIds = Object.keys(persistedSelection).sort();
  const selectedIds = Object.keys(selected).filter((leadId) => selected[leadId]).sort();
  const selectionDirty = workflowReview && persistedIds.join(",") !== selectedIds.join(",");

  useEffect(() => {
    if (workflowReview) setSelected(persistedSelection);
    else if (locked) setSelected({});
  }, [locked, persistedSelection, selectionVersion, workflowReview]);

  useEffect(() => {
    setPage(0);
  }, [busqueda, search, sortDir, sortKey, stage]);

  function toggleSort(key: "score" | "company") {
    if (sortKey === key) {
      setSortDir((dir) => (dir === -1 ? 1 : -1));
    } else {
      setSortKey(key);
      setSortDir(key === "score" ? -1 : 1);
    }
  }

  function toggleSelected(leadId: string) {
    if (selectionLocked || (workflowReview && !batchItems?.has(leadId))) return;
    setSelected((current) => {
      const next = { ...current };
      if (next[leadId]) delete next[leadId];
      else next[leadId] = true;
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    if (selectionLocked) return;
    setSelected((current) => {
      const next = { ...current };
      for (const lead of selectableVisible) {
        if (checked) next[lead.id] = true;
        else delete next[lead.id];
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(workflowReview ? persistedSelection : {});
  }

  return (
    <div>
      {busqueda && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border border-l-4 border-l-rust bg-card px-4 py-2 text-sm" data-testid="b2b-busqueda-banner">
          <Search className="h-4 w-4 text-rust" />
          Personas de la campaña: <b>{busquedaLabel || busqueda}</b>
        </div>
      )}
      {locked && (
        <div className="mb-3 rounded-lg border border-yellow-500/30 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
          Campaña lanzada o sincronizada: las personas quedan en solo lectura.
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar persona, empresa, ángulo o mensaje..."
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
              {stageDisplayLabel(item.key)}
            </option>
          ))}
          <option value={DISCARDED_STAGE}>Descartados</option>
        </select>
        {workflowReview && (
          <span className="ml-auto text-xs font-semibold text-foreground">
            {selectedIds.length} de {batchItems?.size ?? 0} para contactar
            {selectionDirty && <span className="ml-2 text-rust">· sin guardar</span>}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1480px] table-fixed text-left text-sm" data-testid="outbound-lista">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="w-24 px-3 py-2.5">
                <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allVisibleChecked}
                  disabled={selectionLocked || selectableVisible.length === 0}
                  onChange={(event) => toggleAllVisible(event.target.checked)}
                  className="h-4 w-4 accent-rust"
                />
                  Contactar
                </span>
              </th>
              <th className="w-56 px-3 py-2.5">Persona</th>
              <SortableTh className="w-24" label="Fit estimado" active={sortKey === "score"} dir={sortDir} onClick={() => toggleSort("score")} />
              <SortableTh className="w-48" label="Empresa" active={sortKey === "company"} dir={sortDir} onClick={() => toggleSort("company")} />
              <th className="w-44 px-3 py-2.5">Rol</th>
              <th className="w-64 px-3 py-2.5">Ángulo + apertura</th>
              <th className="w-[420px] px-3 py-2.5">Mensaje</th>
              <th className="w-28 px-3 py-2.5">Fuente</th>
              <th className="w-28 px-3 py-2.5">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm italic text-muted-foreground">
                  Ningún prospecto coincide con esos filtros.
                </td>
              </tr>
            )}
            {pageRows.map((lead) => {
              const discarded = stageForStatus(lead.lifecycleStatus) === DISCARDED_STAGE;
              const batchItem = batchItems?.get(lead.id);
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
                      disabled={selectionLocked || (workflowReview && !batchItem)}
                      onChange={() => toggleSelected(lead.id)}
                      className="h-4 w-4 accent-rust"
                      aria-label={`Contactar a ${leadDisplayName(lead)}`}
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
                    <span
                      className={scoreBandClass(leadScore(lead))}
                      title="Estimación heurística. La validación de filtros está en el resumen de búsqueda."
                    >
                      {leadScore(lead) == null ? "-" : Math.round(leadScore(lead)!)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-foreground">{lead.company || "-"}</div>
                    <div className="text-[11px] text-muted-foreground">{lead.companySize || lead.location || lead.companyDomain || ""}</div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{leadRole(lead)}</td>
                  <td className="px-3 py-2.5 align-top">
                    {batchItem?.variantLabel && (
                      <span className="mb-1 block text-[10px] font-semibold uppercase text-rust">
                        {batchItem.variantLabel}
                      </span>
                    )}
                    {batchItem?.selectionReason && (
                      <p className="mb-1 mt-0 text-[11px] leading-relaxed text-muted-foreground">
                        {selectionReasonDisplay(batchItem.selectionReason, batchItem.variantLabel)}
                      </p>
                    )}
                    <p className="m-0 whitespace-normal break-words text-xs leading-relaxed text-foreground">{batchItem?.hook || "-"}</p>
                    {batchItem && (
                      <span className="mt-1 block text-[10px] font-semibold uppercase text-muted-foreground">
                        {batchItem.hookStatus === "verified" ? "Evidencia validada" : "Rol + empresa"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <p className="m-0 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">{batchItem?.messageBody || "-"}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <SourceChip lead={lead} />
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
        Mostrando {visible.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + pageSize, visible.length)} de {visible.length}
        {visible.length !== leads.length && ` · ${leads.length} totales`}
        {stage !== DISCARDED_STAGE && " · descartadas excluidas por defecto"}
      </p>

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            title="Página anterior"
            disabled={safePage === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
          </button>
          <span className="min-w-24 text-center text-xs font-semibold text-foreground">
            {safePage + 1} de {pageCount}
          </span>
          <button
            type="button"
            title="Página siguiente"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {workflowReview && selectionDirty && !locked && (
        <div className="fixed bottom-6 left-1/2 z-[550] flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-5 py-3 shadow-lg" data-testid="b2b-workflow-selection-bar">
          <span className="text-sm font-semibold text-foreground">
            {selectedIds.length} para contactar
          </span>
          <button
            type="button"
            disabled={selectionSaving || selectedIds.length === 0}
            onClick={() => onSaveSelection?.(selectedIds)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-rust bg-rust px-3 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
          >
            {selectionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {selectionSaving ? "Guardando..." : "Guardar lote"}
          </button>
          <button
            type="button"
            title="Deshacer cambios"
            disabled={selectionSaving}
            onClick={clearSelection}
            className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {!workflowReview && selectedLeads.length > 0 && !locked && (
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
                {stageDisplayLabel(item.key)}
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
            Marcar contactados
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
  className,
  active,
  dir,
  onClick,
}: {
  label: string;
  className?: string;
  active: boolean;
  dir: 1 | -1;
  onClick: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className={cn("cursor-pointer select-none px-3 py-2.5 transition-colors hover:text-foreground", active && "text-rust", className)}
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
  onPrepareContact,
  busy,
  locked,
}: {
  slug: string;
  lead: Lead | null;
  onClose: () => void;
  onMove: (lead: Lead, target: StageFilterKey, note?: string) => void;
  onPrepareContact: () => void;
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
  const campaignDetail = useQuery({
    queryKey: ["yalc", slug, "b2b", "lead-campaign", lead?.campaignId],
    queryFn: () =>
      fetchJson<CampaignDetail>(
        `/api/yalc/campaigns/${encodeURIComponent(lead!.campaignId!)}?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug && !!lead?.campaignId,
  });

  if (!lead) return null;

  const score = leadScore(lead);
  const components = lead.fitBreakdown || {};
  const messages = thread.data?.messages || [];
  const preparedMessages = messages.filter((message) =>
    message.direction === "out" && (message.status === "dry_run" || message.status === "draft"),
  );
  const campaignForLead = campaignDetail.data || null;
  const sequencePreview = sequencePreviewForLead(lead, campaignForLead);
  const linkedinHref = externalHref(lead.linkedinUrl);
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
          {linkedinHref ? (
            <InfoChip
              icon={<ExternalLink className="h-3 w-3" />}
              label="Abrir LinkedIn"
              href={linkedinHref}
            />
          ) : lead.linkedinUrl ? (
            <InfoChip icon={<ExternalLink className="h-3 w-3" />} label="LinkedIn no válido" />
          ) : null}
          <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", stageClasses(lead))}>
            {stageLabel(lead)}
          </span>
        </div>

        {locked && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
            Campaña lanzada o sincronizada: esta ficha queda en solo lectura.
          </div>
        )}

        {!locked && stage === "Shortlist" && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-sage" />
                Aprobado · sin enviar
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">Se incluirá en el próximo lote de LinkedIn.</div>
            </div>
            <button
              type="button"
              onClick={onPrepareContact}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-rust bg-rust px-3 text-sm font-semibold text-white transition-colors hover:bg-rust/90"
            >
              <MessageSquare className="h-4 w-4" />
              Preparar contacto
            </button>
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
                  Aprobar sin enviar
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
                Restaurar a descubiertos
              </button>
            )}
          </div>
        )}

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Lead en esta campaña</h3>
          <div className="mt-3 grid gap-3 text-sm">
            <ContextLine label="Rol" value={leadRole(lead)} />
            <ContextLine label="Empresa" value={lead.company || "-"} />
            <ContextLine label="Origen" value={leadOriginSummary(lead)} />
            <ContextLine label="Canal" value={leadContactChannels(lead)} />
            <ContextLine label="Motivo" value={leadContactReason(lead)} />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Fit estimado</h3>
          <div className="mt-3 flex items-start gap-4">
            <div className={scoreBandClass(score, "lg")} data-testid="b2b-score-total">
              {score == null ? "-" : Math.round(score)}
            </div>
            <div className="min-w-0 flex-1 space-y-2.5">
              {SCORE_ROWS.map((row) => {
                const value = scoreComponentValue(components, row);
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
            <DataItem label="Empresa" value={lead.company || "-"} />
            <DataItem label="Email" value={lead.email || "-"} />
            <DataItem label="LinkedIn" value={linkedinHref ? "Abrir perfil" : lead.linkedinUrl || "-"} href={linkedinHref || undefined} />
            <DataItem label="Búsqueda" value={lead.campaignTitle || lead.campaignId || "-"} />
            <DataItem label="Fuente" value={sourceLabel(lead)} />
            <DataItem label="Ubicación" value={lead.location || "-"} />
            <DataItem label="Creado" value={compactDate(lead.createdAt)} />
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Secuencia de esta campaña</h3>
            {campaignForLead?.title && <span className="text-xs text-muted-foreground">{campaignForLead.title}</span>}
          </div>
          {sequencePreview.length > 0 ? (
            <div className="mt-3 space-y-3">
              {sequencePreview.map((item, index) => (
                <SequencePreviewCard key={item.key} item={item} index={index} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Esta campaña todavía no tiene secuencia configurada.
            </p>
          )}
        </section>

        {preparedMessages.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Previews registrados</h3>
            <div className="mt-3 space-y-3">
              {preparedMessages.map((message) => (
                <div key={message.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>{messageChannelLabel(message, lead)}</span>
                    <span>{message.status === "dry_run" ? "Preview" : "Draft"}</span>
                    {message.createdAt && <span>{formatDateTime(message.createdAt)}</span>}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{message.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}

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
                title={`${messageEventLabel(message)}${message.subject ? ` - ${message.subject}` : ""}`}
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
                    <DataItem
                      label="LinkedIn"
                      value={externalHref(selected.linkedinUrl) ? "Abrir perfil" : selected.linkedinUrl || "-"}
                      href={externalHref(selected.linkedinUrl) || undefined}
                    />
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
  campaign,
  campaignDetail,
  loading,
  saving,
  locked,
  onSave,
}: {
  campaign: Campaign | CampaignDetail | null;
  campaignDetail: CampaignDetail | null;
  leads: Lead[];
  loading: boolean;
  saving: boolean;
  locked: boolean;
  onSave: (stepId: string | undefined, emails: EmailSequenceEmail[]) => void;
}) {
  const sequences = extractEmailSequences(campaignDetail);
  const selectedCampaign = campaignDetail || campaign;
  return (
    <section className="rounded-xl border border-border bg-card p-4" data-testid="outbound-plantillas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg text-navy">Secuencia de email</h3>
          <p className="text-sm text-muted-foreground">Email inicial y follow-ups de la campaña seleccionada.</p>
        </div>
        {loading && <span className="text-xs text-muted-foreground">Cargando...</span>}
      </div>
      <div className="mt-4 space-y-4">
        {!selectedCampaign && !loading && <ZeroState title="Sin campaña seleccionada" body="Selecciona una campaña de email." />}
        {selectedCampaign && sequences.length === 0 && !loading && (
          <ZeroState title="Secuencia pendiente" body="Todavía no hay mensajes de email guardados." />
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
            <FlowRow icon={<Search className="h-4 w-4" />} title="Buscar personas" body="Encuentra cuentas y contactos que encajan con el target." />
            <FlowRow icon={<Target className="h-4 w-4" />} title="Enriquecer datos" body="Completa cargo, empresa, email, LinkedIn y señales de fit." />
            <FlowRow icon={<Mail className="h-4 w-4" />} title="Preparar mensaje" body="Añade nombre, empresa y motivo de contacto." />
            <FlowRow icon={<Send className="h-4 w-4" />} title="Contactar" body="Simula primero y envía solo lo aprobado." />
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-heading text-lg text-navy">Conexiones</h3>
          <div className="mt-4 space-y-3 text-sm">
            <FlowRow icon={<Send className="h-4 w-4" />} title="Eventos" body="Sancho recibe respuestas, envíos, aperturas y mensajes nuevos." />
            <FlowRow icon={<RefreshCw className="h-4 w-4" />} title="Recuperación" body="Una revisión periódica trae eventos perdidos o reintentos." />
            <FlowRow icon={<CheckCircle2 className="h-4 w-4" />} title="Resumen diario" body="Sancho consolida métricas para dashboard, funnel e inbox." />
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

function InfoChip({ icon, label, href }: { icon: ReactNode; label: string; href?: string }) {
  const className = "inline-flex max-w-[180px] items-center gap-1 truncate rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground";
  const content = (
    <>
      {icon}
      <span className="truncate">{label}</span>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cn(className, "transition-colors hover:border-rust hover:text-rust")}
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </a>
    );
  }
  return (
    <span className={className}>
      {content}
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

function DataItem({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground" title={href || value}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 truncate text-rust underline-offset-2 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="truncate">{value}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function SequencePreviewCard({ item, index }: { item: SequencePreviewItem; index: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{index + 1}. {item.channel}</span>
        <span>{item.title}</span>
        <span>{item.timing}</span>
        {item.status && <span>{item.status}</span>}
      </div>
      {item.subject && <div className="mb-2 text-sm font-semibold text-foreground">{item.subject}</div>}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{item.body || "-"}</p>
    </div>
  );
}

function ContextLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-background px-3 py-2 sm:grid-cols-[130px_minmax(0,1fr)]">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="min-w-0 text-sm leading-relaxed text-foreground">{value}</div>
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
