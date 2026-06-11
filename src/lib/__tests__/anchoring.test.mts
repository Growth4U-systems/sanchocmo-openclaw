/**
 * TextQuoteSelector scoring (SAN-148) — pure string tests over
 * bestAnchorOffset, no DOM needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../anchoring";
const { bestAnchorOffset, ANCHOR_CTX } = (mod as unknown as { default: typeof mod }).default ?? mod;

test("single occurrence anchors directly", () => {
  const full = "El plan estratégico de Acme define tres fases claras.";
  const off = bestAnchorOffset(full, { exact: "tres fases", prefix: "", suffix: "" });
  assert.equal(off, full.indexOf("tres fases"));
});

test("missing exact returns -1 (orphan)", () => {
  assert.equal(bestAnchorOffset("nada que ver", { exact: "tres fases", prefix: "", suffix: "" }), -1);
  assert.equal(bestAnchorOffset("x", { exact: "", prefix: "", suffix: "" }), -1);
});

test("prefix/suffix disambiguate repeated occurrences", () => {
  const a = "la fase uno requiere presupuesto. ";
  const b = "la fase dos requiere validación previa.";
  const full = a + b;
  // Both contain "requiere" — the suffix picks the second.
  const exact = "requiere";
  const second = full.indexOf(exact, a.length);
  const off = bestAnchorOffset(full, {
    exact,
    prefix: full.slice(Math.max(0, second - ANCHOR_CTX), second),
    suffix: full.slice(second + exact.length, second + exact.length + ANCHOR_CTX),
  });
  assert.equal(off, second);
});

test("proximity to original start breaks ties when context is gone", () => {
  const full = "alpha beta alpha beta alpha beta";
  const exact = "beta";
  const hits = [6, 17, 28];
  // No prefix/suffix match (doc changed around them) — closest to start=18 wins.
  const off = bestAnchorOffset(full, { exact, prefix: "ZZZ", suffix: "ZZZ", start: 18 });
  assert.equal(off, hits[1]);
});

test("v1 rows (no prefix/suffix) still anchor via exact + offset", () => {
  const full = "uno dos tres dos uno";
  const off = bestAnchorOffset(full, { exact: "dos", prefix: "", suffix: "", start: 13 });
  assert.equal(off, 13);
});
