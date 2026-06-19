import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// MC_WORKSPACE must be set before the data modules are imported (lib/data/paths
// computes BASE at module load), so everything below uses dynamic import.
// Same pattern as clarify-autostatus.test.mts.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "drafts-events-"));
process.env.MC_WORKSPACE = tmpRoot;

type DraftsMod = typeof import("../drafts");
type EventsMod = typeof import("../events");
let updateDraft: DraftsMod["updateDraft"];
let subscribe: EventsMod["subscribe"];

const SLUG = "testbrand";
const IDEA_ID = "idea-2026-06-10-2";
const CHANNEL = "linkedin";

function writeDraft(clarifyStatus = "pending") {
  const draftPath = path.join(
    tmpRoot, "brand", SLUG, "content", "drafts", IDEA_ID, `${CHANNEL}.md`,
  );
  fs.mkdirSync(path.dirname(draftPath), { recursive: true });
  const fm = [
    "---",
    `idea_id: ${IDEA_ID}`,
    "content_task_id: P-Test-Semana-01-T01-C01",
    `channel: ${CHANNEL}`,
    "kind: channel-draft",
    "iteration: 0",
    `clarify_status: ${clarifyStatus}`,
    "created_at: 2026-06-10T00:00:00.000Z",
    "updated_at: 2026-06-10T00:00:00.000Z",
    "---",
  ].join("\n");
  fs.writeFileSync(draftPath, `${fm}\nBody text.`);
  return draftPath;
}

before(async () => {
  ({ updateDraft } = await import("../drafts"));
  ({ subscribe } = await import("../events"));
});

beforeEach(() => {
  fs.rmSync(path.join(tmpRoot, "brand", SLUG), { recursive: true, force: true });
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("SAN-244 · updateDraft emits a draft-updated event with {slug, ideaId, channel}", () => {
  writeDraft();

  const seen: import("../events").ContentEngineEvent[] = [];
  const unsubscribe = subscribe(SLUG, (ev) => seen.push(ev));
  try {
    updateDraft(SLUG, IDEA_ID, CHANNEL, { meta: { clarify_status: "answered" } });
  } finally {
    unsubscribe();
  }

  const drafted = seen.filter((e) => e.type === "draft-updated");
  assert.equal(drafted.length, 1, "exactly one draft-updated event");
  assert.deepEqual(drafted[0], {
    type: "draft-updated",
    slug: SLUG,
    ideaId: IDEA_ID,
    channel: CHANNEL,
  });
});

test("SAN-244 · a body-only write also emits (covers UI edits)", () => {
  writeDraft();

  const seen: import("../events").ContentEngineEvent[] = [];
  const unsubscribe = subscribe(SLUG, (ev) => seen.push(ev));
  try {
    updateDraft(SLUG, IDEA_ID, CHANNEL, { body: "Edited body." });
  } finally {
    unsubscribe();
  }

  assert.equal(seen.filter((e) => e.type === "draft-updated").length, 1);
});

test("SAN-244 · does NOT emit when the write throws (no draft / invalid meta)", () => {
  // No draft on disk → updateDraft throws before persisting; nothing must emit.
  const seen: import("../events").ContentEngineEvent[] = [];
  const unsubscribe = subscribe(SLUG, (ev) => seen.push(ev));
  try {
    assert.throws(() =>
      updateDraft(SLUG, IDEA_ID, CHANNEL, { meta: { clarify_status: "answered" } }),
    );
    // Invalid clarify_status on an existing draft also throws pre-write.
    writeDraft();
    assert.throws(() =>
      updateDraft(SLUG, IDEA_ID, CHANNEL, {
        meta: { clarify_status: "bogus" as never },
      }),
    );
  } finally {
    unsubscribe();
  }

  assert.equal(
    seen.filter((e) => e.type === "draft-updated").length,
    0,
    "no event on failed writes",
  );
});
