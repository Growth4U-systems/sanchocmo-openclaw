import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRuntimeControlReply } from "../control-reply.js";

test("temporary Sancho cannot delegate or route away", () => {
  const out = parseRuntimeControlReply(
    ':::delegate\n{"agent":"hamete","brief":"Sal de aquí"}\n:::\n:::task-route\n{"agent":"rocinante","name":"Otra","brief":"Cambia"}\n:::',
    { respondingAgent: "sancho", temporaryAgent: true },
  );
  assert.deepEqual(out.routeRequests, []);
  assert.equal(out.intervention, null);
  assert.match(out.text, /Bloqueé esa acción/);
});

test("a specialist intervention wins over a conflicting task route and is capped at one", () => {
  const out = parseRuntimeControlReply(
    ':::task-route\n{"agent":"hamete","name":"Otra","brief":"Cambia"}\n:::\n:::sancho-intervene\n{"brief":"Diagnostica uno"}\n:::\n:::sancho-intervene\n{"brief":"Diagnostica dos"}\n:::',
    { respondingAgent: "rocinante" },
  );
  assert.equal(out.intervention?.brief, "Diagnostica uno");
  assert.deepEqual(out.routeRequests, []);
  assert.ok(out.blockedCount >= 2);
  assert.match(out.text, /Bloqueé una instrucción de control/);
});

test("Sancho may delegate but a specialist may not forge delegate markers", () => {
  const marker = ':::delegate\n{"agent":"hamete","brief":"Investiga"}\n:::';
  assert.equal(parseRuntimeControlReply(marker, { respondingAgent: "sancho" }).routeRequests.length, 1);
  assert.equal(parseRuntimeControlReply(marker, { respondingAgent: "rocinante" }).routeRequests.length, 0);
});

test("blocked and malformed markers append a warning even when the model also emitted prose", () => {
  const blocked = parseRuntimeControlReply(
    'Ya lo cambié.\n\n:::delegate\n{"agent":"hamete","brief":"Investiga"}\n:::',
    { respondingAgent: "rocinante" },
  );
  assert.match(blocked.text, /^Ya lo cambié\./);
  assert.match(blocked.text, /Bloqueé una instrucción de control/);
  assert.equal(blocked.blockedCount, 1);

  const malformed = parseRuntimeControlReply(
    'Voy a moverlo.\n\n:::task-route\n{"name":"sin brief"}\n:::',
    { respondingAgent: "rocinante" },
  );
  assert.match(malformed.text, /^Voy a moverlo\./);
  assert.match(malformed.text, /instrucción de routing inválida/);
  assert.equal(malformed.malformedCount, 1);
});
