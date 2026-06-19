import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// content-tasks resolves BASE from MC_WORKSPACE at import time (paths.ts).
// Point it at a throwaway workspace BEFORE importing the module.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ct-media-gate-"));
process.env.MC_WORKSPACE = tmp;

type CtMod = typeof import("../content-tasks");
type MfMod = typeof import("../markdown-frontmatter");
let setChannelPhase: CtMod["setChannelPhase"];
let setChannelPhases: CtMod["setChannelPhases"];
let updateContentTask: CtMod["updateContentTask"];
let findContentTask: CtMod["findContentTask"];
let MediaGateError: CtMod["MediaGateError"];
let writeFrontmatterFile: MfMod["writeFrontmatterFile"];

const SLUG = "gate-brand";
const PARENT_ID = "P-Content-Semana-01-T01";
const CT_ID = `${PARENT_ID}-C01`;
const IDEA_ID = "idea-2026-06-19-1";
const CHANNEL = "linkedin";

function brandDir() {
  return path.join(tmp, "brand", SLUG);
}

/** Reset the CT to a clean Draft state with a fresh draft on disk for `media`. */
function seedCt(opts: { media?: unknown[]; mediaPolicy?: "required" | "optional"; mediaStatus?: "pending" | "skipped" }) {
  const projDir = path.join(brandDir(), "projects", "P-Content-Semana-01");
  fs.mkdirSync(projDir, { recursive: true });
  const ct = {
    id: CT_ID,
    parent_task_id: PARENT_ID,
    idea_id: IDEA_ID,
    name: "Carousel post",
    status: "Draft",
    target_channels: [CHANNEL],
    documents: [],
    media_policy: opts.mediaPolicy ? { [CHANNEL]: opts.mediaPolicy } : undefined,
    media_status: opts.mediaStatus,
    channel_phases: { [CHANNEL]: "draft" },
    created_at: "2026-06-19T00:00:00Z",
    updated_at: "2026-06-19T00:00:00Z",
  };
  // Parent MUST be type=content (requireContentParent enforces it).
  fs.writeFileSync(
    path.join(projDir, "tasks.json"),
    JSON.stringify([{ id: PARENT_ID, type: "content", content_tasks: [ct] }], null, 2),
  );

  // Channel draft on disk — loadDraft reads media[] from its frontmatter.
  const draftPath = path.join(brandDir(), "content", "drafts", IDEA_ID, `${CHANNEL}.md`);
  writeFrontmatterFile(
    draftPath,
    {
      idea_id: IDEA_ID,
      channel: CHANNEL,
      kind: "channel-draft",
      media: opts.media ?? [],
      created_at: "2026-06-19T00:00:00Z",
      updated_at: "2026-06-19T00:00:00Z",
    },
    "body",
  );
}

const REAL_MEDIA = [
  {
    url: "https://cdn.example.com/carousel.pdf",
    type: "application/pdf",
    source: "uploaded",
    created_at: "2026-06-19T00:00:00Z",
  },
];

before(async () => {
  ({ setChannelPhase, setChannelPhases, updateContentTask, findContentTask, MediaGateError } =
    await import("../content-tasks"));
  ({ writeFrontmatterFile } = await import("../markdown-frontmatter"));
});

test("required media + empty media[] → blocks → approved (MediaGateError, 409)", () => {
  seedCt({ mediaPolicy: "required", media: [] });
  let caught: unknown;
  try {
    setChannelPhase(SLUG, PARENT_ID, CT_ID, CHANNEL, "approved");
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof MediaGateError, "expected a MediaGateError");
  assert.equal((caught as InstanceType<typeof MediaGateError>).statusCode, 409);
  // Phase must NOT have advanced.
  const ct = findContentTask(SLUG, PARENT_ID, CT_ID)!;
  assert.equal(ct.channel_phases?.[CHANNEL], "draft");
});

test("required media + real media[] → advances to approved", () => {
  seedCt({ mediaPolicy: "required", media: REAL_MEDIA });
  const ct = setChannelPhase(SLUG, PARENT_ID, CT_ID, CHANNEL, "approved");
  assert.equal(ct.channel_phases?.[CHANNEL], "approved");
});

test("required media + empty media[] + media_status='skipped' → advances (explicit escape)", () => {
  seedCt({ mediaPolicy: "required", media: [], mediaStatus: "skipped" });
  const ct = setChannelPhase(SLUG, PARENT_ID, CT_ID, CHANNEL, "approved");
  assert.equal(ct.channel_phases?.[CHANNEL], "approved");
});

test("optional media + empty media[] → advances (gate only fires for required)", () => {
  seedCt({ mediaPolicy: "optional", media: [] });
  const ct = setChannelPhase(SLUG, PARENT_ID, CT_ID, CHANNEL, "approved");
  assert.equal(ct.channel_phases?.[CHANNEL], "approved");
});

test("bulk setChannelPhases: required + empty → blocks", () => {
  seedCt({ mediaPolicy: "required", media: [] });
  assert.throws(
    () => setChannelPhases(SLUG, PARENT_ID, CT_ID, { [CHANNEL]: "approved" }),
    MediaGateError,
  );
  const ct = findContentTask(SLUG, PARENT_ID, CT_ID)!;
  assert.equal(ct.channel_phases?.[CHANNEL], "draft");
});

test("bulk setChannelPhases: skipped escape → advances", () => {
  seedCt({ mediaPolicy: "required", media: [], mediaStatus: "skipped" });
  const ct = setChannelPhases(SLUG, PARENT_ID, CT_ID, { [CHANNEL]: "approved" });
  assert.equal(ct.channel_phases?.[CHANNEL], "approved");
});

test("updateContentTask persists media_status (PATCH-writable escape field)", () => {
  seedCt({ mediaPolicy: "required", media: [] });
  const ct = updateContentTask(SLUG, PARENT_ID, CT_ID, { media_status: "skipped" });
  assert.equal(ct.media_status, "skipped");
});
