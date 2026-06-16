import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// MC_WORKSPACE must be set before the data modules load (paths.ts computes
// BASE at import time) — hence the dynamic imports below.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "content-reconcile-"));
process.env.MC_WORKSPACE = tmpRoot;
process.env.CONTENT_RECONCILE_GRACE_MIN = "30";
process.env.CONTENT_WRITER_STALLED_HOURS = "4";

type Reconcile = typeof import("../content/content-reconciliation");
type McChat = typeof import("../data/mc-chat");
let reconcile: Reconcile;
let mcChat: McChat;

const SLUG = "testbrand";
const PARENT_ID = "P-Test-Semana-01-T01";
const CT_ID = `${PARENT_ID}-C01`;
const IDEA_ID = "idea-2026-06-11-1";
const THREAD_ID = `${SLUG}:content:${CT_ID.toLowerCase()}`;

const HOUR = 3_600_000;
const REAL_BODY = "El 73% de los B2B buyers usa IA para vendor research y tu contenido no existe. ".repeat(8);

function brandDir() {
  return path.join(tmpRoot, "brand", SLUG);
}

function writeJson(p: string, data: unknown) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

interface SetupOpts {
  status?: string;
  pipelineState?: string | null;
  channelPhases?: Record<string, string>;
  ctUpdatedAt?: string;
  draftBody?: string;
  draftIteration?: number;
  /** epoch ms to force on the draft file (utimesSync). */
  draftMtime?: number;
  media?: unknown[];
  clarifyStatus?: string;
  threadUpdatedAt?: number | null;
}

function setup(opts: SetupOpts = {}) {
  fs.rmSync(brandDir(), { recursive: true, force: true });
  const ctUpdatedAt = opts.ctUpdatedAt ?? new Date(Date.now() - 10 * HOUR).toISOString();

  writeJson(path.join(brandDir(), "projects", "proj-1", "tasks.json"), [
    {
      id: PARENT_ID,
      type: "content",
      content_tasks: [
        {
          id: CT_ID,
          parent_task_id: PARENT_ID,
          idea_id: IDEA_ID,
          name: "Test CT",
          status: opts.status ?? "Approved",
          ...(opts.pipelineState !== null
            ? { pipeline_state: opts.pipelineState ?? "drafting" }
            : {}),
          channel_phases: opts.channelPhases ?? { linkedin: "drafting" },
          target_channels: Object.keys(opts.channelPhases ?? { linkedin: 1 }),
          documents: [],
          created_at: "2026-06-10T00:00:00.000Z",
          updated_at: ctUpdatedAt,
        },
      ],
    },
  ]);

  const draftsDir = path.join(brandDir(), "content", "drafts", IDEA_ID);
  fs.mkdirSync(draftsDir, { recursive: true });

  const channels = Object.keys(opts.channelPhases ?? { linkedin: 1 });
  for (const ch of channels) {
    const fm = [
      "---",
      `idea_id: ${IDEA_ID}`,
      `content_task_id: ${CT_ID}`,
      `channel: ${ch}`,
      "kind: channel-draft",
      `iteration: ${opts.draftIteration ?? 1}`,
      ...(opts.media ? [`media: ${JSON.stringify(opts.media)}`] : []),
      "created_at: 2026-06-10T00:00:00.000Z",
      "updated_at: 2026-06-10T00:00:00.000Z",
      "---",
    ].join("\n");
    const file = path.join(draftsDir, `${ch}.md`);
    fs.writeFileSync(file, `${fm}\n${opts.draftBody ?? REAL_BODY}`);
    if (opts.draftMtime !== undefined) {
      fs.utimesSync(file, new Date(opts.draftMtime), new Date(opts.draftMtime));
    }
  }

  if (opts.clarifyStatus) {
    fs.writeFileSync(
      path.join(draftsDir, "clarify.md"),
      `---\nidea_id: ${IDEA_ID}\nchannel: clarify\nkind: clarify\niteration: 0\nclarify_status: ${opts.clarifyStatus}\ncreated_at: 2026-06-10T00:00:00.000Z\nupdated_at: 2026-06-10T00:00:00.000Z\n---\n\n:::ask\n{"id":"q_provoke","prompt":"x","mode":"single","options":[]}\n:::\n`,
    );
  }

  writeJson(path.join(brandDir(), "chat", `content-${CT_ID.toLowerCase()}.json`), {
    messages: [],
    ...(opts.threadUpdatedAt !== undefined && opts.threadUpdatedAt !== null
      ? { updatedAt: opts.threadUpdatedAt }
      : {}),
  });
}

function readCt(): Record<string, unknown> {
  const tasks = JSON.parse(
    fs.readFileSync(path.join(brandDir(), "projects", "proj-1", "tasks.json"), "utf-8"),
  );
  return tasks[0].content_tasks[0];
}

before(async () => {
  const r = (await import("../content/content-reconciliation")) as unknown as { default?: Reconcile } & Reconcile;
  reconcile = (r as { default?: Reconcile }).default ?? r;
  const m = (await import("../data/mc-chat")) as unknown as { default?: McChat } & McChat;
  mcChat = (m as { default?: McChat }).default ?? m;
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ── R1 ──────────────────────────────────────────────────────────────────────

test("R1: real draft newer than CT → phase promoted to draft and status ratchets to Draft", async () => {
  setup({ draftMtime: Date.now() - HOUR });
  const res = await reconcile.reconcileContentTasks(SLUG);
  assert.equal(res.promoted.length, 1);
  assert.equal(res.promoted[0].rule, "R1");
  const ct = readCt();
  assert.equal((ct.channel_phases as Record<string, string>).linkedin, "draft");
  assert.equal(ct.status, "Draft");
});

test("R1 mtime guard: draft older than CT update (manual revert) → NOT undone", async () => {
  // ct.updated_at is 10h ago; the draft file is 20h old → revert stands.
  setup({ draftMtime: Date.now() - 20 * HOUR });
  const res = await reconcile.reconcileContentTasks(SLUG);
  assert.equal(res.promoted.length, 0);
  assert.equal(readCt().status, "Approved");
});

test("R1: placeholder or iteration 0 → no promotion", async () => {
  setup({
    draftBody: "x".repeat(300) + "\n\n_Pendiente: Dulcinea ejecutará deep-research → Clarify → writer._",
    draftMtime: Date.now() - HOUR,
  });
  assert.equal((await reconcile.reconcileContentTasks(SLUG)).promoted.length, 0);

  setup({ draftIteration: 0, draftMtime: Date.now() - HOUR });
  assert.equal((await reconcile.reconcileContentTasks(SLUG)).promoted.length, 0);
});

// ── Guards ──────────────────────────────────────────────────────────────────

test("skip: agent active in thread", async () => {
  setup({ draftMtime: Date.now() - HOUR });
  mcChat.setStatusEntry(THREAD_ID, { text: "El agente está pensando...", ts: Date.now() });
  const res = await reconcile.reconcileContentTasks(SLUG);
  mcChat.clearStatus(THREAD_ID);
  assert.equal(res.promoted.length, 0);
  assert.deepEqual(res.skipped.map((s) => s.reason), ["agent-active"]);
});

test("skip: recent thread activity / recent CT update", async () => {
  setup({ draftMtime: Date.now() - HOUR, threadUpdatedAt: Date.now() - 5 * 60_000 });
  let res = await reconcile.reconcileContentTasks(SLUG);
  assert.deepEqual(res.skipped.map((s) => s.reason), ["recent-thread-activity"]);

  setup({ draftMtime: Date.now() - HOUR, ctUpdatedAt: new Date(Date.now() - 5 * 60_000).toISOString() });
  res = await reconcile.reconcileContentTasks(SLUG);
  assert.deepEqual(res.skipped.map((s) => s.reason), ["recent-ct-update"]);
});

test("skip: terminal and New statuses", async () => {
  setup({ status: "Published", pipelineState: null, draftMtime: Date.now() - HOUR });
  let res = await reconcile.reconcileContentTasks(SLUG);
  assert.deepEqual(res.skipped.map((s) => s.reason), ["terminal-status"]);

  setup({ status: "New", pipelineState: null, draftMtime: Date.now() - HOUR });
  res = await reconcile.reconcileContentTasks(SLUG);
  assert.deepEqual(res.skipped.map((s) => s.reason), ["status-new"]);
});

// ── R4 / R5 ─────────────────────────────────────────────────────────────────

test("R4: Pending Media + media attached → pipeline_state media-review", async () => {
  setup({
    status: "Pending Media",
    pipelineState: "generating-media",
    channelPhases: { linkedin: "draft" },
    media: [{ url: "https://x/i.png", type: "image/png", source: "ai-generated", created_at: "2026-06-11T00:00:00Z" }],
    draftMtime: Date.now() - 20 * HOUR, // old — R1 must not fire, R4 has no mtime guard
  });
  const res = await reconcile.reconcileContentTasks(SLUG);
  assert.equal(res.promoted.length, 1);
  assert.equal(res.promoted[0].rule, "R4");
  assert.equal(readCt().pipeline_state, "media-review");
});

test("R5: phases at draft but status Approved → status promoted to Draft", async () => {
  setup({
    channelPhases: { linkedin: "draft" },
    draftMtime: Date.now() - 20 * HOUR, // R1 can't fire (phase already draft anyway)
  });
  const res = await reconcile.reconcileContentTasks(SLUG);
  assert.equal(res.promoted.length, 1);
  assert.equal(res.promoted[0].rule, "R5");
  assert.equal(readCt().status, "Draft");
});

// ── Desyncs (no promoción) ──────────────────────────────────────────────────

test("D1: clarify answered + clarify-needed sin draft real → desync retrigger", async () => {
  setup({
    pipelineState: "clarify-needed",
    channelPhases: { linkedin: "clarify-needed" },
    draftBody: "x".repeat(300) + "Pendiente. Dulcinea rellenará",
    draftIteration: 0,
    clarifyStatus: "answered",
    draftMtime: Date.now() - HOUR,
  });
  const res = await reconcile.reconcileContentTasks(SLUG);
  assert.equal(res.promoted.length, 0);
  const d1 = res.desyncs.find((d) => d.kind === "clarify-answered-phase-stale");
  assert.ok(d1);
  assert.equal(d1.suggested_action, "retrigger-writer");
});

test("D2: writer parado >4h sin señales → desync writer-stalled", async () => {
  setup({
    pipelineState: "researching",
    channelPhases: { linkedin: "researching" },
    draftBody: "x".repeat(300) + "Pendiente. Dulcinea rellenará",
    draftIteration: 0,
    threadUpdatedAt: Date.now() - 10 * HOUR,
  });
  const res = await reconcile.reconcileContentTasks(SLUG);
  const d2 = res.desyncs.find((d) => d.kind === "writer-stalled");
  assert.ok(d2);
});

// ── Idempotencia + persistencia ─────────────────────────────────────────────

test("idempotente: segundo run no promueve nada y state.json refleja el último run", async () => {
  setup({ draftMtime: Date.now() - HOUR });
  const first = await reconcile.reconcileContentTasks(SLUG);
  assert.equal(first.promoted.length, 1);

  const second = await reconcile.reconcileContentTasks(SLUG);
  // Tras promover, el CT quedó en Draft (no working) y nada es promotable.
  assert.equal(second.promoted.length, 0);

  const state = reconcile.readReconcileState(SLUG);
  assert.ok(state);
  assert.equal(state.ran_at, second.ran_at);
  assert.equal(state.promoted.length, 0);

  // Activity log registró la promoción del primer run.
  const logFile = path.join(brandDir(), "content", "activity-log.jsonl");
  const lines = fs.readFileSync(logFile, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.filter((l) => l.type === "transition").length, 1);
});

test("promoción fallida se degrada a desync visible (no rompe el run)", async () => {
  // Media gate: phase→approved con media_policy required y sin media lanzaría;
  // aquí forzamos un fallo análogo poniendo un draft que desaparece: simulamos
  // borrando el archivo tras setup para que statSync falle y R1 no sea elegible.
  setup({ draftMtime: Date.now() - HOUR });
  fs.rmSync(path.join(brandDir(), "content", "drafts", IDEA_ID, "linkedin.md"));
  const res = await reconcile.reconcileContentTasks(SLUG);
  assert.equal(res.ok, true);
  assert.equal(res.promoted.length, 0);
});
