import { test } from "node:test";
import assert from "node:assert/strict";

const {
  buildGrowieSupportContext,
  buildGrowieSupportDoc,
  GROWIE_DOC_EXCERPT_MAX_CHARS,
  GROWIE_HISTORY_MAX_MESSAGES,
  GROWIE_HISTORY_MAX_TEXT_CHARS,
  GROWIE_RECENT_RUNS_MAX,
  GROWIE_RECENT_THREADS_MAX,
  GROWIE_RUN_TRACE_MAX_EVENTS,
  growieDocPathFromPagePath,
  isGrowieSupportThreadId,
  snapshotGrowieRecentRuns,
  snapshotGrowieRecentThreads,
  snapshotGrowieRunTrace,
  snapshotGrowieThreadHistory,
  supportPagePathFromReferrer,
} = await import("../support/growie");

test("recognises only canonical Growie support threads for the expected tenant", () => {
  assert.equal(isGrowieSupportThreadId("acme:support-growie-case-1", "acme"), true);
  assert.equal(isGrowieSupportThreadId("acme:support:growie-case-1", "acme"), true);
  assert.equal(isGrowieSupportThreadId("other:support-growie-case-1", "acme"), false);
  assert.equal(isGrowieSupportThreadId("acme:general", "acme"), false);
  assert.equal(isGrowieSupportThreadId("../acme:support-growie-case-1"), false);
});

test("support page evidence drops query values and malformed referrers", () => {
  assert.equal(
    supportPagePathFromReferrer("https://staging.sanchocmo.ai/dashboard/acme/tasks?token=secret#frag"),
    "/dashboard/acme/tasks",
  );
  assert.equal(supportPagePathFromReferrer("not a URL"), undefined);
});

test("builds a bounded deployed-context envelope", () => {
  assert.deepEqual(buildGrowieSupportContext({
    referrer: "https://staging.sanchocmo.ai/dashboard/acme/content",
    deployedCommit: "abc123",
    imageDigest: "sha256:def456",
    environment: "Staging",
  }), {
    pagePath: "/dashboard/acme/content",
    deployedCommit: "abc123",
    imageDigest: "sha256:def456",
    environment: "Staging",
  });
});

test("snapshots only visible canonical messages and preserves validated attachments", () => {
  const snapshot = snapshotGrowieThreadHistory([
    { role: "progress", text: "internal tool progress", ts: 1 },
    { role: "user", text: "  No encuentro el campo  ", ts: 2, attachments: [{
      url: "/uploads/growth4u/screen.png",
      filename: "screen.png",
      mimeType: "image/png",
      size: 42,
    }] },
    { role: "bot", text: "Lo reviso", ts: 3, agent: "sancho" },
    { role: "handoff", text: "internal handoff", ts: 4 },
    { role: "system", text: "Caso reabierto", ts: 5 },
  ]);

  assert.deepEqual(snapshot.map((message) => message.role), ["user", "bot", "system"]);
  assert.equal(snapshot[0].text, "No encuentro el campo");
  assert.deepEqual(snapshot[0].attachments, [{
    url: "/uploads/growth4u/screen.png",
    filename: "screen.png",
    mimeType: "image/png",
    size: 42,
  }]);
  assert.equal(snapshot[1].agent, "sancho");
});

test("canonical history snapshot prefers recent messages within both bounds", () => {
  const manyMessages = Array.from({ length: GROWIE_HISTORY_MAX_MESSAGES + 8 }, (_, index) => ({
    role: "user",
    text: `message-${index}`,
    ts: index,
  }));
  const countBounded = snapshotGrowieThreadHistory(manyMessages);

  assert.equal(countBounded.length, GROWIE_HISTORY_MAX_MESSAGES);
  assert.equal(countBounded[0].text, "message-8");
  assert.equal(countBounded.at(-1)?.text, `message-${GROWIE_HISTORY_MAX_MESSAGES + 7}`);

  const charBounded = snapshotGrowieThreadHistory(Array.from({ length: 20 }, (_, index) => ({
    role: "bot",
    text: `${index}:` + "x".repeat(3_998),
  })));
  assert.ok(charBounded.reduce((total, message) => total + message.text.length, 0)
    <= GROWIE_HISTORY_MAX_TEXT_CHARS);
  assert.equal(charBounded.at(-1)?.text.startsWith("19:"), true);
});

test("recent-thread evidence excludes support cases, sorts by recency, and stays bounded", () => {
  const threads = [
    { id: "acme:general", messageCount: 4, updatedAt: 100, lastMessage: { role: "bot", text: "x".repeat(500), ts: 100 } },
    { id: "acme:support-growie-open-case", messageCount: 9, updatedAt: 900 },
    { id: "acme:seo-plan", messageCount: 2, updatedAt: 300 },
    { id: 42, updatedAt: 999 },
    ...Array.from({ length: GROWIE_RECENT_THREADS_MAX + 5 }, (_, index) => ({
      id: `acme:thread-${index}`,
      updatedAt: index,
    })),
  ];
  const snapshot = snapshotGrowieRecentThreads(threads);

  assert.equal(snapshot.length, GROWIE_RECENT_THREADS_MAX);
  assert.equal(snapshot[0].id, "acme:seo-plan");
  assert.equal(snapshot[1].id, "acme:general");
  assert.ok(snapshot.every((thread) => !thread.id.includes("support-growie")));
  assert.ok((snapshot[1].lastMessage?.text.length ?? 0) <= 160);
});

test("recent-run evidence keeps every runtime path, newest first, errors bounded", () => {
  const runs = [
    { id: "run_old", threadId: "acme:general", status: "completed", createdAt: "2026-07-01T00:00:00Z" },
    { id: "run_new", threadId: "acme:general", status: "failed", error: "e".repeat(900), createdAt: "2026-07-19T00:00:00Z", runtime: "openclaw" },
    { id: "run_support", threadId: "acme:support-growie-case", status: "failed", createdAt: "2026-07-20T00:00:00Z" },
    { id: "run_bad" },
    ...Array.from({ length: GROWIE_RECENT_RUNS_MAX + 5 }, (_, index) => ({
      id: `run_${index}`,
      threadId: "acme:seo-plan",
      status: "completed",
      createdAt: `2026-06-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    })),
  ];
  const snapshot = snapshotGrowieRecentRuns(runs);

  assert.equal(snapshot.length, GROWIE_RECENT_RUNS_MAX);
  assert.equal(snapshot[0].id, "run_new");
  assert.equal(snapshot[0].error?.length, 300);
  assert.ok(snapshot.every((run) => !run.threadId.includes("support-growie")));
});

test("run trace keeps the newest events and stringifies bounded detail", () => {
  const events = [
    ...Array.from({ length: GROWIE_RUN_TRACE_MAX_EVENTS + 4 }, (_, index) => ({
      type: "progress",
      ts: `2026-07-19T00:00:${String(index % 60).padStart(2, "0")}Z`,
      data: { step: index },
    })),
    { type: "failed", ts: "2026-07-19T01:00:00Z", data: "d".repeat(900) },
  ];
  const trace = snapshotGrowieRunTrace("run_new", "acme:general", events);

  assert.equal(trace?.runId, "run_new");
  assert.equal(trace?.threadId, "acme:general");
  assert.equal(trace?.events.length, GROWIE_RUN_TRACE_MAX_EVENTS);
  assert.equal(trace?.events.at(-1)?.type, "failed");
  assert.equal(trace?.events.at(-1)?.detail?.length, 400);
  assert.equal(snapshotGrowieRunTrace(undefined, "acme:general", events), undefined);
});

test("doc path extraction is tenant-scoped and rejects traversal", () => {
  assert.equal(
    growieDocPathFromPagePath("/dashboard/acme/docs/brand/acme/estrategia/plan.md", "acme"),
    "brand/acme/estrategia/plan.md",
  );
  assert.equal(
    growieDocPathFromPagePath("/dashboard/acme/docs/notas%20internas/q3.md", "acme"),
    "notas internas/q3.md",
  );
  assert.equal(growieDocPathFromPagePath("/dashboard/other/docs/plan.md", "acme"), undefined);
  assert.equal(growieDocPathFromPagePath("/dashboard/acme/tasks", "acme"), undefined);
  assert.equal(growieDocPathFromPagePath("/dashboard/acme/docs/../secrets.md", "acme"), undefined);
  assert.equal(growieDocPathFromPagePath("/dashboard/acme/docs/a/%2e%2e/b.md", "acme"), undefined);
});

test("active-doc excerpt truncates and flags it", () => {
  const doc = buildGrowieSupportDoc("brand/acme/plan.md", "y".repeat(GROWIE_DOC_EXCERPT_MAX_CHARS + 50));
  assert.equal(doc?.excerpt.length, GROWIE_DOC_EXCERPT_MAX_CHARS);
  assert.equal(doc?.truncated, true);
  const short = buildGrowieSupportDoc("brand/acme/plan.md", "hola");
  assert.equal(short?.truncated, false);
});
