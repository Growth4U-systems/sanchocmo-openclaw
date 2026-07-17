import assert from "node:assert/strict";
import test from "node:test";

import {
  EXECUTION_ORIGIN_CUTOVER_BLOCKED_CODE,
  EXECUTION_ORIGIN_CUTOVER_UNAVAILABLE_CODE,
  ExecutionOriginCutoverBlockedError,
  ExecutionOriginCutoverUnavailableError,
  executionOriginCutoverFailureMessage,
  inspectExecutionOriginCutover,
  isExecutionOriginCutoverCheckRequired,
  verifyExecutionOriginCutover,
  type ExecutionOriginCutoverDatabase,
} from "../runtime/execution-origin-cutover-gate";

class FakeDatabase implements ExecutionOriginCutoverDatabase {
  calls = 0;

  constructor(
    private readonly result: unknown,
    private readonly failure?: Error,
  ) {}

  async execute(): Promise<unknown> {
    this.calls += 1;
    if (this.failure) throw this.failure;
    return this.result;
  }
}

test("cutover check is required only by an exact durable worker boot flag", () => {
  assert.equal(isExecutionOriginCutoverCheckRequired({}), false);
  for (const value of ["", "0", "true", "yes", " 1", "1 "]) {
    assert.equal(
      isExecutionOriginCutoverCheckRequired({
        PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED: value,
        LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED: value,
        LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: value,
      }),
      false,
      value,
    );
  }
  for (const flag of [
    "PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED",
    "LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED",
    "LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED",
  ] as const) {
    assert.equal(isExecutionOriginCutoverCheckRequired({ [flag]: "1" }), true);
  }
});

test("disabled rollout skips database I/O while operator mode still checks", async () => {
  const skippedDatabase = new FakeDatabase({ rows: [{ gapCount: "99" }] });
  assert.deepEqual(
    await verifyExecutionOriginCutover({
      env: {},
      database: skippedDatabase,
    }),
    { checked: false, gapCount: "0" },
  );
  assert.equal(skippedDatabase.calls, 0);

  const requiredDatabase = new FakeDatabase({
    rows: [{ schemaReady: true, gapCount: "0" }],
  });
  assert.deepEqual(
    await verifyExecutionOriginCutover({
      env: {},
      database: requiredDatabase,
      requireCheck: true,
    }),
    { checked: true, gapCount: "0" },
  );
  assert.equal(requiredDatabase.calls, 1);
});

test("enabled rollout passes only an exact zero inventory", async () => {
  const database = new FakeDatabase([{ schemaReady: true, gapCount: 0n }]);
  assert.deepEqual(
    await verifyExecutionOriginCutover({
      env: { PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED: "1" },
      database,
    }),
    { checked: true, gapCount: "0" },
  );
  assert.equal(database.calls, 1);
});

test("a gap fails closed with only a count and actionable remediation", async () => {
  const secret = "postgres://admin:do-not-log@example.invalid/private";
  const tenant = "sensitive-tenant";
  const database = new FakeDatabase({
    rows: [{ schema_ready: "t", gap_count: "17" }],
  });
  await assert.rejects(
    verifyExecutionOriginCutover({
      env: { LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: "1" },
      database,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ExecutionOriginCutoverBlockedError);
      assert.equal(error.code, EXECUTION_ORIGIN_CUTOVER_BLOCKED_CODE);
      assert.equal(error.gapCount, "17");
      assert.match(error.message, /17 non-terminal execution run/);
      assert.match(error.message, /drain or cancel and re-admit/i);
      assert.doesNotMatch(error.message, new RegExp(secret));
      assert.doesNotMatch(error.message, new RegExp(tenant));
      return true;
    },
  );
});

test("query and result failures collapse credentials and payloads", async () => {
  const secret = "postgres://admin:do-not-log@example.invalid/private";
  const payload = '{"leadEmail":"private@example.invalid"}';
  const database = new FakeDatabase(
    undefined,
    new Error(`connection ${secret} failed while reading ${payload}`),
  );
  await assert.rejects(
    inspectExecutionOriginCutover(database),
    (error: unknown) => {
      assert.ok(error instanceof ExecutionOriginCutoverUnavailableError);
      assert.equal(error.code, EXECUTION_ORIGIN_CUTOVER_UNAVAILABLE_CODE);
      assert.doesNotMatch(error.message, /postgres|private@example/i);
      return true;
    },
  );

  for (const malformed of [undefined, -1, 1.5, "01", "-1", {}, []]) {
    await assert.rejects(
      inspectExecutionOriginCutover(
        new FakeDatabase({
          rows: [{ schemaReady: true, gapCount: malformed }],
        }),
      ),
      ExecutionOriginCutoverUnavailableError,
    );
  }

  const unknown = executionOriginCutoverFailureMessage(
    new Error(`${secret} ${payload}`),
  );
  assert.doesNotMatch(unknown, /postgres|private@example/i);
  assert.match(unknown, /could not be verified/i);
  assert.throws(
    () => new ExecutionOriginCutoverBlockedError(`${secret} ${payload}`),
    ExecutionOriginCutoverUnavailableError,
  );
  await assert.rejects(
    inspectExecutionOriginCutover(
      new FakeDatabase({ rows: [{ schemaReady: false, gapCount: "0" }] }),
    ),
    ExecutionOriginCutoverUnavailableError,
  );
});
