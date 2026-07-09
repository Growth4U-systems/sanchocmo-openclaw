import { test } from "node:test";
import assert from "node:assert/strict";
// job-callback.ts is authored as an ES module but consumed as CommonJS by
// Next.js (root package.json has no "type":"module"), so under tsx --test the
// named exports may land on the `default` namespace — mirror the interop dance
// used in api-middleware.test.mts / mc-chat.test.mts.
import * as mod from "../yalc/job-callback";
import type {
  DispatchDeps,
  GatewayInboundPayload,
  JobCallbackPayload,
} from "../yalc/job-callback";
import type { SendInboundOptions } from "../runtime";

const { parseCallback, buildReEngagePayload, dispatchJobResult, summarizeOutput } = (
  mod as unknown as { default: typeof mod }
).default ?? mod;

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    event: "job.completed",
    jobId: "job_123",
    tenantId: "growth4u",
    type: "campaign.enrich",
    status: "completed",
    output: { leads: 132 },
    callbackContext: { slug: "growth4u", threadId: "growth4u:abc", agent: "rocinante" },
    timestamp: "2026-06-19T10:00:00.000Z",
    ...overrides,
  };
}

// --- parseCallback ---------------------------------------------------------

test("parseCallback accepts a valid completed payload", () => {
  const p = parseCallback(validBody());
  assert.equal(p.event, "job.completed");
  assert.equal(p.jobId, "job_123");
  assert.equal(p.type, "campaign.enrich");
  assert.deepEqual(p.callbackContext, {
    slug: "growth4u",
    threadId: "growth4u:abc",
    agent: "rocinante",
  });
});

test("parseCallback accepts a failed payload with errorMessage", () => {
  const p = parseCallback(
    validBody({ event: "job.failed", status: "failed", output: undefined, errorMessage: "Apollo 429" }),
  );
  assert.equal(p.event, "job.failed");
  assert.equal(p.errorMessage, "Apollo 429");
});

test("parseCallback rejects a non-object body", () => {
  assert.throws(() => parseCallback("nope"), /body must be a JSON object/);
});

test("parseCallback rejects an unknown event", () => {
  assert.throws(() => parseCallback(validBody({ event: "job.started" })), /event must be/);
});

test("parseCallback rejects a missing jobId", () => {
  assert.throws(() => parseCallback(validBody({ jobId: "" })), /jobId is required/);
});

test("parseCallback rejects a missing callbackContext", () => {
  const body = validBody();
  delete (body as Record<string, unknown>).callbackContext;
  assert.throws(() => parseCallback(body), /callbackContext is required/);
});

test("parseCallback rejects callbackContext missing slug/threadId/agent", () => {
  assert.throws(
    () => parseCallback(validBody({ callbackContext: { threadId: "t", agent: "a" } })),
    /callbackContext.slug is required/,
  );
  assert.throws(
    () => parseCallback(validBody({ callbackContext: { slug: "s", agent: "a" } })),
    /callbackContext.threadId is required/,
  );
  assert.throws(
    () => parseCallback(validBody({ callbackContext: { slug: "s", threadId: "t" } })),
    /callbackContext.agent is required/,
  );
});

// --- summarizeOutput -------------------------------------------------------

test("summarizeOutput surfaces count-ish fields", () => {
  assert.equal(summarizeOutput({ leads: 132 }), "leads=132");
  assert.equal(summarizeOutput({ count: 5, total: 9 }), "count=5, total=9");
  assert.equal(summarizeOutput([1, 2, 3]), "3 elementos");
  assert.equal(summarizeOutput("hello"), "hello");
  assert.equal(summarizeOutput(undefined), "(sin output)");
});

// --- buildReEngagePayload --------------------------------------------------

test("buildReEngagePayload carries slug/threadId/agent from callbackContext", () => {
  const payload = parseCallback(validBody());
  const out: GatewayInboundPayload = buildReEngagePayload(payload);
  assert.equal(out.slug, "growth4u");
  assert.equal(out.threadId, "growth4u:abc");
  assert.equal(out.agent, "rocinante");
  assert.equal(out.threadState, "continue");
  assert.equal(out.isAdmin, true);
  assert.equal(out.senderRole, "admin");
});

test("buildReEngagePayload text includes job summary for a completed job", () => {
  const payload = parseCallback(validBody());
  const out = buildReEngagePayload(payload);
  assert.match(out.text, /campaign\.enrich/);
  assert.match(out.text, /job_123/);
  assert.match(out.text, /leads=132/);
  assert.match(out.text, /completado/);
});

test("buildReEngagePayload text includes the error for a failed job", () => {
  const payload = parseCallback(
    validBody({ event: "job.failed", status: "failed", output: undefined, errorMessage: "Apollo 429" }),
  );
  const out = buildReEngagePayload(payload);
  assert.match(out.text, /FALLÓ/);
  assert.match(out.text, /Apollo 429/);
});

test("buildReEngagePayload does NOT hardcode an agent — it echoes the context agent", () => {
  const payload = parseCallback(
    validBody({ callbackContext: { slug: "acme", threadId: "acme:xyz", agent: "sanson" } }),
  );
  const out = buildReEngagePayload(payload);
  assert.equal(out.agent, "sanson");
  assert.equal(out.slug, "acme");
  assert.equal(out.threadId, "acme:xyz");
});

// --- dispatchJobResult (stubbed deps) --------------------------------------

interface AddMessageCall {
  threadId: string;
  role: string;
  text: string;
  agent?: string;
}

function makeStubDeps(fetchResult: { ok: boolean; status?: number; body?: string } = { ok: true }) {
  const addMessageCalls: AddMessageCall[] = [];
  const sendInboundCalls: { message: GatewayInboundPayload; opts: SendInboundOptions | undefined }[] = [];

  const deps: DispatchDeps = {
    addMessage: ((threadId: string, role: string, text: string, agent?: string) => {
      addMessageCalls.push({ threadId, role, text, agent });
    }) as DispatchDeps["addMessage"],
    sendInbound: async (message: GatewayInboundPayload, opts?: SendInboundOptions) => {
      sendInboundCalls.push({ message, opts });
      return {
        ok: fetchResult.ok,
        status: fetchResult.status ?? (fetchResult.ok ? 200 : 500),
        raw: fetchResult.body ?? "",
        error: fetchResult.ok ? undefined : fetchResult.body ?? "",
      };
    },
  };

  return { deps, addMessageCalls, sendInboundCalls };
}

test("dispatchJobResult sends an inbound runtime message with timeout", async () => {
  const payload: JobCallbackPayload = parseCallback(validBody());
  const { deps, addMessageCalls, sendInboundCalls } = makeStubDeps();

  const result = await dispatchJobResult(payload, deps);

  assert.equal(result.forwardedToGateway, true);
  assert.equal(result.threadId, "growth4u:abc");
  assert.equal(result.agent, "rocinante");
  assert.equal(result.jobId, "job_123");

  // It must add a system note + the synthetic user prompt to the SAME thread.
  assert.ok(addMessageCalls.length >= 2);
  assert.equal(addMessageCalls[0].threadId, "growth4u:abc");
  assert.equal(addMessageCalls[0].role, "system");
  const userMsg = addMessageCalls.find((c) => c.role === "user");
  assert.ok(userMsg, "expected a user message");
  assert.equal(userMsg!.threadId, "growth4u:abc");

  // One runtime dispatch with the same inbound payload shape.
  assert.equal(sendInboundCalls.length, 1);
  assert.equal(sendInboundCalls[0].opts?.timeoutMs, 15_000);
  const sent = sendInboundCalls[0].message;
  assert.equal(sent.slug, "growth4u");
  assert.equal(sent.threadId, "growth4u:abc");
  assert.equal(sent.agent, "rocinante");
  assert.equal(sent.threadState, "continue");
  assert.equal(sent.isAdmin, true);
});

test("dispatchJobResult keeps runtime transport details out of the callback", async () => {
  const payload = parseCallback(validBody());
  const { deps, sendInboundCalls } = makeStubDeps();

  await dispatchJobResult(payload, deps);

  assert.equal(sendInboundCalls.length, 1);
  assert.equal(sendInboundCalls[0].message.userId, "yalc-job-callback");
  assert.equal(sendInboundCalls[0].message.userName, "YALC");
});

test("dispatchJobResult reports a gateway error without throwing", async () => {
  const payload = parseCallback(validBody());
  const { deps } = makeStubDeps({ ok: false, status: 502, body: "bad gateway" });

  const result = await dispatchJobResult(payload, deps);

  assert.equal(result.forwardedToGateway, false);
  assert.match(result.error ?? "", /gateway 502/);
});

test("dispatchJobResult catches a thrown runtime dispatch error", async () => {
  const payload = parseCallback(validBody());
  const { deps } = makeStubDeps();
  deps.sendInbound = async () => {
    throw new Error("ECONNREFUSED");
  };

  const result = await dispatchJobResult(payload, deps);
  assert.equal(result.forwardedToGateway, false);
  assert.match(result.error ?? "", /ECONNREFUSED/);
});
