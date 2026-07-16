import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import postgres, { type Sql } from "postgres";

const databaseUrl = process.env.PARTNERSHIPS_CRASH_MATRIX_DATABASE_URL?.trim();
const fixture = path.resolve(
  process.cwd(),
  "src/lib/partnerships/__tests__/fixtures/discovery-setup-crash-child.mts",
);
const slug = "hospital-capilar-crash-matrix";
const leaseMs = 1_200;
let workspace = "";
let sql: Sql<Record<string, unknown>>;
let yalcUrl = "";

interface CampaignCall {
  method: string;
  pathname: string;
  idempotencyKey: string;
  bodyHash: string;
  campaignId: string;
}

const campaignCalls: CampaignCall[] = [];
const campaignReceipts = new Map<
  string,
  { bodyHash: string; campaignId: string }
>();

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("mock campaign body must be JSON serializable");
}

function assertDedicatedDatabase(value: string): void {
  const url = new URL(value);
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!local || !/^san480_crash_matrix_[a-z0-9_]+$/.test(database)) {
    throw new Error(
      "PARTNERSHIPS_CRASH_MATRIX_DATABASE_URL must name a dedicated local san480_crash_matrix_* database",
    );
  }
}

async function readBody(request: http.IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 128 * 1024) throw new Error("mock request too large");
  }
  return body;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const method = request.method ?? "GET";
  if (method !== "POST" || url.pathname !== "/api/campaigns") {
    campaignCalls.push({
      method,
      pathname: url.pathname,
      idempotencyKey: String(request.headers["idempotency-key"] ?? ""),
      bodyHash: "",
      campaignId: "",
    });
    response.writeHead(405, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "forbidden mock operation" }));
    return;
  }
  try {
    const idempotencyKey = String(request.headers["idempotency-key"] ?? "");
    assert.ok(idempotencyKey, "Yalc mock requires Idempotency-Key");
    // PostgreSQL JSONB may reorder object keys between attempts. Yalc's
    // idempotency contract is semantic, so the mock fingerprints canonical
    // JSON rather than transport byte order.
    const body = JSON.parse(await readBody(request)) as unknown;
    const bodyHash = hash(canonical(body));
    const existing = campaignReceipts.get(idempotencyKey);
    if (existing && existing.bodyHash !== bodyHash) {
      response.writeHead(409, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "idempotency drift" }));
      return;
    }
    const receipt = existing ?? {
      bodyHash,
      campaignId: `campaign-${hash(idempotencyKey).slice(0, 16)}`,
    };
    campaignReceipts.set(idempotencyKey, receipt);
    campaignCalls.push({
      method,
      pathname: url.pathname,
      idempotencyKey,
      bodyHash,
      campaignId: receipt.campaignId,
    });
    response.writeHead(existing ? 200 : 201, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify({ campaignId: receipt.campaignId }));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
});

interface ChildResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

interface RunningChild {
  child: ChildProcessWithoutNullStreams;
  completed: Promise<ChildResult>;
  waitForMarker(marker: string): Promise<void>;
}

function launchChild(input: {
  mode: "seed" | "run";
  commandId: string;
  runId?: string;
  point?: string;
  workerId?: string;
  childLeaseMs?: number;
}): RunningChild {
  assert.ok(databaseUrl);
  const child = spawn(process.execPath, ["--import", "tsx", fixture], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_DRIVER: "postgres",
      MC_WORKSPACE: workspace,
      MC_TASKS_BACKEND: "json",
      CRASH_MATRIX_YALC_URL: yalcUrl,
      CRASH_MATRIX_MODE: input.mode,
      CRASH_MATRIX_POINT: input.point ?? "none",
      CRASH_MATRIX_SLUG: slug,
      CRASH_MATRIX_COMMAND_ID: input.commandId,
      CRASH_MATRIX_RUN_ID: input.runId ?? "seed-has-no-run-id",
      CRASH_MATRIX_WORKER_ID: input.workerId ?? "seed-no-worker",
      CRASH_MATRIX_LEASE_MS: String(input.childLeaseMs ?? leaseMs),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const markerWaiters = new Map<string, Array<() => void>>();
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
    for (const [marker, resolvers] of markerWaiters) {
      if (!stdout.includes(`\"marker\":\"${marker}\"`)) continue;
      markerWaiters.delete(marker);
      for (const resolve of resolvers) resolve();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const completed = new Promise<ChildResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `crash fixture timed out (${input.commandId}/${input.point})\n${stderr}`,
        ),
      );
    }, 20_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr });
    });
  });
  return {
    child,
    completed,
    waitForMarker(marker) {
      if (stdout.includes(`\"marker\":\"${marker}\"`)) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        const resolvers = markerWaiters.get(marker) ?? [];
        resolvers.push(resolve);
        markerWaiters.set(marker, resolvers);
        const timeout = setTimeout(() => {
          reject(
            new Error(
              `marker ${marker} not observed for ${input.commandId}\n${stdout}\n${stderr}`,
            ),
          );
        }, 15_000);
        void completed.finally(() => clearTimeout(timeout));
      });
    },
  };
}

function lastJsonLine<T>(output: string): T {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  assert.ok(lines.length > 0, "child returned no stdout");
  return JSON.parse(lines[lines.length - 1]) as T;
}

async function runSuccessfulChild(
  input: Parameters<typeof launchChild>[0],
): Promise<Record<string, unknown>> {
  const result = await launchChild(input).completed;
  assert.equal(
    result.code,
    0,
    `child failed (${input.commandId}/${input.point})\n${result.stderr}\n${result.stdout}`,
  );
  assert.equal(result.signal, null);
  return lastJsonLine(result.stdout);
}

async function waitForLeaseExpiry(runId: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = await sql<
      Array<{ expired: boolean; status: string; lease_owner: string | null }>
    >`
      SELECT
        "status",
        "lease_owner",
        COALESCE(
          "lease_expires_at" <= (clock_timestamp() AT TIME ZONE 'UTC'),
          false
        ) AS "expired"
      FROM "execution_runs"
      WHERE "id" = ${runId}
    `;
    if (rows[0]?.status === "running" && rows[0].expired) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`lease did not expire for ${runId}`);
}

function mutateWorkspace(commandHash: string): void {
  const projectId = `P-Discovery-${commandHash.slice(0, 12)}`;
  const directory = path.join(workspace, "brand", slug, "projects", projectId);
  const projectFile = path.join(directory, "project.json");
  const tasksFile = path.join(directory, "tasks.json");
  const project = JSON.parse(fs.readFileSync(projectFile, "utf8")) as Record<
    string,
    unknown
  >;
  project.name = "Human-owned project title";
  project.description = "Human edit preserved across setup recovery";
  fs.writeFileSync(projectFile, JSON.stringify(project, null, 2));
  const tasks = JSON.parse(fs.readFileSync(tasksFile, "utf8")) as Array<
    Record<string, unknown>
  >;
  assert.ok(tasks.length > 0);
  tasks[0].status = "completed";
  tasks[0].description = "Human-owned task edit";
  fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
}

function mutateSearch(searchId: string): void {
  const file = path.join(
    workspace,
    "brand",
    slug,
    "outreach",
    "searches",
    `${searchId}.json`,
  );
  const search = JSON.parse(fs.readFileSync(file, "utf8")) as {
    runner: Record<string, unknown>;
  };
  search.runner.attempts = 77;
  search.runner.error = "Human diagnostic preserved across binding";
  fs.writeFileSync(file, JSON.stringify(search, null, 2));
}

async function assertRecoveredScenario(input: {
  commandId: string;
  commandHash: string;
  searchId: string;
  setupRunId: string;
  expectWorkspaceMutation?: boolean;
  expectSearchMutation?: boolean;
  expectedCampaignCalls: number;
}): Promise<void> {
  const setupRows = await sql<
    Array<{
      id: string;
      idempotency_key: string;
      command_fingerprint: string;
      status: string;
      claim_count: number;
      handler_attempt: number;
      output: {
        campaign?: { id?: string };
        workspace?: { projectId?: string; taskId?: string };
        discoveryRunId?: string;
      };
    }>
  >`
    SELECT "id", "idempotency_key", "command_fingerprint", "status",
           "claim_count", "handler_attempt", "output"
    FROM "execution_runs"
    WHERE "tenant_key" = ${slug}
      AND "operation" = 'partnerships.discovery.setup'
      AND "input"->>'commandId' = ${input.commandId}
  `;
  assert.equal(setupRows.length, 1, "exactly one setup receipt");
  const setup = setupRows[0];
  assert.equal(setup.id, input.setupRunId);
  assert.equal(setup.status, "completed");
  assert.equal(setup.claim_count, 2, "one crashed claim plus one recovery");
  assert.equal(setup.handler_attempt, 2);
  assert.match(setup.command_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(
    setup.idempotency_key,
    `partnerships.discovery.setup:${slug}:${input.commandHash}:v1`,
  );

  const childRows = await sql<
    Array<{
      id: string;
      idempotency_key: string;
      command_fingerprint: string;
      status: string;
      input: { setupRunId?: string; searchId?: string };
    }>
  >`
    SELECT "id", "idempotency_key", "command_fingerprint", "status", "input"
    FROM "execution_runs"
    WHERE "tenant_key" = ${slug}
      AND "operation" = 'partnerships.discovery'
      AND "input"->>'setupRunId' = ${setup.id}
  `;
  assert.equal(childRows.length, 1, "exactly one discovery child receipt");
  const child = childRows[0];
  assert.equal(child.status, "queued");
  assert.equal(child.input.searchId, input.searchId);
  assert.match(child.command_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(setup.output.discoveryRunId, child.id);

  const events = await sql<Array<{ type: string }>>`
    SELECT "type" FROM "execution_events"
    WHERE "run_id" IN (${setup.id}, ${child.id})
    ORDER BY "sequence"
  `;
  assert.equal(
    events.filter((event) => event.type === "run.lease_recovered").length,
    1,
    "recovery must be observable exactly once",
  );
  assert.equal(
    events.filter(
      (event) => event.type === "partnerships.discovery.setup.campaign_ready",
    ).length,
    1,
  );
  assert.equal(
    events.filter(
      (event) => event.type === "partnerships.discovery.setup.workspace_ready",
    ).length,
    1,
  );
  assert.equal(
    events.filter(
      (event) =>
        event.type === "partnerships.discovery.setup.discovery_admitted",
    ).length,
    1,
  );
  assert.ok(
    events.every(
      (event) => !/(?:approve|execute|publish|send)/i.test(event.type),
    ),
    "fixture must not approve, execute, publish, or send",
  );

  const campaignKey = `partnerships.discovery:${input.commandHash}`;
  const calls = campaignCalls.filter(
    (call) => call.idempotencyKey === campaignKey,
  );
  assert.equal(calls.length, input.expectedCampaignCalls);
  assert.equal(new Set(calls.map((call) => call.idempotencyKey)).size, 1);
  assert.equal(new Set(calls.map((call) => call.bodyHash)).size, 1);
  assert.equal(new Set(calls.map((call) => call.campaignId)).size, 1);
  assert.equal(campaignReceipts.has(campaignKey), true);
  assert.equal(setup.output.campaign?.id, calls[0].campaignId);
  assert.ok(
    calls.every(
      (call) => call.method === "POST" && call.pathname === "/api/campaigns",
    ),
  );

  const searchFile = path.join(
    workspace,
    "brand",
    slug,
    "outreach",
    "searches",
    `${input.searchId}.json`,
  );
  const search = JSON.parse(fs.readFileSync(searchFile, "utf8")) as {
    campaignId: string;
    projectId: string;
    taskId: string;
    runner: { attempts: number; error?: string };
    executionControl: { setupRunId: string; runId: string };
  };
  assert.equal(search.campaignId, calls[0].campaignId);
  assert.equal(search.executionControl.setupRunId, setup.id);
  assert.equal(search.executionControl.runId, child.id);
  assert.equal(search.projectId, setup.output.workspace?.projectId);
  assert.equal(search.taskId, setup.output.workspace?.taskId);
  if (input.expectSearchMutation) {
    assert.equal(search.runner.attempts, 77);
    assert.equal(
      search.runner.error,
      "Human diagnostic preserved across binding",
    );
  }

  const projectId = `P-Discovery-${input.commandHash.slice(0, 12)}`;
  const projectDirectory = path.join(
    workspace,
    "brand",
    slug,
    "projects",
    projectId,
  );
  const project = JSON.parse(
    fs.readFileSync(path.join(projectDirectory, "project.json"), "utf8"),
  ) as {
    id: string;
    name: string;
    description: string;
    legacy_extras?: { durable_creation_key?: string };
  };
  const tasks = JSON.parse(
    fs.readFileSync(path.join(projectDirectory, "tasks.json"), "utf8"),
  ) as Array<{
    id: string;
    status: string;
    description?: string;
    legacy_extras?: { durable_creation_key?: string };
  }>;
  assert.equal(project.id, projectId);
  assert.equal(
    fs.readdirSync(projectDirectory).filter((name) => name === "project.json")
      .length,
    1,
  );
  assert.ok(tasks.length > 0);
  const marker = project.legacy_extras?.durable_creation_key;
  assert.ok(marker?.includes(input.commandHash));
  assert.ok(
    tasks.every((task) => task.legacy_extras?.durable_creation_key === marker),
  );
  if (input.expectWorkspaceMutation) {
    assert.equal(project.name, "Human-owned project title");
    assert.equal(
      project.description,
      "Human edit preserved across setup recovery",
    );
    assert.equal(tasks[0].status, "completed");
    assert.equal(tasks[0].description, "Human-owned task edit");
  }
}

before(async () => {
  if (!databaseUrl) return;
  assertDedicatedDatabase(databaseUrl);
  workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "san480-partnerships-crash-matrix-"),
  );
  sql = postgres(databaseUrl, { max: 4 });
  await sql.unsafe(
    'DROP TABLE IF EXISTS "execution_run_origins", "execution_origins", "leads_search_projections", "execution_terminal_projections", "execution_effects", "execution_events", "execution_steps", "execution_runs" CASCADE',
  );
  for (const migration of [
    "0019_execution_control.sql",
    "0020_execution_tenant_scope.sql",
    "0021_execution_leases.sql",
    "0022_execution_command_fingerprint.sql",
    "0023_execution_drain.sql",
    "0024_execution_tenant_contract.sql",
    "0025_execution_effects.sql",
    "0026_execution_cancellation.sql",
    "0027_execution_terminal_projections.sql",
    "0028_execution_run_blocking.sql",
    "0029_leads_search_projections.sql",
    "0030_execution_utc_timestamps.sql",
    "0031_execution_origin_lookup.sql",
    "0032_execution_origin_tombstones.sql",
  ]) {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/db/migrations", migration),
      "utf8",
    );
    await sql.unsafe(source);
  }
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  yalcUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!databaseUrl) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await sql.end({ timeout: 2 });
  fs.rmSync(workspace, { recursive: true, force: true });
});

if (!databaseUrl) {
  test(
    "Partnerships crash matrix requires an explicit isolated PostgreSQL URL",
    { skip: "set PARTNERSHIPS_CRASH_MATRIX_DATABASE_URL" },
    () => undefined,
  );
} else {
  test("Partnerships fixture recovers every durable setup crash boundary", async (t) => {
    const scenarios = [
      {
        name: "campaign response before checkpoint",
        commandId: "matrix-after-campaign-response",
        point: "after_campaign_response",
        marker: "after_campaign_response",
        campaignCalls: 2,
      },
      {
        name: "project/task insert-only before checkpoint",
        commandId: "matrix-after-workspace-insert",
        point: "after_workspace_insert",
        marker: "after_workspace_insert",
        campaignCalls: 1,
        mutateWorkspace: true,
      },
      {
        name: "child run created before bind/projection",
        commandId: "matrix-after-child-create",
        point: "after_child_create",
        marker: "after_child_create",
        campaignCalls: 1,
        mutateSearch: true,
      },
    ];

    for (const scenario of scenarios) {
      await t.test(scenario.name, { concurrency: false }, async () => {
        const seeded = await runSuccessfulChild({
          mode: "seed",
          commandId: scenario.commandId,
        });
        const runId = String(seeded.runId);
        const searchId = String(seeded.searchId);
        const commandHash = String(seeded.commandHash);
        const crashing = launchChild({
          mode: "run",
          commandId: scenario.commandId,
          runId,
          point: scenario.point,
          workerId: `crashed-${scenario.point}`,
        });
        const crashed = await crashing.completed;
        assert.equal(crashed.code, null, crashed.stderr);
        assert.equal(crashed.signal, "SIGKILL", crashed.stderr);
        assert.match(crashed.stdout, new RegExp(scenario.marker));
        if (scenario.mutateWorkspace) mutateWorkspace(commandHash);
        if (scenario.mutateSearch) mutateSearch(searchId);
        await waitForLeaseExpiry(runId);
        const recovered = await runSuccessfulChild({
          mode: "run",
          commandId: scenario.commandId,
          runId,
          workerId: `recovery-${scenario.point}`,
          childLeaseMs: 5_000,
        });
        assert.equal(
          (recovered.outcome as { kind?: string }).kind,
          "completed",
        );
        await assertRecoveredScenario({
          commandId: scenario.commandId,
          commandHash,
          searchId,
          setupRunId: runId,
          expectWorkspaceMutation: scenario.mutateWorkspace,
          expectSearchMutation: scenario.mutateSearch,
          expectedCampaignCalls: scenario.campaignCalls,
        });
      });
    }

    await t.test(
      "expired live owner is reclaimed by another process",
      { concurrency: false },
      async () => {
        const commandId = "matrix-stale-lease-reclaim";
        const seeded = await runSuccessfulChild({ mode: "seed", commandId });
        const runId = String(seeded.runId);
        const hanging = launchChild({
          mode: "run",
          commandId,
          runId,
          point: "hang_campaign",
          workerId: "stale-live-owner",
          childLeaseMs: 1_200,
        });
        try {
          await hanging.waitForMarker("campaign_hanging");
          await waitForLeaseExpiry(runId);
          const recovered = await runSuccessfulChild({
            mode: "run",
            commandId,
            runId,
            workerId: "stale-reclaimer",
            childLeaseMs: 5_000,
          });
          assert.equal(
            (recovered.outcome as { kind?: string }).kind,
            "completed",
          );
          const rows = await sql<Array<{ lease_owner: string | null }>>`
            SELECT "lease_owner" FROM "execution_runs" WHERE "id" = ${runId}
          `;
          assert.equal(rows[0].lease_owner, null);
          await assertRecoveredScenario({
            commandId,
            commandHash: String(seeded.commandHash),
            searchId: String(seeded.searchId),
            setupRunId: runId,
            expectedCampaignCalls: 1,
          });
        } finally {
          if (hanging.child.exitCode === null) hanging.child.kill("SIGKILL");
          await hanging.completed.catch(() => undefined);
        }
      },
    );

    assert.ok(
      campaignCalls.every(
        (call) => call.method === "POST" && call.pathname === "/api/campaigns",
      ),
      `unexpected external operation: ${JSON.stringify(campaignCalls)}`,
    );
    assert.equal(campaignReceipts.size, 4);
  });
}
