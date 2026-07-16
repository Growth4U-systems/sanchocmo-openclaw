import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import type { CreatorModelConfig } from "@/lib/calc-creator-core";
import type { DiscoverySearchRecord } from "../discovery-types";

const tmp = fs.mkdtempSync(
  path.join(os.tmpdir(), "sancho-discovery-artifact-"),
);
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";
process.env.PARTNERSHIPS_DISCOVERY_EXECUTION_V2 = "canary";
process.env.PARTNERSHIPS_DISCOVERY_V2_SLUGS = "artifact-tenant";
process.env.PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE =
  "local-persistent-single-host";

type ArtifactModule = typeof import("../discovery-execution-artifact");
type RunnerModule = typeof import("../discovery-runner");
type StoreModule = typeof import("../discovery-store");
type QualifyModule = typeof import("../qualify-enrich");

let artifact: ArtifactModule;
let runner: RunnerModule;
let store: StoreModule;
let qualify: QualifyModule;
let yalc: http.Server;
const assignmentCalls: Array<{
  rawBody: string;
  body: { leads: Array<Record<string, unknown>> };
  idempotencyKey: string | undefined;
}> = [];

function cloneConfig(): CreatorModelConfig {
  return JSON.parse(
    JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG),
  ) as CreatorModelConfig;
}

function assignmentData(handle: string, email: string) {
  const qualified = qualify.qualifyCandidates(
    [
      {
        handle,
        email,
        network: "instagram",
        followers: 50_000,
        engagementRatePct: 5,
        signals: { fakeFollowersPct: 0 },
      },
    ],
    { searchId: "search-private" },
  );
  return {
    assignmentBody: { leads: qualified.map((item) => item.lead) },
    qualifiedCount: qualified.length,
    totalQuality: qualified.reduce((sum, item) => sum + item.score.total, 0),
    invalid: 0,
    filtered: 0,
  };
}

function savedSearch(config: CreatorModelConfig): DiscoverySearchRecord {
  return {
    id: "search-reclaim",
    slug: "artifact-tenant",
    commandId: "command-reclaim",
    commandFingerprint: "fingerprint-reclaim",
    executionIntent: "live",
    executionControl: {
      mode: "canary",
      admittedAt: "2026-07-16T10:00:00.000Z",
      generation: 1,
      runId: "run-reclaim",
    },
    executionModelConfig: config,
    title: "Frozen discovery",
    plan: {
      title: "Frozen discovery",
      sectors: ["salud capilar"],
      networks: ["instagram"],
      tiers: ["micro"],
      targetVolume: 1,
    },
    campaignId: "campaign-reclaim",
    projectId: null,
    taskId: null,
    threadId: null,
    runner: {
      status: "running",
      mode: "live",
      attempts: 1,
      queuedAt: "2026-07-16T10:00:00.000Z",
      startedAt: "2026-07-16T10:00:01.000Z",
      finishedAt: null,
      error: null,
      stats: null,
    },
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:01.000Z",
  };
}

before(async () => {
  yalc = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const body = JSON.parse(rawBody) as {
        leads: Array<Record<string, unknown>>;
      };
      assignmentCalls.push({
        rawBody,
        body,
        idempotencyKey: request.headers["idempotency-key"] as
          string | undefined,
      });
      if (assignmentCalls.length === 1) {
        // Simulates a provider commit whose HTTP response is lost. The worker
        // must reclaim with the exact checkpointed body and effect key.
        request.socket.destroy();
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.statusCode = 201;
      response.end(
        JSON.stringify({
          ok: true,
          leads: body.leads.map((lead) => ({
            id: `lead-${String(lead.handle)}`,
            handle: lead.handle,
            lifecycleStatus: "Sourced",
          })),
          dropped: [],
        }),
      );
    });
  });
  await new Promise<void>((resolve) => yalc.listen(0, "127.0.0.1", resolve));
  process.env.YALC_BASE_URL = `http://127.0.0.1:${(yalc.address() as AddressInfo).port}`;
  artifact = await import("../discovery-execution-artifact");
  runner = await import("../discovery-runner");
  store = await import("../discovery-store");
  qualify = await import("../qualify-enrich");
});

after(async () => {
  await new Promise<void>((resolve) => yalc.close(() => resolve()));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("private artifact is atomic, identity-bound and permission-restricted", () => {
  const ref = {
    slug: "artifact-tenant",
    runId: "run-private@example.com",
    effectKey: "effect-private@example.com",
    searchId: "search-private",
    campaignId: "campaign-private",
  };
  const data = assignmentData("@private", "creator@example.com");
  const persisted = artifact.persistDiscoveryAssignmentArtifact(ref, data);
  assert.deepEqual(persisted, data);
  assert.deepEqual(artifact.loadDiscoveryAssignmentArtifact(ref), data);

  const file = artifact.discoveryExecutionArtifactInternals.artifactFile(ref);
  assert.doesNotMatch(file, /run-private|effect-private|creator@example/);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  for (
    let directory = path.dirname(file);
    directory.endsWith(".private") === false;
  ) {
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    directory = path.dirname(directory);
  }
  const privateDirectory = path.join(tmp, "brand", ref.slug, ".private");
  assert.equal(fs.statSync(privateDirectory).mode & 0o777, 0o700);

  const conflicting = assignmentData("@different", "other@example.com");
  assert.throws(
    () => artifact.persistDiscoveryAssignmentArtifact(ref, conflicting),
    (error: unknown) =>
      error instanceof artifact.DiscoveryExecutionArtifactError &&
      error.code === "artifact_conflict",
  );
  artifact.deleteDiscoveryAssignmentArtifact(ref);
  assert.equal(artifact.loadDiscoveryAssignmentArtifact(ref), null);

  const outside = path.join(tmp, "must-not-read.json");
  fs.writeFileSync(outside, JSON.stringify({ creator: "outside@example.com" }));
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.symlinkSync(outside, file);
  assert.throws(
    () => artifact.loadDiscoveryAssignmentArtifact(ref),
    (error: unknown) =>
      error instanceof artifact.DiscoveryExecutionArtifactError &&
      error.code === "artifact_corrupt",
  );
  assert.equal(
    fs.readFileSync(outside, "utf8"),
    JSON.stringify({ creator: "outside@example.com" }),
  );
  fs.rmSync(file, { force: true });
});

test("corrupt destinations fail closed and abandoned partial files expire", () => {
  const corruptRef = {
    slug: "artifact-tenant",
    runId: "run-corrupt",
    effectKey: "effect-corrupt",
    searchId: "search-corrupt",
    campaignId: "campaign-corrupt",
  };
  artifact.persistDiscoveryAssignmentArtifact(
    corruptRef,
    assignmentData("@corrupt", "corrupt@example.com"),
  );
  const corruptFile =
    artifact.discoveryExecutionArtifactInternals.artifactFile(corruptRef);
  fs.writeFileSync(corruptFile, '{"schemaVersion":1', { mode: 0o600 });
  assert.throws(
    () => artifact.loadDiscoveryAssignmentArtifact(corruptRef),
    (error: unknown) =>
      error instanceof artifact.DiscoveryExecutionArtifactError &&
      error.code === "artifact_corrupt",
  );

  const runDirectory = path.dirname(corruptFile);
  const partial = path.join(runDirectory, ".orphaned-pii.tmp");
  fs.writeFileSync(partial, '{"email":"partial@example.com"', {
    mode: 0o600,
  });
  const expiredAt = new Date(
    Date.now() - artifact.discoveryExecutionArtifactInternals.retentionMs - 1,
  );
  fs.utimesSync(partial, expiredAt, expiredAt);

  const expiredRef = {
    slug: "artifact-tenant",
    runId: "run-expired",
    effectKey: "effect-expired",
    searchId: "search-expired",
    campaignId: "campaign-expired",
  };
  artifact.persistDiscoveryAssignmentArtifact(
    expiredRef,
    assignmentData("@expired", "expired@example.com"),
    expiredAt,
  );
  assert.equal(
    artifact.cleanupExpiredDiscoveryAssignmentArtifacts(
      corruptRef.slug,
      new Date(),
    ),
    2,
  );
  assert.equal(fs.existsSync(partial), false);
  assert.equal(artifact.loadDiscoveryAssignmentArtifact(expiredRef), null);
});

test("reclaim ignores provider and config drift and repeats exact effect payload", async () => {
  const configA = cloneConfig();
  configA.weights = {
    erVsTier: 0,
    authenticity: 1,
    sectorFit: 0,
    audienceEs: 0,
    consistency: 0,
  };
  const configB = cloneConfig();
  configB.weights = {
    erVsTier: 1,
    authenticity: 0,
    sectorFit: 0,
    audienceEs: 0,
    consistency: 0,
  };
  store.saveSearch(savedSearch(configA));
  const effectKey =
    "partnerships.discovery:run:run-reclaim:step:yalc.campaign:v2";
  const firstCandidate = {
    handle: "@first_provider_result",
    email: "first@example.com",
    network: "instagram",
    followers: 50_000,
    engagementRatePct: 0,
    signals: { fakeFollowersPct: 0 },
  };
  const execution = {
    leaseAuthority: "canary" as const,
    manageRunnerState: false,
    yalcIdempotencyKey: effectKey,
    modelConfig: configA,
    assignmentArtifact: { runId: "run-reclaim", effectKey },
  };

  await assert.rejects(() =>
    runner.runDiscoverySearch({
      slug: "artifact-tenant",
      searchId: "search-reclaim",
      candidates: [firstCandidate],
      execution,
    }),
  );
  assert.equal(assignmentCalls.length, 1);

  const reclaimed = await runner.runDiscoverySearch({
    slug: "artifact-tenant",
    searchId: "search-reclaim",
    candidates: [
      {
        ...firstCandidate,
        handle: "@drifted_provider_result",
        email: "drifted@example.com",
      },
    ],
    execution: { ...execution, modelConfig: configB },
  });

  assert.equal(assignmentCalls.length, 2);
  assert.equal(assignmentCalls[1].rawBody, assignmentCalls[0].rawBody);
  assert.deepEqual(assignmentCalls[1].body, assignmentCalls[0].body);
  assert.equal(assignmentCalls[0].idempotencyKey, effectKey);
  assert.equal(assignmentCalls[1].idempotencyKey, effectKey);
  const lead = assignmentCalls[1].body.leads[0];
  assert.equal(lead.handle, "@first_provider_result");
  assert.equal(lead.email, "first@example.com");
  assert.equal(lead.qualityScore, 100);
  assert.deepEqual(reclaimed.qualified, []);
});
