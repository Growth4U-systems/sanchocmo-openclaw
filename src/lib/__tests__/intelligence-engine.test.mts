import { test } from "node:test";
import assert from "node:assert/strict";

import type { Rule, Signal } from "../data/intelligence/engine";

// Match the repo's .mts→.ts interop convention: dynamic import, no extension.
const { detect, outlier, trend, gapVsTarget, threshold, textMatch } = await import("../data/intelligence/engine");
const { meetingDocumentRules } = await import("../data/intelligence/rules/meeting-documents");
const { documentsForText } = await import("../data/meeting-intelligence-runner");

// ----------------------------------------------------------------------------
// Primitives
// ----------------------------------------------------------------------------

test("outlier primitive flags values above p75", () => {
  const hits = outlier([1, 2, 3, 10], { side: "top", percentile: 75 });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].value, 10);
});

test("outlier primitive returns nothing for fewer than 2 values", () => {
  assert.deepEqual(outlier([5], { side: "top" }), []);
});

test("trend primitive detects an upward series and respects direction filter", () => {
  const up = trend([{ t: 1, v: 10 }, { t: 2, v: 20 }], { direction: "up" });
  assert.ok(up);
  assert.equal(up?.direction, "up");
  assert.equal(trend([{ t: 1, v: 20 }, { t: 2, v: 10 }], { direction: "up" }), null);
});

test("gapVsTarget primitive only fires when off-target", () => {
  assert.ok(gapVsTarget(50, 100, { direction: "higher_better" }));
  assert.equal(gapVsTarget(150, 100, { direction: "higher_better" }), null);
});

test("threshold primitive compares against a bound", () => {
  assert.equal(threshold(5, { op: "gt", bound: 3 }), true);
  assert.equal(threshold(2, { op: "gt", bound: 3 }), false);
});

test("textMatch primitive requires at least one matcher", () => {
  assert.equal(textMatch("anything", {}), false);
  assert.equal(textMatch("hello world", { anyOf: [/world/] }), true);
  assert.equal(textMatch("hello", { allOf: [/hello/, /world/] }), false);
});

// ----------------------------------------------------------------------------
// detect(signals, rules) → proposals[]
// ----------------------------------------------------------------------------

test("detect: an outlier rule flags the top content post with a numeric rationale", () => {
  const values = [1.0, 1.1, 0.9, 4.2, 1.2];
  const signals: Signal[] = values.map((value, i) => ({
    id: `sig-${i}`,
    slug: "growth4u",
    category: "content",
    provider: "metricool",
    entityType: "post",
    entityId: `post-${i}`,
    metric: "engagement_pct",
    value,
    capturedAt: "2026-06-01",
  }));
  const rule: Rule = {
    id: "c1-top",
    domain: "content",
    primitive: "outlier",
    category: "content",
    metric: "engagement_pct",
    params: { side: "top", percentile: 75 },
    proposal: { title: "Atomizar el post top", suggestedAction: "Doblar el ángulo ganador." },
    target: { skill: "content-atomizer", agent: "Dulcinea" },
  };

  const proposals = detect(signals, [rule]);

  assert.equal(proposals.length, 1, "only the 4.2 post is above p75");
  const [proposal] = proposals;
  assert.equal(proposal.domain, "content");
  assert.equal(proposal.ruleId, "c1-top");
  assert.equal(proposal.signalRef, "sig-3", "proposal carries provenance to the triggering signal");
  assert.ok(proposal.rationale.includes("4.2"), `rationale should cite the value: ${proposal.rationale}`);
  assert.ok(proposal.confidence > 0, "confidence is populated");
  assert.equal(proposal.targetSkill, "content-atomizer");
  assert.equal(proposal.targetAgent, "Dulcinea");
});

test("detect: a gapVsTarget rule flags a metric below its north-star target", () => {
  const signal: Signal = {
    slug: "growth4u",
    category: "web_analytics",
    provider: "ga4",
    metric: "signups",
    value: 50,
  };
  const rule: Rule = {
    id: "h1-northstar",
    domain: "cro",
    primitive: "gapVsTarget",
    category: "web_analytics",
    metric: "signups",
    params: { target: 100, direction: "higher_better" },
    proposal: { title: "Cerrar el gap del north-star" },
  };

  const proposals = detect([signal], [rule]);

  assert.equal(proposals.length, 1);
  assert.ok(proposals[0].rationale.includes("100"), "rationale cites the target");
  assert.ok(proposals[0].rationale.includes("50"), "rationale cites the value");
});

test("detect: a rule only consumes signals matching its category/metric", () => {
  const signal: Signal = {
    slug: "growth4u",
    category: "ads",
    provider: "meta",
    metric: "ctr",
    value: 99,
  };
  const rule: Rule = {
    id: "c1-top",
    domain: "content",
    primitive: "outlier",
    category: "content", // does not match the ads signal
    metric: "engagement_pct",
    params: { side: "top" },
    proposal: { title: "noop" },
  };
  assert.deepEqual(detect([signal], [rule]), []);
});

// ----------------------------------------------------------------------------
// Text rules via the engine + the documentsForText backward-compat surface
// ----------------------------------------------------------------------------

test("detect: meeting-document rules flag StrategyPlan as a high-severity hit", () => {
  const signal: Signal = {
    slug: "growth4u",
    category: "meeting",
    provider: "meeting",
    metric: "raw_text",
    text: "Cambiamos la prioridad del roadmap y la estrategia GTM",
  };
  const proposals = detect([signal], meetingDocumentRules);
  const strategy = proposals.find((proposal) => proposal.documentName === "StrategyPlan");
  assert.ok(strategy, "StrategyPlan should be detected");
  assert.equal(strategy?.severity, "high");
  assert.equal(strategy?.domain, "meeting");
});

test("detect: irrelevant meeting text yields no proposals", () => {
  const signal: Signal = {
    slug: "growth4u",
    category: "meeting",
    provider: "meeting",
    metric: "raw_text",
    text: "Hola, buenos dias a todos",
  };
  assert.deepEqual(detect([signal], meetingDocumentRules), []);
});

test("detect: textMatch proposal ids stay unique per triggering signal", () => {
  const signals: Signal[] = [
    { id: "sig-1", slug: "growth4u", category: "meeting", provider: "meeting", metric: "raw_text", text: "foo" },
    { id: "sig-2", slug: "growth4u", category: "meeting", provider: "meeting", metric: "raw_text", text: "foo" },
  ];
  const rule: Rule = {
    id: "text-hit",
    domain: "meeting",
    primitive: "textMatch",
    category: "meeting",
    metric: "raw_text",
    params: { anyOf: [/foo/] },
    proposal: { title: "Text hit" },
  };

  const proposals = detect(signals, [rule]);

  assert.equal(proposals.length, 2);
  assert.equal(new Set(proposals.map((proposal) => proposal.id)).size, 2);
  assert.deepEqual(proposals.map((proposal) => proposal.signalRef), ["sig-1", "sig-2"]);
});

test("documentsForText collapses POV Bank to one entry keeping the highest severity", () => {
  // Both a direct POV signal (pov) and a mineable one (cac, 30%) match.
  const docs = documentsForText("Revisamos el pov y bajamos el CAC un 30%");
  const pov = docs.filter((doc) => doc.name === "POV Bank");
  assert.equal(pov.length, 1, "POV Bank must not be duplicated");
  assert.equal(pov[0].severity, "medium", "direct POV (medium) wins over mineable (low)");
});

test("documentsForText keeps a mineable-only POV signal at low severity", () => {
  const docs = documentsForText("Bajamos el CAC un 30% con un nuevo proceso");
  const pov = docs.find((doc) => doc.name === "POV Bank");
  assert.equal(pov?.severity, "low");
});

test("documentsForText mines an uppercase-X numeric metric (case-insensitive regression)", () => {
  // "10X" is the ONLY mineable token here (no POV keyword), so this exercises
  // the numeric regex directly. The original matcher lowercased text first
  // ("10X"→"10x"); the engine must stay case-insensitive or POV Bank is dropped.
  const docs = documentsForText("Crecimos 10X interanual");
  const pov = docs.find((doc) => doc.name === "POV Bank");
  assert.equal(pov?.severity, "low", "uppercase-X multiplier must still mine a POV signal");
});
