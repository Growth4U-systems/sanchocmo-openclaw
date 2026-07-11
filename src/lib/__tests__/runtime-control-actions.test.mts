import { test } from "node:test";
import assert from "node:assert/strict";

const { processRuntimeControlReply } = await import("../runtime/control-actions");

const context = {
  slug: "demo",
  threadId: "demo:task-p1-t1",
  missionControlRunId: "run_owner",
  threadName: "Outreach",
  respondingAgent: "rocinante",
  userText: "diagnostica el fallo",
  userId: "mc-client-demo",
  userName: "Cliente",
  isAdmin: false,
  senderRole: "client" as const,
  source: "discord",
};

function response(status: number, data: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

test("runtime-neutral intervention preserves principal and dispatches one temporary Sancho turn", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const result = await processRuntimeControlReply(
    ':::sancho-intervene\n{"brief":"Diagnostica el runtime"}\n:::',
    context,
    {
      secret: "shared",
      nextBaseUrl: "http://next",
      fetchImpl: async (url, init) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return response(200, { ok: true });
      },
    },
  );

  assert.equal(result.actionsDispatched, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://next/api/chat/send");
  assert.equal(calls[0].body.threadId, context.threadId);
  assert.equal(calls[0].body.agent, "sancho");
  assert.equal(calls[0].body.temporaryAgent, true);
  assert.equal(calls[0].body.controlDepth, 1);
  assert.match(String(calls[0].body.idempotencyKey), /^mc-control:/);
  assert.equal(calls[0].body.isAdmin, false);
  assert.equal(calls[0].body.senderRole, "client");
  assert.equal(calls[0].body._source, "discord");
});

test("runtime-neutral task routing reuses a canonical target and preserves principal", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const result = await processRuntimeControlReply(
    ':::task-route\n{"agent":"hamete","name":"Research","brief":"Investiga el mercado"}\n:::',
    context,
    {
      secret: "shared",
      nextBaseUrl: "http://next",
      fetchImpl: async (url, init) => {
        const body = JSON.parse(String(init.body));
        calls.push({ url, body });
        if (url.endsWith("/api/tasks/resolve-route")) {
          return response(200, {
            action: "reuse",
            threadId: "demo:task-p1-t2",
            threadName: "Research",
          });
        }
        return response(200, { ok: true });
      },
    },
  );

  assert.equal(result.actionsDispatched, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.sourceThreadId, context.threadId);
  assert.equal(calls[1].body.threadId, "demo:task-p1-t2");
  assert.equal(calls[1].body.isAdmin, false);
  assert.equal(calls[1].body.senderRole, "client");
  assert.equal(calls[1].body.controlDepth, 1);
});

test("a control-originated turn cannot chain another control action", async () => {
  let calls = 0;
  const result = await processRuntimeControlReply(
    ':::sancho-intervene\n{"brief":"Escala otra vez"}\n:::',
    { ...context, missionControlRunId: "run_owner", controlDepth: 1 },
    {
      secret: "shared",
      fetchImpl: async () => {
        calls += 1;
        return response(200, {});
      },
    },
  );
  assert.equal(calls, 0);
  assert.equal(result.actionsDispatched, 0);
  assert.match(result.followupMessages[0], /encadenamiento de control/);
});

test("temporary Sancho route markers are blocked before any network action", async () => {
  let calls = 0;
  const result = await processRuntimeControlReply(
    ':::delegate\n{"agent":"hamete","brief":"Sal de la tarea"}\n:::',
    { ...context, respondingAgent: "sancho", temporaryAgent: true },
    {
      secret: "shared",
      fetchImpl: async () => {
        calls += 1;
        return response(200, {});
      },
    },
  );
  assert.equal(calls, 0);
  assert.equal(result.actionsDispatched, 0);
  assert.match(result.text, /Bloqueé esa acción/);
});
