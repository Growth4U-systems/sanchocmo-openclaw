import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspace = process.cwd();
const cancelApi = fs.readFileSync(path.join(workspace, "src/pages/api/chat/cancel.ts"), "utf8");
const plugin = fs.readFileSync(path.join(workspace, "plugins/mc-chat/src/index.js"), "utf8");

test("chat cancel aborts the active OpenClaw turn", () => {
  assert.match(plugin, /mcChatCostGuard\.cancelRun\(/);
  assert.match(plugin, /cancelled,\s*message: cancelled/);
});

test("chat cancel persists an immediate terminal message for the UI", () => {
  assert.match(cancelApi, /addMessage\(tid, "bot", "Ejecución detenida\."/);
  assert.match(cancelApi, /runtimeCancelled/);
});
