import { test } from "node:test";
import assert from "node:assert/strict";

const { buildMediaAssetThread, buildVisualIdentityChatThread } = await import("../chat-openers");
const { ownerCheckFindings } = await import("../data/task-blueprints");

const SLUG = "growth4u";

test("buildMediaAssetThread === frozen spec (kind→skill + sanitized id + docKind)", () => {
  assert.deepEqual(buildMediaAssetThread(SLUG, "brand-book/logos/main.png", "Main Logo", "logo"), {
    threadId: "growth4u:asset:brand-book-logos-main-png",
    threadName: "🎨 Main Logo",
    skill: "od-refine",
    skills: ["od-refine", "od-generate", "od-export"],
    agent: "maese-pedro",
    linkedTo: "media-creation/asset/brand-book/logos/main.png",
    docPath: "brand/growth4u/brand-book/logos/main.png",
    threadState: "continue",
    initialMessage: 'Estoy mirando el asset "Main Logo" (`brand-book/logos/main.png`, kind=logo). Dame un resumen y las opciones de refinamiento.',
    docKind: "file",
  });
  // design-md → design-system skill; template → docKind template
  assert.equal(buildMediaAssetThread(SLUG, "x/DESIGN.md", "D", "design-md").skill, "design-system");
  assert.equal(buildMediaAssetThread(SLUG, "x/t", "T", "template").docKind, "template");
});

test("buildVisualIdentityChatThread === frozen spec (no block / block)", () => {
  assert.deepEqual(buildVisualIdentityChatThread(SLUG), {
    threadId: "growth4u:visual-identity:all",
    threadName: "🎨 Visual Identity",
    skill: "design-system",
    skills: ["design-system", "od-generate"],
    agent: "maese-pedro",
    linkedTo: "media-creation/visual-identity/all",
    docPath: "brand/growth4u/brand-book/visual-identity/DESIGN.md",
    threadState: "continue",
    initialMessage: "Hablemos del Visual Identity del brand. ¿Por dónde empezamos?",
  });
  const withBlock = buildVisualIdentityChatThread(SLUG, "Colores");
  assert.equal(withBlock.threadId, "growth4u:visual-identity:colores");
  assert.equal(withBlock.threadName, "🎨 Visual Identity — Colores");
  assert.equal(withBlock.initialMessage, 'Quiero ajustar la sección "Colores" del Visual Identity. ¿Qué opciones tengo?');
});

test("owner-check clean (now incl. media-asset + visual-identity entries)", () => {
  assert.deepEqual(ownerCheckFindings(), []);
});
