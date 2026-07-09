import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../yalc/reply-webhook";
import type { DispatchYalcReplyDeps } from "../yalc/reply-webhook";
import type { Notification } from "../data/notifications";

const { buildReplyChatMessage, dispatchYalcReply, parseYalcReplyWebhook, sanchoReplyRoute } = (
  mod as unknown as { default: typeof mod }
).default ?? mod;

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    event: "reply.received",
    tenantId: "growth4u",
    campaignId: "camp_1",
    leadId: "lead_1",
    messageId: "msg_1",
    channel: "instagram",
    subject: "Re: colaboración",
    body: "Sí, me interesa. ¿Qué presupuesto tenéis?",
    receivedAt: "2026-07-09T09:00:00.000Z",
    providerMessageId: "ig_msg_1",
    notification: {
      type: "reply_received",
      title: "Nueva respuesta de @ana",
      body: "Instagram: Sí, me interesa.",
      action: { route: "/outreach?tab=inbox&leadId=lead_1" },
    },
    lead: {
      handle: "@ana",
      firstName: "Ana",
      network: "instagram",
    },
    ...overrides,
  };
}

test("parseYalcReplyWebhook maps tenant replies to Sancho Inbox routes", () => {
  const payload = parseYalcReplyWebhook(validBody());

  assert.equal(payload.slug, "growth4u");
  assert.equal(payload.event, "reply.received");
  assert.equal(payload.leadId, "lead_1");
  assert.equal(payload.notification.route, "/dashboard/growth4u/yalc?tab=inbox&leadId=lead_1");
  assert.equal(sanchoReplyRoute("growth4u", "lead_1"), "/dashboard/growth4u/yalc?tab=inbox&leadId=lead_1");
});

test("parseYalcReplyWebhook rejects malformed events", () => {
  assert.throws(() => parseYalcReplyWebhook({}), /event must be reply\.received/);
  assert.throws(() => parseYalcReplyWebhook(validBody({ tenantId: "" })), /tenantId is required/);
  assert.throws(() => parseYalcReplyWebhook(validBody({ leadId: "" })), /leadId is required/);
  assert.throws(() => parseYalcReplyWebhook(validBody({ body: "" })), /body is required/);
});

test("dispatchYalcReply writes a notification and a visible Outreach thread message", () => {
  const payload = parseYalcReplyWebhook(validBody());
  const addMessageCalls: Array<{ threadId: string; role: string; text: string; agent?: string }> = [];
  const addNotificationCalls: Array<{
    slug: string;
    notification: { type: string; title: string; body: string; metadata?: Record<string, unknown> };
  }> = [];

  const deps: DispatchYalcReplyDeps = {
    addMessage: ((threadId: string, role: string, text: string, agent?: string) => {
      addMessageCalls.push({ threadId, role, text, agent });
    }) as DispatchYalcReplyDeps["addMessage"],
    addNotification: ((slug, notification) => {
      addNotificationCalls.push({ slug, notification });
      return {
        id: "ntf_1",
        type: notification.type,
        title: notification.title,
        body: notification.body,
        slug,
        created_at: "2026-07-09T09:00:00.000Z",
        sent_at: null,
        sent: false,
        metadata: notification.metadata,
      } satisfies Notification;
    }) as DispatchYalcReplyDeps["addNotification"],
  };

  const result = dispatchYalcReply(payload, deps);

  assert.deepEqual(result, {
    ok: true,
    slug: "growth4u",
    threadId: "growth4u:yalc",
    notificationId: "ntf_1",
  });
  assert.equal(addNotificationCalls.length, 1);
  assert.equal(addNotificationCalls[0].slug, "growth4u");
  assert.equal(addNotificationCalls[0].notification.type, "reply_received");
  assert.equal(addNotificationCalls[0].notification.metadata?.route, "/dashboard/growth4u/yalc?tab=inbox&leadId=lead_1");

  assert.equal(addMessageCalls.length, 1);
  assert.equal(addMessageCalls[0].threadId, "growth4u:yalc");
  assert.equal(addMessageCalls[0].role, "bot");
  assert.equal(addMessageCalls[0].agent, "rocinante");
  assert.match(addMessageCalls[0].text, /Nueva respuesta de @ana/);
  assert.match(addMessageCalls[0].text, /Abrir en Inbox/);
});

test("buildReplyChatMessage is compact and points to the same Inbox route", () => {
  const payload = parseYalcReplyWebhook(validBody());
  const text = buildReplyChatMessage(payload);
  assert.match(text, /Canal: Instagram/);
  assert.match(text, /\[Abrir en Inbox\]\(\/dashboard\/growth4u\/yalc\?tab=inbox&leadId=lead_1\)/);
});
