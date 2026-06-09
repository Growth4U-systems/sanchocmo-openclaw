import { test } from "node:test";
import assert from "node:assert/strict";
// CommonJS interop: pillar-doc-paths is consumed as CJS by Next.js, so named exports live on default.
import * as mod from "../pillar-doc-paths";

const { PILLAR_DOC_PATHS, resolvePillarDocPath } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("fast-context maps to the single fastcontext file", () => {
  assert.deepEqual(PILLAR_DOC_PATHS["fast-context"], ["fastcontext/fastcontext.current.md"]);
});

test("fast-foundation section resolves to fastcontext (no company-brief lite)", () => {
  assert.equal(PILLAR_DOC_PATHS["fast-foundation"][0], "fastcontext/fastcontext.current.md");
  assert.ok(!PILLAR_DOC_PATHS["fast-foundation"].some((p) => p.endsWith("/lite.md")));
});

test("foundation-state output_file still wins over the static map", () => {
  const state = { sections: { "fast-foundation": { pillars: {
    "fast-context": { output_file: "brand/acme/fastcontext/fastcontext.current.md" },
  } } } };
  assert.equal(
    resolvePillarDocPath("fast-context", state),
    "brand/acme/fastcontext/fastcontext.current.md",
  );
});
