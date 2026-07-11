import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../yalc/job-callback";
import type { DispatchDeps, JobCallbackPayload } from "../yalc/job-callback";
import type { WorkflowJobEvent } from "../data/mc-chat";

const { parseCallback, dispatchJobResult, formatJobResult, summarizeOutput } = (
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

test("parseCallback accepts a valid completed payload", () => {
  const payload = parseCallback(validBody());
  assert.equal(payload.event, "job.completed");
  assert.equal(payload.jobId, "job_123");
  assert.equal(payload.type, "campaign.enrich");
});

test("parseCallback preserves outbound workflow context", () => {
  const payload = parseCallback(validBody({
    callbackContext: {
      slug: "growth4u",
      threadId: "growth4u:abc",
      agent: "rocinante",
      originalRequest: "Busca tres founders",
      command: "outbound.workflow.prepare",
      campaignId: "camp-123",
      profileKind: "b2b_contact",
      channel: "linkedin",
    },
  }));

  assert.equal(payload.callbackContext.command, "outbound.workflow.prepare");
  assert.equal(payload.callbackContext.campaignId, "camp-123");
  assert.equal(payload.callbackContext.channel, "linkedin");
});

test("parseCallback rejects malformed callbacks", () => {
  assert.throws(() => parseCallback("nope"), /body must be a JSON object/);
  assert.throws(() => parseCallback(validBody({ event: "job.started" })), /event must be/);
  assert.throws(() => parseCallback(validBody({ jobId: "" })), /jobId is required/);
  assert.throws(
    () => parseCallback(validBody({ callbackContext: { threadId: "t", agent: "a" } })),
    /callbackContext.slug is required/,
  );
});

test("summarizeOutput surfaces useful counts", () => {
  assert.equal(summarizeOutput({ leads: 132 }), "leads=132");
  assert.equal(summarizeOutput({ count: 5, total: 9 }), "count=5, total=9");
  assert.equal(summarizeOutput([1, 2, 3]), "3 elementos");
  assert.equal(summarizeOutput(undefined), "(sin output)");
});

test("formatJobResult is deterministic and never contains an agent instruction", () => {
  const completed = parseCallback(validBody({ type: "campaign.search", output: { leads: 132 } }));
  const failed = parseCallback(validBody({
    event: "job.failed",
    status: "failed",
    type: "campaign.workflow.prepare",
    errorMessage: "La campaña no tiene LinkedIn como canal",
  }));

  assert.equal(formatJobResult(completed), "Búsqueda completada: leads=132.");
  assert.equal(
    formatJobResult(failed),
    "No se pudo preparar LinkedIn porque la campaña pertenece a otro canal. No se creó otra campaña ni se envió ningún contacto.",
  );
  assert.doesNotMatch(formatJobResult(completed), /retom|ejecut|prompt|agente/i);
});

test("formatJobResult reports another cohort without implying an automatic loop", () => {
  const text = formatJobResult(parseCallback({
    event: "job.completed",
    jobId: "job-cohort",
    tenantId: "growth4u",
    type: "campaign.workflow.prepare",
    status: "completed",
    output: {
      source: { found: 1_000, totalAvailable: 12_500, hasMore: true, nextPage: 11 },
      enrichment: { enriched: 900 },
      batch: { itemCount: 850, sample: [] },
    },
    callbackContext: { slug: "growth4u", threadId: "growth4u:outreach", agent: "rocinante" },
  }));

  assert.match(text, /12\.500|12500/);
  assert.match(text, /solo se prepara cuando la pidas/);
  assert.doesNotMatch(text, /autom[aá]ticamente|iniciando la siguiente/i);
});

interface UpsertCall {
  threadId: string;
  text: string;
  workflowJob: WorkflowJobEvent;
  agent?: string;
}

function makeStubDeps() {
  const calls: UpsertCall[] = [];
  const deps: DispatchDeps = {
    upsertWorkflowJobMessage: (threadId, text, workflowJob, agent) => {
      calls.push({ threadId, text, workflowJob, agent });
    },
  };
  return { deps, calls };
}

test("dispatchJobResult records one workflow result without re-engaging the runtime", async () => {
  const payload: JobCallbackPayload = parseCallback(validBody({
    type: "campaign.workflow.prepare",
    output: {
      runId: "run-123",
      source: { found: 3, totalAvailable: 3, truncated: false },
      enrichment: { enriched: 2 },
      batch: {
        itemCount: 2,
        sample: [{ leadId: "lead-1", messageBody: "Hola Ruth, ¿conectamos?" }],
      },
    },
    callbackContext: {
      slug: "growth4u",
      threadId: "growth4u:abc",
      agent: "rocinante",
      command: "outbound.workflow.prepare",
      campaignId: "camp-123",
    },
  }));
  const { deps, calls } = makeStubDeps();

  const result = await dispatchJobResult(payload, deps);

  assert.equal(result.forwardedToGateway, false);
  assert.equal(result.recorded, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].threadId, "growth4u:abc");
  assert.equal(calls[0].workflowJob.jobId, "job_123");
  assert.equal(calls[0].workflowJob.campaignId, "camp-123");
  assert.equal(calls[0].workflowJob.status, "completed");
  assert.equal(calls[0].workflowJob.runId, "run-123");
  assert.deepEqual(calls[0].workflowJob.batch, {
    itemCount: 2,
    sample: [{ leadId: "lead-1", messageBody: "Hola Ruth, ¿conectamos?" }],
  });
  assert.deepEqual(calls[0].workflowJob.stats, {
    found: 3,
    enriched: 2,
    usable: 2,
    totalAvailable: 3,
    truncated: false,
    hasMore: false,
    nextPage: null,
  });
  assert.equal(calls[0].text, "Campaña lista para revisar: 3 encontrados, 2 enriquecidos, 2 utilizables.");
});

test("dispatchJobResult records failed jobs without throwing", async () => {
  const payload = parseCallback(validBody({
    event: "job.failed",
    status: "failed",
    errorMessage: "Apollo 429",
  }));
  const { deps, calls } = makeStubDeps();

  const result = await dispatchJobResult(payload, deps);

  assert.equal(result.recorded, true);
  assert.equal(calls[0].workflowJob.status, "failed");
  assert.equal(calls[0].workflowJob.errorMessage, "Apollo 429");
});
