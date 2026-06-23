import { test } from "node:test";
import assert from "node:assert/strict";

// isCompanyBriefCompletion es el predicado puro que decide si un cambio de estado
// de pilar debe auto-arrancar el Trust Score en el kickoff (SAN-309). El hook real
// vive en src/pages/api/brand-brain/pillar-status.ts y compone este predicado con
// el guard de cache (hasTrustScoreCache). Mismo patrón CJS/namespace que
// trust-score-doc.test.mts para el interop .mts↔.ts.
import * as runMod from "../trust-score/run";

const { isCompanyBriefCompletion } =
  (runMod as unknown as { default: typeof runMod }).default ?? runMod;

test("dispara al completarse el Company Brief (kickoff hecho)", () => {
  assert.equal(
    isCompanyBriefCompletion("company-brief", "company-brief", "completed", true),
    true,
  );
});

test("NO dispara si el pilar no cambió (re-escritura idempotente del completed)", () => {
  assert.equal(
    isCompanyBriefCompletion("company-brief", "company-brief", "completed", false),
    false,
  );
});

test("NO dispara en estados intermedios del Company Brief", () => {
  for (const status of ["pending-review", "in-progress", "todo", "blocked", "cancelled"]) {
    assert.equal(
      isCompanyBriefCompletion("company-brief", "company-brief", status, true),
      false,
      `status=${status} no debería disparar`,
    );
  }
});

test("NO dispara al completar otros pilares (evita corridas caras espurias)", () => {
  // El propio pilar trust-score completándose (lo marca su corrida) no se re-dispara.
  assert.equal(isCompanyBriefCompletion("site-audit", "trust-score", "completed", true), false);
  // Otros pilares de Foundation tampoco.
  assert.equal(isCompanyBriefCompletion("brand-voice", "brand-voice", "completed", true), false);
  assert.equal(isCompanyBriefCompletion("market-and-us", "market-analysis", "completed", true), false);
});

test("NO dispara si solo coincide la sección o solo el pilar", () => {
  assert.equal(isCompanyBriefCompletion("company-brief", "otro-pilar", "completed", true), false);
  assert.equal(isCompanyBriefCompletion("otra-seccion", "company-brief", "completed", true), false);
});
