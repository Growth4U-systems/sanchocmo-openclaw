import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point BASE at a throwaway workspace BEFORE importing the routing module
// (paths.ts captures process.env.MC_WORKSPACE at module-load time).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fbi-routing-"));
process.env.MC_WORKSPACE = TMP;

const routingMod = await import("../feedback-routing");
const { routeAcceptedInsight } =
  (routingMod as unknown as { default: typeof routingMod }).default ?? routingMod;

function row(over: Record<string, unknown>) {
  return {
    id: "fbi_1",
    runId: "fbr_x",
    slug: "acme",
    docPath: "brand/acme/market/current.md",
    skillId: "deep-research",
    category: "skill",
    title: "t",
    detail: "d",
    proposedChange: "pc",
    sourceCommentIds: ["cmt_1"],
    status: "new",
    routedRef: null,
    createdAt: new Date("2026-06-04T10:00:00.000Z"),
    ...over,
  };
}

test("routeAcceptedInsight (skill) appends a JSON line to _system/skill-execution-log.jsonl", () => {
  const ref = routeAcceptedInsight(row({ category: "skill" }) as never);
  assert.equal(ref, "_system/skill-execution-log.jsonl");
  const file = path.join(TMP, "_system", "skill-execution-log.jsonl");
  const content = fs.readFileSync(file, "utf-8").trim();
  const parsed = JSON.parse(content.split("\n").pop() as string);
  assert.equal(parsed.skill, "deep-research");
  assert.equal(parsed.outcome, "client-feedback");
  assert.equal(parsed.improvement_hint, "pc");
});

test("routeAcceptedInsight (client) appends to brand/<slug>/client-preferences.md", () => {
  const ref = routeAcceptedInsight(row({ category: "client", title: "short emails" }) as never);
  assert.equal(ref, "brand/acme/client-preferences.md");
  const file = path.join(TMP, "brand", "acme", "client-preferences.md");
  assert.match(fs.readFileSync(file, "utf-8"), /short emails/);
});

test("routeAcceptedInsight (form) appends to _system/onboarding-form-backlog.md", () => {
  const ref = routeAcceptedInsight(row({ category: "form", title: "ask B2B/B2C" }) as never);
  assert.equal(ref, "_system/onboarding-form-backlog.md");
  const file = path.join(TMP, "_system", "onboarding-form-backlog.md");
  assert.match(fs.readFileSync(file, "utf-8"), /ask B2B\/B2C/);
});

test("routeAcceptedInsight (other) is a no-op returning 'none'", () => {
  const ref = routeAcceptedInsight(row({ category: "other" }) as never);
  assert.equal(ref, "none");
});
