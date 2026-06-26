import { test } from "node:test";
import assert from "node:assert/strict";

// chat-tool-echo only imports a TYPE from @/hooks/useChat (erased at runtime),
// so it loads cleanly under tsx without resolving the alias.
const { isToolEcho } = await import("../chat-tool-echo");

test("isToolEcho: flags runtime tool-call echoes (mirror of the plugin)", () => {
  const echoes = [
    "✍️ Write: to $OPENCLAW_HOME/workspace-sancho/brand/g/outreach/x.md (1539 chars)",
    "🐍 run python3 inline script",
    "🪄 show $OPENCLAW_HOME/.../ds.json -> run python3 inline script",
    "Read: /tmp/foo.txt",
    "🔍 Grep: pattern",
    "Escribiendo informe",
    "📦 Compactando contexto",
  ];
  for (const e of echoes) assert.equal(isToolEcho(e), true, `should flag: ${e}`);
});

test("isToolEcho: leaves real Spanish replies untouched", () => {
  const replies = [
    "Listo, ya guardé la plantilla y actualicé el plan.",
    "He creado la búsqueda. ¿Quieres que la lance ahora o revisas los filtros primero?",
    "Aquí tienes el resumen:\n\n- Sector: fintech\n- Tier: micro/mid\n\n¿Avanzo?",
    "Movería el lead a Negociando, pero confírmame el presupuesto.",
    "",
  ];
  for (const r of replies) assert.equal(isToolEcho(r), false, `should NOT flag: ${r.slice(0, 40)}`);
});

test("isToolEcho: flags weak-model tool narration (SAN-342)", () => {
  const echoes = [
    "list files in ~/workspace-rocinante/brand/growth4u/ → print text → list files in ~/workspace-rocinante/brand/growth4u/discovery/ → print text failed",
    "🐎 list files in ~/ws/brand/g/ → print text → list files in ~/ws/brand/g/discovery/ → print text failed",
    "list files in /root/.openclaw/workspace-rocinante/brand/x failed",
    "read file brand/growth4u/foo.md → print text failed",
  ];
  for (const e of echoes) assert.equal(isToolEcho(e), true, `should flag: ${e.slice(0, 50)}`);
});

test("isToolEcho: stays conservative on Spanish prose with arrows/paths (SAN-342)", () => {
  const replies = [
    "El flujo es discovery → plantilla → secuencia, ¿lo montamos?",
    "Movemos el lead brand/x → revisamos → cerramos cuando confirmes.",
    "Primero leo el brief y luego te paso el plan en 2 líneas.",
    "Listo el análisis, lo tienes en el doc.",
  ];
  for (const r of replies) assert.equal(isToolEcho(r), false, `should NOT flag: ${r.slice(0, 40)}`);
});
