import { test } from "node:test";
import assert from "node:assert/strict";

// .mts → .ts interop: load the data layer via dynamic import.
const ka = await import("../keyword-antenna");

const NOW = "2026-06-19T10:00:00.000Z";

test("scoreKeyword — declared target gets the strategic floor even when weak", () => {
  const s = ka.scoreKeyword({ keyword: "mejores agencias de growth", strategicFlag: true }, { now: NOW });
  assert.ok(s.priorityScore >= 50, `floor applied, got ${s.priorityScore}`);
  assert.equal(s.lastScoredAt, NOW);
});

test("scoreKeyword — strong on every axis scores high", () => {
  const s = ka.scoreKeyword(
    {
      keyword: "best open source cmo",
      bofuCategory: "best-of",
      demand: { volume: 9000, trend: "up" },
      winnability: { kdGap: 40, currentRank: 12 },
      pillarId: "P1",
      strategicFlag: true,
    },
    { now: NOW },
  );
  assert.ok(s.priorityScore >= 70, `expected high, got ${s.priorityScore}`);
});

test("scoreKeyword — multiplicative harshness: weak demand tanks the score", () => {
  const s = ka.scoreKeyword(
    { keyword: "obscure long tail", bofuCategory: "best-of", demand: { volume: 5 }, winnability: { kdGap: 0 } },
    { now: NOW },
  );
  assert.ok(s.priorityScore < 50, `expected low, got ${s.priorityScore}`);
});

test("scoreAiOpportunity — AI Overview present + not cited = high; cited = lower; absent = 0", () => {
  assert.ok(ka.scoreAiOpportunity({ aiOverviewPresent: true, citedNow: false, shareOfVoice: 0 }) >= 70);
  assert.equal(ka.scoreAiOpportunity({ aiOverviewPresent: true, citedNow: true }), 30);
  assert.equal(ka.scoreAiOpportunity(null), 0);
});

test("isProgrammaticRisk — high volume + weak winnability + no anchor flags; strategic target does not", () => {
  assert.equal(
    ka.isProgrammaticRisk({ keyword: "herramientas marketing por ciudad", demand: { volume: 9900 }, winnability: { kdGap: -30 } }),
    true,
  );
  assert.equal(
    ka.isProgrammaticRisk({ keyword: "best open source cmo", demand: { volume: 9900 }, strategicFlag: true }),
    false,
  );
});

test("toSeoIdea — enriched shape + source_signals that lights up the Keywords filter", () => {
  const s = ka.scoreKeyword({ keyword: "Qué es un CMO open source", pillarId: "P2", intent: "informational" }, { now: NOW });
  const idea = ka.toSeoIdea(s, { now: NOW });
  assert.equal(idea.source, "keyword-antenna");
  assert.equal(idea.list, "keywords");
  assert.equal(idea.target_channel, "blog");
  assert.equal(idea.status, "New");
  assert.match(idea.source_signals[0], /^kw-2026-06-19-/); // → "keywords" bucket in classifySignalSource
  assert.equal(idea.seo.keyword, "Qué es un CMO open source");
  assert.equal(idea.seo.pillarId, "P2");
  assert.equal(idea.seo.priorityScore, s.priorityScore);
});

test("dedupeCandidates — merges discoveredBy and keeps strategicFlag", () => {
  const merged = ka.dedupeCandidates([
    { keyword: "growth agency", discoveredBy: ["identity"], strategicFlag: true },
    { keyword: "Growth Agency", discoveredBy: ["competitor-gap"] }, // same slug
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].discoveredBy?.slice().sort(), ["competitor-gap", "identity"]);
  assert.equal(merged[0].strategicFlag, true);
});

test("appendScoredToQueue — append-only, dedupe vs existing antenna ideas, leaves others untouched", () => {
  const existing = [
    { source: "keyword-antenna", title: "growth agency", seo: { keyword: "growth agency" } },
    { source: "news", title: "some news idea" },
  ];
  const scored = [
    ka.scoreKeyword({ keyword: "growth agency" }, { now: NOW }), // dupe → skipped
    ka.scoreKeyword({ keyword: "fractional cmo" }, { now: NOW }), // new → created
  ];
  const { next, result } = ka.appendScoredToQueue(existing, scored, { now: NOW });
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].seo.keyword, "fractional cmo");
  assert.equal(result.skipped.length, 1);
  assert.equal(next.length, existing.length + 1);
});

test("selectKeywordOpportunities — filters to antenna ideas, sorts by priority desc", () => {
  const queue = [
    { source: "news", title: "x" },
    { source: "keyword-antenna", seo: { keyword: "a", pillarId: "P1", priorityScore: 30, discoveredBy: ["identity"] } },
    { source: "keyword-antenna", seo: { keyword: "b", pillarId: "P1", priorityScore: 80, discoveredBy: ["demand"] } },
    { source: "keyword-antenna", seo: { keyword: "c", pillarId: "P2", priorityScore: 90, discoveredBy: ["identity"] } },
  ];
  assert.deepEqual(ka.selectKeywordOpportunities(queue).map((i) => i.seo.keyword), ["c", "b", "a"]);
  assert.deepEqual(ka.selectKeywordOpportunities(queue, { pillarId: "P1", minPriority: 50 }).map((i) => i.seo.keyword), ["b"]);
  assert.deepEqual(ka.selectKeywordOpportunities(queue, { mode: "identity", limit: 1 }).map((i) => i.seo.keyword), ["c"]);
});
