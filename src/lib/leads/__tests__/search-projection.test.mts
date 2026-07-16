import assert from "node:assert/strict";
import test from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  LEADS_SEARCH_PROJECTION_CONFLICT_CODE,
  LEADS_SEARCH_PROJECTION_CORRUPT_CODE,
  LEADS_SEARCH_PROJECTION_INVALID_CODE,
  LEADS_SEARCH_PROJECTION_TENANT_CONFLICT_CODE,
  type LeadsSearchProjection,
  type LeadsSearchProjectedResultV2,
  normalizeUpsertLeadsSearchProjectionInput,
} from "../search-projection";
import {
  type LeadsSearchProjectionDatabase,
  PostgresLeadsSearchProjectionRepository,
} from "../search-projection-postgres";

const dialect = new PgDialect();

class ScriptedDatabase implements LeadsSearchProjectionDatabase {
  readonly queries: SQL[] = [];

  constructor(private readonly responses: unknown[]) {}

  async execute(query: SQL): Promise<unknown> {
    this.queries.push(query);
    if (this.responses.length === 0) {
      throw new Error("Unexpected projection database query");
    }
    return this.responses.shift();
  }
}

function result(
  overrides: Partial<LeadsSearchProjectedResultV2> = {},
): LeadsSearchProjectedResultV2 {
  return {
    provider: "apollo",
    candidates: [
      {
        providerId: "person-1",
        name: "Ada Lovelace",
        title: "VP Growth",
        linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
        organizationName: "Analytical Engines",
        organizationDomain: "analytical.example",
      },
    ],
    totalAvailable: 42,
    returned: 1,
    page: 1,
    nextPage: 2,
    hasMore: true,
    ...overrides,
  };
}

function projection(
  overrides: Partial<
    Parameters<typeof normalizeUpsertLeadsSearchProjectionInput>[0]
  > = {},
): LeadsSearchProjection {
  return normalizeUpsertLeadsSearchProjectionInput({
    tenantKey: "tenant-a",
    runId: "xrun-1",
    terminalStatus: "completed",
    result: result(),
    projectedAt: new Date("2026-07-16T10:00:00.000Z"),
    ...overrides,
  });
}

function row(value: LeadsSearchProjection): Record<string, unknown> {
  return { ...value };
}

function code(expected: string): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof Error &&
    (error as Error & { code?: unknown }).code === expected;
}

test("projection normalization is canonical, compact and tenant-normalized", () => {
  const first = projection({ tenantKey: " TENANT-A " });
  const second = projection({
    tenantKey: "tenant-a",
    result: {
      hasMore: true,
      nextPage: 2,
      page: 1,
      returned: 1,
      totalAvailable: 42,
      candidates: [
        {
          organizationDomain: "ANALYTICAL.EXAMPLE.",
          organizationName: "Analytical Engines",
          linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
          title: "VP Growth",
          name: "Ada Lovelace",
          providerId: "person-1",
        },
      ],
      provider: "apollo",
    },
  });

  assert.equal(first.tenantKey, "tenant-a");
  assert.equal(first.candidateCount, 1);
  assert.equal(first.projectionFingerprint, second.projectionFingerprint);
  assert.equal(
    second.result?.candidates[0]?.organizationDomain,
    "analytical.example",
  );
});

test("projection identity mirrors the durable tenant boundary", () => {
  assert.equal(
    projection({ tenantKey: "a".repeat(128) }).tenantKey.length,
    128,
  );
  assert.equal(
    projection({ tenantKey: "TENANT_A.V2-1" }).tenantKey,
    "tenant_a.v2-1",
  );
  assert.throws(
    () => projection({ tenantKey: "a".repeat(129) }),
    code(LEADS_SEARCH_PROJECTION_INVALID_CODE),
  );
  assert.throws(
    () => projection({ tenantKey: `sk-${"a".repeat(20)}` }),
    code(LEADS_SEARCH_PROJECTION_INVALID_CODE),
  );
  assert.throws(
    () => projection({ tenantKey: "tenant:" }),
    code(LEADS_SEARCH_PROJECTION_INVALID_CODE),
  );
});

test("projection contract rejects unbounded, inconsistent and secret-bearing results", () => {
  const eleven = Array.from({ length: 11 }, (_, index) => ({
    providerId: `person-${index}`,
    name: `Person ${index}`,
  }));
  const oversized = Array.from({ length: 10 }, (_, index) => ({
    providerId: `person-${index}`,
    name: `Person ${index}`,
    title: "t".repeat(512),
    linkedinUrl: `https://www.linkedin.com/in/${"p".repeat(1_800)}${index}`,
    organizationName: "o".repeat(512),
    organizationDomain: `${"d".repeat(50)}${index}.example`,
  }));
  for (const invalidResult of [
    result({ candidates: eleven, returned: eleven.length }),
    result({ candidates: oversized, returned: oversized.length }),
    result({ returned: 0 }),
    result({ nextPage: null, hasMore: true }),
    result({
      candidates: [{ providerId: "person-1", name: "Bearer secret-value" }],
    }),
  ]) {
    assert.throws(
      () => projection({ result: invalidResult }),
      code(LEADS_SEARCH_PROJECTION_INVALID_CODE),
    );
  }
  assert.throws(
    () =>
      projection({
        terminalStatus: "failed",
        result: result(),
      }),
    code(LEADS_SEARCH_PROJECTION_INVALID_CODE),
  );
  assert.throws(
    () => projection({ terminalStatus: "completed", result: null }),
    code(LEADS_SEARCH_PROJECTION_INVALID_CODE),
  );
});

test("Postgres upsert inserts once and adopts an exact replay", async () => {
  const expected = projection();
  const insertedDb = new ScriptedDatabase([[row(expected)]]);
  const insertedRepository = new PostgresLeadsSearchProjectionRepository(
    insertedDb,
  );
  assert.deepEqual(
    await insertedRepository.upsert({
      tenantKey: expected.tenantKey,
      runId: expected.runId,
      terminalStatus: expected.terminalStatus,
      result: expected.result,
      projectedAt: new Date(expected.projectedAt),
    }),
    expected,
  );
  assert.equal(insertedDb.queries.length, 1);
  const insertQuery = dialect.sqlToQuery(insertedDb.queries[0]!);
  assert.match(insertQuery.sql, /ON CONFLICT \("run_id"\) DO NOTHING/);
  assert.match(insertQuery.sql, /RETURNING/);

  const replayDb = new ScriptedDatabase([[], [row(expected)]]);
  const replayRepository = new PostgresLeadsSearchProjectionRepository(
    replayDb,
  );
  const replay = await replayRepository.upsert({
    tenantKey: "TENANT-A",
    runId: "xrun-1",
    terminalStatus: "completed",
    result: result(),
    projectedAt: new Date("2026-07-16T11:00:00.000Z"),
  });
  assert.deepEqual(
    replay,
    expected,
    "the immutable winner keeps its timestamp",
  );
  assert.equal(replayDb.queries.length, 2);
  assert.match(
    dialect.sqlToQuery(replayDb.queries[1]!).sql,
    /WHERE "run_id" = \$1/,
  );
});

test("Postgres upsert rejects divergent and cross-tenant reuse of one run id", async () => {
  const existing = projection();
  const divergentDb = new ScriptedDatabase([[], [row(existing)]]);
  await assert.rejects(
    new PostgresLeadsSearchProjectionRepository(divergentDb).upsert({
      tenantKey: "tenant-a",
      runId: "xrun-1",
      terminalStatus: "failed",
      result: null,
    }),
    code(LEADS_SEARCH_PROJECTION_CONFLICT_CODE),
  );

  const crossTenantDb = new ScriptedDatabase([[], [row(existing)]]);
  await assert.rejects(
    new PostgresLeadsSearchProjectionRepository(crossTenantDb).upsert({
      tenantKey: "tenant-b",
      runId: "xrun-1",
      terminalStatus: "completed",
      result: result(),
    }),
    code(LEADS_SEARCH_PROJECTION_TENANT_CONFLICT_CODE),
  );
});

test("failed, partial and cancelled terminals project immutable null results", () => {
  for (const terminalStatus of ["failed", "partial", "cancelled"] as const) {
    const terminal = projection({
      runId: `xrun-${terminalStatus}`,
      terminalStatus,
      result: null,
    });
    assert.equal(terminal.result, null);
    assert.equal(terminal.candidateCount, 0);
    assert.match(terminal.projectionFingerprint, /^[a-f0-9]{64}$/);
  }
});

test("get and list stay tenant-scoped and list uses a stable bounded cursor", async () => {
  const newest = projection({ runId: "xrun-3" });
  const middle = projection({
    runId: "xrun-2",
    projectedAt: new Date("2026-07-16T09:00:00.000Z"),
  });
  const oldest = projection({
    runId: "xrun-1",
    projectedAt: new Date("2026-07-16T08:00:00.000Z"),
  });
  const database = new ScriptedDatabase([
    [row(newest)],
    [row(newest), row(middle), row(oldest)],
  ]);
  const repository = new PostgresLeadsSearchProjectionRepository(database);

  assert.deepEqual(
    await repository.get({ tenantKey: "TENANT-A", runId: newest.runId }),
    newest,
  );
  const getQuery = dialect.sqlToQuery(database.queries[0]!);
  assert.match(getQuery.sql, /WHERE "tenant_key" = \$1/);
  assert.match(getQuery.sql, /AND "run_id" = \$2/);
  assert.deepEqual(getQuery.params.slice(0, 2), ["tenant-a", "xrun-3"]);

  const page = await repository.list({ tenantKey: "tenant-a", limit: 2 });
  assert.deepEqual(page.items, [newest, middle]);
  assert.deepEqual(page.nextCursor, {
    projectedAt: middle.projectedAt,
    runId: middle.runId,
  });
  const listQuery = dialect.sqlToQuery(database.queries[1]!);
  assert.match(listQuery.sql, /WHERE "tenant_key" = \$1/);
  assert.match(listQuery.sql, /ORDER BY "projected_at" DESC, "run_id" DESC/);
  assert.equal(listQuery.params.at(-1), 3, "requests one look-ahead row");
});

test("read paths fail closed when the database returns another tenant or drifted data", async () => {
  const otherTenant = projection({ tenantKey: "tenant-b" });
  const database = new ScriptedDatabase([[row(otherTenant)]]);
  await assert.rejects(
    new PostgresLeadsSearchProjectionRepository(database).get({
      tenantKey: "tenant-a",
      runId: otherTenant.runId,
    }),
    code(LEADS_SEARCH_PROJECTION_CORRUPT_CODE),
  );

  const drifted = row(projection());
  drifted.candidateCount = 9;
  const corruptDatabase = new ScriptedDatabase([[drifted]]);
  await assert.rejects(
    new PostgresLeadsSearchProjectionRepository(corruptDatabase).get({
      tenantKey: "tenant-a",
      runId: "xrun-1",
    }),
    code(LEADS_SEARCH_PROJECTION_CORRUPT_CODE),
  );
});
