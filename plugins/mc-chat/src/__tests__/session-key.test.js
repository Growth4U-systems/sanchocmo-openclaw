import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAgentSessionKey, modelSessionSlug, resolveAgentModel } from "../session-key.js";

test("resolveAgentModel prefers the explicit agent model", () => {
  const cfg = {
    agents: {
      defaults: { model: { primary: "codex/gpt-5.5" } },
      list: [{ id: "sancho", model: "fireworks/accounts/fireworks/models/glm-5p2" }],
    },
  };

  assert.equal(resolveAgentModel(cfg, "sancho"), "fireworks/accounts/fireworks/models/glm-5p2");
});

test("resolveAgentModel falls back to the default primary model", () => {
  const cfg = {
    agents: {
      defaults: { model: { primary: "fireworks/accounts/fireworks/models/glm-5p2" } },
      list: [{ id: "hamete" }],
    },
  };

  assert.equal(resolveAgentModel(cfg, "hamete"), "fireworks/accounts/fireworks/models/glm-5p2");
});

test("modelSessionSlug converts provider paths into session-safe ids", () => {
  assert.equal(
    modelSessionSlug("fireworks/accounts/fireworks/models/glm-5p2"),
    "fireworks_accounts_fireworks_models_glm-5p2",
  );
  assert.equal(modelSessionSlug(""), "default");
});

test("buildAgentSessionKey keeps the agent prefix and includes the model slug", () => {
  const cfg = {
    agents: {
      defaults: { model: { primary: "codex/gpt-5.5" } },
      list: [{ id: "sancho", model: "fireworks/accounts/fireworks/models/glm-5p2" }],
    },
  };

  assert.equal(
    buildAgentSessionKey("sancho", "channel:mc-chat:hospital-capilar:new-task-1", cfg),
    "agent:sancho:model:fireworks_accounts_fireworks_models_glm-5p2:channel:mc-chat:hospital-capilar:new-task-1",
  );
});
