import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeToolEcho } from "../tool-echo.js";

test("flags runtime tool-call echoes", () => {
  const echoes = [
    "✍️ Write: to $OPENCLAW_HOME/workspace-sancho/brand/g/outreach/x.md (1539 chars)",
    "📝 Edit: in $OPENCLAW_HOME/workspace-sancho/brand/g/searches/ds.json",
    "🐍 run python3 inline script",
    "🪄 show $OPENCLAW_HOME/.../ds.json -> run python3 inline script",
    "Read: /tmp/foo.txt",
    "🔍 Grep: pattern",
    "🛠️ fetch http://localhost:3000/api/partnerships/searches",
    "🛠️ print text → fetch http://localhost:3000/api/partnerships/searches → print text",
    "🧮 Code Execution: Make an HTTP POST request to http://localhost:3000/api/partnerships/searches with these headers:",
    "🛠️ pwd",
    "fetch http://localhost:3000/api/partnerships/searches",
    "print text",
    "Escribiendo informe",
    "📦 Compactando contexto",
  ];
  for (const e of echoes) assert.equal(looksLikeToolEcho(e), true, `should flag: ${e}`);
});

test("leaves real Spanish replies untouched", () => {
  const replies = [
    "Listo, ya guardé la plantilla y actualicé el plan.",
    "Está bien, guárdala y actualiza el plan",
    "He creado la búsqueda. ¿Quieres que la lance ahora o revisas los filtros primero?",
    "Aquí tienes el resumen:\n\n- Sector: fintech\n- Tier: micro/mid\n\n¿Avanzo?",
    "Movería el lead a Negociando, pero confírmame el presupuesto.",
    "",
  ];
  for (const r of replies) assert.equal(looksLikeToolEcho(r), false, `should NOT flag: ${r.slice(0, 40)}`);
});

test("does not flag long prose that merely starts with a tool word", () => {
  // "Listo" must not match "List"; a long paragraph is never an echo.
  const longProse = "Run ".padEnd(220, "x");
  assert.equal(looksLikeToolEcho(longProse), false);
  assert.equal(looksLikeToolEcho("Listo el análisis competitivo, lo tienes en el doc."), false);
});
