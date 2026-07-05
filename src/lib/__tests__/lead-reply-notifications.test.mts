import assert from "node:assert/strict";
import { test } from "node:test";
import * as mod from "../notifications/lead-replies";

const notifications = (mod as unknown as { default?: typeof mod }).default ?? mod;

test("buildLeadReplyNotifications keeps inbound Partnerships and B2B replies", () => {
  const out = notifications.buildLeadReplyNotifications({
    partnerships: [
      {
        id: "p1",
        handle: "@creator",
        lifecycleStatus: "Replied",
        network: "Instagram",
        lastMessage: {
          id: "m1",
          direction: "in",
          body: "Me interesa, mandame detalles.",
          channel: "instagram",
          createdAt: "2026-07-05T10:00:00Z",
        },
      },
    ],
    b2b: [
      {
        id: "b1",
        firstName: "Ana",
        lastName: "Perez",
        company: "Acme",
        lifecycleStatus: "Replied",
        lastMessage: {
          id: "m2",
          direction: "incoming",
          subject: "Re: propuesta",
          body: "Lo revisamos esta semana.",
          channel: "email",
          createdAt: "2026-07-05T12:00:00Z",
        },
      },
    ],
  });

  assert.deepEqual(out.map((item) => item.leadId), ["b1", "p1"]);
  assert.equal(out[0].kind, "lead_reply");
  assert.equal(out[0].area, "b2b");
  assert.equal(out[0].contactName, "Ana Perez");
  assert.equal(out[1].area, "partnerships");
  assert.equal(out[1].contactName, "@creator");
});

test("buildLeadReplyNotifications ignores outbound-only messages", () => {
  const out = notifications.buildLeadReplyNotifications({
    partnerships: [
      {
        id: "p1",
        handle: "@creator",
        lifecycleStatus: "DM1_Sent",
        lastMessage: {
          id: "m1",
          direction: "out",
          body: "Hola",
          createdAt: "2026-07-05T10:00:00Z",
        },
      },
    ],
  });

  assert.deepEqual(out, []);
});

test("buildLeadReplyNotifications surfaces replied leads even without message preview", () => {
  const out = notifications.buildLeadReplyNotifications({
    b2b: [
      {
        id: "b1",
        email: "ana@example.com",
        lifecycleStatus: "Replied",
        repliedAt: "2026-07-05T11:00:00Z",
      },
    ],
  });

  assert.equal(out.length, 1);
  assert.equal(out[0].body, "Respuesta registrada. Abre el Inbox para revisar el hilo.");
  assert.equal(out[0].contactName, "ana@example.com");
});
