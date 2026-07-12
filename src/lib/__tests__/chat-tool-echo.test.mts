import { test } from "node:test";
import assert from "node:assert/strict";

const {
  groupChatMessages,
  isToolEcho,
  stripAskProtocol,
  stripOutboundWorkflowDebugDetails,
  toToolEvent,
} = await import("../chat-tool-echo");

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

test("stripAskProtocol hides outbound workflow metadata", () => {
  assert.equal(
    stripAskProtocol("[ask:outbound_ecp_v1] respuesta: Responsables de Growth <!--workflow-option:growth-leaders-->"),
    "Responsables de Growth",
  );
  assert.equal(
    stripAskProtocol("Responsables de Growth <!--workflow-option:growth-leaders-->"),
    "Responsables de Growth",
  );
  assert.equal(stripAskProtocol("  texto normal  "), "  texto normal  ");
});

test("stripOutboundWorkflowDebugDetails hides legacy campaign and run ids", () => {
  assert.equal(
    stripOutboundWorkflowDebugDetails([
      "Inicié la campaña para Founders y CEOs.",
      "El workflow no enviará nada sin aprobación.",
      "Campaña: `d21fde5e-a4bd-5f01-a4e4-e992fc3b126e`",
      "Run: `fe760456-294f-410e-b1d9-1cc6b0c25b4c`",
    ].join("\n")),
    "Inicié la campaña para Founders y CEOs.\nEl workflow no enviará nada sin aprobación.",
  );
  assert.equal(stripOutboundWorkflowDebugDetails("  respuesta normal  "), "  respuesta normal  ");
});
