import test from "node:test";
import assert from "node:assert/strict";
import { isModelFallbackNotice } from "../delivery-filter.js";

test("recognizes OpenClaw model fallback notices", () => {
  assert.equal(
    isModelFallbackNotice("\u21aa\ufe0f Model Fallback: nan/qwen3.6 (selected anthropic/claude-opus-4-7; billing)"),
    true,
  );
  assert.equal(isModelFallbackNotice("Model Fallback: nan/qwen3.6"), true);
});

test("keeps meaningful assistant replies", () => {
  assert.equal(isModelFallbackNotice("He revisado el documento y el Brain."), false);
  assert.equal(
    isModelFallbackNotice("Model Fallback: nan/qwen3.6\nHe revisado el documento."),
    false,
  );
});
