import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { NextApiRequest, NextApiResponse } from "next";
import type {
  CreateExecutionRunInput,
  ExecutionControlRepository,
  ExecutionRun,
} from "@/lib/execution-control";
import { executionCommandFingerprint } from "@/lib/execution-control";
import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import { parseDiscoveryPlan } from "../discovery-plan";
import type { DiscoverySearchRecord } from "../discovery-types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-canary-admission-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";
process.env.PARTNERSHIPS_DISCOVERY_EXECUTION_V2 = "canary";
process.env.PARTNERSHIPS_DISCOVERY_V2_SLUGS = "hospital-capilar";
process.env.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED = "1";
process.env.PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE =
  "local-persistent-single-host";

let server: http.Server;
let campaignPosts = 0;
let createDiscoverySearch: typeof import("../create-search").createDiscoverySearch;
let DiscoveryCommandError: typeof import("../create-search").DiscoveryCommandError;
let listSearchIds: typeof import("../discovery-store").listSearchIds;
let getSearch: typeof import("../discovery-store").getSearch;
let saveSearch: typeof import("../discovery-store").saveSearch;
let buildDiscoveryExecutionSnapshot: typeof import("../discovery-execution-policy").buildDiscoveryExecutionSnapshot;
let apiHandler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function legacyCanarySearch(commandId: string): DiscoverySearchRecord {
  const slug = "hospital-capilar";
  const rawPlan = {
    title: `Legacy ${commandId}`,
    sectors: ["salud capilar"],
    networks: ["instagram"],
  };
  const commandHash = sha256(`${slug}\u0000${commandId}`);
  const now = "2026-07-16T10:00:00.000Z";
  return {
    id: `ds-${commandHash.slice(0, 20)}`,
    slug,
    commandId,
    commandFingerprint: sha256(
      canonical({ plan: rawPlan, executionIntent: "fixtures" }),
    ),
    executionIntent: "fixtures",
    executionControl: {
      mode: "canary",
      admittedAt: now,
      generation: 1,
    },
    executionModelConfig: JSON.parse(
      JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG),
    ),
    title: rawPlan.title,
    plan: parseDiscoveryPlan(rawPlan, DEFAULT_CREATOR_MODEL_CONFIG),
    campaignId: `campaign-${commandId}`,
    projectId: `P-${commandId}`,
    taskId: `P-${commandId}-T01`,
    threadId: null,
    runner: {
      status: "queued",
      mode: null,
      queuedAt: now,
      startedAt: null,
      finishedAt: null,
      error: null,
      stats: null,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function executionRun(
  id: string,
  search: DiscoverySearchRecord,
  input = buildDiscoveryExecutionSnapshot(search),
  commandFingerprint = `child-${id}`,
): ExecutionRun {
  const now = "2026-07-16T10:00:00.000Z";
  return {
    id,
    tenantKey: search.slug,
    idempotencyKey: `partnerships.discovery:${search.slug}:${search.id}:attempt:1:v2`,
    aggregateType: "partnerships.search",
    aggregateId: `${search.slug}:${search.id}`,
    operation: "partnerships.discovery",
    mode: "canary",
    status: "queued",
    input,
    metadata: {},
    commandFingerprint,
    availableAt: now,
    claimCount: 0,
    handlerAttempt: 0,
    createdAt: now,
    updatedAt: now,
  };
}

before(async () => {
  fs.writeFileSync(
    path.join(tmp, "clients.json"),
    JSON.stringify({
      clients: [
        { slug: "hospital-capilar", name: "Hospital Capilar", active: true },
      ],
      adminToken: "canary-test-admin",
    }),
  );
  server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET" && req.url?.startsWith("/api/model-config")) {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, overrides: {} }));
      return;
    }
    if (req.method === "POST" && req.url?.startsWith("/api/campaigns")) {
      campaignPosts += 1;
      res.statusCode = 201;
      res.end(JSON.stringify({ ok: true, campaignId: "must-not-exist" }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "unexpected request" }));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  process.env.YALC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ({ createDiscoverySearch, DiscoveryCommandError } =
    await import("../create-search"));
  ({ listSearchIds, getSearch, saveSearch } =
    await import("../discovery-store"));
  ({ buildDiscoveryExecutionSnapshot } =
    await import("../discovery-execution-policy"));
  apiHandler = (await import("@/pages/api/partnerships/searches")).default;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("shared canary creation requires a stable caller receipt before effects", async () => {
  await assert.rejects(
    () =>
      createDiscoverySearch({
        slug: "hospital-capilar",
        plan: {
          title: "Salud capilar IG",
          sectors: ["salud capilar"],
          networks: ["instagram"],
        },
      }),
    (error: unknown) =>
      error instanceof DiscoveryCommandError && error.status === 400,
  );
  assert.equal(campaignPosts, 0);
  assert.deepEqual(listSearchIds("hospital-capilar"), []);
});

test("HTTP canary POST without commandId or Idempotency-Key returns 400", async () => {
  let statusCode = 200;
  let payload: unknown;
  const req = {
    method: "POST",
    url: "/api/partnerships/searches?slug=hospital-capilar",
    query: { slug: "hospital-capilar" },
    headers: { "x-admin-token": "canary-test-admin" },
    body: {
      slug: "hospital-capilar",
      plan: {
        title: "Salud capilar IG",
        sectors: ["salud capilar"],
        networks: ["instagram"],
      },
    },
  } as unknown as NextApiRequest;
  const res = {
    headersSent: false,
    setHeader() {},
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      this.headersSent = true;
      return this;
    },
  } as unknown as NextApiResponse;

  await apiHandler(req, res);

  assert.equal(statusCode, 400);
  assert.equal(
    (payload as { code?: string }).code,
    "DISCOVERY_COMMAND_ID_REQUIRED",
  );
  assert.equal(campaignPosts, 0);
});

test("canary rollout with default boot off fails before provider or product receipt", async () => {
  const commandId = "boot-off-must-not-admit";
  const commandHash = sha256(`hospital-capilar\u0000${commandId}`);
  const searchId = `ds-${commandHash.slice(0, 20)}`;
  const campaignsBefore = campaignPosts;
  const previousBoot = process.env.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED;
  try {
    process.env.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED = "0";
    await assert.rejects(
      () =>
        createDiscoverySearch(
          {
            slug: "hospital-capilar",
            commandId,
            executionIntent: "fixtures",
            plan: {
              title: "Boot off",
              sectors: ["salud capilar"],
              networks: ["instagram"],
            },
          },
          {
            env: {
              PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED: "0",
              PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
              PARTNERSHIPS_DISCOVERY_V2_SLUGS: "hospital-capilar",
              PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE:
                "local-persistent-single-host",
            },
          },
        ),
      (error: unknown) =>
        error instanceof DiscoveryCommandError &&
        error.status === 503 &&
        error.code === "DISCOVERY_DURABLE_WORKER_BOOT_DISABLED",
    );
  } finally {
    if (previousBoot === undefined) {
      delete process.env.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED;
    } else {
      process.env.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED = previousBoot;
    }
  }
  assert.equal(campaignPosts, campaignsBefore);
  assert.equal(getSearch("hospital-capilar", searchId), null);
});

test("flag-off without artifact ACK still consults a sticky setup receipt and never falls through to legacy", async () => {
  const slug = "hospital-capilar";
  const commandId = "sticky-setup-without-current-capability";
  const rawPlan = {
    title: "Sticky setup receipt",
    sectors: ["salud capilar"],
    networks: ["instagram"],
  };
  const executionIntent = "fixtures" as const;
  const commandHash = sha256(`${slug}\u0000${commandId}`);
  const searchId = `ds-${commandHash.slice(0, 20)}`;
  const requestFingerprint = sha256(
    canonical({ plan: rawPlan, executionIntent }),
  );
  const now = "2026-07-16T10:00:00.000Z";
  const stickyRun: ExecutionRun = {
    id: "xrun_sticky_setup_no_ack",
    tenantKey: slug,
    idempotencyKey: `partnerships.discovery.setup:${slug}:${commandHash}:v1`,
    aggregateType: "partnerships.search",
    aggregateId: `${slug}:${searchId}`,
    operation: "partnerships.discovery.setup",
    mode: "canary",
    status: "queued",
    input: {
      schemaVersion: 1,
      slug,
      searchId,
      commandId,
      commandHash,
      requestFingerprint,
      rawPlan,
      threadId: null,
      executionIntent,
      createdAt: now,
    },
    metadata: {},
    availableAt: now,
    claimCount: 0,
    handlerAttempt: 0,
    createdAt: now,
    updatedAt: now,
  };
  let exactAggregateReads = 0;
  let createRuns = 0;
  const repository = {
    getRunByAggregateForScope: async () => {
      exactAggregateReads += 1;
      return stickyRun;
    },
    createRun: async () => {
      createRuns += 1;
      throw new Error("sticky replay must never admit a replacement run");
    },
  } as unknown as ExecutionControlRepository;
  const campaignsBefore = campaignPosts;

  await assert.rejects(
    () =>
      createDiscoverySearch(
        {
          slug,
          commandId,
          executionIntent,
          plan: rawPlan,
        },
        {
          repository,
          env: {
            PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "off",
            PARTNERSHIPS_DISCOVERY_V2_SLUGS: "",
          },
        },
      ),
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 503 &&
        "code" in error &&
        error.code === "setup_store_not_acknowledged",
      ),
  );
  assert.equal(exactAggregateReads, 1);
  assert.equal(createRuns, 0);
  assert.equal(campaignPosts, campaignsBefore);
  assert.equal(getSearch(slug, searchId), null);
});

test("canary rejects deferred, agentic and non-Instagram commands before campaign creation", async () => {
  const setupReceipts: ExecutionRun[] = [];
  const repository = {
    getRunByAggregateForScope: async () => null,
    createRun: async (value: CreateExecutionRunInput) => {
      const now = value.now?.toISOString() ?? new Date().toISOString();
      const run: ExecutionRun = {
        id: `xrun_rejected_${setupReceipts.length + 1}`,
        tenantKey: value.tenantKey.trim().toLowerCase(),
        idempotencyKey: value.idempotencyKey,
        aggregateType: value.aggregateType,
        aggregateId: value.aggregateId,
        operation: value.operation.trim().toLowerCase(),
        mode: value.mode ?? "shadow",
        status: "failed",
        input: value.input,
        metadata: value.metadata ?? {},
        availableAt: now,
        claimCount: 0,
        handlerAttempt: 1,
        currentStep: "failed",
        output: { errorCode: "unsupported_setup_command" },
        error: "Instagram-only durable discovery canary",
        createdAt: now,
        updatedAt: now,
        finishedAt: now,
      };
      setupReceipts.push(run);
      return { run, created: true };
    },
  } as unknown as ExecutionControlRepository;
  const cases = [
    {
      commandId: "deferred-command",
      executionIntent: "none" as const,
      networks: ["instagram"],
    },
    {
      commandId: "agent-command",
      executionIntent: "agent" as const,
      networks: ["instagram"],
    },
    {
      commandId: "tiktok-command",
      executionIntent: "auto" as const,
      networks: ["tiktok"],
    },
  ];
  for (const item of cases) {
    await assert.rejects(
      () =>
        createDiscoverySearch(
          {
            slug: "hospital-capilar",
            commandId: item.commandId,
            executionIntent: item.executionIntent,
            plan: {
              title: item.commandId,
              sectors: ["salud capilar"],
              networks: item.networks,
            },
          },
          {
            repository,
            env: {
              PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
              PARTNERSHIPS_DISCOVERY_V2_SLUGS: "hospital-capilar",
              PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE:
                "local-persistent-single-host",
            },
          },
        ),
      (error: unknown) =>
        error instanceof DiscoveryCommandError && error.status === 400,
    );
  }
  assert.equal(setupReceipts.length, 1);
  assert.equal(setupReceipts[0]?.operation, "partnerships.discovery.setup");
  assert.equal(campaignPosts, 0);
  assert.deepEqual(listSearchIds("hospital-capilar"), []);
});

test("legacy JSON with a linked exact child replays without setup or global runtime", async () => {
  const base = legacyCanarySearch("legacy-linked-command");
  const childId = "xrun_legacy_linked";
  const childFingerprint = "legacy-linked-child-fingerprint";
  const child = executionRun(
    childId,
    base,
    buildDiscoveryExecutionSnapshot(base),
    childFingerprint,
  );
  saveSearch({
    ...base,
    executionControl: {
      ...base.executionControl!,
      runId: childId,
      commandFingerprint: childFingerprint,
    },
  });
  let exactReads = 0;
  let createRuns = 0;
  const repository = {
    getRunByIdForScope: async () => {
      exactReads += 1;
      return child;
    },
    createRun: async () => {
      createRuns += 1;
      throw new Error("legacy linked replay must not create a run");
    },
  } as unknown as ExecutionControlRepository;
  let setupEffects = 0;
  let modelReads = 0;
  let wakes = 0;
  const result = await createDiscoverySearch(
    {
      slug: base.slug,
      commandId: base.commandId,
      executionIntent: "fixtures",
      plan: {
        title: base.title,
        sectors: ["salud capilar"],
        networks: ["instagram"],
      },
    },
    {
      repository,
      env: {
        PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
        PARTNERSHIPS_DISCOVERY_V2_SLUGS: base.slug,
        PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
      },
      getModelConfig: async () => {
        modelReads += 1;
        throw new Error("frozen config must be reused");
      },
      wakeDiscovery: async () => {
        wakes += 1;
      },
      setup: {
        createCampaign: async () => {
          setupEffects += 1;
          throw new Error("setup campaign must not run");
        },
        createWorkspace: async () => {
          setupEffects += 1;
          throw new Error("setup workspace must not run");
        },
      },
    },
  );

  assert.equal("kind" in result, false);
  if ("kind" in result) return;
  assert.equal(result.replayed, true);
  assert.equal(result.search.executionControl?.runId, childId);
  assert.equal(exactReads, 1);
  assert.equal(createRuns, 0);
  assert.equal(modelReads, 0);
  assert.equal(setupEffects, 0);
  assert.equal(wakes, 1);
});

test("legacy JSON without a child binds one exact child and reuses it", async () => {
  const base = legacyCanarySearch("legacy-prebind-command");
  saveSearch(base);
  const runs = new Map<string, ExecutionRun>();
  const createInputs: CreateExecutionRunInput[] = [];
  const repository = {
    createRun: async (value: CreateExecutionRunInput) => {
      createInputs.push(value);
      const existing = [...runs.values()].find(
        (run) => run.idempotencyKey === value.idempotencyKey,
      );
      if (existing) return { run: existing, created: false };
      const run = {
        ...executionRun(
          "xrun_legacy_prebind",
          base,
          value.input,
          executionCommandFingerprint(value),
        ),
        tenantKey: value.tenantKey,
        idempotencyKey: value.idempotencyKey,
        aggregateType: value.aggregateType,
        aggregateId: value.aggregateId,
        operation: value.operation,
        mode: value.mode ?? "shadow",
        metadata: value.metadata ?? {},
      };
      runs.set(run.id, run);
      return { run, created: true };
    },
    getRunByIdForScope: async (scope: { runId: string }) =>
      runs.get(scope.runId) ?? null,
  } as unknown as ExecutionControlRepository;
  let setupEffects = 0;
  let wakes = 0;
  const dependencies = {
    repository,
    env: {
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
      PARTNERSHIPS_DISCOVERY_V2_SLUGS: base.slug,
      PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
    },
    getModelConfig: async () => {
      throw new Error("legacy frozen config must be reused");
    },
    wakeDiscovery: async () => {
      wakes += 1;
    },
    setup: {
      createCampaign: async () => {
        setupEffects += 1;
        throw new Error("setup campaign must not run");
      },
      createWorkspace: async () => {
        setupEffects += 1;
        throw new Error("setup workspace must not run");
      },
    },
  };
  const request = {
    slug: base.slug,
    commandId: base.commandId,
    executionIntent: "fixtures" as const,
    plan: {
      title: base.title,
      sectors: ["salud capilar"],
      networks: ["instagram"],
    },
  };

  const first = await createDiscoverySearch(request, dependencies);
  const replay = await createDiscoverySearch(request, dependencies);
  assert.equal("kind" in first, false);
  assert.equal("kind" in replay, false);
  if ("kind" in first || "kind" in replay) return;
  assert.equal(first.search.executionControl?.runId, "xrun_legacy_prebind");
  assert.equal(replay.search.executionControl?.runId, "xrun_legacy_prebind");
  assert.equal(first.replayed, true);
  assert.equal(replay.replayed, true);
  assert.equal(createInputs.length, 1);
  assert.equal(createInputs[0]?.operation, "partnerships.discovery");
  assert.equal(setupEffects, 0);
  assert.equal(wakes, 2);
  assert.equal(
    getSearch(base.slug, base.id)?.executionControl?.runId,
    "xrun_legacy_prebind",
  );
});

test("legacy off plus artifact ACK cannot lazily allocate Partnerships when boot is 0/0/1", async () => {
  const worker = await import("../discovery-durable-worker");
  const previous = {
    partnershipsBoot: process.env.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED,
    leadsBoot: process.env.LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED,
    searchBoot: process.env.LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED,
    rollout: process.env.PARTNERSHIPS_DISCOVERY_EXECUTION_V2,
    slugs: process.env.PARTNERSHIPS_DISCOVERY_V2_SLUGS,
    databaseUrl: process.env.DATABASE_URL,
  };
  const campaignsBefore = campaignPosts;
  try {
    await worker.stopCanaryDiscoveryWorkers();
    process.env.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED = "0";
    process.env.LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED = "0";
    process.env.LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED = "1";
    process.env.PARTNERSHIPS_DISCOVERY_EXECUTION_V2 = "off";
    process.env.PARTNERSHIPS_DISCOVERY_V2_SLUGS = "";
    delete process.env.DATABASE_URL;

    const created = await createDiscoverySearch({
      slug: "hospital-capilar",
      commandId: "legacy-boot-isolation-001",
      executionIntent: "none",
      plan: {
        title: "Legacy boot isolation",
        sectors: ["salud capilar"],
        networks: ["instagram"],
      },
    });

    assert.equal("kind" in created, false);
    assert.equal(campaignPosts, campaignsBefore + 1);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(worker.getCanaryDiscoveryRuntimeReadiness(), undefined);
  } finally {
    if (previous.partnershipsBoot === undefined) {
      delete process.env.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED;
    } else {
      process.env.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED =
        previous.partnershipsBoot;
    }
    if (previous.leadsBoot === undefined) {
      delete process.env.LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED;
    } else {
      process.env.LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED =
        previous.leadsBoot;
    }
    if (previous.searchBoot === undefined) {
      delete process.env.LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED;
    } else {
      process.env.LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED =
        previous.searchBoot;
    }
    if (previous.rollout === undefined) {
      delete process.env.PARTNERSHIPS_DISCOVERY_EXECUTION_V2;
    } else {
      process.env.PARTNERSHIPS_DISCOVERY_EXECUTION_V2 = previous.rollout;
    }
    if (previous.slugs === undefined) {
      delete process.env.PARTNERSHIPS_DISCOVERY_V2_SLUGS;
    } else {
      process.env.PARTNERSHIPS_DISCOVERY_V2_SLUGS = previous.slugs;
    }
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    await worker.stopCanaryDiscoveryWorkers();
  }
});
