import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Golden equivalence test for the F0 pillar-manifest refactor.
//
// `config/pillar-manifest.json` is the single source of truth. The production
// loader (src/lib/pillar-manifest.ts) projects it into PILLAR_DOC_PATHS,
// PILLAR_SKILL_ALIAS, HOMONYMOUS_SKILL_PILLARS and the chat-config pillar
// defaults. Here we re-project the manifest with the SAME trivial logic and
// assert it reproduces the frozen pre-refactor maps exactly — any divergence is
// a regression in routing or doc resolution. (The production loader is also
// exercised end-to-end by foundation-pillar-agents.test.mts via the routing it
// drives.) The test reads the JSON directly rather than importing the loader so
// it is immune to tsx's ESM→CJS named-export quirks for JSON-importing modules.

const ROOT = process.cwd();

type ManifestEntry = {
  docPaths?: string[];
  skillAlias?: string;
  homonymous?: boolean;
  chatConfig?: { skill: string; skills: string[]; agent?: string };
};
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "config", "pillar-manifest.json"), "utf8"),
) as { pillars: Record<string, ManifestEntry> };

const golden = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "__fixtures__", "pillar-maps.golden.json"), "utf8"),
) as {
  docPaths: Record<string, string[]>;
  skillAlias: Record<string, string>;
  homonymous: string[];
  chatConfig: Record<string, { skill: string; skills: string[]; agent?: string }>;
};

const pillarEntries = Object.entries(manifest.pillars);
const project = <T>(pick: (e: ManifestEntry) => T | undefined): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const [k, e] of pillarEntries) {
    const v = pick(e);
    if (v !== undefined) out[k] = v;
  }
  return out;
};

test("manifest → PILLAR_DOC_PATHS === frozen golden", () => {
  assert.deepStrictEqual(project((e) => e.docPaths), golden.docPaths);
});

test("manifest → PILLAR_SKILL_ALIAS === frozen golden", () => {
  assert.deepStrictEqual(project((e) => e.skillAlias), golden.skillAlias);
});

test("manifest → HOMONYMOUS_SKILL_PILLARS === frozen golden", () => {
  const homonymous = pillarEntries.filter(([, e]) => e.homonymous).map(([k]) => k).sort();
  assert.deepStrictEqual(homonymous, golden.homonymous);
});

test("manifest → chat-config pillar defaults === frozen golden", () => {
  assert.deepStrictEqual(project((e) => e.chatConfig), golden.chatConfig);
});

test("config/chat-config.default.json pillars match the manifest (no drift)", () => {
  const chatConfig = JSON.parse(
    fs.readFileSync(path.join(ROOT, "config", "chat-config.default.json"), "utf8"),
  ) as { pillars?: Record<string, unknown> };
  assert.deepStrictEqual(chatConfig.pillars ?? {}, project((e) => e.chatConfig));
});
