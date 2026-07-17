import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "@/db/drizzle";
import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import { PostgresExecutionControlRepository } from "@/lib/execution-control/postgres";

const databaseUrl =
  process.env.PARTNERSHIPS_V2_RECONCILE_TEST_DATABASE_URL ??
  process.env.EXECUTION_CONTROL_LEASE_TEST_DATABASE_URL ??
  process.env.AGENT_RUNS_TEST_DATABASE_URL;

function migration(name: string): string[] {
  return fs
    .readFileSync(path.join(process.cwd(), "src/db/migrations", name), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

test(
  "an ambiguous Yalc POST reconciles by GET on the next claim without a second invoke",
  { skip: !databaseUrl, timeout: 30_000 },
  async () => {
    const workspace = fs.mkdtempSync(
      path.join(os.tmpdir(), "sancho-partnerships-v2-reconcile-"),
    );
    process.env.MC_WORKSPACE = workspace;
    process.env.MC_TASKS_BACKEND = "json";
    const slug = `reconcile-${crypto.randomUUID()}`;
    const searchId = `ds-${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const campaignId = `campaign-${crypto.randomUUID()}`;
    const yalcBaseUrl = "https://yalc.reconcile.test";
    const env = {
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
      PARTNERSHIPS_DISCOVERY_EFFECTS_V2: "canary",
      PARTNERSHIPS_DISCOVERY_V2_SLUGS: slug,
      PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
      PARTNERSHIPS_DISCOVERY_WORKER_LEASE_MS: "5000",
      PARTNERSHIPS_DISCOVERY_WORKER_MAX_ATTEMPTS: "3",
    };
    const suiteSchema = `partnerships_v2_reconcile_${crypto.randomUUID().replaceAll("-", "")}`;
    const adminSql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });
    const sql = postgres(databaseUrl as string, {
      max: 10,
      onnotice: () => {},
      connection: { search_path: `${suiteSchema},public` },
    });
    const repository = new PostgresExecutionControlRepository(
      drizzle(sql) as unknown as Db,
    );

    try {
      await adminSql.unsafe(`CREATE SCHEMA "${suiteSchema}"`);
      await sql.begin(async (migrationSql) => {
        await migrationSql`SELECT pg_advisory_xact_lock(hashtext('sancho_execution_control_migrations'))`;
        for (const name of [
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
          for (const statement of migration(name)) {
            await migrationSql.unsafe(statement);
          }
        }
      });

      const [admission, effects, handler, store, worker] = await Promise.all([
        import("../discovery-admission-v2"),
        import("../discovery-effects-v2"),
        import("../discovery-handler-v2"),
        import("../discovery-store"),
        import("../discovery-durable-worker"),
      ]);
      const now = "2026-07-16T10:00:00.000Z";
      const plan = {
        title: "Ambiguous Yalc reconcile",
        sectors: ["salud capilar"],
        networks: ["instagram"],
        tiers: ["micro"],
        targetVolume: 1,
      };
      store.saveSearch({
        id: searchId,
        slug,
        commandId: `command-${searchId}`,
        executionIntent: "fixtures",
        executionControl: {
          mode: "canary",
          admittedAt: now,
          generation: 1,
        },
        executionModelConfig: JSON.parse(
          JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG),
        ),
        title: plan.title,
        plan,
        campaignId,
        projectId: null,
        taskId: null,
        threadId: null,
        runner: {
          status: "queued",
          mode: "fixtures",
          attempts: 1,
          queuedAt: now,
          startedAt: null,
          finishedAt: null,
          error: null,
          stats: null,
        },
        createdAt: now,
        updatedAt: now,
      });
      const admitted = await admission.admitPartnershipsDiscoveryV2(
        {
          schemaVersion: 2,
          slug,
          searchId,
          attempt: 1,
          executionGeneration: 1,
          modelConfig: DEFAULT_CREATOR_MODEL_CONFIG,
          title: plan.title,
          campaignId,
          projectId: null,
          taskId: null,
          executionIntent: "fixtures",
          plan,
          createdAt: now,
        },
        {
          repository,
          env,
          resolveYalc: () => ({ baseUrl: yalcBaseUrl, token: "token", slug }),
          verifyYalcCapability: async () => ({
            schemaVersion: 1,
            capability: "campaign-leads-assign-v1",
            contractVersion: 1,
            endpoints: {
              assign: "/api/campaigns/:campaignId/leads/assign-v1",
              receipt: "/api/campaigns/:campaignId/leads/assign-v1/receipt",
            },
            authentication: { required: true, scheme: "bearer" },
            idempotency: {
              required: true,
              header: "Idempotency-Key",
              requestFingerprintHeader: "Idempotency-Request-Fingerprint",
              requestFingerprint: "sha256_canonical_json_leads_body",
              maxCharacters: 256,
              scope: ["tenant", "campaign", "operation"],
              sameKeySamePayload: "frozen_response",
              sameKeyDifferentPayload: "409_idempotency_conflict",
            },
            execution: {
              atomic: true,
              maxBatchSize: 500,
              replayHeader: "Idempotency-Replayed",
              contractFingerprintHeader: "Yalc-Contract-Fingerprint",
              receiptLookup: "read_only",
            },
            contractFingerprint:
              admission.PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
            ready: true,
            checks: {
              bearerAuthentication: true,
              receiptTable: true,
              receiptColumns: true,
              uniqueCommandIndex: true,
              uniqueCommandIndexColumns: true,
            },
          }),
        },
      );
      store.bindSearchExecutionRun(slug, searchId, {
        generation: 1,
        runId: admitted.run.id,
        commandFingerprint: admitted.run.commandFingerprint,
      });

      let postCalls = 0;
      let receiptCalls = 0;
      let committedBody: { leads: Array<Record<string, unknown>> } | null =
        null;
      const transport = async (
        _config: unknown,
        requestPath: string,
        input: {
          method: "GET" | "POST";
          headers: Record<string, string>;
          body?: unknown;
        },
      ) => {
        if (input.method === "POST") {
          postCalls += 1;
          assert.match(requestPath, /\/leads\/assign-v1$/);
          committedBody = input.body as {
            leads: Array<Record<string, unknown>>;
          };
          throw new TypeError("socket closed after target commit");
        }
        receiptCalls += 1;
        assert.match(requestPath, /\/leads\/assign-v1\/receipt$/);
        assert.ok(committedBody, "GET must observe the committed POST receipt");
        return {
          status: 200,
          contractFingerprint:
            admission.PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
          body: {
            ok: true,
            campaignId,
            operation: "leads.assign",
            status: "completed",
            requestFingerprint:
              input.headers["Idempotency-Request-Fingerprint"],
            responseBody: {
              ok: true,
              campaignId,
              leads: committedBody.leads.map((lead) => ({
                ...lead,
                lifecycleStatus: "Sourced",
              })),
              dropped: [],
            },
          },
        };
      };
      // Injected as version-agnostic dependencies: the worker registry builds
      // the version-bound effects (and the v5 handler its fixture loader).
      const prepareEffectDependencies = {
        loadFixtures: () => [
          {
            handle: "@reconcile_fixture",
            network: "instagram",
            followers: 48_000,
            engagementRatePct: 5.2,
            signals: { fakeFollowersPct: 0 },
          },
        ],
      };
      const yalcAssignEffectDependencies = {
        transport: transport as never,
      };
      assert.equal(
        effects.createPartnershipsYalcAssignEffectV5(
          yalcAssignEffectDependencies,
        ).safety.kind,
        "reconcile_before_replay",
      );
      const credentialProvider = {
        async resolve(reference: string) {
          assert.equal(reference, `yalc://tenant/${slug}`);
          return {
            slug,
            baseUrl: yalcBaseUrl,
            token: "token",
            targetBindingFingerprint:
              handler.partnershipsTargetBindingFingerprint(yalcBaseUrl),
          };
        },
      };
      const dependencies = {
        repository,
        env,
        workerId: "partnerships-v2-reconcile-test",
        prepareEffectDependencies,
        yalcAssignEffectDependencies,
        credentialProvider,
        deliverV2ChatCompletion: async () => {},
      };

      assert.equal(
        await worker.processNextCanaryDiscoveryRun(slug, dependencies),
        true,
      );
      assert.equal(postCalls, 1);
      assert.equal(receiptCalls, 0);
      assert.equal(
        (await repository.getRunById(admitted.run.id))?.status,
        "queued",
      );

      // Advance only the authoritative DB clock fences that a natural 30s
      // deadline would make due. No effect status or receipt is rewritten.
      await sql`
        UPDATE "execution_effects"
        SET "available_at" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second',
            "last_deadline_at" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second'
        WHERE "run_id" = ${admitted.run.id}
          AND "step_key" = 'yalc.assign_leads'
      `;
      await sql`
        UPDATE "execution_runs"
        SET "available_at" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second'
        WHERE "id" = ${admitted.run.id}
      `;

      assert.equal(
        await worker.processNextCanaryDiscoveryRun(slug, dependencies),
        true,
      );
      assert.equal(postCalls, 1, "GET reconciliation must prevent POST replay");
      assert.equal(receiptCalls, 1);
      const terminal = await repository.getRunById(admitted.run.id);
      assert.equal(
        terminal?.status,
        "completed",
        JSON.stringify({
          status: terminal?.status,
          error: terminal?.error,
          output: terminal?.output,
        }),
      );
      const [effect] = await sql<
        Array<{
          status: string;
          safety: string;
          attemptCount: number;
          reconcileCount: number;
        }>
      >`
        SELECT "status", "safety",
               "attempt_count" AS "attemptCount",
               "reconcile_count" AS "reconcileCount"
        FROM "execution_effects"
        WHERE "run_id" = ${admitted.run.id}
          AND "step_key" = 'yalc.assign_leads'
      `;
      assert.deepEqual(effect, {
        status: "succeeded",
        safety: "reconcile_before_replay",
        attemptCount: 1,
        reconcileCount: 1,
      });
    } finally {
      await sql.end({ timeout: 5 });
      await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${suiteSchema}" CASCADE`);
      await adminSql.end({ timeout: 5 });
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  },
);
