import assert from "node:assert/strict";
import { test } from "node:test";
import { collectProductCapabilityDrift } from "../product-definition/drift";
import {
  getProductCapabilityManifest,
  parseProductCapabilityManifest,
  ProductCapabilityManifestError,
  resolveProductDefinition,
} from "../product-definition/manifest";
import { PRODUCT_DEFINITION_STATUSES } from "../product-definition/schema";

const manifest = getProductCapabilityManifest();

test("the Product Definition Registry loads three honest, fail-closed pilot definitions", () => {
  assert.deepEqual(PRODUCT_DEFINITION_STATUSES, [
    "approved",
    "draft",
    "partial",
    "missing",
    "conflict",
    "stale",
  ]);
  assert.deepEqual(
    manifest.capabilities.map((capability) => capability.id),
    [
      "mission-control.chat.run",
      "mission-control.task.agent-run-lifecycle",
      "mission-control.comments.apply-skip",
    ],
  );
  assert.equal(manifest.capabilities.every((capability) => capability.definitionStatus === "partial"), true);
  assert.equal(manifest.capabilities.every((capability) => capability.definitionGaps.length > 0), true);
  assert.equal(manifest.capabilities.every((capability) => capability.approvedBy === undefined), true);
});

test("capability resolution is exact and preserves partial so Growie cannot infer approval", () => {
  const result = resolveProductDefinition({ capabilityId: "mission-control.chat.run" }, manifest);
  assert.equal(result.kind, "resolved");
  assert.equal(result.status, "partial");
  if (result.kind === "resolved") {
    assert.equal(result.capability.userJob.includes("agente"), true);
    assert.equal(result.source, "capability");
  }
});

test("route resolution selects the most specific pilot capability", () => {
  const task = resolveProductDefinition({ route: "/dashboard/acme/tasks/P01-T01?tab=activity" }, manifest);
  assert.equal(task.kind, "resolved");
  if (task.kind === "resolved") {
    assert.equal(task.capability.id, "mission-control.task.agent-run-lifecycle");
    assert.equal(task.matchedRoute, "/dashboard/:slug/tasks/:taskId");
  }

  const comments = resolveProductDefinition({ route: "https://sancho.example/dashboard/acme/docs/brief.md" }, manifest);
  assert.equal(comments.kind, "resolved");
  if (comments.kind === "resolved") {
    assert.equal(comments.capability.id, "mission-control.comments.apply-skip");
    assert.equal(comments.matchedRoute, "/dashboard/:slug/docs/**");
  }

  const chat = resolveProductDefinition({ route: "/dashboard/acme/foundation" }, manifest);
  assert.equal(chat.kind, "resolved");
  if (chat.kind === "resolved") assert.equal(chat.capability.id, "mission-control.chat.run");
});

test("unknown capabilities and routes resolve explicitly to missing", () => {
  const byId = resolveProductDefinition({
    capabilityId: "mission-control.unknown.feature",
    route: "/dashboard/acme/tasks/P01-T01",
  }, manifest);
  assert.equal(byId.kind, "missing");
  assert.equal(byId.status, "missing");
  if (byId.kind === "missing") {
    assert.equal(byId.reason, "capability_not_found");
    assert.deepEqual(byId.suggestedCapabilityIds, ["mission-control.task.agent-run-lifecycle", "mission-control.chat.run"]);
  }

  const byRoute = resolveProductDefinition({ route: "/pricing" }, manifest);
  assert.equal(byRoute.kind, "missing");
  if (byRoute.kind === "missing") assert.equal(byRoute.reason, "route_not_mapped");
});

test("a claimed capability on an incompatible route fails closed as conflict", () => {
  const result = resolveProductDefinition({
    capabilityId: "mission-control.comments.apply-skip",
    route: "/dashboard/acme/tasks/P01-T01",
  }, manifest);
  assert.equal(result.kind, "conflict");
  assert.equal(result.status, "conflict");
  if (result.kind === "conflict") assert.equal(result.reason, "capability_route_mismatch");
});

test("equally specific overlapping routes are surfaced as conflict", () => {
  const input = structuredClone(manifest);
  input.capabilities = input.capabilities.slice(0, 2);
  input.capabilities[0].routes = ["/ambiguous/:slug/result/**"];
  input.capabilities[1].routes = ["/ambiguous/:tenant/result/**"];
  const ambiguousManifest = parseProductCapabilityManifest(input);

  const result = resolveProductDefinition({ route: "/ambiguous/acme/result/one" }, ambiguousManifest);
  assert.equal(result.kind, "conflict");
  if (result.kind === "conflict") {
    assert.equal(result.reason, "ambiguous_route");
    assert.equal(result.candidates.length, 2);
  }
});

test("approved definitions are rejected without approval evidence or acceptance tests", () => {
  const input = structuredClone(manifest) as unknown as {
    capabilities: Array<Record<string, unknown>>;
  };
  input.capabilities[0].definitionStatus = "approved";
  input.capabilities[0].definitionGaps = [];
  delete input.capabilities[0].approvedBy;
  input.capabilities[0].acceptanceTests = [];

  assert.throws(
    () => parseProductCapabilityManifest(input),
    (error) => {
      assert.equal(error instanceof ProductCapabilityManifestError, true);
      assert.match(String(error), /approvedBy/);
      assert.match(String(error), /acceptanceTests/);
      return true;
    },
  );
});

test("the checked-in manifest references existing files without fabricating approval freshness", () => {
  assert.deepEqual(
    collectProductCapabilityDrift(manifest, {
      root: process.cwd(),
      asOf: new Date("2026-07-15T00:00:00.000Z"),
    }),
    [],
  );

  const hypotheticalApproved = structuredClone(manifest);
  for (const capability of hypotheticalApproved.capabilities) {
    capability.definitionStatus = "approved";
    capability.definitionGaps = [];
    capability.approvedBy = "martin";
    capability.approvedAt = "2026-07-15T00:00:00Z";
  }
  const overdue = collectProductCapabilityDrift(parseProductCapabilityManifest(hypotheticalApproved), {
    root: process.cwd(),
    asOf: new Date("2027-01-01T00:00:00.000Z"),
  });
  assert.equal(overdue.filter((finding) => finding.kind === "review-overdue").length, 3);
});
