import { test } from "node:test";
import assert from "node:assert/strict";
// CommonJS interop: pillar-doc-paths is consumed as CJS by Next.js, so named exports live on default.
import * as mod from "../pillar-doc-paths";

const { PILLAR_DOC_PATHS, resolvePillarDocPath } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

// W4: company-brief is the single Layer-0 pillar. fast-context and fast-foundation are retired.

test("company-brief maps to the canonical company-brief file", () => {
  assert.deepEqual(PILLAR_DOC_PATHS["company-brief"], [
    "company-brief/company-brief.current.md",
  ]);
});

test("fast-context key is removed from PILLAR_DOC_PATHS", () => {
  assert.equal(PILLAR_DOC_PATHS["fast-context"], undefined);
});

test("fast-foundation key is removed from PILLAR_DOC_PATHS", () => {
  assert.equal(PILLAR_DOC_PATHS["fast-foundation"], undefined);
});

test("foundation-state output_file still wins over the static map", () => {
  const state = {
    sections: {
      "company-brief": {
        pillars: {
          "company-brief": {
            output_file: "brand/acme/company-brief/company-brief.current.md",
          },
        },
      },
    },
  };
  assert.equal(
    resolvePillarDocPath("company-brief", state),
    "brand/acme/company-brief/company-brief.current.md",
  );
});

test("company-brief falls back to the static map when no foundation-state", () => {
  assert.equal(
    resolvePillarDocPath("company-brief", undefined),
    "company-brief/company-brief.current.md",
  );
});
