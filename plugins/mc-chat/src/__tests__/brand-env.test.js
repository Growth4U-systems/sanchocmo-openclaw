import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyBrandEnvToProcess,
  buildBrandRuntimeEnv,
  resolveWorkspaceDir,
} from "../brand-env.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-chat-brand-env-"));
const workspaceDir = path.join(tmp, "workspace-sancho");

fs.mkdirSync(path.join(workspaceDir, "brand", "xhyp"), { recursive: true });
fs.writeFileSync(
  path.join(tmp, ".env"),
  "FIRECRAWL_API_KEY=global-firecrawl\nSERPER_API_KEY=global-serper\n",
  "utf8",
);
fs.writeFileSync(
  path.join(workspaceDir, "brand", "xhyp", ".env"),
  "XHYP_FIRECRAWL_API_KEY=local-firecrawl\n",
  "utf8",
);

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("resolveWorkspaceDir defaults to OPENCLAW_HOME/workspace-sancho", () => {
  assert.equal(
    resolveWorkspaceDir({ OPENCLAW_HOME: "/tmp/openclaw" }),
    "/tmp/openclaw/workspace-sancho",
  );
});

test("buildBrandRuntimeEnv maps client-scoped secrets onto flat runtime names", () => {
  const env = buildBrandRuntimeEnv("xhyp", {
    workspaceDir,
    env: { FIRECRAWL_API_KEY: "process-firecrawl" },
  });

  assert.equal(env.XHYP_FIRECRAWL_API_KEY, "local-firecrawl");
  assert.equal(env.FIRECRAWL_API_KEY, "local-firecrawl");
  assert.equal(env.SERPER_API_KEY, "global-serper");
});

test("applyBrandEnvToProcess restores the previous process env", () => {
  const targetEnv = {
    FIRECRAWL_API_KEY: "process-firecrawl",
    KEEP: "1",
  };
  const restore = applyBrandEnvToProcess("xhyp", { workspaceDir, targetEnv });

  assert.equal(targetEnv.FIRECRAWL_API_KEY, "local-firecrawl");
  assert.equal(targetEnv.XHYP_FIRECRAWL_API_KEY, "local-firecrawl");
  assert.equal(targetEnv.KEEP, "1");

  restore();

  assert.equal(targetEnv.FIRECRAWL_API_KEY, "process-firecrawl");
  assert.equal(targetEnv.XHYP_FIRECRAWL_API_KEY, undefined);
  assert.equal(targetEnv.KEEP, "1");
});
