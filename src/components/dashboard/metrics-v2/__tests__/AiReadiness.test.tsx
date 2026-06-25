/**
 * Discoverability · AI readiness + evidence (SAN-319 · PR6). Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiReadiness, type AiCheck, type AiEvidence } from "../AiReadiness";

const render = (el: ReactElement) => renderToStaticMarkup(el);
const checklist: AiCheck[] = [
  { check: "GPTBot permitido", status: "ok" },
  { check: "PerplexityBot permitido", status: "ok" },
  { check: "Schema Organization / FAQ", status: "ok" },
  { check: "llms.txt publicado", status: "fail" },
  { check: "Contenido citable", status: "partial" },
];
const evidence: AiEvidence = {
  prompt: "mejor agencia growth b2b para SaaS",
  engine: "Perplexity",
  answer: "Para SaaS B2B destacan Hospital Capilar, Insparya y…",
  cited: true,
  position: 2,
  sources: ["growth4u.io", "g2.com"],
};

test("AiReadiness: checklist with the N/total summary", () => {
  const m = render(createElement(AiReadiness, { checklist, evidence }));
  assert.match(m, /AI-readiness/);
  assert.match(m, /3 \/ 5/);
  assert.match(m, /llms\.txt publicado/);
});

test("AiReadiness: evidence card shows the cited answer + sources", () => {
  const m = render(createElement(AiReadiness, { checklist, evidence }));
  assert.match(m, /mejor agencia growth b2b/);
  assert.match(m, /citado/);
  assert.match(m, /growth4u\.io/);
});
