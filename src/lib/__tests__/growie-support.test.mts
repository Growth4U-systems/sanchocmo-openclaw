import { test } from "node:test";
import assert from "node:assert/strict";

const {
  buildGrowieSupportContext,
  GROWIE_HISTORY_MAX_MESSAGES,
  GROWIE_HISTORY_MAX_TEXT_CHARS,
  isGrowieSupportThreadId,
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
