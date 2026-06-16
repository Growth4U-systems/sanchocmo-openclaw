import { test } from "node:test";
import assert from "node:assert/strict";

// chat-openers + task-blueprints are client-safe (no fs) → load directly.
const { buildYalcThread, buildOutreachTemplateThread, buildSkillEditorThread, instantiateNamespace } = await import(
  "../chat-openers"
);
const { ownerCheckFindings } = await import("../data/task-blueprints");

const SLUG = "growth4u";

// Migrated builders must produce byte-identical output to the pre-refactor
// hardcoded versions (only the source moved: TS → manifest namespaceOwners).

test("buildYalcThread === frozen spec", () => {
  assert.deepEqual(buildYalcThread(SLUG, "hola"), {
    threadId: "growth4u:yalc",
    threadName: "YALC / GTM-OS",
    skill: "yalc-operator",
    skills: ["yalc-operator"],
    agent: "rocinante",
    linkedTo: "rocinante",
    docPath: null,
    threadState: "continue",
    initialMessage: "hola",
  });
});

test("buildOutreachTemplateThread === frozen spec (preserves {{vars}})", () => {
  assert.deepEqual(buildOutreachTemplateThread(SLUG, { id: "Seq-1", name: "Mi Seq", kind: "sequence" }), {
    threadId: "growth4u:outreach-template:seq-1",
    threadName: "Plantilla: Mi Seq",
    skill: "outreach-sequence-builder",
    skills: ["outreach-sequence-builder", "outreach-playbook"],
    agent: "rocinante",
    linkedTo: "outreach/templates/Seq-1",
    docPath: "brand/growth4u/outreach/templates/Seq-1.md",
    threadState: "continue",
    initialMessage:
      'Estoy mirando la plantilla de outreach "Mi Seq" (secuencia, brand/growth4u/outreach/templates/Seq-1.md). Puedes ajustar tono, pasos, delays o variables ({{nombre}}, {{handle}}, {{plataforma}}, {{precio}}) — propón cambios como borrador, nada se pisa sin mi OK.',
  });
});

test("skill-creator entry === frozen spec (nonce param)", () => {
  assert.deepEqual(instantiateNamespace("skill-creator", { slug: SLUG, params: { nonce: "123" } }), {
    threadId: "growth4u:skill-creator:123",
    threadName: "Crear nueva skill",
    skill: "skill-creator",
    skills: ["skill-creator"],
    agent: "cervantes",
    linkedTo: "skills/new",
    docPath: null,
    threadState: "create",
    initialMessage: "Quiero crear una nueva skill para el workspace. Guíame paso a paso.",
  });
});

test("buildSkillEditorThread === frozen spec (+ docPath override)", () => {
  assert.deepEqual(buildSkillEditorThread(SLUG, "my-skill", "My Skill"), {
    threadId: "growth4u:skill:my-skill",
    threadName: "My Skill",
    skill: "skill-creator",
    skills: ["skill-creator"],
    agent: "cervantes",
    linkedTo: "skills/my-skill",
    docPath: null,
    threadState: "continue",
  });
  assert.equal(buildSkillEditorThread(SLUG, "my-skill", "My Skill", "skills/my-skill/SKILL.md").docPath, "skills/my-skill/SKILL.md");
});

test("unknown chat entry throws", () => {
  assert.throws(() => instantiateNamespace("nope", { slug: SLUG }));
});

test("ownerCheckFindings still clean (now covers namespaceOwners openers)", () => {
  assert.deepEqual(ownerCheckFindings(), []);
});
