#!/usr/bin/env tsx
/**
 * regen-pillar-derived.mts (SAN-192 W2b) — regenera los artefactos DERIVADOS del
 * manifest desde la fuente única (pillar-doc-paths.ts): el golden de equivalencia
 * y el seed config/chat-config.default.json. El manifest ya no declara skill/
 * agente por pilar (se derivan de la task cubriente). NO editar esos ficheros a
 * mano: correr este script.
 *
 *   npx tsx scripts/regen-pillar-derived.mts
 */
import fs from "node:fs";
// Dynamic import: pillar-doc-paths default-importa un JSON → con tsx el binding
// estático de named exports falla (quirk ESM→CJS); el namespace dinámico sí trae
// los exports (mismo patrón que scripts/migrate-foundation-state.mts).
const { PILLAR_DOC_PATHS, PILLAR_SKILL_ALIAS, PILLAR_CHAT_DEFAULTS } = await import("../src/lib/pillar-doc-paths");

// 1) golden fixture (indent 2 — formato nativo del fixture)
const golden = { docPaths: PILLAR_DOC_PATHS, skillAlias: PILLAR_SKILL_ALIAS, chatConfig: PILLAR_CHAT_DEFAULTS };
fs.writeFileSync(
  "src/lib/__tests__/__fixtures__/pillar-maps.golden.json",
  JSON.stringify(golden, null, 2) + "\n",
);

// 2) chat-config.default.json — entradas de pilar inline, preservando estilo
const comment =
  "Default per-brand chat config copied to brand/{slug}/chat-config.json on client creation (src/pages/api/clients/create.ts). El bloque `pillars` declara, por documento-pilar, la skill que lo produce y el agente que lo posee. SAN-192 (W2b): DERIVADO de config/pillar-manifest.json — skill/agente salen de la task cubriente (bloque foundation -> taskSets) o, para documentos-pilar sin task aun, de skill/agent explicitos del pilar. NO editar a mano: regenerar con scripts/regen-pillar-derived.mts. El resolver usa el mismo mapa via skill-resolver.";
const keys = Object.keys(PILLAR_CHAT_DEFAULTS);
const out: string[] = ["{", '  "_comment": ' + JSON.stringify(comment) + ",", '  "pillars": {'];
keys.forEach((k, i) => {
  const v = PILLAR_CHAT_DEFAULTS[k];
  out.push(
    "    " +
      JSON.stringify(k) +
      ': { "skill": ' +
      JSON.stringify(v.skill) +
      ', "skills": ' +
      JSON.stringify(v.skills) +
      ', "agent": ' +
      JSON.stringify(v.agent) +
      " }" +
      (i < keys.length - 1 ? "," : ""),
  );
});
out.push("  }", "}");
fs.writeFileSync("config/chat-config.default.json", out.join("\n") + "\n");

console.log(
  "golden: docPaths=" +
    Object.keys(PILLAR_DOC_PATHS).length +
    " skillAlias=" +
    Object.keys(PILLAR_SKILL_ALIAS).length +
    " chatConfig=" +
    Object.keys(PILLAR_CHAT_DEFAULTS).length,
);
console.log("chat-config.default.json pillars=" + keys.length);
