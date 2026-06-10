import { test } from "node:test";
import assert from "node:assert/strict";
// env-file.ts is consumed as CommonJS by Next.js (root package.json has no
// "type": "module"), so under tsx --test the named exports live on `default`.
import * as ef from "../env-file";
const { parseEnvContent, upsertEnvContent, removeKeysFromEnvContent } =
  (ef as unknown as { default: typeof ef }).default ?? ef;

test("removeKeysFromEnvContent drops only the targeted key, preserves the rest", () => {
  const env = ["# comment", "FOO=bar", "ANTHROPIC_API_KEY=sk-ant-api-xxx", "", "OPENAI_API_KEY=sk-openai"].join("\n");
  const out = removeKeysFromEnvContent(env, ["ANTHROPIC_API_KEY"]);
  const parsed = parseEnvContent(out);
  assert.equal("ANTHROPIC_API_KEY" in parsed, false);
  assert.equal(parsed.FOO, "bar");
  assert.equal(parsed.OPENAI_API_KEY, "sk-openai");
  assert.ok(out.includes("# comment"), "comments preserved");
});

test("removeKeysFromEnvContent removes a multi-field service (e.g. dataforseo)", () => {
  const env = "DATAFORSEO_LOGIN=a\nDATAFORSEO_PASSWORD=b\nKEEP=1";
  const out = removeKeysFromEnvContent(env, ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]);
  const parsed = parseEnvContent(out);
  assert.equal("DATAFORSEO_LOGIN" in parsed, false);
  assert.equal("DATAFORSEO_PASSWORD" in parsed, false);
  assert.equal(parsed.KEEP, "1");
});

test("removeKeysFromEnvContent matches keys exactly (no prefix collision)", () => {
  const env = "ANTHROPIC_API_KEY=sk\nANTHROPIC_API=other";
  const out = removeKeysFromEnvContent(env, ["ANTHROPIC_API"]);
  const parsed = parseEnvContent(out);
  assert.equal(parsed.ANTHROPIC_API_KEY, "sk", "must NOT remove the longer key");
  assert.equal("ANTHROPIC_API" in parsed, false);
});

test("removeKeysFromEnvContent is a no-op for an absent key", () => {
  const env = "A=1\nB=2";
  assert.equal(removeKeysFromEnvContent(env, ["NOPE"]), env);
});

test("upsertEnvContent updates existing keys and appends new ones", () => {
  const out = upsertEnvContent("A=1\nB=2", { A: "9", C: "3" });
  const parsed = parseEnvContent(out);
  assert.equal(parsed.A, "9");
  assert.equal(parsed.B, "2");
  assert.equal(parsed.C, "3");
});
