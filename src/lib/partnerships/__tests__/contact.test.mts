import assert from "node:assert/strict";
import test from "node:test";

import * as contactPreviewModule from "../contact-preview";

const lib =
  (contactPreviewModule as unknown as { default: typeof contactPreviewModule })
    .default ?? contactPreviewModule;

test("contact preview keeps every lead and every step", () => {
  const drafts = lib.contactGateDraftsFromResponse([
    {
      leadId: "lead-1",
      providerId: "instagram:123",
      displayName: "@lista",
      handle: "@lista",
      network: "instagram",
      email: null,
      steps: [
        { subject: "Hola @lista", body: "Mensaje completo", delayDays: 0 },
        { subject: null, body: "Follow-up", delayDays: 3.4 },
      ],
    },
    {
      leadId: "lead-2",
      displayName: "@bloqueado",
      steps: [{ body: "Sobre {{anchor_topic}} y {{categoria}}", delayDays: 0 }],
    },
  ]);

  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].steps.length, 2);
  assert.equal(drafts[0].steps[1].delayDays, 3);
  assert.equal(drafts[0].ready, true);
  assert.deepEqual(drafts[1].unresolvedVariables, [
    "anchor_topic",
    "categoria",
  ]);
  assert.equal(drafts[1].ready, false);
  assert.deepEqual(lib.unresolvedVariablesFromDrafts(drafts), [
    "anchor_topic",
    "categoria",
  ]);

  const previews = lib.contactDraftPreviewsFromResponse(
    drafts.map((draft) => ({
      ...draft,
      steps: draft.steps,
    })),
  );
  assert.equal(previews.length, 2);
  assert.equal(previews[0].stepCount, 2);
  assert.equal(previews[1].ready, false);
});

test("contact preview uses stable labels without dropping an empty or invalid draft", () => {
  const drafts = lib.contactGateDraftsFromResponse([
    {
      leadId: "lead-email",
      email: "creator@example.com",
      steps: [{ body: "Body only", delayDays: 0 }],
    },
    { leadId: "empty", steps: [] },
    null,
  ]);

  assert.equal(drafts.length, 3);
  assert.equal(drafts[0].displayName, "creator@example.com");
  assert.equal(drafts[0].steps[0].subject, null);
  assert.equal(drafts[0].ready, true);
  assert.deepEqual(drafts[1].unresolvedVariables, ["sin_pasos"]);
  assert.deepEqual(drafts[2].unresolvedVariables, [
    "borrador_no_válido",
    "sin_pasos",
  ]);
  assert.equal(drafts[1].ready, false);
  assert.equal(drafts[2].ready, false);
});

test("any malformed or empty step is retained and blocks approval", () => {
  const [draft] = lib.contactGateDraftsFromResponse([
    {
      leadId: "lead-invalid",
      steps: [
        { body: "", delayDays: 0 },
        { body: "Texto", delayDays: -1 },
        "not-a-step",
      ],
    },
  ]);

  assert.equal(draft.steps.length, 3);
  assert.equal(draft.ready, false);
  assert.deepEqual(draft.unresolvedVariables, [
    "paso_no_válido",
    "paso_sin_contenido",
  ]);
});

test("contact previews are not truncated to three leads", () => {
  const response = Array.from({ length: 50 }, (_, index) => ({
    leadId: `lead-${index}`,
    displayName: `Creator ${index}`,
    steps: [{ body: `Hola creator ${index}`, delayDays: 0 }],
  }));
  assert.equal(lib.contactDraftPreviewsFromResponse(response).length, 50);
  assert.equal(lib.contactGateDraftsFromResponse(response).length, 50);
});

test("unresolved scanner supports whitespace/fallbacks and maps internal literal names", () => {
  assert.deepEqual(
    lib.unresolvedTemplateVariables(
      'Hola {{ anchor_specific }} {{nombre_perfil | "ahí"}} {{sector_plan}}',
    ),
    ["anchor_specific", "nombre", "sector"],
  );
});

test("unresolved scanner blocks empty and incomplete expressions", () => {
  assert.deepEqual(lib.unresolvedTemplateVariables("{{ }} {{sin_cierre"), [
    "sintaxis_incompleta",
    "variable_vacía",
  ]);
});
