import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-brand-env-"));
const workspace = path.join(tmp, "workspace-sancho");
process.env.MC_WORKSPACE = workspace;

fs.mkdirSync(path.join(workspace, "brand", "xhyp"), { recursive: true });
fs.writeFileSync(
  path.join(tmp, ".env"),
  [
    "FIRECRAWL_API_KEY=global-firecrawl",
    "SERPER_API_KEY=global-serper",
    "XHYP_OPENAI_API_KEY=workspace-scoped-openai",
  ].join("\n"),
  "utf-8",
);
fs.writeFileSync(
  path.join(workspace, "brand", "xhyp", ".env"),
  [
    "XHYP_FIRECRAWL_API_KEY=local-firecrawl",
    "XHYP_NOTION_API_KEY=local-notion",
  ].join("\n"),
  "utf-8",
);

const brandEnvMod = await import("../brand-env");
const {
  brandEnvHas,
  buildBrandRuntimeEnv,
  readBrandSecret,
} = (brandEnvMod as unknown as { default: typeof brandEnvMod }).default ?? brandEnvMod;

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("readBrandSecret resolves per-client secret before global fallback", () => {
  assert.equal(readBrandSecret("xhyp", "firecrawl", "API_KEY"), "local-firecrawl");
  assert.equal(readBrandSecret("xhyp", "serper", "API_KEY"), "global-serper");
});

test("buildBrandRuntimeEnv exposes local scoped keys as flat runtime aliases", () => {
  const env = buildBrandRuntimeEnv("xhyp", {
    FIRECRAWL_API_KEY: "process-firecrawl",
    OPENAI_API_KEY: "process-openai",
  });

  assert.equal(env.XHYP_FIRECRAWL_API_KEY, "local-firecrawl");
  assert.equal(env.FIRECRAWL_API_KEY, "local-firecrawl");
  assert.equal(env.SERPER_API_KEY, "global-serper");
  assert.equal(env.OPENAI_API_KEY, "workspace-scoped-openai");
});

test("brandEnvHas treats a global flat key as fallback for a scoped client key", () => {
  assert.equal(brandEnvHas("xhyp", "XHYP_FIRECRAWL_API_KEY"), true);
  assert.equal(brandEnvHas("xhyp", "XHYP_SERPER_API_KEY"), true);
  assert.equal(brandEnvHas("xhyp", "XHYP_MISSING_API_KEY"), false);
});
