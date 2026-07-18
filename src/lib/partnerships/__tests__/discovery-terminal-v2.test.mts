import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import type { ExecutionRun } from "@/lib/execution-control";
import type { DiscoverySearchRecord } from "../discovery-types";

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "sancho-partnerships-terminal-v2-"),
);
process.env.MC_WORKSPACE = workspace;
process.env.MC_TASKS_BACKEND = "json";

type StoreModule = typeof import("../discovery-store");
type WorkerModule = typeof import("../discovery-durable-worker");
type HandlerModule = typeof import("../discovery-handler-v2");
type CompletionModule = typeof import("../discovery-chat-completion");
type DeliveryModule = typeof import("@/lib/data/mc-chat-durable-delivery");
let store: StoreModule;
let worker: WorkerModule;
let handler: HandlerModule;
let completion: CompletionModule;
let delivery: DeliveryModule;

before(async () => {
  store = await import("../discovery-store");
  worker = await import("../discovery-durable-worker");
  handler = await import("../discovery-handler-v2");
  completion = await import("../discovery-chat-completion");
  delivery = await import("@/lib/data/mc-chat-durable-delivery");
});

after(() => fs.rmSync(workspace, { recursive: true, force: true }));

function command(searchId: string) {
  return handler.parsePartnershipsDiscoveryCommandV2({
    schemaVersion: 2,
    slug: "hospital-capilar",
    searchId,
    attempt: 1,
    executionGeneration: 1,
    modelConfig: DEFAULT_CREATOR_MODEL_CONFIG,
    title: "Creators capilares",
    campaignId: `campaign-${searchId}`,
    projectId: null,
    taskId: null,
    executionIntent: "fixtures",
    plan: {
      title: "Creators capilares",
      sectors: ["salud capilar"],
      networks: ["instagram"],
      tiers: ["micro"],
      targetVolume: 1,
    },
    createdAt: "2026-07-16T10:00:00.000Z",
    artifactStore: "local-persistent-single-host",
    scrapeCreators: {
      credentialRef: "scrapecreators://default",
      targetBindingFingerprint: handler.partnershipsTargetBindingFingerprint(
        "https://api.scrapecreators.com",
      ),
    },
    yalc: {
      credentialRef: "yalc://tenant/hospital-capilar",
      targetBindingFingerprint: handler.partnershipsTargetBindingFingerprint(
        "https://yalc.example.test",
      ),
    },
    setupRunId: null,
    preparedFingerprint: null,
    modelConfigEvidence: null,
  });
}

function search(searchId: string, runId: string): DiscoverySearchRecord {
  return {
    id: searchId,
    slug: "hospital-capilar",
    executionIntent: "fixtures",
    executionControl: {
      mode: "canary",
      admittedAt: "2026-07-16T10:00:00.000Z",
      generation: 1,
      runId,
    },
    executionModelConfig: JSON.parse(
      JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG),
    ),
    title: "Creators capilares",
    plan: {
      title: "Creators capilares",
      sectors: ["salud capilar"],
      networks: ["instagram"],
      tiers: ["micro"],
      targetVolume: 1,
    },
    campaignId: `campaign-${searchId}`,
    projectId: null,
    taskId: null,
    threadId: null,
    runner: {
      status: "running",
      mode: "fixtures",
      jobId: null,
      attempts: 1,
      queuedAt: "2026-07-16T10:00:00.000Z",
      startedAt: "2026-07-16T10:00:01.000Z",
      finishedAt: null,
      error: null,
      errorCode: null,
      retryable: false,
      stats: null,
    },
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:01.000Z",
  };
}

function run(
  searchId: string,
  runId: string,
  status: "completed" | "cancelled",
): ExecutionRun {
  return {
    id: runId,
    tenantKey: "hospital-capilar",
    idempotencyKey: `partnerships.discovery:${searchId}:canary:v4`,
    aggregateType: "partnerships.search",
    aggregateId: `hospital-capilar:${searchId}`,
    operation: "partnerships.discovery",
    mode: "canary",
    status,
    input: command(searchId),
    metadata: {
      authority: "execution_ledger_v2",
      executionContractVersion: 2,
      executionHandlerVersion: 4,
    },
    output:
      status === "completed"
        ? {
            completionBoundary: "partnerships_discovery_completed",
            stats: {
              candidates: 1,
              invalid: 0,
              filtered: 0,
              inserted: 1,
              sourced: 1,
              disqualified: 0,
              dropped: 0,
              avgQuality: 80,
            },
          }
        : undefined,
    availableAt: "2026-07-16T10:00:00.000Z",
    claimCount: 1,
    handlerAttempt: 1,
    createdAt: "2026-07-16T10:00:00.000Z",
    startedAt: "2026-07-16T10:00:01.000Z",
    finishedAt: "2026-07-16T10:00:02.000Z",
    updatedAt: "2026-07-16T10:00:02.000Z",
  };
}

test("terminal replay always retries insert-only chat delivery after product projection already exists", async () => {
  const searchId = "search-terminal-replay";
  const runId = "xrun-terminal-replay";
  store.saveSearch(search(searchId, runId));
  const deliveries: string[] = [];
  const v2 = worker.createPartnershipsDiscoveryWorkerHandlerV2(
    handler.partnershipsDiscoveryEffectPolicyV2["provider.prepare_assignment"],
    handler.partnershipsDiscoveryEffectPolicyV2["yalc.assign_leads"],
    {
      deliverV2ChatCompletion: async (terminalRun) => {
        deliveries.push(terminalRun.id);
      },
    },
  );
  const terminalRun = run(searchId, runId, "completed");
  await v2.projectTerminal(terminalRun, command(searchId), {} as never);
  assert.equal(
    store.getSearch("hospital-capilar", searchId)?.runner.status,
    "done",
  );

  // Exact crash replay: the search projection is now a no-op, while the
  // independent delivery receipt still has to be attempted again.
  await v2.projectTerminal(terminalRun, command(searchId), {} as never);
  assert.deepEqual(deliveries, [runId, runId]);
});

test("crash replay publishes one immutable completion in the originating chat", async () => {
  const searchId = "search-terminal-delivery-crash";
  const runId = "xrun-terminal-delivery-crash";
  const threadId = "hospital-capilar:partnerships-delivery-crash";
  store.saveSearch(search(searchId, runId));
  const v2 = worker.createPartnershipsDiscoveryWorkerHandlerV2(
    handler.partnershipsDiscoveryEffectPolicyV2["provider.prepare_assignment"],
    handler.partnershipsDiscoveryEffectPolicyV2["yalc.assign_leads"],
    {
      deliverV2ChatCompletion: (terminalRun) =>
        completion.deliverPartnershipsDiscoveryChatCompletion(terminalRun, {
          resolveOrigin: async () => ({ threadId, agent: "sancho" }) as never,
        }),
    },
  );
  const terminalRun = run(searchId, runId, "completed");

  // The first callback publishes the result and a crash may happen before the
  // projection ACK. Replaying the complete callback must not duplicate it.
  await v2.projectTerminal(terminalRun, command(searchId), {} as never);
  await v2.projectTerminal(terminalRun, command(searchId), {} as never);

  assert.deepEqual(delivery.listDurableChatDeliveries(threadId), [
    {
      role: "workflow",
      text: "✅ Búsqueda completada: 1 candidata encontrada — 1 lista para outreach. Las tienes en Outreach → Encuentra.",
      agent: "sancho",
      deliveryKey: `execution-terminal:partnerships.discovery:v2:${runId}`,
      ts: delivery.listDurableChatDeliveries(threadId)[0].ts,
    },
  ]);
});

test("cancelled contract-v2 run projects an explicit interrupted terminal state and delivers", async () => {
  const searchId = "search-terminal-cancelled";
  const runId = "xrun-terminal-cancelled";
  const threadId = "hospital-capilar:partnerships-delivery-cancelled";
  store.saveSearch(search(searchId, runId));
  const v2 = worker.createPartnershipsDiscoveryWorkerHandlerV2(
    handler.partnershipsDiscoveryEffectPolicyV2["provider.prepare_assignment"],
    handler.partnershipsDiscoveryEffectPolicyV2["yalc.assign_leads"],
    {
      deliverV2ChatCompletion: (terminalRun) =>
        completion.deliverPartnershipsDiscoveryChatCompletion(terminalRun, {
          resolveOrigin: async () => ({ threadId, agent: "sancho" }) as never,
        }),
    },
  );
  await v2.projectTerminal(
    run(searchId, runId, "cancelled"),
    command(searchId),
    {} as never,
  );
  const projected = store.getSearch("hospital-capilar", searchId);
  assert.equal(projected?.runner.status, "error");
  assert.equal(projected?.runner.errorCode, "job_interrupted");
  assert.equal(projected?.runner.error, "Discovery execution cancelled");
  const messages = delivery.listDurableChatDeliveries(threadId);
  assert.equal(messages.length, 1);
  assert.equal(
    messages[0].text,
    "La búsqueda de partners fue cancelada y no se publicaron resultados nuevos.",
  );
});
