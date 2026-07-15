import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDocsReviewReplyOptions,
  buildTurnReplyOptions,
  DEFAULT_DOCS_ASSISTANT_MODEL,
  DEFAULT_GROWIE_SUPPORT_MODEL,
  resolveTurnModelOverride,
} from "../model-routing.js";

const docsTurn = {
  readOnly: true,
  source: "docs",
  slug: "growth4u",
  userId: "docs-assistant",
};

const growieTurn = {
  readOnly: true,
  source: "growie-support",
  slug: "growth4u",
  userId: "id:mc-admin",
  threadId: "growth4u:support-growie-case-1",
  channelMode: "support-diagnostic",
};

test("trusted Growie support turns use GLM 5.2", () => {
  assert.equal(resolveTurnModelOverride(growieTurn, {}), DEFAULT_GROWIE_SUPPORT_MODEL);
  assert.equal(
    resolveTurnModelOverride(growieTurn, { SANCHO_GROWIE_SUPPORT_MODEL: "fireworks/custom-growie" }),
    "fireworks/custom-growie",
  );
});

test("Growie model routing requires both read-only policy and the support namespace", () => {
  assert.equal(resolveTurnModelOverride({ ...growieTurn, readOnly: false }, {}), null);
  assert.equal(resolveTurnModelOverride({ ...growieTurn, source: "mission-control" }, {}), null);
  assert.equal(resolveTurnModelOverride({ ...growieTurn, channelMode: undefined }, {}), null);
  assert.equal(resolveTurnModelOverride({ ...growieTurn, threadId: "growth4u:general" }, {}), null);
  assert.equal(resolveTurnModelOverride({ ...growieTurn, threadId: "other:support-growie-case-1" }, {}), null);
});

test("invalid configured Growie models fail closed to GLM 5.2", () => {
  assert.equal(
    resolveTurnModelOverride(growieTurn, { SANCHO_GROWIE_SUPPORT_MODEL: "bad model; rm -rf" }),
    DEFAULT_GROWIE_SUPPORT_MODEL,
  );
});

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

test("Growie gets a strict model override, not docs-only fast-mode restrictions", () => {
  assert.deepEqual(
    buildTurnReplyOptions({ modelOverride: DEFAULT_GROWIE_SUPPORT_MODEL, source: "growie-support" }),
    {
      modelOverride: DEFAULT_GROWIE_SUPPORT_MODEL,
      modelOverrideFallbacks: [],
    },
  );
  assert.deepEqual(
    buildTurnReplyOptions({ modelOverride: DEFAULT_DOCS_ASSISTANT_MODEL, source: "docs" }),
    buildDocsReviewReplyOptions(DEFAULT_DOCS_ASSISTANT_MODEL),
  );
  assert.deepEqual(buildTurnReplyOptions({ modelOverride: null, source: "growie-support" }), {});
});
