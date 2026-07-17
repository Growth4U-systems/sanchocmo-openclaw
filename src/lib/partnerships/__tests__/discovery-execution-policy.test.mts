import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import {
  buildDiscoveryExecutionSnapshot,
  configuredDiscoveryExecutionSlugs,
  discoveryExecutionAggregateId,
  discoveryExecutionIdempotencyKey,
  resolveDiscoveryExecutionPolicy,
} from "../discovery-execution-policy";
import type { DiscoverySearchRecord } from "../discovery-types";

test("execution rollout is fail-closed for unset, invalid and non-allowlisted config", () => {
  assert.deepEqual(resolveDiscoveryExecutionPolicy("hospital-capilar", {}), {
    mode: "off",
    enabled: false,
    reason: "disabled",
  });
  assert.equal(
    resolveDiscoveryExecutionPolicy("hospital-capilar", {
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "future",
      PARTNERSHIPS_DISCOVERY_V2_SLUGS: "hospital-capilar",
    }).reason,
    "invalid_mode",
  );
  assert.equal(
    resolveDiscoveryExecutionPolicy("hospital-capilar", {
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "shadow",
    }).reason,
    "slug_not_allowlisted",
  );
  assert.equal(
    resolveDiscoveryExecutionPolicy("hospital-capilar", {
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "shadow",
      PARTNERSHIPS_DISCOVERY_V2_SLUGS: "*",
    }).enabled,
    false,
  );
});

test("shadow requires a slug; local canary also requires the single-host storage gate", () => {
  assert.deepEqual(
    resolveDiscoveryExecutionPolicy("Hospital-Capilar", {
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: " SHADOW ",
      PARTNERSHIPS_DISCOVERY_V2_SLUGS: "demo, hospital-capilar ",
    }),
    { mode: "shadow", enabled: true, reason: "enabled" },
  );
  assert.deepEqual(
    resolveDiscoveryExecutionPolicy("hospital-capilar", {
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "on",
      PARTNERSHIPS_DISCOVERY_V2_SLUGS: "hospital-capilar",
    }),
    {
      mode: "canary",
      enabled: false,
      reason: "artifact_store_not_acknowledged",
    },
  );
  assert.deepEqual(
    configuredDiscoveryExecutionSlugs({
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "on",
      PARTNERSHIPS_DISCOVERY_V2_SLUGS: "hospital-capilar",
    }),
    [],
  );
  assert.deepEqual(
    resolveDiscoveryExecutionPolicy("hospital-capilar", {
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "on",
      PARTNERSHIPS_DISCOVERY_V2_SLUGS: "hospital-capilar",
      PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
    }),
    { mode: "canary", enabled: true, reason: "enabled" },
  );
});

test("snapshot is frozen and excludes chat and assigned-template context", () => {
  const modelConfig = JSON.parse(JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG));
  modelConfig.qualification.threshold = 63;
  const search = {
    id: "ds-1",
    slug: "hospital-capilar",
    title: "Creators capilares ES",
    campaignId: "campaign-1",
    projectId: "project-1",
    taskId: "task-1",
    threadId: "secret-thread",
    executionControl: {
      mode: "canary",
      admittedAt: "2026-07-15T10:00:00.000Z",
      generation: 7,
    },
    executionModelConfig: modelConfig,
    plan: {
      title: "Creators capilares ES",
      sectors: ["salud capilar"],
      networks: ["instagram", "tiktok"],
      tiers: ["micro"],
      targetVolume: 20,
      notes: "brief interno",
    },
    runner: {
      status: "queued",
      mode: "live",
      jobId: "job-1",
      queuedAt: "2026-07-15T10:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      error: null,
      stats: null,
    },
    templates: [{ secret: "must-not-leak" }],
    createdAt: "2026-07-15T10:00:00.000Z",
    updatedAt: "2026-07-15T10:00:00.000Z",
  } as unknown as DiscoverySearchRecord;

  const snapshot = buildDiscoveryExecutionSnapshot(search);
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /secret-thread|must-not-leak/);
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.executionGeneration, 7);
  assert.equal(snapshot.modelConfig.qualification.threshold, 63);
  assert.equal(snapshot.plan.targetVolume, 20);
  search.plan.sectors[0] = "mutated";
  modelConfig.qualification.threshold = 99;
  assert.equal(snapshot.plan.sectors[0], "salud capilar");
  assert.equal(snapshot.modelConfig.qualification.threshold, 63);
});

test("aggregate and idempotency keys are stable and tenant-scoped", () => {
  assert.equal(
    discoveryExecutionAggregateId(" Hospital-Capilar ", "ds-1"),
    "hospital-capilar:ds-1",
  );
  assert.equal(
    discoveryExecutionIdempotencyKey("Hospital-Capilar", "ds-1"),
    "partnerships.discovery:hospital-capilar:ds-1:attempt:1:v2",
  );
  assert.equal(
    discoveryExecutionIdempotencyKey("Hospital-Capilar", "ds-1", 3),
    "partnerships.discovery:hospital-capilar:ds-1:attempt:3:v2",
  );
});
