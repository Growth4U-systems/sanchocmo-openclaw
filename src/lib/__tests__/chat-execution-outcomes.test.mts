import assert from "node:assert/strict";
import test from "node:test";
import { collapseExecutionOutcomes } from "../chat-execution-outcomes";
import type { ChatMessage } from "@/hooks/useChat";

function message(value: Partial<ChatMessage> & Pick<ChatMessage, "role" | "text">): ChatMessage {
  return value as ChatMessage;
}

test("collapses the three terminal cards from the broken outbound thread", () => {
  const messages = collapseExecutionOutcomes([
    message({ role: "user", text: "Crea la campaña", ts: 1 }),
    message({
      role: "bot",
      text: "Ejecución detenida por presupuesto",
      ts: 2,
      errorDetail: { category: "cost_guard", raw: "budget", classifiedAt: 2 },
    }),
    message({ role: "bot", text: "El runtime terminó sin devolver respuesta visible.", ts: 3 }),
    message({ role: "bot", text: "Ejecución detenida.", ts: 4 }),
  ]);

  assert.deepEqual(messages.map((item) => item.text), [
    "Crea la campaña",
    "Ejecución detenida por presupuesto",
  ]);
});

test("turns a standalone empty runtime reply into one recoverable error", () => {
  const messages = collapseExecutionOutcomes([
    message({ role: "user", text: "Continúa", ts: 1 }),
    message({ role: "bot", text: "El runtime terminó sin devolver respuesta visible.", ts: 2 }),
  ]);

  assert.equal(messages[1].errorDetail?.category, "model_unavailable");
});

test("a new user turn resets terminal outcome consolidation", () => {
  const messages = collapseExecutionOutcomes([
    message({ role: "bot", text: "Ejecución detenida.", ts: 1 }),
    message({ role: "user", text: "Prueba otra vez", ts: 2 }),
    message({ role: "bot", text: "Ejecución detenida.", ts: 3 }),
  ]);

  assert.equal(messages.length, 3);
});
