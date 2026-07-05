import { test } from "node:test";
import assert from "node:assert/strict";

const { groupChatMessages, isToolEcho, toToolEvent } = await import("../chat-tool-echo");

test("isToolEcho flags runtime echoes with unknown leading emoji", () => {
  const echoes = [
    "🐎 list files in ~/workspace-rocinante/skills/discovery-plan-builder/ → print text → find files named \"growth4u\" in ~/workspace-rocinante/brand/",
    "⚠️ 🛠️ list files in ~/workspace-rocinante/brand/ → print text",
  ];

  for (const echo of echoes) {
    assert.equal(isToolEcho(echo), true, `should flag: ${echo}`);
  }
});

test("isToolEcho leaves emoji-led Spanish replies untouched", () => {
  const replies = [
    "🐎 Listo, ya revisé el plan y no hace falta tocarlo.",
    "⚠️ Ojo: faltan URLs reales antes de lanzar la búsqueda.",
  ];

  for (const reply of replies) {
    assert.equal(isToolEcho(reply), false, `should NOT flag: ${reply}`);
  }
});

test("groupChatMessages folds unknown-emoji echoes into progress timeline", () => {
  const items = groupChatMessages([
    { role: "bot", text: "🐎 list files in ~/workspace-rocinante/brand/ → print text", ts: 1 },
    { role: "bot", text: "Listo, ya está revisado.", ts: 2 },
  ]);

  assert.equal(items.length, 2);
  assert.equal(items[0].kind, "tools");
  assert.equal(items[1].kind, "message");
});

test("toToolEvent strips multiple leading runtime glyphs", () => {
  const event = toToolEvent({
    text: "⚠️ 🛠️ list files in ~/workspace-rocinante/brand/ → print text",
    ts: 3,
  });

  assert.equal(event.kind, "read");
  assert.equal(event.label, "list files in ~/workspace-rocinante/brand/ → print text");
});
