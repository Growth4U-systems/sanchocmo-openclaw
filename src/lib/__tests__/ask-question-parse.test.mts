import { test } from "node:test";
import assert from "node:assert/strict";
// Same CJS/namespace interop pattern as strip-markdown-frontmatter.test.mts:
// the component file also exports React components, but we only touch the pure
// helpers (parseMessageSegments, initialQuestionState).
import * as mod from "../../components/chat/ask-question";
const { parseMessageSegments, initialQuestionState } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("parseMessageSegments: accepts mode:text WITHOUT options", () => {
  const text =
    ':::ask\n{"id":"q_name","prompt":"¿Quién?","mode":"text","placeholder":"p.ej. Martín","optional":false}\n:::';
  const segs = parseMessageSegments(text);
  const ask = segs.find((s) => s.type === "ask");
  assert.ok(ask, "expected an ask segment");
  assert.equal(ask.question.mode, "text");
  assert.equal(ask.question.id, "q_name");
  assert.equal(ask.question.placeholder, "p.ej. Martín");
  assert.equal(ask.question.optional, false);
  assert.equal(ask.question.options, undefined);
});

test("parseMessageSegments: single STILL requires options (malformed → text fallthrough)", () => {
  const text = ':::ask\n{"id":"q_x","prompt":"P","mode":"single"}\n:::';
  const segs = parseMessageSegments(text);
  // No options → not a valid single → no ask segment; left as text.
  assert.equal(segs.some((s) => s.type === "ask"), false);
});

test("parseMessageSegments: tolerates recommended on a single option", () => {
  const text =
    ':::ask\n{"id":"q_c","prompt":"Cadencia","mode":"single","options":[{"id":"3","label":"3","recommended":true},{"id":"5","label":"5+"}]}\n:::';
  const segs = parseMessageSegments(text);
  const ask = segs.find((s) => s.type === "ask");
  assert.ok(ask, "expected an ask segment");
  assert.equal(ask.question.options?.[0]?.recommended, true);
});

test("parseMessageSegments: retains hidden deterministic workflow intents", () => {
  const workflowIntent = {
    channel: "linkedin",
    discoveryStrategy: "account_first_v1",
    targetSegment: "Founders SaaS",
    contactReason: "Quiero conversar sobre vuestro sistema de growth",
    accountTarget: { description: "SaaS España", keywords: "SaaS" },
    personTarget: { description: "Founders", titles: ["Founder"] },
  };
  const text = `:::ask\n${JSON.stringify({
    id: "outbound_ecp_v1",
    prompt: "Elige",
    mode: "single",
    options: [{ id: "founders", label: "Founders SaaS", workflowIntent }],
  })}\n:::`;
  const ask = parseMessageSegments(text).find((segment) => segment.type === "ask");
  assert.deepEqual(ask?.type === "ask" ? ask.question.options?.[0].workflowIntent : null, workflowIntent);
});

test("parseMessageSegments: can MIX text + single blocks in one message", () => {
  const text =
    ':::ask\n{"id":"q_name","prompt":"Nombre","mode":"text"}\n:::\n:::ask\n{"id":"q_net","prompt":"Red","mode":"single","options":[{"id":"li","label":"LinkedIn"},{"id":"other","label":"Otro"}]}\n:::';
  const asks = parseMessageSegments(text).filter((s) => s.type === "ask");
  assert.equal(asks.length, 2);
  assert.equal(asks[0].question.mode, "text");
  assert.equal(asks[1].question.mode, "single");
});

test("parseMessageSegments: malformed :::ask (unescaped quote in label) → placeholder, NO raw-JSON leak (SAN-238)", () => {
  // The label contains an unescaped `"` which breaks JSON.parse.
  const text =
    ':::ask\n{"id":"q_x","prompt":"P","mode":"single","options":[{"id":"a","label":"El "playbook" ya no funciona"}]}\n:::';
  const segs = parseMessageSegments(text);

  // Yields a malformed placeholder segment…
  assert.equal(segs.some((s) => s.type === "ask-malformed"), true);
  // …and NO valid ask segment…
  assert.equal(segs.some((s) => s.type === "ask"), false);
  // …and the raw JSON must NOT leak into any text segment.
  const textLeak = segs.some(
    (s) => s.type === "text" && s.content.includes(":::ask"),
  );
  assert.equal(textLeak, false, "raw :::ask JSON leaked into a text segment");
  const playbookLeak = segs.some(
    (s) => s.type === "text" && s.content.includes("playbook"),
  );
  assert.equal(playbookLeak, false, "raw label leaked into a text segment");
});

test("parseMessageSegments: malformed block surrounded by text keeps the real text but drops the JSON (SAN-238)", () => {
  const text =
    'Antes.\n:::ask\n{"id":"q_x","prompt":"P","mode":"single","options":[{"id":"a","label":"un " roto"}]}\n:::\nDespués.';
  const segs = parseMessageSegments(text);
  assert.equal(segs.some((s) => s.type === "ask-malformed"), true);
  const joined = segs
    .filter((s) => s.type === "text")
    .map((s) => s.content)
    .join("");
  assert.equal(joined.includes("Antes."), true);
  assert.equal(joined.includes("Después."), true);
  assert.equal(joined.includes(":::ask"), false);
});

test("initialQuestionState: single pre-selects the recommended option", () => {
  const state = initialQuestionState({
    id: "q_c",
    prompt: "Cadencia",
    mode: "single",
    options: [
      { id: "1", label: "1" },
      { id: "3", label: "3", recommended: true },
      { id: "5", label: "5+" },
    ],
  });
  assert.equal(state.selected.has("3"), true);
  assert.equal(state.selected.size, 1);
});

test("initialQuestionState: multi pre-selects ALL recommended options", () => {
  const state = initialQuestionState({
    id: "q_m",
    prompt: "Temas",
    mode: "multi",
    options: [
      { id: "a", label: "A", recommended: true },
      { id: "b", label: "B" },
      { id: "c", label: "C", recommended: true },
    ],
  });
  assert.deepEqual([...state.selected].sort(), ["a", "c"]);
});

test("initialQuestionState: text mode starts empty", () => {
  const state = initialQuestionState({ id: "q_t", prompt: "Handle", mode: "text" });
  assert.equal(state.selected.size, 0);
  assert.equal(state.otherText, "");
});
