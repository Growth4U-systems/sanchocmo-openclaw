import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-chat-webhook-run-"));
process.env.MC_WORKSPACE = tmp;
process.env.SANCHO_RUNTIME = "external-http";
process.env.SANCHO_EXTERNAL_SECRET = "callback-secret";
process.env.MC_CHAT_SECRET = "callback-secret";
process.env.SANCHO_RUNTIME_TERMINAL_GRANT_SECRET =
  "webhook-terminal-grant-secret".padEnd(64, "x");

const { resetRuntimeForTests } = await import("../runtime");
resetRuntimeForTests();
const runsModule = await import("../data/agent-runs");
const agentRuns =
  (runsModule as unknown as { default: typeof runsModule }).default ??
  runsModule;
const chatModule = await import("../data/mc-chat");
const chat =
  (chatModule as unknown as { default: typeof chatModule }).default ??
  chatModule;
const readbackModule = await import("../quality/artifact-readback");
const artifactReadback =
  (readbackModule as unknown as { default: typeof readbackModule }).default ??
  readbackModule;
const { TERMINAL_CALLBACK_CLAIM_LEASE_MS } = await import(
  "../data/agent-run-callback-claim"
);
const { issueRuntimeTerminalCallbackGrant } = await import(
  "../runtime/runtime-terminal-callback-grant"
);
const { webhookHandler } = await import("@/pages/api/chat/webhook");

function mockResponse() {
  let statusCode = 200;
  let payload: Record<string, unknown> = {};
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: Record<string, unknown>) {
      payload = value;
      return this;
    },
  } as unknown as NextApiResponse;
  return { res, read: () => ({ statusCode, payload }) };
}

const callbackCapability = "c".repeat(64);

function createCallbackRun(
  input: Parameters<typeof agentRuns.createAgentRun>[0],
) {
  const persisted = input.input && typeof input.input === "object" && !Array.isArray(input.input)
    ? input.input as Record<string, unknown>
    : {};
  const slug = input.threadId.slice(0, input.threadId.indexOf(":"));
  return agentRuns.createAgentRun({
    ...input,
    input: {
      ...persisted,
      slug,
      threadId: input.threadId,
      runtimeToolCapabilitySha256: createHash("sha256")
        .update(callbackCapability)
        .digest("hex"),
    },
  });
}

function callbackHeaders(runId: string) {
  return {
    "x-mc-secret": "callback-secret",
    "x-mission-control-run-id": runId,
    "x-sancho-run-capability": callbackCapability,
  };
}

const syntheticRuntimeLossMessage =
  "El runtime se reinició después de iniciar este turno. No lo reejecuté para evitar duplicar búsquedas, herramientas o cambios. Puedes reintentarlo con seguridad.";

function terminalGrantHeaders(input: {
  runId: string;
  runtimeId: string;
  dispatchRunId?: string;
  transportSecret?: string;
}) {
  const grant = issueRuntimeTerminalCallbackGrant({
    parentAgentRunId: input.runId,
    ...(input.dispatchRunId
      ? { dispatchRunId: input.dispatchRunId }
      : {}),
    runtimeId: input.runtimeId,
    runtimeToolCapability: callbackCapability,
    transportSecretSha256: createHash("sha256")
      .update(input.transportSecret ?? "callback-secret")
      .digest("hex"),
  });
  return {
    ...callbackHeaders(input.runId),
    ...(input.dispatchRunId
      ? { "x-sancho-dispatch-run-id": input.dispatchRunId }
      : {}),
    "x-sancho-terminal-callback-grant": grant.token,
  };
}

test("a late owner callback completes only its exact run and preserves the temporary run state", async () => {
  const threadId = "demo:task-p1-t1";
  const owner = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "rocinante",
    input: { slug: "demo", userText: "owner", senderRole: "client" },
  });
  agentRuns.markAgentRunDispatched(owner.id, threadId);
  const temporary = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: {
      slug: "demo",
      userText: "temporary",
      temporaryAgent: true,
      senderRole: "client",
    },
  });
  agentRuns.markAgentRunDispatched(temporary.id, threadId);
  chat.setStatusEntry(threadId, {
    text: "Sancho sigue trabajando",
    agent: "sancho",
    ts: Date.now(),
  });

  const req = {
    method: "POST",
    headers: callbackHeaders(owner.id),
    body: {
      slug: "demo",
      threadId,
      missionControlRunId: owner.id,
      text: "Parte tardía del owner",
      agent: "rocinante",
    },
    query: {},
  } as unknown as NextApiRequest;
  const mocked = mockResponse();
  await webhookHandler(req, mocked.res);

  assert.equal(mocked.read().statusCode, 200);
  assert.equal(agentRuns.getAgentRunById(owner.id)?.status, "completed");
  assert.equal(agentRuns.getAgentRunById(temporary.id)?.status, "running");
  assert.equal(agentRuns.getLatestActiveRun(threadId)?.id, temporary.id);
  assert.equal(chat.getStatusEntry(threadId)?.text, "Sancho sigue trabajando");
});

test("an external callback dispatches authorized control before terminalizing its parent", async () => {
  const threadId = "demo:runtime-control";
  const run = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "rocinante",
    input: {
      slug: "demo",
      userText: "diagnostica",
      userId: "mc-admin",
      userName: "Admin",
      isAdmin: true,
      senderRole: "admin",
      readOnly: false,
      controlDepth: 0,
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const previousFetch = globalThis.fetch;
  const calls: Array<{ headers: Record<string, string> }> = [];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    assert.equal(agentRuns.getAgentRunById(run.id)?.status, "running");
    calls.push({ headers: init?.headers as Record<string, string> });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const mocked = mockResponse();
    await webhookHandler(
      {
        method: "POST",
        headers: callbackHeaders(run.id),
        body: {
          slug: "demo",
          threadId,
          missionControlRunId: run.id,
          text: ':::sancho-intervene\n{"brief":"Revisa el runtime"}\n:::',
          agent: "rocinante",
        },
        query: {},
      } as unknown as NextApiRequest,
      mocked.res,
    );

    assert.equal(mocked.read().statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].headers["X-Mission-Control-Parent-Run-Id"],
      run.id,
    );
    assert.equal(
      calls[0].headers["X-Sancho-Parent-Run-Capability"],
      callbackCapability,
    );
    assert.equal(agentRuns.getAgentRunById(run.id)?.status, "completed");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("a callback run id cannot be replayed onto another thread", async () => {
  const run = createCallbackRun({
    threadId: "demo:one",
    runtime: "external-http",
  });
  const mocked = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: callbackHeaders(run.id),
      body: {
        slug: "demo",
        threadId: "demo:two",
        missionControlRunId: run.id,
        text: "wrong thread",
      },
      query: {},
    } as unknown as NextApiRequest,
    mocked.res,
  );
  assert.equal(mocked.read().statusCode, 409);
  assert.equal(agentRuns.getAgentRunById(run.id)?.status, "queued");
});

test("a wrong callback capability fails before any thread mutation", async () => {
  const threadId = "demo:wrong-callback-cap";
  const run = createCallbackRun({
    threadId,
    runtime: "openclaw",
    agent: "sancho",
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const mocked = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: {
        ...callbackHeaders(run.id),
        "x-sancho-run-capability": "f".repeat(64),
      },
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        text: "forged",
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    mocked.res,
  );
  assert.equal(mocked.read().statusCode, 403);
  assert.equal(chat.getThread(threadId).messages.length, 0);
  assert.equal(agentRuns.getAgentRunById(run.id)?.status, "running");
});

test("modern async terminal delivery requires its grant while progress keeps active-run authority", async () => {
  const threadId = "demo:terminal-grant-boundary";
  const run = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: {
      slug: "demo",
      userText: "hazlo",
      runtimeTransportSecretSha256: createHash("sha256")
        .update("callback-secret")
        .digest("hex"),
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);

  const missingGrant = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: callbackHeaders(run.id),
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        text: "No debe terminalizar",
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    missingGrant.res,
  );
  assert.equal(missingGrant.read().statusCode, 403);
  assert.equal(
    missingGrant.read().payload.error,
    "Runtime terminal callback grant required",
  );
  assert.equal(agentRuns.getAgentRunById(run.id)?.status, "running");
  assert.equal(chat.getThread(threadId).messages.length, 0);

  const progress = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: callbackHeaders(run.id),
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        role: "progress",
        agent: "sancho",
        event: { kind: "thinking", label: "Sigue trabajando" },
      },
      query: {},
    } as unknown as NextApiRequest,
    progress.res,
  );
  assert.equal(progress.read().statusCode, 200);
  assert.equal(agentRuns.getAgentRunById(run.id)?.status, "running");

  const terminal = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: terminalGrantHeaders({
        runId: run.id,
        runtimeId: run.runtime,
      }),
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        text: "Resultado autorizado",
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    terminal.res,
  );
  assert.equal(terminal.read().statusCode, 200);
  assert.equal(agentRuns.getAgentRunById(run.id)?.status, "completed");
});

test("a terminal grant recovers an OpenClaw callback without a live dispatch lease", async () => {
  const threadId = "demo:openclaw-terminal-grant";
  const run = agentRuns.createAgentRun({
    threadId,
    runtime: "openclaw",
    agent: "sancho",
    // Older than the ordinary runtime/tool-capability freshness window. Only
    // the exact terminal grant may recover this persisted callback.
    now: new Date(Date.now() - 36 * 60 * 1_000),
    input: {
      slug: "demo",
      threadId,
      runtimeDispatchMode: "ledger-v1",
      runtimeTransportSecretSha256: createHash("sha256")
        .update("callback-secret")
        .digest("hex"),
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const grant = issueRuntimeTerminalCallbackGrant({
    parentAgentRunId: run.id,
    runtimeId: "openclaw",
    runtimeToolCapability: callbackCapability,
    transportSecretSha256: createHash("sha256")
      .update("callback-secret")
      .digest("hex"),
  });

  const recovered = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: {
        ...callbackHeaders(run.id),
        "x-sancho-terminal-callback-grant": grant.token,
      },
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        text: "Resultado recuperado después del reinicio",
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    recovered.res,
  );

  assert.equal(recovered.read().statusCode, 200);
  assert.equal(agentRuns.getAgentRunById(run.id)?.status, "completed");
  assert.equal(
    chat
      .getThread(threadId)
      .messages.filter(
        ({ text }) => text === "Resultado recuperado después del reinicio",
      ).length,
    1,
  );

  const wrongTransport = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: {
        ...callbackHeaders(run.id),
        "x-mc-secret": "wrong-admission-secret",
        "x-sancho-terminal-callback-grant": grant.token,
      },
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        text: "forged replay",
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    wrongTransport.res,
  );
  assert.equal(wrongTransport.read().statusCode, 403);

  const nonTerminal = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: {
        ...callbackHeaders(run.id),
        "x-sancho-terminal-callback-grant": grant.token,
      },
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        role: "progress",
        event: { kind: "thinking", label: "forged" },
      },
      query: {},
    } as unknown as NextApiRequest,
    nonTerminal.res,
  );
  assert.equal(nonTerminal.read().statusCode, 403);
});

test("a late exact terminal callback replaces only runtime_committed_worker_lost", async () => {
  const threadId = "demo:synthetic-runtime-loss-recovery";
  const dispatchRunId = "dispatch-synthetic-loss-1";
  const run = createCallbackRun({
    threadId,
    runtime: "openclaw",
    agent: "sancho",
    input: {
      slug: "demo",
      threadId,
      userText: "hazlo",
      runtimeDispatchMode: "ledger-v1",
      runtimeTransportSecretSha256: createHash("sha256")
        .update("callback-secret")
        .digest("hex"),
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  agentRuns.markAgentRunFailed(
    run.id,
    threadId,
    syntheticRuntimeLossMessage,
    "runtime_unreachable",
    {
      code: "runtime_committed_worker_lost",
      dispatchRunId,
      recovered: true,
    },
  );
  const request = {
    method: "POST",
    headers: terminalGrantHeaders({
      runId: run.id,
      runtimeId: run.runtime,
      dispatchRunId,
    }),
    body: {
      slug: "demo",
      threadId,
      missionControlRunId: run.id,
      text: "Resultado tardío recuperado",
      agent: "sancho",
    },
    query: {},
  } as unknown as NextApiRequest;

  const recovered = mockResponse();
  await webhookHandler(request, recovered.res);

  assert.equal(recovered.read().statusCode, 200);
  const completed = agentRuns.getAgentRunById(run.id);
  assert.equal(completed?.status, "completed");
  assert.equal(completed?.error, undefined);
  assert.equal(
    (completed?.output as Record<string, unknown> | undefined)?.text,
    "Resultado tardío recuperado",
  );
  assert.equal(completed?.callbackFingerprints?.length, 1);
  assert.equal(
    chat
      .getThread(threadId)
      .messages.filter(({ text }) => text === "Resultado tardío recuperado")
      .length,
    1,
  );

  const exactRetry = mockResponse();
  await webhookHandler(request, exactRetry.res);
  assert.equal(exactRetry.read().statusCode, 200);
  assert.equal(
    chat
      .getThread(threadId)
      .messages.filter(({ text }) => text === "Resultado tardío recuperado")
      .length,
    1,
  );

  const competing = mockResponse();
  await webhookHandler(
    {
      ...request,
      body: {
        ...request.body,
        text: "Resultado tardío competidor",
      },
    } as unknown as NextApiRequest,
    competing.res,
  );
  assert.equal(competing.read().statusCode, 200);
  assert.equal(
    chat
      .getThread(threadId)
      .messages.some(({ text }) => text === "Resultado tardío competidor"),
    false,
  );
});

test("a terminal callback cannot reopen a non-synthetic failed run", async () => {
  const fixtures = [
    {
      suffix: "missing-marker",
      error: syntheticRuntimeLossMessage,
      eventCode: "runtime_transport_failed",
    },
    {
      suffix: "different-error",
      error: "El runtime devolvió un fallo real",
      eventCode: "runtime_committed_worker_lost",
    },
  ];

  for (const fixture of fixtures) {
    const threadId = `demo:synthetic-runtime-loss-${fixture.suffix}`;
    const dispatchRunId = `dispatch-${fixture.suffix}`;
    const run = createCallbackRun({
      threadId,
      runtime: "openclaw",
      agent: "sancho",
      input: {
        slug: "demo",
        threadId,
        runtimeDispatchMode: "ledger-v1",
        runtimeTransportSecretSha256: createHash("sha256")
          .update("callback-secret")
          .digest("hex"),
      },
    });
    agentRuns.markAgentRunDispatched(run.id, threadId);
    agentRuns.markAgentRunFailed(
      run.id,
      threadId,
      fixture.error,
      "runtime_unreachable",
      { code: fixture.eventCode, dispatchRunId },
    );

    const response = mockResponse();
    await webhookHandler(
      {
        method: "POST",
        headers: terminalGrantHeaders({
          runId: run.id,
          runtimeId: run.runtime,
          dispatchRunId,
        }),
        body: {
          slug: "demo",
          threadId,
          missionControlRunId: run.id,
          text: `No debe publicarse: ${fixture.suffix}`,
          agent: "sancho",
        },
        query: {},
      } as unknown as NextApiRequest,
      response.res,
    );

    assert.equal(response.read().statusCode, 200);
    assert.equal(agentRuns.getAgentRunById(run.id)?.status, "failed");
    assert.equal(
      chat
        .getThread(threadId)
        .messages.some(({ text }) => text.includes("No debe publicarse")),
      false,
    );
  }
});

test("late synthetic-loss recovery strips controls without admitting effects or children", async () => {
  const threadId = "demo:synthetic-runtime-loss-controls";
  const dispatchRunId = "dispatch-synthetic-loss-controls";
  const run = createCallbackRun({
    threadId,
    runtime: "openclaw",
    agent: "rocinante",
    input: {
      slug: "demo",
      threadId,
      userText: "intervén y ejecuta",
      userId: "mc-admin",
      userName: "Admin",
      isAdmin: true,
      senderRole: "admin",
      controlDepth: 0,
      runtimeDispatchMode: "ledger-v1",
      runtimeTransportSecretSha256: createHash("sha256")
        .update("callback-secret")
        .digest("hex"),
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  agentRuns.markAgentRunFailed(
    run.id,
    threadId,
    syntheticRuntimeLossMessage,
    "runtime_unreachable",
    { code: "runtime_committed_worker_lost", dispatchRunId },
  );

  const previousFetch = globalThis.fetch;
  let admissionAttempts = 0;
  globalThis.fetch = (async () => {
    admissionAttempts += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const response = mockResponse();
    await webhookHandler(
      {
        method: "POST",
        headers: terminalGrantHeaders({
          runId: run.id,
          runtimeId: run.runtime,
          dispatchRunId,
        }),
        body: {
          slug: "demo",
          threadId,
          missionControlRunId: run.id,
          text: [
            "Resultado tardío informativo.",
            ":::sancho-intervene",
            '{"brief":"No debe arrancar un hijo tardío"}',
            ":::",
          ].join("\n"),
          agent: "rocinante",
        },
        query: {},
      } as unknown as NextApiRequest,
      response.res,
    );

    assert.equal(response.read().statusCode, 200);
    assert.equal(admissionAttempts, 0);
    const recovered = agentRuns.getAgentRunById(run.id);
    assert.equal(recovered?.status, "completed");
    const output = recovered?.output as Record<string, unknown> | undefined;
    assert.equal(output?.controlsSuppressedOnLateRecovery, true);
    assert.match(
      String(output?.text),
      /^Resultado tardío informativo\.[\s\S]*No ejecuté sus acciones/,
    );
    assert.equal(
      chat
        .getThread(threadId)
        .messages.some(({ text }) => text.includes(":::sancho-intervene")),
      false,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("a late real terminal failure authoritatively replaces only the synthetic failure", async () => {
  const threadId = "demo:synthetic-runtime-loss-real-failure";
  const dispatchRunId = "dispatch-synthetic-loss-real-failure";
  const run = createCallbackRun({
    threadId,
    runtime: "openclaw",
    agent: "sancho",
    input: {
      slug: "demo",
      threadId,
      runtimeDispatchMode: "ledger-v1",
      runtimeTransportSecretSha256: createHash("sha256")
        .update("callback-secret")
        .digest("hex"),
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  agentRuns.markAgentRunFailed(
    run.id,
    threadId,
    syntheticRuntimeLossMessage,
    "runtime_unreachable",
    { code: "runtime_committed_worker_lost", dispatchRunId },
  );
  const errorDetail = {
    category: "model_unavailable",
    raw: "provider returned no terminal model result",
    classifiedAt: Date.now(),
  };

  const response = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: terminalGrantHeaders({
        runId: run.id,
        runtimeId: run.runtime,
        dispatchRunId,
      }),
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        text: "El runtime terminó con un fallo real",
        agent: "sancho",
        errorDetail,
      },
      query: {},
    } as unknown as NextApiRequest,
    response.res,
  );

  assert.equal(response.read().statusCode, 200);
  const recovered = agentRuns.getAgentRunById(run.id);
  assert.equal(recovered?.status, "failed");
  assert.equal(recovered?.error, errorDetail.category);
  assert.equal(
    (recovered?.output as Record<string, unknown> | undefined)?.errorDetail &&
      ((recovered?.output as Record<string, unknown>).errorDetail as Record<string, unknown>)
        .category,
    errorDetail.category,
  );
  assert.equal(recovered?.callbackFingerprints?.length, 1);
  assert.equal(
    chat
      .getThread(threadId)
      .messages.filter(({ text }) => text === "El runtime terminó con un fallo real")
      .length,
    1,
  );
});

test("callback transport secret follows the run runtime after selection changes", async () => {
  const threadId = "demo:runtime-secret-binding";
  const run = createCallbackRun({
    threadId,
    runtime: "hermes",
    agent: "sancho",
    input: { slug: "demo", userText: "hazlo", senderRole: "client" },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const previousHermesSecret = process.env.HERMES_BRIDGE_SECRET;
  process.env.HERMES_BRIDGE_SECRET = "hermes-callback-secret";
  const body = {
    slug: "demo",
    threadId,
    missionControlRunId: run.id,
    text: "Resultado Hermes",
    agent: "sancho",
  };
  try {
    const selectedRuntimeSecret = mockResponse();
    await webhookHandler(
      {
        method: "POST",
        headers: callbackHeaders(run.id),
        body,
        query: {},
      } as unknown as NextApiRequest,
      selectedRuntimeSecret.res,
    );
    assert.equal(selectedRuntimeSecret.read().statusCode, 403);
    assert.equal(agentRuns.getAgentRunById(run.id)?.status, "running");

    const boundRuntimeSecret = mockResponse();
    await webhookHandler(
      {
        method: "POST",
        headers: {
          ...callbackHeaders(run.id),
          "x-mc-secret": "hermes-callback-secret",
        },
        body,
        query: {},
      } as unknown as NextApiRequest,
      boundRuntimeSecret.res,
    );
    assert.equal(boundRuntimeSecret.read().statusCode, 200);
    assert.equal(agentRuns.getAgentRunById(run.id)?.status, "completed");
  } finally {
    if (previousHermesSecret === undefined) {
      delete process.env.HERMES_BRIDGE_SECRET;
    } else {
      process.env.HERMES_BRIDGE_SECRET = previousHermesSecret;
    }
  }
});

test("callback transport remains bound to the admission secret after rotation", async () => {
  const threadId = "demo:runtime-secret-rotation";
  const admissionSecret = "hermes-secret-at-admission";
  const run = createCallbackRun({
    threadId,
    runtime: "hermes",
    agent: "sancho",
    input: {
      slug: "demo",
      userText: "hazlo",
      senderRole: "client",
      runtimeTransportSecretSha256: createHash("sha256")
        .update(admissionSecret)
        .digest("hex"),
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const terminalAuthority = terminalGrantHeaders({
    runId: run.id,
    runtimeId: run.runtime,
    transportSecret: admissionSecret,
  });
  const previousHermesSecret = process.env.HERMES_BRIDGE_SECRET;
  process.env.HERMES_BRIDGE_SECRET = "rotated-hermes-secret";
  const body = {
    slug: "demo",
    threadId,
    missionControlRunId: run.id,
    text: "Resultado del run anterior a la rotación",
    agent: "sancho",
  };
  try {
    const rotatedSecret = mockResponse();
    await webhookHandler(
      {
        method: "POST",
        headers: {
          ...terminalAuthority,
          "x-mc-secret": "rotated-hermes-secret",
        },
        body,
        query: {},
      } as unknown as NextApiRequest,
      rotatedSecret.res,
    );
    assert.equal(rotatedSecret.read().statusCode, 403);
    assert.equal(agentRuns.getAgentRunById(run.id)?.status, "running");

    const admissionBoundSecret = mockResponse();
    await webhookHandler(
      {
        method: "POST",
        headers: {
          ...terminalAuthority,
          "x-mc-secret": admissionSecret,
        },
        body,
        query: {},
      } as unknown as NextApiRequest,
      admissionBoundSecret.res,
    );
    assert.equal(admissionBoundSecret.read().statusCode, 200);
    assert.equal(agentRuns.getAgentRunById(run.id)?.status, "completed");
  } finally {
    if (previousHermesSecret === undefined) {
      delete process.env.HERMES_BRIDGE_SECRET;
    } else {
      process.env.HERMES_BRIDGE_SECRET = previousHermesSecret;
    }
  }
});

test("a retried terminal callback is acknowledged without duplicating the visible reply", async () => {
  const threadId = "demo:idempotent";
  const run = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: {
      slug: "demo",
      userText: "hazlo",
      senderRole: "admin",
      runtimeTransportSecretSha256: createHash("sha256")
        .update("callback-secret")
        .digest("hex"),
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const request = {
    method: "POST",
    headers: terminalGrantHeaders({ runId: run.id, runtimeId: run.runtime }),
    body: {
      slug: "demo",
      threadId,
      missionControlRunId: run.id,
      text: "Resultado único",
      agent: "sancho",
    },
    query: {},
  } as unknown as NextApiRequest;
  const first = mockResponse();
  const retry = mockResponse();
  await webhookHandler(request, first.res);
  await webhookHandler(request, retry.res);
  assert.equal(first.read().payload.duplicate, undefined);
  assert.equal(retry.read().payload.stale, true);
  assert.equal(
    chat
      .getThread(threadId)
      .messages.filter((message) => message.text === "Resultado único").length,
    1,
  );
});

test("terminal callback recovery preserves replies longer than the old 4096-character ledger limit", async () => {
  const threadId = "demo:long-terminal-reply";
  const run = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: { slug: "demo", userText: "respuesta larga" },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const longText = `inicio-${"x".repeat(5_000)}-fin`;
  const response = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: callbackHeaders(run.id),
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        text: longText,
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    response.res,
  );
  assert.equal(response.read().statusCode, 200);
  assert.equal(agentRuns.getAgentRunById(run.id)?.output?.text, longText);
  assert.equal(chat.getThread(threadId).messages.at(-1)?.text, longText);
});

test("a persisted callback claim on an active run is recovered after a crash", async () => {
  const threadId = "demo:crash-replay";
  const run = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: {
      slug: "demo",
      userText: "hazlo",
      runtimeTransportSecretSha256: createHash("sha256")
        .update("callback-secret")
        .digest("hex"),
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const body = {
    slug: "demo",
    threadId,
    missionControlRunId: run.id,
    text: "Resultado recuperado",
    agent: "sancho",
  };
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        role: "bot",
        text: body.text,
        agent: body.agent,
        errorDetail: undefined,
      }),
    )
    .digest("hex");
  // Simulate a process dying immediately after the durable claim.
  assert.equal(
    agentRuns.claimAgentRunCallbackFingerprint(run.id, fingerprint),
    true,
  );
  // Also cover a crash after the visible message write but before the run's
  // terminal ledger transition.
  chat.addMessage(
    threadId,
    "bot",
    body.text,
    body.agent,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    `${run.id}:${fingerprint}`,
  );
  const authorityHeaders = terminalGrantHeaders({
    runId: run.id,
    runtimeId: run.runtime,
  });

  const leased = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: authorityHeaders,
      body,
      query: {},
    } as unknown as NextApiRequest,
    leased.res,
  );
  assert.equal(leased.read().statusCode, 503);
  assert.equal(leased.read().payload.retryable, true);
  assert.equal(agentRuns.getAgentRunById(run.id)?.status, "running");

  // Simulate the original claimant dying and its distributed lease expiring.
  // The retained runtime outbox can now reclaim the same fingerprint.
  agentRuns.updateAgentRun(run.id, {
    now: new Date(Date.now() - TERMINAL_CALLBACK_CLAIM_LEASE_MS - 1),
  });

  const retry = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: authorityHeaders,
      body,
      query: {},
    } as unknown as NextApiRequest,
    retry.res,
  );

  assert.equal(retry.read().statusCode, 200);
  assert.equal(retry.read().payload.duplicate, undefined);
  assert.equal(agentRuns.getAgentRunById(run.id)?.status, "completed");
  assert.equal(
    chat
      .getThread(threadId)
      .messages.filter((message) => message.text === body.text).length,
    1,
  );
});

test("a retry recovers projection after terminal state won before the chat write", async () => {
  const threadId = "demo:terminal-projection-recovery";
  const run = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: {
      slug: "demo",
      userText: "hazlo",
      runtimeTransportSecretSha256: createHash("sha256")
        .update("callback-secret")
        .digest("hex"),
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const body = {
    slug: "demo",
    threadId,
    missionControlRunId: run.id,
    text: "Resultado recuperado desde el ledger",
    agent: "sancho",
  };
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        role: "bot",
        text: body.text,
        agent: body.agent,
        errorDetail: undefined,
      }),
    )
    .digest("hex");
  assert.equal(
    agentRuns.claimAgentRunCallbackFingerprint(run.id, fingerprint),
    true,
  );
  agentRuns.markAgentRunCompleted(run.id, threadId, {
    text: body.text,
    agent: body.agent,
    progress: [],
    controlFollowups: [],
  });
  assert.equal(
    chat
      .getThread(threadId)
      .messages.some((message) => message.text === body.text),
    false,
  );

  const retry = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: terminalGrantHeaders({ runId: run.id, runtimeId: run.runtime }),
      body,
      query: {},
    } as unknown as NextApiRequest,
    retry.res,
  );
  assert.equal(retry.read().payload.stale, true);
  assert.equal(
    chat
      .getThread(threadId)
      .messages.filter((message) => message.text === body.text).length,
    1,
  );
});

test("a competing terminal fingerprint cannot win after the run-level claim", async () => {
  const threadId = "demo:competing-terminal";
  const run = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: { slug: "demo", userText: "hazlo" },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const winnerBody = {
    slug: "demo",
    threadId,
    missionControlRunId: run.id,
    text: "Resultado ganador",
    agent: "sancho",
  };
  const winnerFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        role: "bot",
        text: winnerBody.text,
        agent: winnerBody.agent,
        errorDetail: undefined,
      }),
    )
    .digest("hex");
  assert.equal(
    agentRuns.claimAgentRunCallbackFingerprint(run.id, winnerFingerprint),
    true,
  );

  const loser = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: callbackHeaders(run.id),
      body: { ...winnerBody, text: "Resultado competidor" },
      query: {},
    } as unknown as NextApiRequest,
    loser.res,
  );
  assert.equal(loser.read().payload.duplicate, true);
  assert.equal(agentRuns.getAgentRunById(run.id)?.status, "running");
  assert.equal(
    chat
      .getThread(threadId)
      .messages.some((message) => message.text === "Resultado competidor"),
    false,
  );

  const winner = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: callbackHeaders(run.id),
      body: winnerBody,
      query: {},
    } as unknown as NextApiRequest,
    winner.res,
  );
  assert.equal(winner.read().statusCode, 503);
  assert.equal(winner.read().payload.retryable, true);
  agentRuns.updateAgentRun(run.id, {
    now: new Date(Date.now() - TERMINAL_CALLBACK_CLAIM_LEASE_MS - 1),
  });
  const recoveredWinner = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: callbackHeaders(run.id),
      body: winnerBody,
      query: {},
    } as unknown as NextApiRequest,
    recoveredWinner.res,
  );
  assert.equal(recoveredWinner.read().statusCode, 200);
  assert.equal(recoveredWinner.read().payload.duplicate, undefined);
  assert.equal(agentRuns.getAgentRunById(run.id)?.status, "completed");
});

test("an uncorrelated legacy callback is rejected with multiple active runs", async () => {
  const threadId = "demo:legacy-ambiguous";
  const owner = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "rocinante",
    input: { slug: "demo", userText: "old request" },
  });
  agentRuns.markAgentRunDispatched(owner.id, threadId);
  const newer = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: { slug: "demo", userText: "new request" },
  });
  agentRuns.markAgentRunDispatched(newer.id, threadId);

  const response = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: { "x-mc-secret": "callback-secret" },
      body: {
        slug: "demo",
        threadId,
        text: "late owner result",
        agent: "rocinante",
      },
      query: {},
    } as unknown as NextApiRequest,
    response.res,
  );

  assert.equal(response.read().statusCode, 403);
  assert.equal(agentRuns.getAgentRunById(owner.id)?.status, "running");
  assert.equal(agentRuns.getAgentRunById(newer.id)?.status, "running");
  assert.equal(
    chat
      .getThread(threadId)
      .messages.some((message) => message.text === "late owner result"),
    false,
  );
});

test("an uncorrelated legacy callback is rejected for the sole active run", async () => {
  const threadId = "demo:legacy-single";
  const active = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: { slug: "demo", userText: "new request" },
  });
  agentRuns.markAgentRunDispatched(active.id, threadId);

  const response = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: { "x-mc-secret": "callback-secret" },
      body: {
        slug: "demo",
        threadId,
        text: "uncorrelated old result",
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    response.res,
  );

  assert.equal(response.read().statusCode, 403);
  assert.equal(agentRuns.getAgentRunById(active.id)?.status, "running");
  assert.deepEqual(
    agentRuns.listAgentRunEvents(active.id).map((event) => event.type),
    ["run_created", "runtime_dispatched"],
  );
  assert.equal(
    chat
      .getThread(threadId)
      .messages.some((message) => message.text === "uncorrelated old result"),
    false,
  );
});

test("a run accepts only one terminal callback", async () => {
  const threadId = "demo:multipart";
  const run = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: {
      slug: "demo",
      userText: "explica",
      senderRole: "admin",
      runtimeTransportSecretSha256: createHash("sha256")
        .update("callback-secret")
        .digest("hex"),
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const authorityHeaders = terminalGrantHeaders({
    runId: run.id,
    runtimeId: run.runtime,
  });
  const sendPart = async (text: string) => {
    const mocked = mockResponse();
    await webhookHandler(
      {
        method: "POST",
        headers: authorityHeaders,
        body: {
          slug: "demo",
          threadId,
          missionControlRunId: run.id,
          text,
          agent: "sancho",
        },
        query: {},
      } as unknown as NextApiRequest,
      mocked.res,
    );
    return mocked.read().payload;
  };
  assert.equal((await sendPart("Parte uno")).duplicate, undefined);
  assert.equal((await sendPart("Parte dos")).stale, true);
  assert.equal((await sendPart("Parte dos")).stale, true);
  assert.deepEqual(
    chat.getThread(threadId).messages.map((message) => message.text),
    ["Parte uno"],
  );
});

test("concurrent terminal callbacks with different fingerprints produce one message", async () => {
  const threadId = "demo:concurrent-terminal";
  const run = createCallbackRun({
    threadId,
    runtime: "openclaw",
    agent: "sancho",
    input: { slug: "demo", userText: "explica" },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const send = async (text: string) => {
    const mocked = mockResponse();
    await webhookHandler(
      {
        method: "POST",
        headers: callbackHeaders(run.id),
        body: {
          slug: "demo",
          threadId,
          missionControlRunId: run.id,
          text,
          agent: "sancho",
        },
        query: {},
      } as unknown as NextApiRequest,
      mocked.res,
    );
    return mocked.read();
  };
  const results = await Promise.all([send("Resultado A"), send("Resultado B")]);
  assert.deepEqual(
    results.map((item) => item.statusCode).sort((a, b) => a - b),
    [200, 503],
  );
  assert.equal(
    results.filter((item) => item.payload.duplicate === true).length,
    1,
  );
  assert.equal(
    results.filter((item) => item.payload.retryable === true).length,
    1,
  );
  assert.equal(chat.getThread(threadId).messages.length, 1);
  assert.equal(agentRuns.getAgentRunById(run.id)?.status, "completed");
});

test("a callback correlated to a cancelled run never becomes a chat message", async () => {
  const threadId = "demo:cancelled";
  const run = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: {
      slug: "demo",
      userText: "hazlo",
      senderRole: "admin",
      runtimeTransportSecretSha256: createHash("sha256")
        .update("callback-secret")
        .digest("hex"),
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  agentRuns.markAgentRunCancelled(run.id, threadId);
  chat.markCancelled(threadId);
  const mocked = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: terminalGrantHeaders({ runId: run.id, runtimeId: run.runtime }),
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        text: "Respuesta que llegó después de Stop",
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    mocked.res,
  );
  assert.equal(mocked.read().payload.cancelled, true);
  assert.equal(
    chat
      .getThread(threadId)
      .messages.some((message) => message.text.includes("después de Stop")),
    false,
  );
});

test("successful webhook persists causal artifact readback only for a matching file_write", async () => {
  const threadId = "demo:causal-readback";
  const output = path.join(tmp, "brand", "demo", "reports", "final.md");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, "causal bytes");
  const agentWorkspace = path.join(tmp, "workspace-specialist");
  fs.mkdirSync(agentWorkspace, { recursive: true });
  fs.symlinkSync(
    path.join("..", "brand"),
    path.join(agentWorkspace, "brand"),
    "dir",
  );
  const agentOutput = path.join(
    agentWorkspace,
    "brand",
    "demo",
    "reports",
    "final.md",
  );
  const run = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    taskId: "T-CAUSAL",
    taskContract: {
      completion: "Report exists",
      expectedOutputs: [
        { path: "brand/demo/reports/*.md", source: "output_files" },
      ],
    },
    input: { slug: "demo", userText: "write report", senderRole: "admin" },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);

  const progress = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: callbackHeaders(run.id),
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        role: "progress",
        event: {
          kind: "file_write",
          label: "Writing report",
          target: agentOutput,
        },
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    progress.res,
  );
  assert.equal(progress.read().statusCode, 200);
  // The write must happen at or after the causally bound progress receipt.
  await new Promise((resolve) => setTimeout(resolve, 5));
  fs.writeFileSync(output, "causal bytes after progress");
  // The kernel stamps mtime from the coarse clock, granular to one timer tick
  // (10ms at CONFIG_HZ=100), which can put the write before the receipt and drop
  // the readback. Pin mtime to the wall clock so the gap above is what counts.
  // It must stay a whole millisecond wide: utimes round-trips through ns and
  // reads back ~0.001ms low, and the lower bound has no pre-progress tolerance.
  const writtenAt = new Date();
  fs.utimesSync(output, writtenAt, writtenAt);

  const final = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: callbackHeaders(run.id),
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        text: "Done",
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    final.res,
  );
  assert.equal(final.read().statusCode, 200);

  const events = agentRuns.listAgentRunEvents(run.id);
  assert.deepEqual(
    events.map((entry) => entry.type),
    [
      "run_created",
      "runtime_dispatched",
      "progress",
      "artifact_readback",
      "bot_reply",
    ],
  );
  const readback = events.find((entry) => entry.type === "artifact_readback")
    ?.data as {
    expectedPath: string;
    actualPath: string;
    sha256: string;
  };
  assert.equal(readback.expectedPath, "brand/demo/reports/*.md");
  assert.equal(readback.actualPath, "brand/demo/reports/final.md");
  assert.match(readback.sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    (
      agentRuns.getAgentRunById(run.id)?.output as {
        artifactReadbackCount: number;
      }
    ).artifactReadbackCount,
    1,
  );
});

test("file_write intent cannot certify a pre-existing stale file", async () => {
  const threadId = "demo:stale-readback";
  const output = path.join(tmp, "brand", "demo", "reports", "stale.md");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, "old bytes");
  // A near-stale file used to pass via the former five-second tolerance.
  const old = new Date(Date.now() - 4_000);
  fs.utimesSync(output, old, old);
  const run = createCallbackRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    taskId: "T-STALE",
    taskContract: {
      expectedOutputs: [
        { path: "brand/demo/reports/stale.md", source: "deliverable_file" },
      ],
    },
    input: { slug: "demo", userText: "write stale report" },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);

  const progress = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: callbackHeaders(run.id),
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        role: "progress",
        event: { kind: "file_write", label: "Writing report", target: output },
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    progress.res,
  );

  const final = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: callbackHeaders(run.id),
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        text: "Done",
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    final.res,
  );

  const events = agentRuns.listAgentRunEvents(run.id);
  assert.equal(
    events.some((entry) => entry.type === "artifact_readback"),
    false,
  );
  assert.equal(
    (
      agentRuns.getAgentRunById(run.id)?.output as {
        artifactReadbackCount: number;
      }
    ).artifactReadbackCount,
    0,
  );
});

test("a tenant-root symlink cannot relabel another tenant's artifact", async () => {
  const brandRoot = path.join(tmp, "brand");
  const betaRoot = path.join(brandRoot, "beta-readback-boundary");
  const alphaRoot = path.join(brandRoot, "alpha-readback-boundary");
  fs.mkdirSync(betaRoot, { recursive: true });
  fs.writeFileSync(path.join(betaRoot, "private.md"), "beta-only bytes");
  fs.symlinkSync(path.basename(betaRoot), alphaRoot, "dir");
  const now = new Date();
  const run = {
    id: "run_cross_tenant_readback",
    threadId: "alpha-readback-boundary:task",
    runtime: "external-http",
    status: "running" as const,
    taskId: "T-CROSS-TENANT",
    taskContract: {
      expectedOutputs: [
        {
          path: "brand/alpha-readback-boundary/private.md",
          source: "deliverable_file" as const,
        },
      ],
    },
    createdAt: new Date(now.getTime() - 1_000).toISOString(),
    updatedAt: now.toISOString(),
  };
  const progress = {
    id: "evt_cross_tenant_readback",
    runId: run.id,
    threadId: run.threadId,
    type: "progress" as const,
    ts: now.toISOString(),
    data: { kind: "file_write", target: "private.md" },
  };

  const result = await artifactReadback.persistCausalArtifactReadbacks(
    run,
    "alpha-readback-boundary",
    [progress],
    new Date(now.getTime() + 100),
  );
  assert.deepEqual(result, []);
});
