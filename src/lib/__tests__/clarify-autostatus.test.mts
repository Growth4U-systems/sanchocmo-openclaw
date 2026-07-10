import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";

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

// ── checkClarifyCompliance (canonical 4-question contract, SAN-238 P3) ───────

test("checkClarifyCompliance: canonical 4 ids → compliant", () => {
  const res = mod.checkClarifyCompliance([
    "q_provoke",
    "q_evidence",
    "q_insight",
    "q_audience",
  ]);
  assert.equal(res.compliant, true);
  assert.deepEqual(res.missing, []);
  assert.deepEqual(res.unexpected, []);
});

test("checkClarifyCompliance: order does not matter", () => {
  const res = mod.checkClarifyCompliance([
    "q_audience",
    "q_provoke",
    "q_insight",
    "q_evidence",
  ]);
  assert.equal(res.compliant, true);
});

test("checkClarifyCompliance: only 3 questions → flagged with the missing id", () => {
  const res = mod.checkClarifyCompliance(["q_provoke", "q_evidence", "q_insight"]);
  assert.equal(res.compliant, false);
  assert.deepEqual(res.missing, ["q_audience"]);
  assert.deepEqual(res.unexpected, []);
});

test("checkClarifyCompliance: custom/wrong ids → flagged (missing + unexpected)", () => {
  const res = mod.checkClarifyCompliance(["q1", "q2", "q3", "q4"]);
  assert.equal(res.compliant, false);
  assert.deepEqual(res.missing.sort(), [
    "q_audience",
    "q_evidence",
    "q_insight",
    "q_provoke",
  ]);
  assert.deepEqual(res.unexpected, ["q1", "q2", "q3", "q4"]);
});

test("checkClarifyCompliance: 4 canonical + 1 extra → flagged as unexpected, not missing", () => {
  const res = mod.checkClarifyCompliance([
    "q_provoke",
    "q_evidence",
    "q_insight",
    "q_audience",
    "q_bonus",
  ]);
  assert.equal(res.compliant, false);
  assert.deepEqual(res.missing, []);
  assert.deepEqual(res.unexpected, ["q_bonus"]);
});

test("maybeMarkClarifyAnswered: still marks a non-compliant clarify but reports compliant:false", () => {
  // CLARIFY_BODY_BLOCK only has q_provoke + q_evidence → not the canonical 4.
  const { clarifyPath } = setupWorkspace();
  const res = mod.maybeMarkClarifyAnswered(
    SLUG,
    THREAD_ID,
    "[ask:q_provoke] respuesta: A\n[ask:q_evidence] respuesta: B",
  );
  // Detection must NOT block the marking (fail-safe).
  assert.equal(res.marked, true);
  assert.equal(res.compliant, false);
  assert.deepEqual(res.missingAskIds, ["q_insight", "q_audience"]);
  assert.equal(readClarifyMeta(clarifyPath).clarify_status, "answered");
});

test("maybeMarkClarifyAnswered: canonical 4-question clarify reports compliant:true", () => {
  const body = `
# Clarify · hot_take

:::ask
{"id":"q_provoke","prompt":"P","mode":"single","options":[{"id":"a","label":"A"},{"id":"other","label":"Otro"}]}
:::

:::ask
{"id":"q_evidence","prompt":"E","mode":"single","options":[{"id":"a","label":"A"},{"id":"other","label":"Otro"}]}
:::

:::ask
{"id":"q_insight","prompt":"I","mode":"single","options":[{"id":"a","label":"A"},{"id":"other","label":"Otro"}]}
:::

:::ask
{"id":"q_audience","prompt":"Au","mode":"single","options":[{"id":"a","label":"A"},{"id":"other","label":"Otro"}]}
:::
`;
  const { clarifyPath } = setupWorkspace({ clarifyBody: body });
  const msg = [
    "[ask:q_provoke] respuesta: A",
    "[ask:q_evidence] respuesta: B",
    "[ask:q_insight] respuesta: C",
    "[ask:q_audience] respuesta: D",
  ].join("\n");
  const res = mod.maybeMarkClarifyAnswered(SLUG, THREAD_ID, msg);
  assert.equal(res.marked, true);
  assert.equal(res.compliant, true);
  assert.equal(res.missingAskIds, undefined);
  assert.equal(readClarifyMeta(clarifyPath).clarify_status, "answered");
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
