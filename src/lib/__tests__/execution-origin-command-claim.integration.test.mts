import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "../../db/drizzle";
import { durableExecutionMcChatOrigin } from "../durable-execution/execution-origin";
import { PostgresExecutionControlRepository } from "../execution-control/postgres";
import {
  EXECUTION_ORIGIN_CANCELLED_CODE,
  EXECUTION_ORIGIN_COMMAND_CONFLICT_CODE,
} from "../execution-control/types";

const databaseUrl =
  process.env.EXECUTION_CONTROL_ORIGIN_COMMAND_TEST_DATABASE_URL ??
  process.env.EXECUTION_CONTROL_ORIGIN_TEST_DATABASE_URL ??
  process.env.EXECUTION_CONTROL_CANCELLATION_TEST_DATABASE_URL ??
  process.env.EXECUTION_CONTROL_LEASE_TEST_DATABASE_URL ??
  process.env.AGENT_RUNS_TEST_DATABASE_URL;

const migrations = [
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
  "0033_execution_origin_command_claim.sql",
];

function migration(name: string): string[] {
  return fs
    .readFileSync(path.join(process.cwd(), "src/db/migrations", name), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function fingerprint(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === code,
  );
}

test(
  "one trusted chat parent durably admits one external command across tools and repository instances",
  { skip: !databaseUrl, timeout: 60_000 },
  async (t) => {
    const suiteSchema = `execution_origin_command_${crypto.randomUUID().replaceAll("-", "")}`;
    const adminSql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });
    const sql = postgres(databaseUrl as string, {
      max: 8,
      onnotice: () => {},
      connection: { search_path: `${suiteSchema},public` },
    });
    const database = drizzle(sql) as unknown as Db;
    const repositories = Array.from(
      { length: 8 },
      () => new PostgresExecutionControlRepository(database),
    );

    t.after(async () => {
      await sql.end({ timeout: 5 });
      await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${suiteSchema}" CASCADE`);
      await adminSql.end({ timeout: 5 });
    });

    await adminSql.unsafe(`CREATE SCHEMA "${suiteSchema}"`);
    for (const name of migrations) {
      for (const statement of migration(name)) await sql.unsafe(statement);
    }

    const tenantKey = "hospital-capilar";
    const origin = durableExecutionMcChatOrigin("arun-one-command-race");
    const commands = {
      leads: {
        tenantKey,
        origin,
        operation: "leads.search",
        commandFingerprint: fingerprint("canonical leads command"),
      },
      partnerships: {
        tenantKey,
        origin,
        operation: "partnerships.discovery",
        commandFingerprint: fingerprint("canonical partnerships command"),
      },
    } as const;

    const attempts = Array.from({ length: 24 }, (_, index) => {
      const key = index % 2 === 0 ? "leads" : "partnerships";
      return {
        key,
        result: repositories[index % repositories.length]
          .claimExecutionOriginCommand(commands[key])
          .then(
            (receipt) => ({ status: "fulfilled" as const, receipt }),
            (error: unknown) => ({ status: "rejected" as const, error }),
          ),
      };
    });
    const results = await Promise.all(
      attempts.map(async ({ key, result }) => ({ key, ...(await result) })),
    );
    const fulfilled = results.filter(
      (
        result,
      ): result is Extract<(typeof results)[number], { status: "fulfilled" }> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (
        result,
      ): result is Extract<(typeof results)[number], { status: "rejected" }> =>
        result.status === "rejected",
    );
    assert.ok(fulfilled.length >= 1);
    assert.equal(new Set(fulfilled.map(({ key }) => key)).size, 1);
    const winningKey = fulfilled[0].key;
    const losingKey = winningKey === "leads" ? "partnerships" : "leads";
    assert.ok(rejected.length >= 1);
    assert.ok(rejected.every(({ key }) => key === losingKey));
    assert.ok(
      rejected.every(({ error }) =>
        hasErrorCode(error, EXECUTION_ORIGIN_COMMAND_CONFLICT_CODE),
      ),
    );
    assert.equal(
      new Set(fulfilled.map(({ receipt }) => receipt.claimedAt)).size,
      1,
    );

    const replay = await repositories[0].claimExecutionOriginCommand(
      commands[winningKey],
    );
    assert.equal(replay.claimedAt, fulfilled[0].receipt.claimedAt);
    await assert.rejects(
      repositories[1].claimExecutionOriginCommand(commands[losingKey]),
      (error: unknown) =>
        hasErrorCode(error, EXECUTION_ORIGIN_COMMAND_CONFLICT_CODE),
    );

    const [stored] = await sql<
      Array<{
        command_operation: string;
        command_fingerprint: string;
        command_claimed_at: Date | string;
      }>
    >`
      SELECT command_operation, command_fingerprint, command_claimed_at
      FROM execution_origins
      WHERE tenant_key = ${tenantKey}
        AND kind = ${origin.kind}
        AND parent_agent_run_id = ${origin.parentAgentRunId}
    `;
    assert.equal(stored.command_operation, commands[winningKey].operation);
    assert.equal(
      stored.command_fingerprint,
      commands[winningKey].commandFingerprint,
    );
    assert.equal(
      Number.isNaN(new Date(stored.command_claimed_at).getTime()),
      false,
    );
    const [runCount] = await sql<Array<{ count: number }>>`
      SELECT count(*)::integer AS count FROM execution_runs
    `;
    assert.equal(runCount.count, 0, "the claim itself creates no product run");

    for (const [suffix, operation] of [
      ["setup", "partnerships.discovery.setup"],
      ["effect", "partnerships.discovery"],
    ] as const) {
      await repositories[0].createRunWithTrustedOrigin({
        origin,
        command: {
          tenantKey,
          idempotencyKey: `winner-child-${suffix}`,
          aggregateType: "contract.external-child",
          aggregateId: `winner-child-${suffix}`,
          operation,
          mode: "canary",
        },
      });
    }
    const [childCount] = await sql<Array<{ count: number }>>`
      SELECT count(*)::integer AS count
      FROM execution_run_origins
      WHERE tenant_key = ${tenantKey}
        AND kind = ${origin.kind}
        AND parent_agent_run_id = ${origin.parentAgentRunId}
    `;
    assert.equal(
      childCount.count,
      2,
      "one external command may own multiple product descendants",
    );
    const replayAfterChildren =
      await repositories[2].claimExecutionOriginCommand(commands[winningKey]);
    assert.equal(replayAfterChildren.claimedAt, replay.claimedAt);

    const otherTenantClaim = await repositories[3].claimExecutionOriginCommand({
      ...commands[losingKey],
      tenantKey: "other-client",
    });
    assert.equal(otherTenantClaim.operation, commands[losingKey].operation);

    await repositories[0].requestOriginCancellation({
      tenantKey,
      origin,
      cancellationId: `cancel_${"b".repeat(32)}`,
      actor: { type: "user", id: "mc-admin" },
      reasonCode: "user_requested",
    });
    await assert.rejects(
      repositories[1].claimExecutionOriginCommand(commands[winningKey]),
      (error: unknown) => hasErrorCode(error, EXECUTION_ORIGIN_CANCELLED_CODE),
    );
    const [preservedClaim] = await sql<
      Array<{ command_operation: string; cancel_request_id: string }>
    >`
      SELECT command_operation, cancel_request_id
      FROM execution_origins
      WHERE tenant_key = ${tenantKey}
        AND kind = ${origin.kind}
        AND parent_agent_run_id = ${origin.parentAgentRunId}
    `;
    assert.equal(
      preservedClaim.command_operation,
      commands[winningKey].operation,
    );
    assert.equal(preservedClaim.cancel_request_id, `cancel_${"b".repeat(32)}`);

    const legacyOrigin = durableExecutionMcChatOrigin("arun-legacy-child");
    await repositories[0].createRunWithTrustedOrigin({
      origin: legacyOrigin,
      command: {
        tenantKey,
        idempotencyKey: "legacy-child",
        aggregateType: "legacy.external",
        aggregateId: "legacy-child",
        operation: "legacy.external",
        mode: "canary",
      },
    });
    await assert.rejects(
      repositories[1].claimExecutionOriginCommand({
        ...commands.leads,
        origin: legacyOrigin,
      }),
      (error: unknown) =>
        hasErrorCode(error, EXECUTION_ORIGIN_COMMAND_CONFLICT_CODE),
      "an unclaimed pre-0033 origin with a child must never be adopted",
    );

    const cancelledOrigin = durableExecutionMcChatOrigin("arun-stopped-first");
    await repositories[0].requestOriginCancellation({
      tenantKey,
      origin: cancelledOrigin,
      cancellationId: `cancel_${"a".repeat(32)}`,
      actor: { type: "user", id: "mc-admin" },
      reasonCode: "user_requested",
    });
    await assert.rejects(
      repositories[1].claimExecutionOriginCommand({
        ...commands.partnerships,
        origin: cancelledOrigin,
      }),
      (error: unknown) => hasErrorCode(error, EXECUTION_ORIGIN_CANCELLED_CODE),
    );

    await assert.rejects(
      repositories[0].claimExecutionOriginCommand({
        ...commands.leads,
        origin: durableExecutionMcChatOrigin("arun-invalid-operation"),
        operation: "INVALID OPERATION",
      }),
      /invalid origin command operation/,
    );
    await assert.rejects(
      repositories[0].claimExecutionOriginCommand({
        ...commands.leads,
        origin: durableExecutionMcChatOrigin("arun-invalid-fingerprint"),
        commandFingerprint: "not-a-fingerprint",
      }),
      /must be a SHA-256 hex digest/,
    );
  },
);
