import { test } from "node:test";
import assert from "node:assert/strict";

const { processRuntimeControlReply } = await import("../runtime/control-actions");

const context = {
  slug: "demo",
  threadId: "demo:task-p1-t1",
  missionControlRunId: "run_owner",
  parentCapability: "a".repeat(64),
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
  const calls: Array<{
    url: string;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }> = [];
  const result = await processRuntimeControlReply(
    ':::sancho-intervene\n{"brief":"Diagnostica el runtime"}\n:::',
    context,
    {
      secret: "shared",
      nextBaseUrl: "http://next",
      fetchImpl: async (url, init) => {
        calls.push({
          url,
          body: JSON.parse(String(init.body)),
          headers: init.headers as Record<string, string>,
        });
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
  assert.equal(
    calls[0].headers["X-Mission-Control-Parent-Run-Id"],
    context.missionControlRunId,
  );
  assert.equal(
    calls[0].headers["X-Sancho-Parent-Run-Capability"],
    context.parentCapability,
  );
});

test("runtime-neutral task routing reuses a canonical target and preserves principal", async () => {
  const calls: Array<{
    url: string;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }> = [];
  const result = await processRuntimeControlReply(
    ':::task-route\n{"agent":"hamete","name":"Research","brief":"Investiga el mercado"}\n:::',
    context,
    {
      secret: "shared",
      nextBaseUrl: "http://next",
      fetchImpl: async (url, init) => {
        const body = JSON.parse(String(init.body));
        calls.push({
          url,
          body,
          headers: init.headers as Record<string, string>,
        });
        if (url.endsWith("/api/tasks/resolve-route")) {
          return response(200, {
            action: "reuse",
            threadId: "demo:task-p1-t2",
            threadName: "Research",
            dispatchGrant: "b".repeat(64),
            dispatchIdempotencyKey: "mc-control:run_owner:task-dispatch:server",
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
  assert.equal(
    calls[1].body.idempotencyKey,
    "mc-control:run_owner:task-dispatch:server",
  );
  assert.equal(
    calls[1].headers["X-Sancho-Route-Dispatch-Grant"],
    "b".repeat(64),
  );
});

test("durable parent lease headers are preserved through resolve and dispatch", async () => {
  const headers: Array<Record<string, string>> = [];
  const durableContext = {
    ...context,
    parentDispatchRunId: "dispatch_parent",
    parentDispatchLeaseToken: "lease_parent",
  };
  const result = await processRuntimeControlReply(
    ':::task-route\n{"agent":"hamete","name":"Research","brief":"Investiga"}\n:::',
    durableContext,
    {
      secret: "shared",
      nextBaseUrl: "http://next",
      fetchImpl: async (url, init) => {
        headers.push(init.headers as Record<string, string>);
        if (url.endsWith("/api/tasks/resolve-route")) {
          return response(200, {
            action: "reuse",
            threadId: "demo:task-p1-t2",
            dispatchGrant: "c".repeat(64),
            dispatchIdempotencyKey: "mc-control:durable:task-dispatch:one",
          });
        }
        return response(200, { ok: true });
      },
    },
  );
  assert.equal(result.actionsDispatched, 1);
  assert.equal(headers.length, 2);
  for (const item of headers) {
    assert.equal(item["X-Sancho-Dispatch-Run-Id"], "dispatch_parent");
    assert.equal(item["X-Sancho-Dispatch-Lease-Token"], "lease_parent");
  }
});

test("a route response without its server-issued dispatch grant fails closed", async () => {
  const calls: string[] = [];
  const result = await processRuntimeControlReply(
    ':::task-route\n{"agent":"hamete","name":"Research","brief":"Investiga"}\n:::',
    context,
    {
      secret: "shared",
      nextBaseUrl: "http://next",
      fetchImpl: async (url) => {
        calls.push(url);
        return response(200, {
          action: "reuse",
          threadId: "demo:task-p1-t2",
        });
      },
    },
  );
  assert.equal(result.actionsDispatched, 0);
  assert.deepEqual(calls, ["http://next/api/tasks/resolve-route"]);
  assert.match(result.followupMessages[0], /No pude resolver/);
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

test("a control action fails closed without parent run authority", async () => {
  let calls = 0;
  const result = await processRuntimeControlReply(
    ':::sancho-intervene\n{"brief":"Diagnostica el runtime"}\n:::',
    { ...context, parentCapability: undefined },
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
  assert.match(result.followupMessages[0], /autoridad del turno padre/);
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
