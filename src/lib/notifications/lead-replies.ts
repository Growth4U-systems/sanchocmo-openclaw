export type NotificationArea = "partnerships" | "b2b";

export interface LeadReplyMessage {
  id?: string | null;
  direction?: string | null;
  subject?: string | null;
  body?: string | null;
  channel?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
}

export interface LeadForNotification {
  id?: string | null;
  campaignId?: string | null;
  campaignTitle?: string | null;
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  handle?: string | null;
  email?: string | null;
  company?: string | null;
  network?: string | null;
  lifecycleStatus?: string | null;
  lastMessage?: LeadReplyMessage | null;
  repliedAt?: string | null;
  emailRepliedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
}

export interface LeadReplyNotification {
  id: string;
  kind: "lead_reply";
  area: NotificationArea;
  leadId: string;
  campaignId?: string | null;
  campaignTitle?: string | null;
  contactName: string;
  company?: string | null;
  status?: string | null;
  channel?: string | null;
  subject?: string | null;
  body: string;
  receivedAt: string;
  source: "YALC";
}

const REPLY_STATUSES = new Set(["Replied", "Negotiating", "Demo_Booked"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const out = text(value);
    if (out) return out;
  }
  return "";
}

function messageCreatedAt(message?: LeadReplyMessage | null): string {
  return firstText(message?.createdAt, message?.created_at);
}

function isInboundMessage(message?: LeadReplyMessage | null): boolean {
  const direction = text(message?.direction).toLowerCase();
  return ["in", "incoming", "inbound", "reply"].includes(direction);
}

function statusSuggestsReply(status?: string | null): boolean {
  return REPLY_STATUSES.has(text(status));
}

function replyTimestamp(lead: LeadForNotification): string {
  return firstText(
    isInboundMessage(lead.lastMessage) ? messageCreatedAt(lead.lastMessage) : "",
    lead.repliedAt,
    lead.emailRepliedAt,
    statusSuggestsReply(lead.lifecycleStatus) ? lead.updatedAt : "",
    lead.createdAt,
  );
}

function contactName(lead: LeadForNotification): string {
  return firstText(
    lead.handle,
    [lead.firstName, lead.lastName].map(text).filter(Boolean).join(" "),
    lead.email,
    lead.company,
    lead.title,
    lead.id,
    "Contacto",
  );
}

function fallbackBody(lead: LeadForNotification): string {
  const status = text(lead.lifecycleStatus);
  return statusSuggestsReply(status)
    ? "Respuesta registrada. Abre el Inbox para revisar el hilo."
    : "Nueva actividad registrada.";
}

export function leadReplyNotificationFromLead(
  lead: LeadForNotification,
  area: NotificationArea,
): LeadReplyNotification | null {
  const leadId = text(lead.id);
  if (!leadId) return null;

  const hasInbound = isInboundMessage(lead.lastMessage);
  const hasReplyState = Boolean(firstText(lead.repliedAt, lead.emailRepliedAt)) || statusSuggestsReply(lead.lifecycleStatus);
  if (!hasInbound && !hasReplyState) return null;

  const receivedAt = replyTimestamp(lead);
  if (!receivedAt) return null;

  const messageId = firstText(lead.lastMessage?.id, receivedAt, lead.updatedAt);
  return {
    id: `lead-reply:${area}:${leadId}:${messageId}`,
    kind: "lead_reply",
    area,
    leadId,
    campaignId: firstText(lead.campaignId) || null,
    campaignTitle: firstText(lead.campaignTitle) || null,
    contactName: contactName(lead),
    company: firstText(lead.company) || null,
    status: firstText(lead.lifecycleStatus) || null,
    channel: firstText(lead.lastMessage?.channel, lead.network) || null,
    subject: firstText(lead.lastMessage?.subject) || null,
    body: firstText(lead.lastMessage?.body) || fallbackBody(lead),
    receivedAt,
    source: "YALC",
  };
}

export function buildLeadReplyNotifications(input: {
  partnerships?: LeadForNotification[];
  b2b?: LeadForNotification[];
}): LeadReplyNotification[] {
  const items = [
    ...(input.partnerships || []).map((lead) => leadReplyNotificationFromLead(lead, "partnerships")),
    ...(input.b2b || []).map((lead) => leadReplyNotificationFromLead(lead, "b2b")),
  ].filter((item): item is LeadReplyNotification => Boolean(item));

  return items.sort((a, b) => {
    const at = Date.parse(a.receivedAt) || 0;
    const bt = Date.parse(b.receivedAt) || 0;
    return bt - at;
  });
}
