import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTaskRouteMarkers } from "../task-route-marker.js";

test("parses and strips a task route", () => {
  const out = parseTaskRouteMarkers(
    'Voy a ubicar la tarea.\n\n:::task-route\n{"agent":"rocinante","skill":"outreach-template","name":"Plantillas de contacto","brief":"Crear plantillas para la campaña."}\n:::',
  );
  assert.equal(out.text, "Voy a ubicar la tarea.");
  assert.deepEqual(out.routes, [{
    agent: "rocinante",
    skill: "outreach-template",
    name: "Plantillas de contacto",
    brief: "Crear plantillas para la campaña.",
  }]);
  assert.deepEqual(out.malformed, []);
});

test("accepts an explicit task or a confirmed same-group creation", () => {
  const out = parseTaskRouteMarkers(
    ':::task-route\n{"name":"Research","brief":"Investiga","taskId":"P01-T03","groupId":"P01","confirmCreate":true}\n:::',
  );
  assert.deepEqual(out.routes[0], {
    name: "Research",
    brief: "Investiga",
    taskId: "P01-T03",
    groupId: "P01",
    confirmCreate: true,
  });
});

test("does not grant confirmation for truthy non-booleans", () => {
  const out = parseTaskRouteMarkers(
    ':::task-route\n{"name":"Research","brief":"Investiga","confirmCreate":"true"}\n:::',
  );
  assert.equal(out.routes[0].confirmCreate, undefined);
});

test("rejects missing names, missing briefs, and malformed JSON", () => {
  const out = parseTaskRouteMarkers(
    ':::task-route\n{"brief":"sin nombre"}\n:::\n:::task-route\n{bad}\n:::',
  );
  assert.deepEqual(out.routes, []);
  assert.equal(out.malformed.length, 2);
  assert.equal(out.text, "");
});

test("leaves delegate and ask markers alone", () => {
  const text = ':::delegate\n{"agent":"hamete","brief":"research"}\n:::\n:::ask\n{"id":"q","mode":"text","prompt":"Nombre"}\n:::';
  const out = parseTaskRouteMarkers(text);
  assert.equal(out.text, text);
  assert.deepEqual(out.routes, []);
});
