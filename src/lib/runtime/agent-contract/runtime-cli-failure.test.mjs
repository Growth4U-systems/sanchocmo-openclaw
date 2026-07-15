import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyRuntimeCliFailure } from "./runtime-cli-failure.mjs";

test("classifies incompatible runtime configuration without calling it a network failure", () => {
  const failure = classifyRuntimeCliFailure("Error: Unknown skill(s): sancho-manager", {
    provider: "hermes",
    runtimeLabel: "Hermes",
    exitCode: 1,
  });

  assert.equal(failure.errorDetail.category, "runtime_configuration");
  assert.equal(failure.errorDetail.provider, "hermes");
  assert.match(failure.text, /Runtime incompatible/);
});

test("preserves provider errors and gives unknown non-zero exits a stable fallback", () => {
  const auth = classifyRuntimeCliFailure("Error: invalid API key", {
    provider: "claude-code",
    runtimeLabel: "Claude Code",
    exitCode: 1,
  });
  assert.equal(auth.errorDetail.category, "auth");
  assert.equal(auth.errorDetail.provider, "claude-code");

  const unknown = classifyRuntimeCliFailure("unexpected CLI failure", {
    provider: "codex",
    runtimeLabel: "Codex",
    exitCode: 2,
  });
  assert.equal(unknown.errorDetail.category, "model_unavailable");
  assert.equal(unknown.text, "Codex no pudo completar este turno.");
});
