import { test } from "node:test";
import assert from "node:assert/strict";
// CommonJS interop dance (see comments.test.mts) — named exports live on default.
import * as cardMod from "../feedback-card";
const { summarizeInsightCounts, buildFeedbackCardMessage } =
  (cardMod as unknown as { default: typeof cardMod }).default ?? cardMod;

test("summarizeInsightCounts tallies categories and total", () => {
  const counts = summarizeInsightCounts([
    { category: "skill" },
    { category: "skill" },
    { category: "client" },
    { category: "form" },
  ]);
  assert.equal(counts.skill, 2);
  assert.equal(counts.client, 1);
  assert.equal(counts.form, 1);
  assert.equal(counts.other, 0);
  assert.equal(counts.total, 4);
});

test("buildFeedbackCardMessage includes counts, doc name and review link", () => {
  const msg = buildFeedbackCardMessage(
    "brand/acme/market/current.md",
    { skill: 1, client: 1, form: 0, other: 0, total: 2 },
    "https://mc.example/dashboard/acme/intelligence#mejoras",
  );
  assert.match(msg, /current\.md/);
  assert.match(msg, /2 sugerencia/);
  assert.match(msg, /🛠️ 1 skill/);
  assert.match(msg, /👤 1 cliente/);
  assert.doesNotMatch(msg, /formulario/); // 0 form → omitted
  assert.match(msg, /\[Revisar en Mejoras\]\(https:\/\/mc\.example/);
});

test("buildFeedbackCardMessage omits the link when no reviewUrl", () => {
  const msg = buildFeedbackCardMessage(
    "d.md",
    { skill: 0, client: 0, form: 0, other: 1, total: 1 },
    "",
  );
  assert.doesNotMatch(msg, /Revisar en Mejoras/);
  assert.match(msg, /🤷 1 otros/);
});
