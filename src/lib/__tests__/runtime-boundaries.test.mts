import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

const REPO_ROOT = process.cwd();

const CHAT_RUNTIME_BOUNDARY_FILES = [
  "src/pages/api/chat/send.ts",
  "src/pages/api/chat/cancel.ts",
];

test("runtime-routed chat APIs do not call the OpenClaw gateway directly", () => {
  for (const relative of CHAT_RUNTIME_BOUNDARY_FILES) {
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
  }
});
