import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspace = process.cwd();
const cancelApi = fs.readFileSync(
  path.join(workspace, "src/pages/api/chat/cancel.ts"),
  "utf8",
);
const plugin = fs.readFileSync(
  path.join(workspace, "plugins/mc-chat/src/index.js"),
  "utf8",
);

test("chat cancel aborts the active OpenClaw turn", () => {
  assert.match(plugin, /mcChatCostGuard\.cancelRun\(/);
  assert.match(
    plugin,
    /cancelled,\s*chatId,\s*finalText,\s*finalAgent: requestedAgent,/,
  );
  assert.match(
    plugin,
    /message: cancelled[\s\S]*\? "Active turn cancelled"[\s\S]*: "No active turn found"/,
  );
});

test("chat cancel records one terminal note only for an active run", () => {
  assert.match(
    cancelApi,
    /durableCancellationPending[\s\S]*Cancelación solicitada\. Esperando confirmación de las tareas activas\.[\s\S]*Ejecución detenida\./,
  );
  assert.match(cancelApi, /alreadyStopped: !activeRun/);
  assert.match(cancelApi, /runtimeCancelled/);
});
