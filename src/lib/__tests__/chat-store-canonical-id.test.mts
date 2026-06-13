import { test } from "node:test";
import assert from "node:assert/strict";

// The chat store is client-safe (zustand + chat-openers types only, no fs).
const { useChatStore } = await import("../../stores/chat");
const { canonicalThreadId } = await import("../thread-id");

const reset = () =>
  useChatStore.setState({ currentThread: null, localThreads: [], localThreadNames: {}, threadMeta: {} });

const cfg = (threadId: string, threadName: string) => ({
  threadId,
  threadName,
  skill: "x",
  skills: ["x"],
  linkedTo: "x",
  docPath: null,
  threadState: "create" as const,
});

// SAN-193 (global): a builder mints a colon-shaped id; the storage layer lists
// it back in dash form. The store must register the CANONICAL (dash) id so the
// dedup in useThreadList (`server.id === localThread`) matches → no phantom row.
for (const [label, rawId] of [
  ["discovery", "acme:discovery:new-123"],
  ["task", "acme:task:p14-t01"],
  ["content", "acme:content:p-content-semana-24-t05-c02"],
  ["skill", "acme:skill:my-skill"],
] as const) {
  test(`openSidebar(${label}) registers the canonical id + keys meta by it`, () => {
    reset();
    const c = cfg(rawId, "X");
    useChatStore.getState().openSidebar(c);

    const canon = canonicalThreadId(rawId);
    const st = useChatStore.getState();

    assert.equal(st.currentThread, canon, "currentThread must be canonical");
    assert.deepEqual(st.localThreads, [canon], "localThreads must hold only the canonical id");
    assert.ok(st.threadMeta[canon], "threadMeta must be keyed by the canonical id");
    assert.equal(st.localThreadNames[canon], "X");
    // The server lists the dash form — that exact id must already be present,
    // so useThreadList's `threads.some(t => t.id === tid)` dedup matches.
    assert.equal(st.localThreads[0], canon);
    assert.ok(!st.currentThread!.slice("acme:".length).includes(":"), "no inner colon survives");
  });
}

test("selectThread + getThreadMeta round-trip on the canonical id (colon lookup still resolves)", () => {
  reset();
  useChatStore.getState().selectThread(cfg("acme:task:p14-t01", "Task"));
  const canon = canonicalThreadId("acme:task:p14-t01");
  assert.equal(useChatStore.getState().currentThread, canon);
  // A caller that still holds the colon-shaped id resolves the same meta.
  assert.ok(useChatStore.getState().getThreadMeta("acme:task:p14-t01"));
  assert.ok(useChatStore.getState().getThreadMeta(canon));
});

reset();
