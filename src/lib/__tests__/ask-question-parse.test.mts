import { test } from "node:test";
import assert from "node:assert/strict";
// Same CJS/namespace interop pattern as strip-markdown-frontmatter.test.mts:
// the component file also exports React components, but we only touch the pure
// helpers (parseMessageSegments, initialQuestionState, storage/render keys).
import * as mod from "../../components/chat/ask-question";
const {
  askMessageIdentity,
  initialQuestionState,
  parseMessageSegments,
  questionGroupRenderKey,
  questionStorageKey,
} =
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

test("questionStorageKey: does not restore stale answers when a reused id has new options", () => {
  const previous = questionStorageKey("hospital:discovery", "message-1", {
    id: "q_frentes",
    prompt: "¿Por qué frentes empezamos?",
    mode: "multi",
    options: [
      { id: "f1", label: "Alopecia masculina joven", recommended: true },
      { id: "other", label: "Otro (lo escribo)" },
    ],
  });
  const current = questionStorageKey("hospital:discovery", "message-1", {
    id: "q_frentes",
    prompt: "¿Por qué frentes empezamos?",
    mode: "multi",
    options: [
      { id: "f1", label: "Caída capilar femenina", recommended: true },
      { id: "other", label: "Otro (lo escribo)" },
    ],
  });

  assert.notEqual(previous, current);
  assert.match(current, /^ask:v2:hospital:discovery:message-1:q_frentes:/);
});

test("questionStorageKey: treats an identical repeated question as a new interaction", () => {
  const question = {
    id: "q_path",
    prompt: "¿Cómo lo montamos?",
    mode: "single" as const,
    options: [
      { id: "propose", label: "Propónmelo tú a partir del contexto del cliente" },
      { id: "other", label: "Otro (lo escribo)" },
    ],
  };

  assert.notEqual(
    questionStorageKey("hospital:discovery", "message-1", question),
    questionStorageKey("hospital:discovery", "message-2", question),
  );
});

test("questionStorageKey: remains stable for the exact same question", () => {
  const question = {
    id: "q_redes",
    prompt: "¿En qué redes buscamos?",
    mode: "multi" as const,
    options: [
      { id: "instagram", label: "Instagram", recommended: true },
      { id: "other", label: "Otro (lo escribo)" },
    ],
  };

  assert.equal(
    questionStorageKey("hospital:discovery", "message-1", question),
    questionStorageKey("hospital:discovery", "message-1", structuredClone(question)),
  );
});

test("askMessageIdentity: legacy identity is independent of the message array position", () => {
  const persistedMessage = {
    role: "bot",
    agent: "rocinante",
    ts: 1_725_000_000_000,
    text: "¿Cómo lo montamos?",
  };

  assert.equal(
    askMessageIdentity(persistedMessage),
    askMessageIdentity(structuredClone(persistedMessage)),
  );
  assert.notEqual(
    askMessageIdentity(persistedMessage),
    askMessageIdentity({ ...persistedMessage, ts: persistedMessage.ts + 1 }),
  );
});

test("questionGroupRenderKey: remounts state for a new message or revised question", () => {
  const previous = parseMessageSegments(`:::ask
{"id":"q_path","prompt":"¿Cómo lo montamos?","mode":"single","options":[{"id":"propose","label":"Propónmelo tú"}]}
:::`);
  const revised = parseMessageSegments(`:::ask
{"id":"q_path","prompt":"¿Cómo lo montamos?","mode":"single","options":[{"id":"manual","label":"Lo defino yo"}]}
:::`);

  const previousKey = questionGroupRenderKey("hospital:discovery", "delivery:one", previous);
  assert.notEqual(
    previousKey,
    questionGroupRenderKey("hospital:discovery", "delivery:two", previous),
  );
  assert.notEqual(
    previousKey,
    questionGroupRenderKey("hospital:discovery", "delivery:one", revised),
  );
  assert.notEqual(
    previousKey,
    questionGroupRenderKey("another:thread", "delivery:one", previous),
  );
});
