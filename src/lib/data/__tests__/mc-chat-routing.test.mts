import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-chat-routing-"));
process.env.MC_WORKSPACE = tmp;

const mod = await import("../mc-chat");
const chat = (mod as unknown as { default: typeof mod }).default ?? mod;

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("durable routing survives message writes and thread listing", () => {
  const threadId = "acme:discovery-new-1";
  chat.setThreadRouting(threadId, {
    agent: "rocinante",
    scope: "agent",
    skillMode: "auto",
    skillHint: "discovery-plan-builder",
    availableSkills: ["discovery-plan-builder", "yalc-operator"],
    updatedAt: 1234,
  });
  chat.addMessage(threadId, "user", "Corrige la audiencia");

  const persisted = chat.getThreadRouting(threadId);
  assert.equal(persisted?.agent, "rocinante");
  assert.equal(persisted?.skillMode, "auto");
  assert.equal(persisted?.scope, "agent");
  assert.equal(persisted?.skillHint, "discovery-plan-builder");
  assert.equal(persisted?.updatedAt, 1234);
  assert.ok(persisted?.availableSkills?.includes("discovery-plan-builder"));
  assert.ok(persisted?.availableSkills?.includes("yalc-operator"));

  const listed = chat.listThreadsForSlug("acme").find((thread) => thread.id === threadId);
  assert.equal(listed?.routing?.agent, "rocinante");
  assert.equal(listed?.routing?.skillMode, "auto");
  assert.equal(listed?.lastMessage?.text, "Corrige la audiencia");
});
