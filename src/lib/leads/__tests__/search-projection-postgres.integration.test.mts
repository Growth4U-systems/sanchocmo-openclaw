import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  type LeadsSearchProjectionDatabase,
  PostgresLeadsSearchProjectionRepository,
} from "../search-projection-postgres";

const databaseUrl =
  process.env.LEADS_SEARCH_POSTGRES_TEST_DATABASE_URL ??
  process.env.AGENT_RUNS_TEST_DATABASE_URL;

function migrationStatements(name: string): string[] {
  return fs
    .readFileSync(path.join(process.cwd(), "src/db/migrations", name), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function projectedResult() {
  return {
    provider: "apollo" as const,
    candidates: [
      {
        providerId: "person-1",
        name: "Ada Lovelace",
        title: "Marketing Director",
      },
    ],
    totalAvailable: 1,
    returned: 1,
    page: 1 as const,
    nextPage: null,
    hasMore: false,
  };
}

test(
  "projection timestamps round-trip as UTC and paginate without gaps outside UTC",
  { skip: !databaseUrl, timeout: 20_000 },
  async () => {
    const previousProcessTimezone = process.env.TZ;
    process.env.TZ = "Europe/Madrid";

    const schema = `leads_projection_tz_${crypto.randomUUID().replaceAll("-", "")}`;
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const tenantKey = `projection-tz-${suffix}`;
    const sql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });

    try {
      await sql.unsafe(`CREATE SCHEMA "${schema}"`);
      await sql.unsafe(`SET search_path TO "${schema}", public`);
      await sql.unsafe("SET TIME ZONE 'Europe/Madrid'");
      await sql.unsafe('CREATE TABLE "execution_runs" ("id" text PRIMARY KEY)');
      for (const statement of migrationStatements(
        "0029_leads_search_projections.sql",
      )) {
        await sql.unsafe(statement);
      }

      const runIds = [
        `xrun-projection-a-${suffix}`,
        `xrun-projection-b-${suffix}`,
        `xrun-projection-c-${suffix}`,
      ];
      for (const runId of runIds) {
        await sql`INSERT INTO "execution_runs" ("id") VALUES (${runId})`;
      }

      const repository = new PostgresLeadsSearchProjectionRepository(
        drizzle(sql) as unknown as LeadsSearchProjectionDatabase,
      );
      const timestamps = [
        "2026-07-16T10:00:00.000Z",
        "2026-07-16T10:00:00.000Z",
        "2026-07-16T09:00:00.000Z",
      ];
      for (let index = 0; index < runIds.length; index += 1) {
        const inserted = await repository.upsert({
          tenantKey,
          runId: runIds[index]!,
          terminalStatus: "completed",
          result: projectedResult(),
          projectedAt: new Date(timestamps[index]!),
        });
        assert.equal(inserted.projectedAt, timestamps[index]);
      }

      const firstPage = await repository.list({ tenantKey, limit: 2 });
      assert.deepEqual(
        firstPage.items.map((item) => item.runId),
        [runIds[1], runIds[0]],
      );
      assert.deepEqual(firstPage.nextCursor, {
        projectedAt: timestamps[0],
        runId: runIds[0],
      });

      const secondPage = await repository.list({
        tenantKey,
        limit: 2,
        before: firstPage.nextCursor,
      });
      assert.deepEqual(
        secondPage.items.map((item) => item.runId),
        [runIds[2]],
      );
      assert.equal(secondPage.items[0]?.projectedAt, timestamps[2]);
      assert.equal(secondPage.nextCursor, undefined);
      assert.equal(
        new Set(
          [...firstPage.items, ...secondPage.items].map((item) => item.runId),
        ).size,
        runIds.length,
        "cursor pagination must neither repeat nor skip a projection",
      );
    } finally {
      try {
        await sql.unsafe("RESET TIME ZONE");
        await sql.unsafe("RESET search_path");
        await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await sql.end();
        if (previousProcessTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = previousProcessTimezone;
      }
    }
  },
);
