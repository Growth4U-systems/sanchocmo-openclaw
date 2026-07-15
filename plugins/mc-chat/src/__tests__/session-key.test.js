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
    buildAgentSessionKey("sancho", "channel:mc-chat:example:new-task-1", cfg),
    "agent:sancho:model:fireworks_accounts_fireworks_models_glm-5p2:channel:mc-chat:example:new-task-1",
  );
});

test("buildAgentSessionKey isolates a one-turn model override", () => {
  const cfg = {
    agents: {
      list: [{ id: "sancho", model: "anthropic/claude-opus-4-7" }],
    },
  };

  assert.equal(
    buildAgentSessionKey(
      "sancho",
      "channel:mc-chat:growth4u:docs-123",
      cfg,
      "nan/qwen3.6",
    ),
    "agent:sancho:model:nan_qwen3.6:channel:mc-chat:growth4u:docs-123",
  );
});

test("switching Growie from the configured model to GLM creates a distinct session boundary", () => {
  const cfg = {
    agents: {
      list: [{ id: "sancho", model: "anthropic/claude-opus-4-7" }],
    },
  };
  const chatId = "channel:mc-chat:growth4u:support-growie-case-1";
  const configuredSession = buildAgentSessionKey("sancho", chatId, cfg);
  const glmSession = buildAgentSessionKey(
    "sancho",
    chatId,
    cfg,
    "fireworks/accounts/fireworks/models/glm-5p2",
  );

  assert.notEqual(configuredSession, glmSession);
  assert.match(configuredSession, /model:anthropic_claude-opus-4-7:/);
  assert.match(glmSession, /model:fireworks_accounts_fireworks_models_glm-5p2:/);
});
