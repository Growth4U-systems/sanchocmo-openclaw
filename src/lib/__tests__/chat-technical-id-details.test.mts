import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTechnicalIdDetails } from "../chat-tool-echo";

// -----------------------------------------------------------------------------
// extractTechnicalIdDetails (SAN-479) — presentation safety net for agents that
// leak run/search identifiers into chat replies.
// -----------------------------------------------------------------------------

test("collapses the real Rocinante launch line (inline • bullets) but keeps the human part", () => {
  const text =
    "🔎 Búsqueda lanzada.\n" +
    "• Run ID: xrun_mrqhdp0a_617807f4 • Search ID: ds-82934ba05197ebc9e27c • Estado: en ejecución\n" +
    "Te aviso aquí con las candidatas.";
  const out = extractTechnicalIdDetails(text);
  assert.equal(out.technicalDetails.length, 2);
  assert.match(out.technicalDetails[0], /^Run ID: xrun_mrqhdp0a_617807f4$/);
  assert.match(out.technicalDetails[1], /^Search ID: ds-82934ba05197ebc9e27c$/);
  assert.ok(out.text.includes("🔎 Búsqueda lanzada."));
  assert.ok(out.text.includes("• Estado: en ejecución"));
  assert.ok(out.text.includes("Te aviso aquí con las candidatas."));
  assert.ok(!out.text.includes("xrun_"));
  assert.ok(!out.text.includes("ds-82934ba05197ebc9e27c"));
});

test("collapses one-per-line Run ID / Search ID bullets", () => {
  const text =
    "Listo, la búsqueda quedó corriendo.\n" +
    "- Run ID: xrun_abc123_deadbeef\n" +
    "- Search ID: ds-0123456789abcdef01\n" +
    "- Estado: en ejecución\n" +
    "Sigue sola aunque cierres el chat.";
  const out = extractTechnicalIdDetails(text);
  assert.equal(out.technicalDetails.length, 2);
  assert.ok(out.text.includes("- Estado: en ejecución"));
  assert.ok(out.text.includes("Sigue sola aunque cierres el chat."));
  assert.ok(!out.text.includes("Run ID"));
  assert.ok(!out.text.includes("Search ID"));
});

test("collapses bold-labelled and bare-token id lines", () => {
  const text =
    "En marcha.\n" +
    "**Run ID:** xrun_zz9\n" +
    "`ds-aaaabbbbccccdddd12`\n" +
    "Búsqueda: ds-ffffeeeeddddcccc99\n" +
    "Te aviso.";
  const out = extractTechnicalIdDetails(text);
  assert.equal(out.technicalDetails.length, 3);
  assert.equal(out.text, "En marcha.\nTe aviso.");
});

test("keeps prose that merely MENTIONS an id mid-sentence", () => {
  const text =
    "La búsqueda ds-82934ba05197ebc9e27c quedó corriendo y suele tardar 2-3 minutos en total.";
  const out = extractTechnicalIdDetails(text);
  assert.equal(out.technicalDetails.length, 0);
  assert.equal(out.text, text);
});

test("leaves messages without technical ids completely untouched", () => {
  const text =
    "🔎 **Buscando 3 creadoras en Instagram** (salud capilar · España).\n" +
    "Suele tardar 2-3 minutos y sigue sola aunque cierres el chat.\n" +
    "• Sector: salud capilar • Estado: en ejecución";
  const out = extractTechnicalIdDetails(text);
  assert.equal(out.technicalDetails.length, 0);
  assert.equal(out.text, text);
});

test("does not touch ids inside code fences", () => {
  const text =
    "Para consultarlo por API:\n```\ncurl …/searches/ds-0123456789abcdef01\nRun ID: xrun_abc_123\n```\nListo.";
  const out = extractTechnicalIdDetails(text);
  assert.equal(out.technicalDetails.length, 0);
  assert.equal(out.text, text);
});

test("empty / null input passes through", () => {
  assert.deepEqual(extractTechnicalIdDetails(""), { text: "", technicalDetails: [] });
  assert.deepEqual(extractTechnicalIdDetails(null), { text: "", technicalDetails: [] });
  assert.deepEqual(extractTechnicalIdDetails(undefined), { text: "", technicalDetails: [] });
});

test("short ds- tokens (under 16 hex chars) are not treated as ids", () => {
  const text = "El plan ds-2026 sigue vigente.";
  const out = extractTechnicalIdDetails(text);
  assert.equal(out.technicalDetails.length, 0);
  assert.equal(out.text, text);
});
