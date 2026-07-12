import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-outbound-choice-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";
process.env.SANCHO_RUNTIME = "external-http";
process.env.SANCHO_EXTERNAL_SECRET = "runtime-secret";
process.env.SANCHO_EXTERNAL_GATEWAY_URL = "http://127.0.0.1:1";
process.env.OUTBOUND_PREPARATION_BATCH_SIZE = "3";

function writeFoundationConfig() {
  const dir = path.join(tmp, "brand", "growth4u", "go-to-market", "ecps");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({
    country: "ES",
    icp: {
      company_context: "Empresa tech post-PMF España, 5-200 empleados",
      role_keywords: [
        "fundador startup",
        "CEO startup",
        "CMO",
        "head of growth",
        "director marketing",
        "VP growth",
      ],
    },
  }));
  const positioning = path.join(tmp, "brand", "growth4u", "go-to-market", "positioning");
  const ecps = [
    { id: 1, slug: "sistema", name: "Sistema repetible", score: 79, audience: "startups tech", need: "Quiero un sistema de growth repetible.", outcome: "Instalar un sistema que el equipo pueda operar.", angle: "Sistema transferible" },
    { id: 2, slug: "regulacion", name: "Growth regulado", score: 74, audience: "fintechs reguladas", need: "Quiero crecer dentro del marco regulatorio.", outcome: "Competir sin arriesgar la licencia.", angle: "Growth compliance-friendly" },
    { id: 3, slug: "canales", name: "Diversificar canales", score: 73, audience: "startups tech", need: "Quiero dejar de depender de un solo canal.", outcome: "Construir adquisición multicanal.", angle: "Sistema multicanal" },
  ];
  for (const ecp of ecps) {
    const ecpDir = path.join(positioning, `ecp${ecp.id}-${ecp.slug}`);
    fs.mkdirSync(ecpDir, { recursive: true });
    fs.writeFileSync(path.join(ecpDir, `ecp${ecp.id}-${ecp.slug}.current.md`), [
      `# Positioning — ECP ${ecp.id}: "${ecp.name}"`,
      `> Generado: 2026-03-06 | Score: ${ecp.score} | Wave 1`,
      "> Status: approved | v1",
      "",
      "## JTBD Synthesis",
      "| Campo | Contenido |",
      "|---|---|",
      `| **Need** | "${ecp.need}" |`,
      "| **Situation** | Situación investigada. |",
      `| **Motivation** | ${ecp.outcome} |`,
      `| **Outcome** | ${ecp.outcome} |`,
      `| **JTBD** | ${ecp.need} |`,
      "| **Alternatives** | Agencia · In-house |",
      "",
      "## Top Value Criteria para messaging",
      "| # | Criteria | Imp. | G4U | Avg comp. | Zone | Asset clave |",
      "|---|---|---|---|---|---|---|",
      `| 1 | **${ecp.angle}** | 10 | 5 | 2 | Opp | A1 |`,
      "",
      "## Assets relevantes",
      "| # | Asset | Criteria | Por qué importa en este ECP |",
      "|---|---|---|---|",
      `| A1 | **${ecp.angle}** | 1 | Prueba relevante. |`,
      "",
      "## Messaging Playbook",
      `**UVP:** *"Para ${ecp.audience}, Growth4U ayuda a ${ecp.outcome.toLowerCase()}"*`,
      "| Cat. | Criteria | Asset | Versión Corta | Versión Landing |",
      "|---|---|---|---|---|",
      `| **UVP Core** | 1 | A1 | ${ecp.angle}. | Mensaje largo. |`,
    ].join("\n"));
  }
}

function listen(server: http.Server): Promise<{ port: number }> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address() as { port: number }));
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

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

test("an outbound ECP click starts YALC directly without invoking the agent gateway", async () => {
  writeFoundationConfig();
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const yalc = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      calls.push({ url: req.url || "", body: JSON.parse(raw) });
      const reused = calls.length === 2;
      res.writeHead(reused ? 200 : 202, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reused ? {
        ok: true,
        command: "outbound.workflow.start",
        campaignId: "campaign-1",
        runId: "run-1",
        status: "awaiting_approval",
        reused: true,
        reusedBecause: "active_equivalent_workflow",
        batch: {
          itemCount: 3,
          contentHash: "content-hash-1",
          sample: [{ leadId: "lead-1", messageBody: "Hola Ruth" }],
        },
      } : {
        ok: true,
        command: "outbound.workflow.start",
        campaignId: "campaign-1",
        runId: "run-1",
        jobId: "job-1",
        status: "queued",
        statusUrl: "/api/jobs/job-1",
      }));
    });
  });
  const address = await listen(yalc);
  process.env.GROWTH4U_YALC_BASE_URL = `http://127.0.0.1:${address.port}`;

  const { resetRuntimeForTests } = await import("../runtime");
  resetRuntimeForTests();
  const { getThread } = await import("../data/mc-chat");
  const { sendHandler } = await import("@/pages/api/chat/send");
  const threadId = "growth4u:b2b-campaign-new-test";

  const optionsResponse = mockResponse();
  await sendHandler({
    method: "POST",
    headers: { "x-mc-secret": "runtime-secret", host: "localhost:3000" },
    query: {},
    body: {
      slug: "growth4u",
      threadId,
      text: "Quiero crear una campaña B2B por LinkedIn.",
      agent: "rocinante",
      scope: "agent",
      skill: "yalc-operator",
    },
  } as unknown as NextApiRequest, optionsResponse.res);

  assert.equal(optionsResponse.read().statusCode, 200);
  assert.equal(optionsResponse.read().payload.deterministic, true);
  assert.equal(calls.length, 0, "opening the campaign chooser must not call YALC or the agent gateway");
  const preparedThread = getThread(threadId);
  assert.equal(preparedThread.routing?.agent, "rocinante");
  assert.equal(preparedThread.routing?.skillHint, "yalc-operator");
  const optionMessage = preparedThread.messages.at(-1)?.text || "";
  const askMatch = optionMessage.match(/:::ask\n([\s\S]*?)\n:::/);
  assert.ok(askMatch);
  const question = JSON.parse(askMatch[1]) as {
    id: string;
    options: Array<{ id: string; label: string; workflowIntent: Record<string, unknown> }>;
  };
  assert.equal(question.id, "outbound_ecp_v1");
  assert.equal(question.options.length, 3);
  const selected = question.options[0];
  assert.doesNotMatch(String(selected.workflowIntent.targetSegment), /MRR|post-PMF/i);
  assert.deepEqual(
    (selected.workflowIntent.accountTarget as Record<string, unknown>).unappliedCriteria,
    ["Post-PMF", "Señal del ECP: Sistema repetible"],
  );
  assert.equal((selected.workflowIntent.foundationBrief as Record<string, unknown>).schemaVersion, 1);
  assert.equal(selected.workflowIntent.messageVariantCount, 3);

  const response = mockResponse();
  try {
    await sendHandler({
      method: "POST",
      headers: {
        "x-mc-secret": "runtime-secret",
        host: "localhost:3000",
      },
      query: {},
      body: {
        slug: "growth4u",
        threadId,
        text: `[ask:outbound_ecp_v1] respuesta: ${selected.label} <!--workflow-option:${selected.id}-->`,
        agent: "rocinante",
        scope: "agent",
      },
    } as unknown as NextApiRequest, response.res);

    assert.equal(response.read().statusCode, 200);
    assert.equal(response.read().payload.deterministic, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /^\/api\/outbound\/command\?tenant=growth4u$/);
    assert.equal(calls[0].body.command, "outbound.workflow.start");
    assert.deepEqual(calls[0].body.intent, selected.workflowIntent);
    assert.equal(
      (calls[0].body.callbackContext as Record<string, unknown>).threadId,
      threadId,
    );
    const messages = getThread(threadId).messages;
    assert.match(messages.at(-1)?.text || "", /workflow buscará primero las empresas/i);
    assert.doesNotMatch(messages.at(-1)?.text || "", /Campaña:|Run:|campaign-1|run-1/);
    const selectedUserMessage = [...messages].reverse().find((message) => message.role === "user");
    assert.equal(selectedUserMessage?.text, selected.label);
    assert.doesNotMatch(selectedUserMessage?.text || "", /workflow-option|\[ask:/);

    const invalid = mockResponse();
    await sendHandler({
      method: "POST",
      headers: { "x-mc-secret": "runtime-secret", host: "localhost:3000" },
      query: {},
      body: {
        slug: "growth4u",
        threadId,
        text: "[ask:outbound_ecp_v1] respuesta: Inventado <!--workflow-option:not-real-->",
        agent: "rocinante",
        scope: "agent",
      },
    } as unknown as NextApiRequest, invalid.res);
    assert.equal(invalid.read().statusCode, 200);
    assert.equal(invalid.read().payload.ok, false);
    assert.equal(calls.length, 1, "invalid structured choices must not reach YALC or the agent gateway");
    const invalidUserMessage = [...getThread(threadId).messages].reverse().find((message) => message.role === "user");
    assert.equal(invalidUserMessage?.text, "Inventado");

    const reusedThreadId = "growth4u:b2b-campaign-new-reused-test";
    const reusedOptions = mockResponse();
    await sendHandler({
      method: "POST",
      headers: { "x-mc-secret": "runtime-secret", host: "localhost:3000" },
      query: {},
      body: {
        slug: "growth4u",
        threadId: reusedThreadId,
        text: "Quiero crear una campaña B2B por LinkedIn.",
        agent: "rocinante",
        scope: "agent",
        skill: "yalc-operator",
      },
    } as unknown as NextApiRequest, reusedOptions.res);
    const reusedSelection = mockResponse();
    await sendHandler({
      method: "POST",
      headers: { "x-mc-secret": "runtime-secret", host: "localhost:3000" },
      query: {},
      body: {
        slug: "growth4u",
        threadId: reusedThreadId,
        text: `[ask:outbound_ecp_v1] respuesta: ${selected.label} <!--workflow-option:${selected.id}-->`,
        agent: "rocinante",
        scope: "agent",
      },
    } as unknown as NextApiRequest, reusedSelection.res);
    assert.equal(reusedSelection.read().statusCode, 200);
    assert.equal(calls.length, 2);
    const reusedMessage = getThread(reusedThreadId).messages.at(-1);
    assert.equal(reusedMessage?.role, "workflow");
    assert.match(reusedMessage?.text || "", /No creé otra ni repetí la búsqueda/);
    assert.equal(reusedMessage?.workflowJob?.campaignId, "campaign-1");

    const missingFoundation = mockResponse();
    await sendHandler({
      method: "POST",
      headers: { "x-mc-secret": "runtime-secret", host: "localhost:3000" },
      query: {},
      body: {
        slug: "missing-client",
        threadId: "missing-client:b2b-campaign-new-test",
        text: "Quiero crear una campaña B2B por LinkedIn.",
        agent: "rocinante",
        scope: "agent",
        skill: "yalc-operator",
      },
    } as unknown as NextApiRequest, missingFoundation.res);
    assert.equal(missingFoundation.read().statusCode, 200);
    assert.equal(missingFoundation.read().payload.ok, false);
    assert.equal(calls.length, 2, "missing Foundation must fail before YALC or the agent gateway");
  } finally {
    await close(yalc);
  }
});
