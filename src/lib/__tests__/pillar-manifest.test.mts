import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Golden equivalence test para el manifest derivado (SAN-192 W2b).
//
// `config/pillar-manifest.json` es la fuente única. El manifest YA NO declara
// skill/agente por pilar: se DERIVAN de la task cubriente (bloque foundation →
// taskSets) o, para documentos-pilar sin task aún, de skill/agent explícitos.
// El loader de producción (src/lib/pillar-doc-paths.ts) proyecta esto en
// PILLAR_DOC_PATHS, PILLAR_SKILL_ALIAS y PILLAR_CHAT_DEFAULTS. Aquí afirmamos que
// reproducen el golden congelado exactamente — cualquier divergencia es una
// regresión en routing o doc-resolution. (El routing end-to-end lo ejercita
// foundation-pillar-agents.test.mts.)
//
// Import DINÁMICO: pillar-doc-paths default-importa un JSON → con tsx el binding
// estático de named exports falla (quirk ESM→CJS); el namespace dinámico sí los trae.
const { PILLAR_DOC_PATHS, PILLAR_SKILL_ALIAS, PILLAR_CHAT_DEFAULTS } = await import("../pillar-doc-paths");

const ROOT = process.cwd();
const golden = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "__fixtures__", "pillar-maps.golden.json"), "utf8"),
) as {
  docPaths: Record<string, string[]>;
  skillAlias: Record<string, string>;
  chatConfig: Record<string, { skill: string; skills: string[]; agent?: string }>;
};

test("manifest → PILLAR_DOC_PATHS === frozen golden", () => {
  assert.deepStrictEqual(PILLAR_DOC_PATHS, golden.docPaths);
});

test("manifest → PILLAR_SKILL_ALIAS (derivado de la task) === frozen golden", () => {
  assert.deepStrictEqual(PILLAR_SKILL_ALIAS, golden.skillAlias);
});

test("manifest → PILLAR_CHAT_DEFAULTS (derivados) === frozen golden", () => {
  assert.deepStrictEqual(PILLAR_CHAT_DEFAULTS, golden.chatConfig);
});

test("config/chat-config.default.json pillars match the derived defaults (no drift)", () => {
  const chatConfig = JSON.parse(
    fs.readFileSync(path.join(ROOT, "config", "chat-config.default.json"), "utf8"),
  ) as { pillars?: Record<string, unknown> };
  assert.deepStrictEqual(chatConfig.pillars ?? {}, PILLAR_CHAT_DEFAULTS);
});
