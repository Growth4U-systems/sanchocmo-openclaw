import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../formula";

const formula = (mod as unknown as { default: typeof mod }).default ?? mod;

test("parses source.metric references with hyphenated sources and arithmetic precedence", () => {
  const parsed = formula.parseMetricFormula("meta-ads.spend / (ghl.newContacts + 2) * 100");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.references, [
    { source: "meta-ads", metric: "spend", raw: "meta-ads.spend" },
    { source: "ghl", metric: "newContacts", raw: "ghl.newContacts" },
  ]);
  assert.deepEqual(
    formula.evaluateMetricFormula(parsed.ast, (ref) =>
      ref.raw === "meta-ads.spend" ? 42 : 4,
    ),
    { ok: true, value: 700 },
  );
});

test("supports unary signs and subtraction without requiring whitespace", () => {
  const parsed = formula.parseMetricFormula("-ga4.sessions-ga4.newUsers");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(
    formula.evaluateMetricFormula(parsed.ast, (ref) =>
      ref.metric === "sessions" ? 10 : 3,
    ),
    { ok: true, value: -13 },
  );
});

test("rejects identifiers, calls, malformed operators, and trailing tokens", () => {
  for (const candidate of [
    "sessions",
    "process.exit(1)",
    "ga4.sessions ** 2",
    "ga4.sessions +",
    "ga4.sessions; alert(1)",
    "meta-.spend",
  ]) {
    assert.equal(formula.isSafeFormula(candidate), false, candidate);
    const parsed = formula.parseMetricFormula(candidate);
    assert.equal(parsed.ok, false, candidate);
  }
  assert.equal(formula.parseMetricFormula("42 / 2").ok, true);
  assert.equal(formula.isSafeFormula("42 / 2"), false);
});

test("returns explicit missing and division-by-zero results without manufacturing zero", () => {
  const parsed = formula.parseMetricFormula("meta-ads.spend / ghl.newContacts");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const missing = formula.evaluateMetricFormula(parsed.ast, (ref) =>
    ref.source === "meta-ads" ? 100 : null,
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, "missing_reference");

  const divisionByZero = formula.evaluateMetricFormula(parsed.ast, (ref) =>
    ref.source === "meta-ads" ? 100 : 0,
  );
  assert.equal(divisionByZero.ok, false);
  if (!divisionByZero.ok) assert.equal(divisionByZero.error.code, "division_by_zero");
});
