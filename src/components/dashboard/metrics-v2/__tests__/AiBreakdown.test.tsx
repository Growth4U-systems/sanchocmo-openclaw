/**
 * Discoverability · AI breakdowns (SAN-319 · PR6). Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiBreakdown, type AiCompetitor, type AiEngine, type AiPrompt } from "../AiBreakdown";

const render = (el: ReactElement) => renderToStaticMarkup(el);
const competitors: AiCompetitor[] = [
  { brand: "Hospital Capilar", sov: 28, visibility: 43.8, mentions: 195, position: 2.4, sentiment: 72, you: true },
  { brand: "Insparya", sov: 32, visibility: 50, mentions: 240, position: 1.9, sentiment: 70 },
  { brand: "Clínica X", sov: 20, visibility: 33, mentions: 130, position: 3.1, sentiment: 68 },
];
const engines: AiEngine[] = [{ engine: "ChatGPT", visibility: 52 }, { engine: "Perplexity", visibility: 61 }];
const prompts: AiPrompt[] = [{ prompt: "mejor clínica injerto capilar", engine: "Perplexity", position: 2 }];
const base = { competitors, engines, prompts, totalPrompts: 1000 };

test("AiBreakdown: default Competidores view — brands + your row highlighted", () => {
  const m = render(createElement(AiBreakdown, base));
  assert.match(m, /Hospital Capilar/);
  assert.match(m, /Insparya/);
  assert.match(m, /\(tú\)/);
});

test("AiBreakdown: provenance is available without showing Seed as a tag", () => {
  const m = render(createElement(AiBreakdown, base));
  assert.match(m, /Referencia temporal/);
  assert.doesNotMatch(m, />Seed</);
  assert.match(m, /IA/);
});
