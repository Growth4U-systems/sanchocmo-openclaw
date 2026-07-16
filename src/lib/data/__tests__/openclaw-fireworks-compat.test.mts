import { test } from "node:test";
import assert from "node:assert/strict";

// The generator is a CommonJS docker script; its `require.main === module`
// guard keeps importing it side-effect-free, so we can unit-test the pure
// helper. (.mts tests run under tsx and are not typechecked by tsconfig.)
const gen = await import("../../../../docker/generate-openclaw-config.js");
const applyFireworksToolSchemaCompat =
  gen.applyFireworksToolSchemaCompat ?? gen.default?.applyFireworksToolSchemaCompat;
const applyFireworksGlm52MaxTokens =
  gen.applyFireworksGlm52MaxTokens ?? gen.default?.applyFireworksGlm52MaxTokens;
const resolveFireworksGlm52MaxTokens =
  gen.resolveFireworksGlm52MaxTokens ?? gen.default?.resolveFireworksGlm52MaxTokens;
const KEYWORDS =
  gen.FIREWORKS_UNSUPPORTED_TOOL_SCHEMA_KEYWORDS ?? gen.default?.FIREWORKS_UNSUPPORTED_TOOL_SCHEMA_KEYWORDS;

test("the keyword set covers the verified Fireworks-incompatible keywords", () => {
  assert.ok(Array.isArray(KEYWORDS) && KEYWORDS.length > 0);
  for (const kw of ["not", "oneOf", "pattern", "minLength", "maxLength", "minItems", "maxItems"]) {
    assert.ok(KEYWORDS.includes(kw), `expected keyword set to include ${kw}`);
  }
});

test("sets compat on a fireworks model that had NONE (the glm-5p2 case)", () => {
  const provider = { models: [{ id: "accounts/fireworks/models/glm-5p2", name: "GLM 5.2", contextWindow: 1048576 }] };
  applyFireworksToolSchemaCompat(provider);
  assert.deepEqual(provider.models[0].compat.unsupportedToolSchemaKeywords, KEYWORDS);
  assert.equal(provider.models[0].contextWindow, 1048576); // other fields untouched
});

test("UPSERTS onto an already-present model (the merge-skip gotcha) and replaces a partial set", () => {
  const provider = {
    models: [
      // glm-5p2 as it already sits in a redeployed staging openclaw.json (no compat)
      { id: "accounts/fireworks/models/glm-5p2", name: "GLM 5.2" },
      // kimi with the OLD partial ['not'] + a runtime field to preserve
      { id: "accounts/fireworks/routers/kimi-k2p5-turbo", compat: { unsupportedToolSchemaKeywords: ["not"] }, cost: { input: 0 } },
    ],
  };
  applyFireworksToolSchemaCompat(provider);
  assert.deepEqual(provider.models[0].compat.unsupportedToolSchemaKeywords, KEYWORDS);
  assert.deepEqual(provider.models[1].compat.unsupportedToolSchemaKeywords, KEYWORDS); // ['not'] → full set
  assert.deepEqual(provider.models[1].cost, { input: 0 }); // unrelated fields preserved
});

test("is idempotent and never throws on missing/empty providers", () => {
  const provider = { models: [{ id: "x" }] };
  applyFireworksToolSchemaCompat(provider);
  const first = [...provider.models[0].compat.unsupportedToolSchemaKeywords];
  applyFireworksToolSchemaCompat(provider);
  assert.deepEqual(provider.models[0].compat.unsupportedToolSchemaKeywords, first);
  assert.doesNotThrow(() => applyFireworksToolSchemaCompat(undefined));
  assert.doesNotThrow(() => applyFireworksToolSchemaCompat({}));
  assert.doesNotThrow(() => applyFireworksToolSchemaCompat({ models: [] }));
});

test("GLM 5.2 always receives an explicit, bounded output-token cap", () => {
  assert.equal(resolveFireworksGlm52MaxTokens({}), 8192);
  assert.equal(
    resolveFireworksGlm52MaxTokens({ FIREWORKS_GLM52_MAX_TOKENS: "4096" }),
    4096,
  );
  for (const value of ["0", "255", "16385", "8192.5", " 8192", "8192x"]) {
    assert.throws(
      () =>
        resolveFireworksGlm52MaxTokens({
          FIREWORKS_GLM52_MAX_TOKENS: value,
        }),
      /FIREWORKS_GLM52_MAX_TOKENS/,
    );
  }

  const provider = {
    models: [
      {
        id: "accounts/fireworks/models/glm-5p2",
        name: "GLM 5.2",
        maxTokens: 262_144,
        contextWindow: 1_048_576,
      },
      { id: "accounts/fireworks/models/other", maxTokens: 12_345 },
    ],
  };
  assert.equal(applyFireworksGlm52MaxTokens(provider, 8192), true);
  assert.equal(provider.models[0].maxTokens, 8192);
  assert.equal(provider.models[0].contextWindow, 1_048_576);
  assert.equal(provider.models[1].maxTokens, 12_345);
  assert.equal(applyFireworksGlm52MaxTokens(provider, 8192), false);
});
