import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

// MC_WORKSPACE must be set before the data modules are imported (lib/data/paths
// computes BASE at module load), so everything below uses dynamic import.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clarify-autostatus-"));
process.env.MC_WORKSPACE = tmpRoot;

type Mod = typeof import("../clarify-autostatus");
let mod: Mod;

const SLUG = "testbrand";
const PARENT_ID = "P-Test-Semana-01-T01";
const CT_ID = `${PARENT_ID}-C01`;
const IDEA_ID = "idea-2026-06-10-2";
const THREAD_ID = `${SLUG}:content:${CT_ID.toLowerCase()}`;

const CLARIFY_BODY_BLOCK = `
# Clarify · hot_take

Intro text.

:::ask
{"id":"q_provoke","prompt":"¿Con cuál abrimos?","mode":"single","options":[{"id":"a","label":"A"},{"id":"other","label":"Otro (lo escribo)"}]}
:::

More text.

:::ask
{"id":"q_evidence","prompt":"¿Qué dato?","mode":"single","options":[{"id":"a","label":"A"},{"id":"other","label":"Otro (lo escribo)"}]}
:::
`;

function writeJson(p: string, data: unknown) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function setupWorkspace(opts?: {
  clarifyBody?: string;
  clarifyStatus?: string;
  threadMessages?: { role: string; text: string; ts: number }[];
}) {
  const brand = path.join(tmpRoot, "brand", SLUG);
  fs.rmSync(brand, { recursive: true, force: true });

  writeJson(path.join(brand, "projects", "proj-1", "tasks.json"), [
    {
      id: PARENT_ID,
      content_tasks: [
        {
          id: CT_ID,
          parent_task_id: PARENT_ID,
          idea_id: IDEA_ID,
          name: "Test CT",
          status: "Approved",
          pipeline_state: "clarify-needed",
          channel_phases: { linkedin: "clarify-needed" },
          target_channels: ["linkedin"],
          documents: [],
          created_at: "2026-06-10T00:00:00.000Z",
          updated_at: "2026-06-10T00:00:00.000Z",
        },
      ],
    },
  ]);

  const clarifyPath = path.join(
    brand, "content", "drafts", IDEA_ID, "clarify.md",
  );
  fs.mkdirSync(path.dirname(clarifyPath), { recursive: true });
  const fm = [
    "---",
    `idea_id: ${IDEA_ID}`,
    `content_task_id: ${CT_ID}`,
    "channel: clarify",
    "kind: clarify",
    "iteration: 0",
    `clarify_status: ${opts?.clarifyStatus ?? "pending"}`,
    "created_at: 2026-06-10T00:00:00.000Z",
    "updated_at: 2026-06-10T00:00:00.000Z",
    "---",
  ].join("\n");
  fs.writeFileSync(clarifyPath, `${fm}\n${opts?.clarifyBody ?? CLARIFY_BODY_BLOCK}`);

  writeJson(path.join(brand, "chat", `content-${CT_ID.toLowerCase()}.json`), {
    messages: opts?.threadMessages ?? [],
  });

  return { clarifyPath };
}

function readClarifyMeta(clarifyPath: string): Record<string, unknown> {
  const text = fs.readFileSync(clarifyPath, "utf-8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(m, "clarify.md keeps frontmatter");
  return yaml.load(m[1]) as Record<string, unknown>;
}

before(async () => {
  mod = ((await import("../clarify-autostatus")) as unknown as { default?: Mod } & Mod);
  mod = (mod as { default?: Mod }).default ?? mod;
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ── extractAskAnswers ───────────────────────────────────────────────────────

test("extractAskAnswers: parses multiple [ask:] lines and trims answers", () => {
  const text = [
    "[ask:q_provoke] respuesta: B — La API es lo que importa",
    "[ask:q_evidence] respuesta: Other — CAC -41% en 6 meses",
    "texto suelto que no es respuesta",
  ].join("\n");
  assert.deepEqual(mod.extractAskAnswers(text), {
    q_provoke: "B — La API es lo que importa",
    q_evidence: "Other — CAC -41% en 6 meses",
  });
});

test("extractAskAnswers: empty object when no ask lines", () => {
  assert.deepEqual(mod.extractAskAnswers("hola, ¿cómo va el draft?"), {});
});

// ── extractAskIds ───────────────────────────────────────────────────────────

test("extractAskIds: block form (:::ask\\n{json}\\n:::)", () => {
  assert.deepEqual(mod.extractAskIds(CLARIFY_BODY_BLOCK), [
    "q_provoke",
    "q_evidence",
  ]);
});

test("extractAskIds: inline form (:::ask {json} on one line)", () => {
  const body = `
Intro.
:::ask {"id":"q_provoke","prompt":"¿Con cuál de estos enganches abrimos?","mode":"single","options":[{"id":"a","label":"A"},{"id":"other","label":"Otro"}]}
Tail text.
`;
  assert.deepEqual(mod.extractAskIds(body), ["q_provoke"]);
});

test("extractAskIds: ignores blocks inside code fences and dedupes", () => {
  const body = [
    "```",
    ":::ask",
    '{"id":"q_in_fence","prompt":"x","mode":"single","options":[]}',
    ":::",
    "```",
    ":::ask",
    '{"id":"q_real","prompt":"x","mode":"single","options":[{"id":"a","label":"A"}]}',
    ":::",
    ":::ask",
    '{"id":"q_real","prompt":"dup","mode":"single","options":[{"id":"a","label":"A"}]}',
    ":::",
  ].join("\n");
  assert.deepEqual(mod.extractAskIds(body), ["q_real"]);
});

// ── parseContentThreadId ────────────────────────────────────────────────────

test("parseContentThreadId: extracts ct id from content threads only", () => {
  assert.equal(
    mod.parseContentThreadId(THREAD_ID, SLUG),
    CT_ID.toLowerCase(),
  );
  assert.equal(mod.parseContentThreadId(`${SLUG}:general`, SLUG), null);
  assert.equal(mod.parseContentThreadId(`other:content:x-c01`, SLUG), null);
});

// ── maybeMarkClarifyAnswered (integration, tmp workspace) ──────────────────

test("marks answered + stores clarify_answers when one message answers all doc asks", () => {
  const { clarifyPath } = setupWorkspace();
  const msg = [
    "[ask:q_provoke] respuesta: B — La API es lo que importa",
    "[ask:q_evidence] respuesta: Other — CAC -41% en 6 meses",
  ].join("\n");

  const res = mod.maybeMarkClarifyAnswered(SLUG, THREAD_ID, msg);
  assert.equal(res.marked, true);

  const meta = readClarifyMeta(clarifyPath);
  assert.equal(meta.clarify_status, "answered");
  assert.deepEqual(meta.clarify_answers, {
    q_provoke: "B — La API es lo que importa",
    q_evidence: "Other — CAC -41% en 6 meses",
  });
});

test("does NOT mark when answers are partial", () => {
  const { clarifyPath } = setupWorkspace();
  const res = mod.maybeMarkClarifyAnswered(
    SLUG,
    THREAD_ID,
    "[ask:q_provoke] respuesta: B",
  );
  assert.equal(res.marked, false);
  assert.equal(readClarifyMeta(clarifyPath).clarify_status, "pending");
});

test("completes across thread history + current message", () => {
  const { clarifyPath } = setupWorkspace({
    threadMessages: [
      { role: "user", text: "[ask:q_provoke] respuesta: A", ts: 1 },
      { role: "bot", text: "ok, ¿y la evidencia?", ts: 2 },
    ],
  });
  const res = mod.maybeMarkClarifyAnswered(
    SLUG,
    THREAD_ID,
    "[ask:q_evidence] respuesta: Other — dato propio",
  );
  assert.equal(res.marked, true);
  const meta = readClarifyMeta(clarifyPath);
  assert.equal(meta.clarify_status, "answered");
  assert.deepEqual(meta.clarify_answers, {
    q_provoke: "A",
    q_evidence: "Other — dato propio",
  });
});

test("ignores ask ids that are not in the clarify doc (media gate answers)", () => {
  const { clarifyPath } = setupWorkspace();
  const res = mod.maybeMarkClarifyAnswered(
    SLUG,
    THREAD_ID,
    [
      "[ask:q_media_linkedin] respuesta: Sí — carrusel",
      "[ask:q_media_twitter] respuesta: Skip",
    ].join("\n"),
  );
  assert.equal(res.marked, false);
  assert.equal(readClarifyMeta(clarifyPath).clarify_status, "pending");
});

test("no-ops when clarify_status is not pending", () => {
  const { clarifyPath } = setupWorkspace({ clarifyStatus: "answered" });
  const res = mod.maybeMarkClarifyAnswered(
    SLUG,
    THREAD_ID,
    "[ask:q_provoke] respuesta: A\n[ask:q_evidence] respuesta: B",
  );
  assert.equal(res.marked, false);
  assert.equal(readClarifyMeta(clarifyPath).clarify_status, "answered");
});

test("no-ops on non-content threads and on messages without ask answers", () => {
  setupWorkspace();
  assert.equal(
    mod.maybeMarkClarifyAnswered(SLUG, `${SLUG}:general`, "[ask:q_provoke] respuesta: A").marked,
    false,
  );
  assert.equal(
    mod.maybeMarkClarifyAnswered(SLUG, THREAD_ID, "mensaje normal").marked,
    false,
  );
});

test("resolves the ContentTask case-insensitively (thread ids are lowercased)", () => {
  const { clarifyPath } = setupWorkspace();
  // THREAD_ID already carries the lowercased CT id while tasks.json stores
  // the mixed-case id — this is the production shape (buildThreadId lowercases).
  assert.notEqual(CT_ID, CT_ID.toLowerCase());
  const res = mod.maybeMarkClarifyAnswered(
    SLUG,
    THREAD_ID,
    "[ask:q_provoke] respuesta: A\n[ask:q_evidence] respuesta: B",
  );
  assert.equal(res.marked, true);
  assert.equal(readClarifyMeta(clarifyPath).clarify_status, "answered");
});
