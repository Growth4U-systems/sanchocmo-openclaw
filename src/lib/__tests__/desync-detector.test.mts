import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../content/desync-detector";
import type { Draft } from "../data/drafts";
import type { ContentTask } from "../../types";

const { detectDesyncs, isRealDraftBody } = (mod as unknown as { default: typeof mod }).default ?? mod;

const NOW = Date.parse("2026-06-11T12:00:00.000Z");
const HOUR = 3_600_000;

const REAL_BODY = "El 73% de los B2B buyers usa IA para vendor research. ".repeat(10);

function draft(channel: string, over?: Partial<Draft["meta"]> & { body?: string }): Draft {
  const { body, ...meta } = over ?? {};
  return {
    meta: {
      idea_id: "idea-1",
      channel,
      kind: channel === "clarify" ? "clarify" : "channel-draft",
      iteration: 1,
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-10T00:00:00.000Z",
      ...meta,
    },
    body: body ?? REAL_BODY,
    relPath: `content/drafts/idea-1/${channel}.md`,
    absPath: `/tmp/x/content/drafts/idea-1/${channel}.md`,
  };
}

function ct(over?: Partial<ContentTask>): ContentTask {
  return {
    id: "P-Test-T01-C01",
    parent_task_id: "P-Test-T01",
    idea_id: "idea-1",
    name: "Test",
    status: "Approved",
    pipeline_state: "drafting",
    channel_phases: { linkedin: "drafting" },
    target_channels: ["linkedin"],
    documents: [],
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: new Date(NOW - 10 * HOUR).toISOString(),
    ...over,
  } as ContentTask;
}

function artifacts(over?: Partial<Parameters<typeof detectDesyncs>[0]>) {
  return {
    ct: ct(),
    parentTaskId: "P-Test-T01",
    drafts: [draft("linkedin")],
    draftMtimes: { linkedin: NOW - HOUR }, // newer than ct.updated_at (10h ago)
    threadUpdatedAt: NOW - 10 * HOUR,
    agentActive: false,
    now: NOW,
    ...over,
  };
}

// ── isRealDraftBody ─────────────────────────────────────────────────────────

test("isRealDraftBody: true for long body with iteration ≥ 1", () => {
  assert.equal(isRealDraftBody(draft("linkedin")), true);
});

test("isRealDraftBody: false for short body, iteration 0, or either placeholder", () => {
  assert.equal(isRealDraftBody(draft("linkedin", { body: "corto" })), false);
  assert.equal(isRealDraftBody(draft("linkedin", { iteration: 0 })), false);
  assert.equal(
    isRealDraftBody(draft("linkedin", { body: `x`.repeat(300) + "Pendiente. Dulcinea rellenará esto" })),
    false,
  );
  assert.equal(
    isRealDraftBody(draft("linkedin", { body: `x`.repeat(300) + "_Pendiente: Dulcinea ejecutará deep-research_" })),
    false,
  );
  assert.equal(
    isRealDraftBody(draft("linkedin", { body: `x`.repeat(300) + "Pendiente. Escudero rellenará esto" })),
    false,
  );
});

// ── R1: draft-on-disk-phase-stale ──────────────────────────────────────────

test("R1: real draft newer than ct.updated_at with stale phase → promotable", () => {
  const reports = detectDesyncs(artifacts());
  const r1 = reports.find((r) => r.kind === "draft-on-disk-phase-stale");
  assert.ok(r1);
  assert.equal(r1.channel, "linkedin");
  assert.equal(r1.promotable, true);
  assert.equal(r1.expected?.phase, "draft");
  assert.equal(r1.suggested_action, "auto-promote");
});

test("R1 mtime guard: draft OLDER than ct.updated_at → NO promotion (revert not undone)", () => {
  // Simulates a manual revert: rollback bumped ct.updated_at past the .md mtime.
  const reports = detectDesyncs(
    artifacts({ draftMtimes: { linkedin: NOW - 20 * HOUR } }),
  );
  assert.equal(reports.some((r) => r.kind === "draft-on-disk-phase-stale"), false);
});

test("R1: placeholder body or phase already draft/approved → no report", () => {
  const placeholder = artifacts({
    drafts: [draft("linkedin", { body: "x".repeat(300) + "Pendiente. Dulcinea rellenará" })],
  });
  assert.equal(
    detectDesyncs(placeholder).some((r) => r.kind === "draft-on-disk-phase-stale"),
    false,
  );
  const advanced = artifacts({ ct: ct({ channel_phases: { linkedin: "draft" }, status: "Draft", pipeline_state: undefined }) });
  assert.equal(
    detectDesyncs(advanced).some((r) => r.kind === "draft-on-disk-phase-stale"),
    false,
  );
});

// ── R4: media-attached-state-stale ──────────────────────────────────────────

test("R4: Pending Media/generating-media with media attached → promotable", () => {
  const a = artifacts({
    ct: ct({ status: "Pending Media", pipeline_state: "generating-media", channel_phases: { linkedin: "draft" } }),
    drafts: [draft("linkedin", {
      media: [{ url: "https://x/img.png", type: "image/png", source: "ai-generated", created_at: "2026-06-11T00:00:00Z" }],
    })],
  });
  const r4 = detectDesyncs(a).find((r) => r.kind === "media-attached-state-stale");
  assert.ok(r4);
  assert.equal(r4.promotable, true);
});

test("R4: no media or already media-review → no report", () => {
  const noMedia = artifacts({
    ct: ct({ status: "Pending Media", pipeline_state: "generating-media", channel_phases: { linkedin: "draft" } }),
  });
  assert.equal(detectDesyncs(noMedia).some((r) => r.kind === "media-attached-state-stale"), false);
});

// ── R5: status-behind-aggregate ─────────────────────────────────────────────

test("R5: all phases at draft but status still Approved → promotable to Draft", () => {
  const a = artifacts({
    ct: ct({ channel_phases: { linkedin: "draft", twitter: "draft" }, target_channels: ["linkedin", "twitter"] }),
    drafts: [],
  });
  const r5 = detectDesyncs(a).find((r) => r.kind === "status-behind-aggregate");
  assert.ok(r5);
  assert.equal(r5.promotable, true);
  assert.equal(r5.expected?.status, "Draft");
});

// ── D1: clarify-answered-phase-stale ────────────────────────────────────────

test("D1: clarify answered + phase clarify-needed + no real draft → desync, not promotable", () => {
  const a = artifacts({
    ct: ct({ pipeline_state: "clarify-needed", channel_phases: { linkedin: "clarify-needed" } }),
    drafts: [
      draft("clarify", { clarify_status: "answered" }),
      draft("linkedin", { body: "x".repeat(300) + "Pendiente. Dulcinea rellenará", iteration: 0 }),
    ],
  });
  const d1 = detectDesyncs(a).find((r) => r.kind === "clarify-answered-phase-stale");
  assert.ok(d1);
  assert.equal(d1.promotable, false);
  assert.equal(d1.suggested_action, "retrigger-writer");
});

// ── D2: writer-stalled ──────────────────────────────────────────────────────

test("D2: Approved working state with no activity beyond threshold → writer-stalled", () => {
  const a = artifacts({
    ct: ct({ pipeline_state: "researching", channel_phases: { linkedin: "researching" } }),
    drafts: [],
    threadUpdatedAt: NOW - 10 * HOUR,
  });
  const d2 = detectDesyncs(a, { stalledHours: 4 }).find((r) => r.kind === "writer-stalled");
  assert.ok(d2);
  assert.equal(d2.suggested_action, "retrigger-writer");
});

test("D2 suppressed by recent thread activity, active agent, or promotable findings", () => {
  const base = {
    ct: ct({ pipeline_state: "researching", channel_phases: { linkedin: "researching" } }),
    drafts: [] as Draft[],
  };
  assert.equal(
    detectDesyncs(artifacts({ ...base, threadUpdatedAt: NOW - HOUR }), { stalledHours: 4 })
      .some((r) => r.kind === "writer-stalled"),
    false,
  );
  assert.equal(
    detectDesyncs(artifacts({ ...base, agentActive: true }), { stalledHours: 4 })
      .some((r) => r.kind === "writer-stalled"),
    false,
  );
  // With a promotable R1 present, D2 stays quiet (promotion will change the picture).
  const withR1 = artifacts({
    ct: ct({ pipeline_state: "drafting", channel_phases: { linkedin: "drafting" } }),
  });
  const reports = detectDesyncs(withR1, { stalledHours: 4 });
  assert.equal(reports.some((r) => r.kind === "draft-on-disk-phase-stale"), true);
  assert.equal(reports.some((r) => r.kind === "writer-stalled"), false);
});

// ── D3: invalid-pipeline-state ──────────────────────────────────────────────

test("D3: pipeline_state outside the valid set → review desync", () => {
  const a = artifacts({
    ct: ct({ pipeline_state: "draft" as never }), // ChannelPhase leaked into pipeline_state
    drafts: [],
    draftMtimes: {},
  });
  const d3 = detectDesyncs(a).find((r) => r.kind === "invalid-pipeline-state");
  assert.ok(d3);
  assert.equal(d3.promotable, false);
  assert.equal(d3.suggested_action, "review");
});

// ── Estados que nunca se tocan ──────────────────────────────────────────────

test("terminal and New statuses produce no reports at all", () => {
  for (const status of ["New", "Published", "Discarded", "Deferred"] as const) {
    const a = artifacts({ ct: ct({ status, pipeline_state: undefined }) });
    assert.deepEqual(detectDesyncs(a), [], `status ${status}`);
  }
});
