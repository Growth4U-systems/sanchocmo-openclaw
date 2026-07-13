import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDocsReviewReplyOptions,
  DEFAULT_DOCS_ASSISTANT_MODEL,
  resolveTurnModelOverride,
} from "../model-routing.js";

const docsTurn = {
  readOnly: true,
  source: "docs",
  slug: "growth4u",
  userId: "docs-assistant",
};

test("trusted read-only docs turns use the fast Growie model", () => {
  assert.equal(resolveTurnModelOverride(docsTurn, {}), DEFAULT_DOCS_ASSISTANT_MODEL);
  assert.equal(
    resolveTurnModelOverride(docsTurn, { SANCHO_DOCS_ASSISTANT_MODEL: "fireworks/fast-model" }),
    "fireworks/fast-model",
  );
});

test("normal chat and partially forged docs turns keep their configured agent model", () => {
  assert.equal(resolveTurnModelOverride({ ...docsTurn, readOnly: false }, {}), null);
  assert.equal(resolveTurnModelOverride({ ...docsTurn, source: "mission-control" }, {}), null);
  assert.equal(resolveTurnModelOverride({ ...docsTurn, slug: "another-client" }, {}), null);
  assert.equal(resolveTurnModelOverride({ ...docsTurn, userId: "someone-else" }, {}), null);
});

test("invalid configured docs models fail closed to the known fast model", () => {
  assert.equal(
    resolveTurnModelOverride(docsTurn, { SANCHO_DOCS_ASSISTANT_MODEL: "bad model; rm -rf" }),
    DEFAULT_DOCS_ASSISTANT_MODEL,
  );
});

test("docs reviews disable runtime overhead without sending an empty tools array", () => {
  const options = buildDocsReviewReplyOptions("nan/qwen3.6");
  assert.deepEqual(options, {
    modelOverride: "nan/qwen3.6",
    thinkingLevelOverride: "off",
    fastModeOverride: true,
    bootstrapContextMode: "lightweight",
    skillFilter: [],
    suppressToolErrorWarnings: true,
    suppressDefaultToolProgressMessages: true,
  });
  assert.equal("disableTools" in options, false);
  assert.deepEqual(buildDocsReviewReplyOptions(null), {});
});
