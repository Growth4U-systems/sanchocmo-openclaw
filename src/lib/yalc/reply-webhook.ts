import { addMessage as defaultAddMessage } from "@/lib/data/mc-chat";
import { addNotification as defaultAddNotification, type Notification } from "@/lib/data/notifications";

export interface YalcReplyWebhookPayload {
  event: "reply.received";
  slug: string;
  campaignId?: string;
  leadId: string;
  messageId?: string;
  channel: string;
  subject?: string | null;
  body: string;
  receivedAt?: string;
  providerMessageId?: string;
  lead: {
    providerId?: string | null;
    email?: string | null;
    handle?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    network?: string | null;
  };
  notification: {
    type: string;
    title: string;
    body: string;
    route: string;
  };
  raw: Record<string, unknown>;
}

export interface DispatchYalcReplyResult {
  ok: true;
  slug: string;
  threadId: string;
  notificationId: string;
}

export interface DispatchYalcReplyDeps {
  addMessage: typeof defaultAddMessage;
  addNotification: typeof defaultAddNotification;
}

const defaultDeps: DispatchYalcReplyDeps = {
  addMessage: defaultAddMessage,
  addNotification: defaultAddNotification,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown): string | undefined {
  const out = text(value);
  return out || undefined;
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> {
  const child = isRecord(value) ? value[key] : null;
  return isRecord(child) ? child : {};
}

function preview(value: string, max = 180): string {
  const single = value.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

function leadDisplayName(payload: Pick<YalcReplyWebhookPayload, "lead" | "leadId">): string {
  const fullName = [payload.lead.firstName, payload.lead.lastName].filter(Boolean).join(" ").trim();
  return payload.lead.handle || fullName || payload.lead.email || payload.leadId;
}

function channelLabel(channel: string): string {
  const normalized = channel.toLowerCase();
  if (normalized === "instagram") return "Instagram";
  if (normalized === "linkedin") return "LinkedIn";
  if (normalized === "email") return "Email";
  return channel || "Outreach";
}

export function sanchoReplyRoute(slug: string, leadId?: string): string {
  const query = new URLSearchParams({ tab: "inbox" });
  if (leadId) query.set("leadId", leadId);
  return `/dashboard/${encodeURIComponent(slug)}/yalc?${query.toString()}`;
}

export function parseYalcReplyWebhook(body: unknown): YalcReplyWebhookPayload {
  if (!isRecord(body)) throw new Error("Invalid reply webhook: body must be a JSON object");
  if (body.event !== "reply.received") {
    throw new Error(`Invalid reply webhook: event must be reply.received (got ${String(body.event)})`);
  }

  const slug = text(body.tenantId) || text(body.slug);
  if (!slug) throw new Error("Invalid reply webhook: tenantId is required");

  const leadId = text(body.leadId);
  if (!leadId) throw new Error("Invalid reply webhook: leadId is required");

  const messageBody = text(body.body);
  if (!messageBody) throw new Error("Invalid reply webhook: body is required");

  const leadRecord = nestedRecord(body, "lead");
  const notificationRecord = nestedRecord(body, "notification");
  const lead = {
    providerId: optionalText(leadRecord.providerId) ?? null,
    email: optionalText(leadRecord.email) ?? null,
    handle: optionalText(leadRecord.handle) ?? null,
    firstName: optionalText(leadRecord.firstName) ?? null,
    lastName: optionalText(leadRecord.lastName) ?? null,
    company: optionalText(leadRecord.company) ?? null,
    network: optionalText(leadRecord.network) ?? null,
  };
  const route = sanchoReplyRoute(slug, leadId);
  const channel = text(body.channel) || "outreach";
  const title = text(notificationRecord.title) || `Nueva respuesta de ${leadDisplayName({ lead, leadId })}`;
  const notificationBody = text(notificationRecord.body) || `${channelLabel(channel)}: ${preview(messageBody)}`;

  return {
    event: "reply.received",
    slug,
    campaignId: optionalText(body.campaignId),
    leadId,
    messageId: optionalText(body.messageId),
    channel,
    subject: optionalText(body.subject) ?? null,
    body: messageBody,
    receivedAt: optionalText(body.receivedAt),
    providerMessageId: optionalText(body.providerMessageId),
    lead,
    notification: {
      type: text(notificationRecord.type) || "reply_received",
      title,
      body: notificationBody,
      route,
    },
    raw: body,
  };
}

export function buildReplyChatMessage(payload: YalcReplyWebhookPayload): string {
  const route = sanchoReplyRoute(payload.slug, payload.leadId);
  const lines = [
    `Nueva respuesta de ${leadDisplayName(payload)}`,
    "",
    `Canal: ${channelLabel(payload.channel)}`,
    payload.subject ? `Asunto: ${payload.subject}` : "",
    `Mensaje: ${preview(payload.body, 320)}`,
    "",
    `[Abrir en Inbox](${route})`,
  ];
  return lines.filter((line) => line !== "").join("\n");
}

export function dispatchYalcReply(
  payload: YalcReplyWebhookPayload,
  deps: DispatchYalcReplyDeps = defaultDeps,
): DispatchYalcReplyResult {
  const threadId = `${payload.slug}:yalc`;
  const route = sanchoReplyRoute(payload.slug, payload.leadId);
  const notification: Notification = deps.addNotification(payload.slug, {
    type: payload.notification.type,
    title: payload.notification.title,
    body: payload.notification.body,
    metadata: {
      source: "yalc",
      event: payload.event,
      route,
      campaignId: payload.campaignId,
      leadId: payload.leadId,
      messageId: payload.messageId,
      providerMessageId: payload.providerMessageId,
      channel: payload.channel,
    },
  });
  deps.addMessage(threadId, "bot", buildReplyChatMessage(payload), "rocinante");
  return { ok: true, slug: payload.slug, threadId, notificationId: notification.id };
}
