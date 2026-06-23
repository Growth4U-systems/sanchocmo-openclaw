import { test } from "node:test";
import assert from "node:assert/strict";

// Piezas puras de la lib de competidores del Trust Score (SAN-309): el parser del
// texto libre del kickoff/formulario y la normalización/dedupe del set. pinCompetitors
// escribe a disco (BASE) → no se testea aquí. Mismo patrón CJS/namespace que los demás.
import * as compMod from "../trust-score/competitors";

const { parseCompetitors, normalizeCompetitorUrl, dedupeNormalizeCompetitors } =
  (compMod as unknown as { default: typeof compMod }).default ?? compMod;

test("parseCompetitors: 'Nombre — URL' por línea → {name, url}", () => {
  const out = parseCompetitors("Acme — https://acme.com\nRival - rival.io");
  assert.deepEqual(out, [
    { url: "https://acme.com", name: "Acme" },
    { url: "rival.io", name: "Rival" },
  ]);
});

test("parseCompetitors: solo URL → sin name; 'Nombre: url' y 'Nombre (url)' también", () => {
  assert.deepEqual(parseCompetitors("https://acme.com"), [{ url: "https://acme.com" }]);
  assert.deepEqual(parseCompetitors("Foo: foo.com"), [{ url: "foo.com", name: "Foo" }]);
  assert.deepEqual(parseCompetitors("Acme (https://acme.com)"), [{ url: "https://acme.com", name: "Acme" }]);
});

test("parseCompetitors: descarta líneas sin URL y vacías", () => {
  assert.deepEqual(parseCompetitors("Solo un nombre sin web\n\n   \nOtro competidor"), []);
  assert.deepEqual(parseCompetitors(""), []);
});

test("normalizeCompetitorUrl: añade https si falta y limpia puntuación colgante", () => {
  assert.equal(normalizeCompetitorUrl("acme.com"), "https://acme.com");
  assert.equal(normalizeCompetitorUrl("https://acme.com"), "https://acme.com");
  assert.equal(normalizeCompetitorUrl("http://x.com"), "http://x.com");
  assert.equal(normalizeCompetitorUrl("acme.com)"), "https://acme.com");
});

test("dedupeNormalizeCompetitors: deduplica por URL normalizada (conserva el primero) y descarta sin url", () => {
  const out = dedupeNormalizeCompetitors([
    { url: "acme.com", name: "Acme" },
    { url: "https://acme.com", name: "Duplicado" },
    { url: "", name: "Sin url" },
    { url: "rival.io" },
  ]);
  assert.deepEqual(out, [
    { url: "https://acme.com", name: "Acme" },
    { url: "https://rival.io" },
  ]);
});
