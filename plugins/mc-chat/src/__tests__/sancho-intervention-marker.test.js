import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSanchoInterventionMarkers } from "../sancho-intervention-marker.js";

test("parses and strips a temporary Sancho intervention", () => {
  const out = parseSanchoInterventionMarkers(
    'Pido ayuda puntual.\n\n:::sancho-intervene\n{"brief":"Diagnostica por qué falló el runtime sin cambiar esta tarea.","reason":"Es un problema del sistema, no de outreach."}\n:::',
  );
  assert.equal(out.text, "Pido ayuda puntual.");
  assert.deepEqual(out.interventions, [{
    brief: "Diagnostica por qué falló el runtime sin cambiar esta tarea.",
    reason: "Es un problema del sistema, no de outreach.",
  }]);
  assert.deepEqual(out.malformed, []);
});

test("requires a non-empty brief", () => {
  const out = parseSanchoInterventionMarkers(
    ':::sancho-intervene\n{"reason":"meta"}\n:::',
  );
  assert.deepEqual(out.interventions, []);
  assert.equal(out.malformed.length, 1);
  assert.equal(out.text, "");
});

test("leaves task-route and delegate markers untouched", () => {
  const text = ':::task-route\n{"name":"A","brief":"B"}\n:::\n:::delegate\n{"agent":"hamete","brief":"C"}\n:::';
  const out = parseSanchoInterventionMarkers(text);
  assert.equal(out.text, text);
  assert.deepEqual(out.interventions, []);
});

test("strips an unterminated intervention tail and records it as malformed", () => {
  const out = parseSanchoInterventionMarkers(
    'Respuesta visible.\n\n:::sancho-intervene\n{"brief":"Diagnostica"}',
  );
  assert.equal(out.text, "Respuesta visible.");
  assert.deepEqual(out.interventions, []);
  assert.equal(out.malformed.length, 1);
});
