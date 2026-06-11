/**
 * SAN-80 · Plantillas — round-trip serialize⇄parse, render de variables,
 * instanciación (asignar a búsqueda) y seeds del mockup plantillas.html.
 *
 *   npx tsx --test src/lib/partnerships/__tests__/templates.test.mts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as templatesModule from "../templates";
import * as seedsModule from "../template-seeds";
import type { PartnershipTemplate } from "../templates";

// Interop CJS↔ESM de tsx (mismo patrón que break-even.test.mts).
const templatesLib =
  (templatesModule as unknown as { default: typeof templatesModule }).default ?? templatesModule;
const seedsLib = (seedsModule as unknown as { default: typeof seedsModule }).default ?? seedsModule;

const {
  instantiateTemplate,
  parseTemplate,
  renderTemplateText,
  serializeTemplate,
  slugifyTemplateName,
  templateSummary,
  toYalcSequence,
} = templatesLib;
const { SEED_TEMPLATES } = seedsLib;

const SAMPLE: PartnershipTemplate = {
  id: "primer-contacto-creators-fintech",
  name: "Primer contacto creators fintech",
  kind: "sequence",
  type: "partnerships",
  description: "3 pasos: intro + follow-up 3d + break-up 7d",
  updatedAt: "2026-06-11T09:00:00.000Z",
  steps: [
    {
      title: "Intro",
      delayDays: 0,
      subject: "{{handle}} × Monzo — programa creators España",
      body: "Hola {{handle}},\n\nTu quality score es {{quality_score}}/100.\n\n¿Hablamos?",
    },
    {
      title: "Follow-up",
      delayDays: 3,
      subject: "Re: {{handle}} × Monzo",
      body: "Reflote rápido — el fee orientativo sería {{precio}}.",
    },
  ],
};

describe("templates · serialize ⇄ parse round-trip", () => {
  it("round-trips a sequence exactly (steps, delays, subjects, bodies)", () => {
    const markdown = serializeTemplate(SAMPLE);
    const parsed = parseTemplate(markdown);
    assert.ok(parsed);
    assert.deepEqual(parsed, SAMPLE);
  });

  it("round-trips every seed template (mockup plantillas.html)", () => {
    for (const seed of SEED_TEMPLATES) {
      const parsed = parseTemplate(serializeTemplate(seed));
      assert.ok(parsed, `${seed.id} should parse`);
      assert.deepEqual(parsed, seed, `${seed.id} should round-trip exactly`);
    }
  });

  it("seeds match the mockup catalogue: 3 sequences + 3 briefs, names of plantillas.html", () => {
    const names = SEED_TEMPLATES.map((t) => t.name);
    assert.deepEqual(names, [
      "Primer contacto creators fintech",
      "Re-engagement creators parados",
      "Outreach B2B SaaS",
      "Brief Monzo · reel educativo",
      "Brief Monzo · post comparativa",
      "Brief compliance FCA (checklist)",
    ]);
    assert.equal(SEED_TEMPLATES.filter((t) => t.kind === "sequence").length, 3);
    assert.equal(SEED_TEMPLATES.filter((t) => t.kind === "brief").length, 3);
    assert.equal(SEED_TEMPLATES.filter((t) => t.type === "b2b").length, 1);
    // La secuencia principal replica los delays del mockup (0 · 3d · 7d).
    assert.deepEqual(
      SEED_TEMPLATES[0].steps.map((s) => s.delayDays),
      [0, 3, 7],
    );
  });

  it("parses markdown without frontmatter or steps as null", () => {
    assert.equal(parseTemplate("# Algo libre\n\nsin estructura"), null);
    assert.equal(parseTemplate("---\nid: x\nname: X\n---\n\nsin pasos"), null);
  });

  it("slugifies names with accents (es-ES)", () => {
    assert.equal(slugifyTemplateName("Brief Monzo · reel educativo"), "brief-monzo-reel-educativo");
    assert.equal(slugifyTemplateName("Última campaña año 2026"), "ultima-campana-ano-2026");
  });
});

describe("templates · render de variables", () => {
  it("substitutes {{handle}}/{{quality_score}}/{{precio}} and keeps unknowns", () => {
    const out = renderTemplateText("Hola {{handle}} ({{quality_score}}): {{precio}} {{otra}}", {
      handle: "@finanzasconlucia",
      qualityScore: 87,
      precio: 3500,
    });
    assert.equal(out, "Hola @finanzasconlucia (87): 3.500 € {{otra}}");
  });

  it("leaves variables intact when context is missing (visible para el humano)", () => {
    const out = renderTemplateText("Fee: {{precio}}", {});
    assert.equal(out, "Fee: {{precio}}");
  });
});

describe("templates · instanciación (asignar a búsqueda)", () => {
  it("creates a frozen copy with instanceId + templateId", () => {
    const instance = instantiateTemplate(SAMPLE);
    assert.equal(instance.templateId, SAMPLE.id);
    assert.ok(instance.instanceId.startsWith("ti-"));
    assert.ok(instance.assignedAt);
    // copia profunda: mutar la instancia no toca el original
    instance.steps[0].body = "MUTADO";
    assert.notEqual(SAMPLE.steps[0].body, "MUTADO");
  });

  it("maps to the Yalc partner-contact sequence shape", () => {
    const sequence = toYalcSequence(SAMPLE);
    assert.deepEqual(sequence[1], {
      subject: "Re: {{handle}} × Monzo",
      body: "Reflote rápido — el fee orientativo sería {{precio}}.",
      delayDays: 3,
    });
  });

  it("summary carries the doc path used by ⬇️/📄/💬", () => {
    const summary = templateSummary(SAMPLE);
    assert.equal(summary.docPath, "outreach/templates/primer-contacto-creators-fintech.md");
    assert.equal(summary.stepCount, 2);
  });
});
