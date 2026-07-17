import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const AUTHORITY_IMPORT = "@/lib/runtime/chat-agent-turn-dispatch-authority";
const REMOTE_WORKER_IMPORT = "@/lib/chat/agent-turn-remote-worker";

const authorityConsumers = [
  "src/pages/api/runtime/leads-search.ts",
  "src/pages/api/runtime/partnerships-discovery.ts",
  "src/pages/api/runtime/chat-turn-authority.ts",
  "src/pages/api/runtime/chat-agent-turn-dispatch.ts",
  "src/pages/api/chat/context-pack.ts",
  "src/pages/api/chat/webhook.ts",
  "src/pages/api/chat/send.ts",
];

test("product and chat routes depend on the small dispatch authority, not the remote worker", () => {
  for (const path of authorityConsumers) {
    const source = readFileSync(path, "utf8");
    assert.match(source, new RegExp(AUTHORITY_IMPORT), path);
    if (path !== "src/pages/api/runtime/chat-agent-turn-dispatch.ts") {
      assert.doesNotMatch(source, new RegExp(REMOTE_WORKER_IMPORT), path);
    }
  }
});

test("the generic authority stays product-neutral and the worker shares its chat adapter", () => {
  const genericAuthority = readFileSync(
    "src/lib/runtime/dispatch-lease-authority.ts",
    "utf8",
  );
  const chatAuthority = readFileSync(
    "src/lib/runtime/chat-agent-turn-dispatch-authority.ts",
    "utf8",
  );
  const worker = readFileSync(
    "src/lib/chat/agent-turn-remote-worker.ts",
    "utf8",
  );

  assert.doesNotMatch(genericAuthority, /@\/lib\/chat\//);
  assert.doesNotMatch(chatAuthority, /agent-turn-remote-worker/);
  assert.match(worker, new RegExp(AUTHORITY_IMPORT));
});
