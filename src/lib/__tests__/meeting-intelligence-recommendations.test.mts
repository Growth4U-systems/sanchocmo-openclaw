import { test } from "node:test";
import assert from "node:assert/strict";

// SAN-222 — fix A. The DB-bound pieces (backfill writes, Convert→createTask) are
// covered by the staging e2e; here we lock the two PURE cores the loop depends on
// plus the no-DB degradation, all runnable without DATABASE_URL.
const { insightsNeedingRecommendation, documentsForText, recommendationEvidenceRefreshPatch, backfillMeetingRecommendations } = await import(
  "../data/meeting-intelligence-runner"
);
const { convertedRecommendationTaskId } = await import("../data/meeting-intelligence-db");

test("insightsNeedingRecommendation keeps only insights without a recommendation", () => {
  const insights = [{ id: "i1" }, { id: "i2" }, { id: "i3" }];
  const recommendations = [{ insightId: "i2" }];
  assert.deepEqual(
    insightsNeedingRecommendation(insights, recommendations).map((i) => i.id),
    ["i1", "i3"],
  );
});

test("insightsNeedingRecommendation ignores recommendations with a null insightId", () => {
  const insights = [{ id: "i1" }, { id: "i2" }];
  // A null link must NOT accidentally filter out a real insight.
  const recommendations = [{ insightId: null }, { insightId: "i1" }];
  assert.deepEqual(
    insightsNeedingRecommendation(insights, recommendations).map((i) => i.id),
    ["i2"],
  );
});

test("insightsNeedingRecommendation returns all insights when none have recommendations", () => {
  const insights = [{ id: "i1" }, { id: "i2" }];
  assert.equal(insightsNeedingRecommendation(insights, []).length, 2);
});

test("documentsForText flags StrategyPlan as a high-severity conflict candidate", () => {
  const docs = documentsForText("Cambiamos la prioridad del roadmap y la estrategia GTM");
  const strategy = docs.find((d) => d.name === "StrategyPlan");
  assert.ok(strategy, "expected a StrategyPlan impact");
  assert.equal(strategy?.severity, "high");
});

test("documentsForText mines a POV signal from a metric mention", () => {
  const docs = documentsForText("Bajamos el CAC un 30% con un nuevo proceso");
  assert.ok(docs.some((d) => d.name === "POV Bank"), "expected a POV Bank impact from the metric/process signal");
});

test("documentsForText returns nothing for irrelevant text (no spurious recommendations)", () => {
  assert.deepEqual(documentsForText("Hola, buenos dias a todos"), []);
});

test("recommendationEvidenceRefreshPatch preserves human workflow fields on upsert", () => {
  const updatedAt = new Date("2026-06-19T00:00:00.000Z");
  const patch = recommendationEvidenceRefreshPatch({
    description: "Refreshed evidence copy",
    priority: "high",
    updatedAt,
  });
  assert.deepEqual(Object.keys(patch).sort(), ["description", "priority", "updatedAt"]);
  assert.equal((patch as { status?: string }).status, undefined);
  assert.equal((patch as { taskStatus?: string }).taskStatus, undefined);
  assert.equal((patch as { taskId?: string }).taskId, undefined);
});

test("convertedRecommendationTaskId is P-prefixed (json projectDirs lists only P* dirs) and stable", () => {
  const id = convertedRecommendationTaskId("mirc_22df657bcaa28a28f8d5483b");
  assert.equal(id, "P-mirec-22df657bcaa28a28f8d5483b");
  // The "P" prefix is the contract that broke on staging — guard it hard.
  assert.ok(id.startsWith("P"), "must start with P or the json backend hides the task");
  // Idempotent: same recommendation always maps to the same task id.
  assert.equal(convertedRecommendationTaskId("mirc_22df657bcaa28a28f8d5483b"), id);
});

test("backfillMeetingRecommendations degrades cleanly without a database", async () => {
  const result = await backfillMeetingRecommendations("growth4u");
  assert.deepEqual(result, { recommendations: 0, insightsScanned: 0 });
});
