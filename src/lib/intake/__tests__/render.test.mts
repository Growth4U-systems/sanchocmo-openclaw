import { test } from "node:test";
import assert from "node:assert/strict";
// render.ts is consumed as CommonJS (root package.json has no
// "type": "module"), so under tsx --test the named exports live on the
// `default` namespace — mirror the interop dance used in other tests.
import * as mod from "../render";
const { renderIntakeMarkdown } = (
  mod as unknown as { default: typeof mod }
).default ?? mod;

test("renders a titled markdown grouped by section with labels", () => {
  const md = renderIntakeMarkdown({
    clientName: "Acme", respondentName: "Ana", respondentEmail: "ana@acme.com",
    submittedAt: new Date("2026-06-12T10:00:00Z"),
    answers: { company_name: "Acme", elevator_pitch: "Widgets", goals: "2x" },
  });
  assert.match(md, /# Formulario inicial — Acme/);
  assert.match(md, /Ana/);
  assert.match(md, /## Empresa y oferta/);
  assert.match(md, /Nombre de la empresa/); // human label, not raw id
  assert.match(md, /Widgets/);
});

test("omits questions with no answer", () => {
  const md = renderIntakeMarkdown({
    clientName: "Acme", respondentName: "Ana", respondentEmail: null,
    submittedAt: new Date("2026-06-12T10:00:00Z"),
    answers: { company_name: "Acme" },
  });
  assert.doesNotMatch(md, /Competidores principales/);
});
