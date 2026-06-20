import { test, before } from "node:test";
import assert from "node:assert/strict";

// Source modules are CJS under this tsx test runner; follow the repo
// convention of importing them dynamically (see persona-loops.test.mts).
type Mod = typeof import("../slugify");
let slugify: Mod["slugify"];

before(async () => {
  ({ slugify } = await import("../slugify"));
});

// A representative battery, incl. diacritics, punctuation, leading/trailing
// separators, casing, emptiness and over-length inputs.
const SAMPLES = [
  "Café Olé!",
  "  --Hello,  World--  ",
  "Mejores Agencias de Growth 2026",
  "Martín Pérez",
  "ÀÉÎÕÜ ñ ç",
  "***",
  "",
  "already-a-slug",
  "Tabs\tand\nnewlines",
  "x".repeat(120),
  "ünïcödé tëst with a verrrrry long taaaaail that exceeds sixty four characters easily",
];

test("slugify: core transform (lowercase, NFD strip, hyphenate, trim)", () => {
  assert.equal(slugify("Café Olé!"), "cafe-ole");
  assert.equal(slugify("  --Hello,  World--  "), "hello-world");
  assert.equal(slugify("Martín Pérez"), "martin-perez");
  assert.equal(slugify("ÀÉÎÕÜ ñ ç"), "aeiou-n-c");
});

test("slugify: maxLen truncates before fallback; fallback only when empty", () => {
  assert.equal(slugify("Plantilla X", { maxLen: 4 }), "plan");
  assert.equal(slugify("***", { fallback: "articulo" }), "articulo");
  assert.equal(slugify("***", { maxLen: 80, fallback: "articulo" }), "articulo");
  assert.equal(slugify(""), "");
  // Truncation does NOT re-trim a hyphen the slice exposes (matches the old chain).
  assert.equal(slugify("ab cd", { maxLen: 3 }), "ab-");
});

// Parity guard: the three helpers this util replaced each used this exact chain.
// If `slugify` ever drifts, these assertions break before any caller does.
test("slugify: byte-parity with the original inlined chains", () => {
  const templateChain = (name: string) =>
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "plantilla";
  const pathChain = (title: string) =>
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "articulo";
  const personaChain = (name: string) =>
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  for (const s of SAMPLES) {
    assert.equal(slugify(s, { maxLen: 64, fallback: "plantilla" }), templateChain(s), `template parity: ${s}`);
    assert.equal(slugify(s, { maxLen: 80, fallback: "articulo" }), pathChain(s), `path parity: ${s}`);
    assert.equal(slugify(s), personaChain(s), `persona parity: ${s}`);
  }
});
