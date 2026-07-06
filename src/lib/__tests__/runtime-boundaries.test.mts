import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

const REPO_ROOT = process.cwd();

const RUNTIME_BOUNDARY_FILES = [
  "src/pages/api/chat/send.ts",
  "src/pages/api/chat/cancel.ts",
  "src/pages/api/admin/default-model.ts",
  "src/pages/api/admin/agents/index.ts",
  "src/pages/api/admin/agents/[id]/model.ts",
  "src/pages/api/admin/auth-route.ts",
  "src/pages/api/crons/[id]/model.ts",
  "src/pages/api/crons/index.ts",
  "src/pages/api/crons/toggle.ts",
  "src/pages/api/system/cron-toggle.ts",
  "src/pages/api/system/restart-gateway.ts",
];

test("runtime-routed APIs do not call OpenClaw directly", () => {
  for (const relative of RUNTIME_BOUNDARY_FILES) {
    const source = fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");

    assert.doesNotMatch(
      source,
      /from\s+["']@\/lib\/data\/openclaw/,
      `${relative} must use @/lib/runtime instead of OpenClaw data modules`,
    );
    assert.doesNotMatch(
      source,
      /getGatewayUrl|getChatSecret|\/mc-chat\/inbound/,
      `${relative} must not know the OpenClaw gateway URL, secret, or inbound path`,
    );
    assert.doesNotMatch(
      source,
      /openclaw\s+cron|spawn\(["']openclaw["']/,
      `${relative} must route cron commands through the runtime adapter`,
    );
  }
});
