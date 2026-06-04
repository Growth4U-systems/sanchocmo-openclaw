import { test } from "node:test";
import assert from "node:assert/strict";
// feedback-insights.ts is consumed as CommonJS (root package.json has no
// "type": "module"), so under tsx --test the named exports live on the
// `default` namespace — mirror the interop dance used in comments.test.mts.
import * as fbiMod from "../feedback-insights";
const {
  FeedbackInsightValidationError,
  VALID_CATEGORIES,
  MAX_TITLE,
  MAX_DETAIL,
  validateIngestPayload,
  groupInsightsByCategory,
} = (fbiMod as unknown as { default: typeof fbiMod }).default ?? fbiMod;

const validInsight = {
  category: "skill",
  title: "Research too shallow",
  detail: "The client said the research lacked depth; the skill should require >=10 sources.",
  proposedChange: "Add a hard rule: minimum 10 sources.",
  sourceCommentIds: ["cmt_1", "cmt_2"],
};

test("validateIngestPayload accepts a valid payload and sets slug", () => {
  const out = validateIngestPayload("acme", {
    runId: "fbr_abc",
    docPath: "brand/acme/market/current.md",
    skillId: "deep-research",
    insights: [validInsight],
  });
  assert.equal(out.slug, "acme");
  assert.equal(out.runId, "fbr_abc");
  assert.equal(out.skillId, "deep-research");
  assert.equal(out.insights.length, 1);
  assert.equal(out.insights[0].category, "skill");
  assert.deepEqual(out.insights[0].sourceCommentIds, ["cmt_1", "cmt_2"]);
});

test("validateIngestPayload defaults skillId to null and proposedChange to null", () => {
  const out = validateIngestPayload("acme", {
    runId: "fbr_abc",
    docPath: "brand/acme/market/current.md",
    insights: [{ category: "form", title: "Ask about B2B/B2C", detail: "We never asked the model." }],
  });
  assert.equal(out.skillId, null);
  assert.equal(out.insights[0].proposedChange, null);
  assert.deepEqual(out.insights[0].sourceCommentIds, []);
});

test("validateIngestPayload rejects an unknown category", () => {
  assert.throws(
    () => validateIngestPayload("acme", {
      runId: "fbr_abc",
      docPath: "d.md",
      insights: [{ ...validInsight, category: "nonsense" }],
    }),
    FeedbackInsightValidationError,
  );
});

test("validateIngestPayload rejects missing runId / docPath / empty insights", () => {
  assert.throws(() => validateIngestPayload("acme", { docPath: "d.md", insights: [validInsight] }), FeedbackInsightValidationError);
  assert.throws(() => validateIngestPayload("acme", { runId: "r", insights: [validInsight] }), FeedbackInsightValidationError);
  assert.throws(() => validateIngestPayload("acme", { runId: "r", docPath: "d.md", insights: [] }), FeedbackInsightValidationError);
});

test("validateIngestPayload rejects empty title / oversized detail", () => {
  assert.throws(() => validateIngestPayload("acme", {
    runId: "r", docPath: "d.md", insights: [{ ...validInsight, title: "  " }],
  }), FeedbackInsightValidationError);
  assert.throws(() => validateIngestPayload("acme", {
    runId: "r", docPath: "d.md", insights: [{ ...validInsight, detail: "x".repeat(MAX_DETAIL + 1) }],
  }), FeedbackInsightValidationError);
});

test("validateIngestPayload collapses newlines in title (no markdown-heading injection)", () => {
  const out = validateIngestPayload("acme", {
    runId: "r", docPath: "d.md",
    insights: [{ ...validInsight, title: "Research\n### Injected" }],
  });
  assert.equal(out.insights[0].title, "Research ### Injected");
  assert.doesNotMatch(out.insights[0].title, /\n/);
});

test("VALID_CATEGORIES is the expected set", () => {
  assert.deepEqual([...VALID_CATEGORIES], ["skill", "client", "form", "other"]);
  assert.ok(MAX_TITLE > 0);
});

test("groupInsightsByCategory returns all four buckets", () => {
  const rows = [
    { category: "skill" }, { category: "skill" }, { category: "form" },
  ] as Parameters<typeof groupInsightsByCategory>[0];
  const grouped = groupInsightsByCategory(rows);
  assert.equal(grouped.skill.length, 2);
  assert.equal(grouped.form.length, 1);
  assert.equal(grouped.client.length, 0);
  assert.equal(grouped.other.length, 0);
});

import * as routingMod from "../feedback-routing";
const { buildExecutionLogEntry } = (routingMod as unknown as { default: typeof routingMod }).default ?? routingMod;

test("buildExecutionLogEntry maps a skill insight to a skill-execution-log entry", () => {
  const row = {
    id: "fbi_1",
    runId: "fbr_x",
    slug: "acme",
    docPath: "brand/acme/market/current.md",
    skillId: "deep-research",
    category: "skill" as const,
    title: "Research too shallow",
    detail: "Lacked depth.",
    proposedChange: "Require >=10 sources.",
    sourceCommentIds: ["cmt_1", "cmt_2"],
    status: "new",
    routedRef: null,
    createdAt: new Date("2026-06-04T10:00:00.000Z"),
  };
  const entry = buildExecutionLogEntry(row);
  assert.equal(entry.skill, "deep-research");
  assert.equal(entry.outcome, "client-feedback");
  assert.equal(entry.session_key, "feedback:fbr_x");
  assert.equal(entry.timestamp, "2026-06-04T10:00:00.000Z");
  assert.deepEqual(entry.issues, ["Research too shallow"]);
  assert.equal(entry.improvement_hint, "Require >=10 sources.");
  assert.match(entry.notes, /cmt_1,cmt_2/);
});

test("buildExecutionLogEntry falls back to detail when no proposedChange and unknown skill", () => {
  const entry = buildExecutionLogEntry({
    id: "fbi_2", runId: "fbr_y", slug: "acme", docPath: "d.md", skillId: null,
    category: "skill" as const, title: "t", detail: "the detail", proposedChange: null,
    sourceCommentIds: [], status: "new", routedRef: null, createdAt: new Date("2026-06-04T10:00:00.000Z"),
  });
  assert.equal(entry.skill, "unknown");
  assert.equal(entry.improvement_hint, "the detail");
});
