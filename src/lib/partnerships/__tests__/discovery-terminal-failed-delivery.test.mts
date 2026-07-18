/**
 * SAN-480 — un run `failed` debe avisar SIEMPRE al hilo de chat de origen.
 *
 * Reproduce el fallo real de staging (2026-07-18): dos runs de
 * `partnerships.discovery` terminaron `failed` (`durable_execution_deadline_
 * exceeded`) y el hilo no recibió ningún mensaje. La proyección terminal v5
 * corría, pero el guard de vigencia (runId/generación del search) tragaba la
 * entrega cuando el search aún no estaba ligado al run (bind del setup
 * pendiente) o cuando el usuario ya había relanzado (generación avanzada).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import type { ExecutionRun } from "@/lib/execution-control";
import type { DiscoverySearchRecord } from "../discovery-types";

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "sancho-partnerships-terminal-failed-"),
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
    executionIntent: "live",
    plan: {
      title: "Creators capilares",
      sectors: ["salud capilar"],
      networks: ["instagram"],
      tiers: ["micro"],
      targetVolume: 1,
    },
    createdAt: "2026-07-18T10:00:00.000Z",
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

function search(
  searchId: string,
  executionControl: DiscoverySearchRecord["executionControl"],
): DiscoverySearchRecord {
  return {
    id: searchId,
    slug: "hospital-capilar",
    executionIntent: "live",
    executionControl,
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
      mode: "live",
      jobId: null,
      attempts: 1,
      queuedAt: "2026-07-18T10:00:00.000Z",
      startedAt: "2026-07-18T10:00:01.000Z",
      finishedAt: null,
      error: null,
      errorCode: null,
      retryable: false,
      stats: null,
    },
    createdAt: "2026-07-18T10:00:00.000Z",
    updatedAt: "2026-07-18T10:00:01.000Z",
  };
}

function run(
  searchId: string,
  runId: string,
  status: "failed" | "completed",
  errorCode = "durable_execution_deadline_exceeded",
): ExecutionRun {
  return {
    id: runId,
    tenantKey: "hospital-capilar",
    idempotencyKey: `partnerships.discovery:${searchId}:canary:v5`,
    aggregateType: "partnerships.search",
    aggregateId: `hospital-capilar:${searchId}`,
    operation: "partnerships.discovery",
    mode: "canary",
    status,
    input: command(searchId),
    metadata: {
      authority: "execution_ledger_v2",
      executionContractVersion: 2,
      executionHandlerVersion: 5,
    },
    ...(status === "failed"
      ? {
          output: { errorCode },
          error: `Durable execution failed (${errorCode})`,
        }
      : {
          output: {
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
          },
        }),
    availableAt: "2026-07-18T10:00:00.000Z",
    claimCount: 1,
    handlerAttempt: 1,
    createdAt: "2026-07-18T10:00:00.000Z",
    startedAt: "2026-07-18T10:00:01.000Z",
    finishedAt: "2026-07-18T10:06:01.000Z",
    updatedAt: "2026-07-18T10:06:01.000Z",
  };
}

function v5Handler(threadId: string) {
  return worker.createPartnershipsDiscoveryWorkerHandlerV5({
    deliverV2ChatCompletion: (terminalRun) =>
      completion.deliverPartnershipsDiscoveryChatCompletion(terminalRun, {
        resolveOrigin: async () => ({ threadId, agent: "sancho" }) as never,
      }),
  });
}

test("failed run with a bound search delivers a human failure notice", async () => {
  const searchId = "search-failed-bound";
  const runId = "xrun-failed-bound";
  const threadId = "hospital-capilar:failed-bound";
  store.saveSearch(
    search(searchId, {
      mode: "canary",
      admittedAt: "2026-07-18T10:00:00.000Z",
      generation: 1,
      runId,
    }),
  );
  await v5Handler(threadId).projectTerminal(
    run(searchId, runId, "failed"),
    command(searchId),
    {} as never,
  );
  assert.equal(
    store.getSearch("hospital-capilar", searchId)?.runner.status,
    "error",
  );
  const messages = delivery.listDurableChatDeliveries(threadId);
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /no se completó/);
  assert.match(messages[0].text, /límite de tiempo/);
  assert.match(messages[0].text, /Outreach → Encuentra/);
});

test("failed run still notifies the chat when the search/run bind never landed", async () => {
  // Estado real del incidente: el setup creó el search (setupRunId) pero el
  // runId del hijo nunca quedó ligado. La proyección de producto no puede
  // aplicar (runner sigue running hasta que reconcile repare el bind), pero el
  // aviso de fallo al hilo NO puede depender de esa vigencia.
  const searchId = "search-failed-unbound";
  const runId = "xrun-failed-unbound";
  const threadId = "hospital-capilar:failed-unbound";
  store.saveSearch(
    search(searchId, {
      mode: "canary",
      admittedAt: "2026-07-18T10:00:00.000Z",
      generation: 1,
      setupRunId: "xrun-setup-unbound",
      preparedFingerprint: "prepared-unbound",
    }),
  );
  await v5Handler(threadId).projectTerminal(
    run(searchId, runId, "failed"),
    command(searchId),
    {} as never,
  );
  const messages = delivery.listDurableChatDeliveries(threadId);
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /no se completó/);
});

test("failed run superseded by a user retry still delivers exactly once", async () => {
  // El primer intento falla, el usuario relanza (generación avanza y el runId
  // se libera) y la proyección terminal del run viejo se reintenta después:
  // el fallo del intento 1 debe llegar al hilo una sola vez.
  const searchId = "search-failed-superseded";
  const runId = "xrun-failed-superseded";
  const threadId = "hospital-capilar:failed-superseded";
  store.saveSearch(
    search(searchId, {
      mode: "canary",
      admittedAt: "2026-07-18T10:00:00.000Z",
      generation: 2,
    }),
  );
  const projector = v5Handler(threadId);
  await projector.projectTerminal(
    run(searchId, runId, "failed"),
    command(searchId),
    {} as never,
  );
  // Replay exacto post-crash: la entrega es insert-only por deliveryKey.
  await projector.projectTerminal(
    run(searchId, runId, "failed"),
    command(searchId),
    {} as never,
  );
  const messages = delivery.listDurableChatDeliveries(threadId);
  assert.equal(messages.length, 1);
  assert.equal(
    messages[0].deliveryKey,
    `execution-terminal:partnerships.discovery:v2:${runId}`,
  );
});

test("a superseded COMPLETED run keeps the currency guard (no stale results in chat)", async () => {
  const searchId = "search-completed-superseded";
  const runId = "xrun-completed-superseded";
  const threadId = "hospital-capilar:completed-superseded";
  store.saveSearch(
    search(searchId, {
      mode: "canary",
      admittedAt: "2026-07-18T10:00:00.000Z",
      generation: 2,
    }),
  );
  await v5Handler(threadId).projectTerminal(
    run(searchId, runId, "completed"),
    command(searchId),
    {} as never,
  );
  assert.deepEqual(delivery.listDurableChatDeliveries(threadId), []);
});

test("the v2 recovery handler also always delivers terminal failures", async () => {
  const searchId = "search-failed-v2";
  const runId = "xrun-failed-v2";
  const threadId = "hospital-capilar:failed-v2";
  store.saveSearch(
    search(searchId, {
      mode: "canary",
      admittedAt: "2026-07-18T10:00:00.000Z",
      generation: 1,
      setupRunId: "xrun-setup-v2",
      preparedFingerprint: "prepared-v2",
    }),
  );
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
    { ...run(searchId, runId, "failed"), metadata: {
      authority: "execution_ledger_v2",
      executionContractVersion: 2,
      executionHandlerVersion: 4,
    } },
    command(searchId),
    {} as never,
  );
  assert.equal(delivery.listDurableChatDeliveries(threadId).length, 1);
});

test("failed formatter: deadline gets a friendly cause, unknown codes stay generic", () => {
  const deadline = completion.formatPartnershipsDiscoveryChatCompletion(
    run("s", "r", "failed"),
  );
  assert.match(deadline, /tardó más del límite de tiempo permitido/);
  assert.match(deadline, /relanzarla desde Outreach → Encuentra/);

  const generic = completion.formatPartnershipsDiscoveryChatCompletion(
    run("s", "r", "failed", "partnerships_discovery_v5_contract_invalid"),
  );
  assert.match(generic, /no se completó y no se publicaron resultados/);
  assert.match(generic, /diagnóstico/);

  const noCredits = completion.formatPartnershipsDiscoveryChatCompletion(
    run("s", "r", "failed", "partnerships_scrape_payment_required"),
  );
  assert.match(noCredits, /sin créditos/);
});
