import assert from "node:assert/strict";
import test from "node:test";
import { parseFoundationOutboundEcp } from "../outreach/foundation-outbound-context";

const markdown = `# Positioning — ECP 4: "Quemado por agencias"

> Generado: 2026-03-06 | Score: 66.45 | Wave 2 (cuando haya cases propios)
> Status: pending-approval | v2

## JTBD Synthesis

| Campo | Contenido |
|---|---|
| **Need** | "Quiero ayuda externa que dé resultados." |
| **Situation** | La última agencia no movió resultados. |
| **Motivation** | Ayuda que demuestre valor antes del compromiso. |
| **Outcome** | Crecer sin repetir la experiencia. |
| **JTBD** | Encontrar ayuda verificable. |
| **Alternatives** | No hacer nada · In-house |

## Top Value Criteria para messaging

| # | Criteria | Imp. | G4U | Avg comp. | Zone | Asset clave |
|---|---|---|---|---|---|---|
| 21 | **Verified Social Proof** | 9 | 2 | 1.6 | Cont | A6 |

**Social Proof:** Debilidad CRÍTICA. ECP activable solo con 2-3 cases propios.

## Assets relevantes

| # | Asset | Criteria | Por qué importa en este ECP |
|---|---|---|---|
| A1 | **Trust Engine** | 22 | Fecha de fin y menor dependencia. |

## Messaging Playbook

**UVP:** *"Para founders quemados por agencias, Trust Engine tiene fecha de fin."*

| Cat. | Criteria | Asset | Versión Corta | Versión Landing |
|---|---|---|---|---|
| **UVP Core** | 22 | A1 | Seis meses con fecha de salida. | Mensaje largo. |
`;

test("builds a structured ECP brief and preserves activation constraints", () => {
  const parsed = parseFoundationOutboundEcp({
    markdown,
    source: "go-to-market/positioning/ecp4/ecp4.current.md",
    brand: {
      name: "Growth4U",
      category: "Growth",
      service: "Instala sistemas de growth.",
      strengths: [],
    },
  });

  assert.ok(parsed);
  assert.equal(parsed.brief.ecp.id, "ecp4");
  assert.equal(parsed.brief.target.need, "Quiero ayuda externa que dé resultados.");
  assert.equal(parsed.brief.positioning.angles[0].label, "UVP Core");
  assert.equal(parsed.blocked, true);
  assert.match(parsed.brief.guardrails.activationConstraints.join(" "), /cases propios/i);
  assert.match(parsed.brief.guardrails.prohibitedClaims.join(" "), /no usar como prueba/i);
  assert.deepEqual(parsed.brief.sources, ["go-to-market/positioning/ecp4/ecp4.current.md"]);
});

test("does not accept prose without the Foundation ECP contract", () => {
  const parsed = parseFoundationOutboundEcp({
    markdown: "# Some notes\nThis is not an ECP playbook.",
    source: "notes.md",
    brand: { name: "Acme", category: "", service: "", strengths: [] },
  });
  assert.equal(parsed, null);
});
