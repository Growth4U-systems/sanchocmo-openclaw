import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-route-grants-"));
process.env.MC_WORKSPACE = tmp;

const grants = await import("../data/runtime-route-dispatch-grants");

const claims = {
  parentRunId: "run_parent_a",
  clientSlug: "demo",
  sourceThreadId: "demo:task-p1-t1",
  targetThreadId: "demo:task-p1-t2",
  agent: "hamete",
  briefSha256: grants.runtimeRouteBriefSha256("Investiga el mercado"),
  idempotencyKey: grants.runtimeRouteDispatchIdempotencyKey({
    parentRunId: "run_parent_a",
    clientSlug: "demo",
    sourceThreadId: "demo:task-p1-t1",
    targetThreadId: "demo:task-p1-t2",
    agent: "hamete",
    briefSha256: grants.runtimeRouteBriefSha256("Investiga el mercado"),
  }),
};

test("route dispatch grants persist only a digest and are one-shot", async () => {
  grants.resetRuntimeRouteDispatchGrantsForTests();
  const issued = await grants.issueRuntimeRouteDispatchGrant(claims, 1_000);
  assert.match(issued.token, /^[a-f0-9]{64}$/);

  const persisted = fs.readFileSync(
    grants.runtimeRouteDispatchGrantsFile(),
    "utf8",
  );
  assert.equal(persisted.includes(issued.token), false);
  assert.equal(persisted.includes("tokenSha256"), true);
  assert.equal(persisted.includes("Investiga el mercado"), false);

  assert.equal(
    await grants.consumeRuntimeRouteDispatchGrant(issued.token, claims, 1_001),
    "claimed",
  );
  assert.equal(
    await grants.consumeRuntimeRouteDispatchGrant(issued.token, claims, 1_002),
    "already_consumed",
  );
});

test("altered tenant, source, target, agent, brief or idempotency cannot consume a grant", async () => {
  grants.resetRuntimeRouteDispatchGrantsForTests();
  const issued = await grants.issueRuntimeRouteDispatchGrant(claims, 2_000);
  const mutations = [
    { clientSlug: "victim" },
    { sourceThreadId: "demo:task-p1-other" },
    { targetThreadId: "demo:task-p1-t3" },
    { agent: "rocinante" },
    { briefSha256: grants.runtimeRouteBriefSha256("Brief alterado") },
    { idempotencyKey: `${claims.idempotencyKey}-altered` },
    { parentRunId: "run_parent_b" },
  ];
  for (const mutation of mutations) {
    assert.equal(
      await grants.consumeRuntimeRouteDispatchGrant(
        issued.token,
        { ...claims, ...mutation },
        2_001,
      ),
      "invalid",
    );
  }
  // Invalid attempts do not burn the exact authority.
  assert.equal(
    await grants.consumeRuntimeRouteDispatchGrant(issued.token, claims, 2_002),
    "claimed",
  );
});

test("expired grants fail closed", async () => {
  grants.resetRuntimeRouteDispatchGrantsForTests();
  const issued = await grants.issueRuntimeRouteDispatchGrant(claims, 3_000);
  assert.equal(
    await grants.consumeRuntimeRouteDispatchGrant(
      issued.token,
      claims,
      3_000 + grants.RUNTIME_ROUTE_DISPATCH_GRANT_TTL_MS,
    ),
    "invalid",
  );
});

test("concurrent consumers have exactly one winner", async () => {
  grants.resetRuntimeRouteDispatchGrantsForTests();
  const issued = await grants.issueRuntimeRouteDispatchGrant(claims, 4_000);
  const results = await Promise.all([
    grants.consumeRuntimeRouteDispatchGrant(issued.token, claims, 4_001),
    grants.consumeRuntimeRouteDispatchGrant(issued.token, claims, 4_001),
  ]);
  assert.deepEqual(results.sort(), ["already_consumed", "claimed"]);
});
