/**
 * SAN-80 · Inbox + negotiation-assist:
 *  - mapeo de estados del Inbox (8 chips del mockup ↔ enum real de Yalc,
 *    derivados incluidos, precedencia del rebote);
 *  - parser de precios es-ES;
 *  - break-even de negociación = números EXACTOS del mockup inbox.html
 *    (@finanzasconlucia: fee 3.500 / CAC 80 → 44 necesarias · ~52
 *    alcanzables · 118% · VIABLE · contraoferta 4.100€).
 *
 *   npx tsx --test src/lib/partnerships/__tests__/inbox-negotiation.test.mts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as inboxModule from "../inbox-mapping";
import * as negotiationModule from "../negotiation";

// Interop CJS↔ESM de tsx (mismo patrón que break-even.test.mts).
const inboxLib = (inboxModule as unknown as { default: typeof inboxModule }).default ?? inboxModule;
const negotiationLib =
  (negotiationModule as unknown as { default: typeof negotiationModule }).default ?? negotiationModule;

const { INBOX_STATES, inboxConversations, inboxStateCounts, inboxStateForLead } = inboxLib;
const {
  detectLatestPrice,
  detectPrices,
  insertAnalysisParagraph,
  negotiationBreakEven,
  NICHE_ER_BENCHMARK_PCT,
} = negotiationLib;

describe("inbox · mapeo de estados", () => {
  it("declara los 8 chips del mockup en orden", () => {
    assert.deepEqual(
      INBOX_STATES.map((s) => s.label),
      ["En cola", "Contactado", "Pendiente", "Respondió", "Reunión", "Negociando", "Parado", "Rebotado"],
    );
  });

  it("mapea estados reales del enum", () => {
    assert.equal(inboxStateForLead({ lifecycleStatus: "Replied" }), "respondio");
    assert.equal(inboxStateForLead({ lifecycleStatus: "Demo_Booked" }), "reunion");
    assert.equal(inboxStateForLead({ lifecycleStatus: "Negotiating" }), "negociando");
    assert.equal(inboxStateForLead({ lifecycleStatus: "No_Reply" }), "parado");
    assert.equal(inboxStateForLead({ lifecycleStatus: "Expired" }), "parado");
  });

  it("deriva En cola vs Contactado de Queued ± envío", () => {
    assert.equal(inboxStateForLead({ lifecycleStatus: "Queued" }), "en-cola");
    assert.equal(
      inboxStateForLead({ lifecycleStatus: "Queued", emailSentAt: "2026-06-11T10:00:00Z" }),
      "contactado",
    );
    assert.equal(inboxStateForLead({ lifecycleStatus: "Connect_Sent" }), "contactado");
    assert.equal(inboxStateForLead({ lifecycleStatus: "Connected" }), "contactado");
  });

  it("deriva Pendiente de los follow-ups DM1/DM2", () => {
    assert.equal(inboxStateForLead({ lifecycleStatus: "DM1_Sent" }), "pendiente");
    assert.equal(inboxStateForLead({ lifecycleStatus: "DM2_Sent" }), "pendiente");
  });

  it("el rebote tiene prioridad máxima sobre cualquier lifecycle", () => {
    assert.equal(
      inboxStateForLead({ lifecycleStatus: "Negotiating", emailBouncedAt: "2026-06-11T10:00:00Z" }),
      "rebotado",
    );
    assert.equal(inboxStateForLead({ lifecycleStatus: "Queued", emailStatus: "bounced" }), "rebotado");
  });

  it("triaje previo y deals cerrados quedan FUERA del inbox", () => {
    for (const status of ["Sourced", "Qualified", "Disqualified", "Deal_Created", "Closed_Won", "Closed_Lost"]) {
      assert.equal(inboxStateForLead({ lifecycleStatus: status }), null, status);
    }
  });

  it("las 5 conversaciones del mockup inbox.html mapean a sus chips", () => {
    // lucia Negociando · david Respondió · marta Contactado · inversor Reunión · pau Parado
    const mockup = [
      { handle: "@finanzasconlucia", lifecycleStatus: "Negotiating", expected: "negociando" },
      { handle: "@davidfintech", lifecycleStatus: "Replied", expected: "respondio" },
      { handle: "@ahorroconmarta", lifecycleStatus: "Queued", emailSentAt: "2026-06-10T09:00:00Z", expected: "contactado" },
      { handle: "@elinversorprudente", lifecycleStatus: "Demo_Booked", expected: "reunion" },
      { handle: "@money_pau", lifecycleStatus: "No_Reply", expected: "parado" },
    ];
    for (const convo of mockup) {
      assert.equal(inboxStateForLead(convo), convo.expected, convo.handle);
    }
  });

  it("counts + conversations ordenadas por actividad", () => {
    const leads = [
      { id: "a", campaignId: "c", lifecycleStatus: "Replied", updatedAt: "2026-06-11T10:00:00Z" },
      { id: "b", campaignId: "c", lifecycleStatus: "Qualified", updatedAt: "2026-06-11T11:00:00Z" },
      { id: "c", campaignId: "c", lifecycleStatus: "Negotiating", updatedAt: "2026-06-11T12:00:00Z" },
    ];
    const counts = inboxStateCounts(leads);
    assert.equal(counts["respondio"], 1);
    assert.equal(counts["negociando"], 1);
    assert.equal(counts["en-cola"], 0);
    const convos = inboxConversations(leads);
    assert.deepEqual(convos.map((c) => c.id), ["c", "a"]); // Qualified fuera, más reciente primero
  });
});

describe("negotiation · parser de precios es-ES", () => {
  it("detecta los formatos del mockup", () => {
    assert.equal(detectLatestPrice("mi tarifa sería de 3.500€ por el pack")?.amountEur, 3500);
    assert.equal(detectLatestPrice("ronda los 1.200€ por reel")?.amountEur, 1200);
    assert.equal(detectLatestPrice("cobro 950 euros")?.amountEur, 950);
    assert.equal(detectLatestPrice("serían € 2.000 en total")?.amountEur, 2000);
    assert.equal(detectLatestPrice("unos 2k€ aprox")?.amountEur, 2000);
    assert.equal(detectLatestPrice("1.200,50 € con IVA")?.amountEur, 1200.5);
  });

  it("devuelve el ÚLTIMO precio (la oferta vigente) y todos en orden", () => {
    const text = "Antes cobraba 800€, ahora mi tarifa es 3.500€.";
    const prices = detectPrices(text);
    assert.deepEqual(prices.map((p) => p.amountEur), [800, 3500]);
    assert.equal(detectLatestPrice(text)?.amountEur, 3500);
  });

  it("ignora ruido (<10€) y texto sin precios", () => {
    assert.equal(detectLatestPrice("te regalo 5€ de descuento"), null);
    assert.equal(detectLatestPrice("¿nos vemos el jueves a las 10:00?"), null);
    assert.equal(detectLatestPrice(""), null);
  });
});

describe("negotiation · break-even (paridad mockup inbox.html)", () => {
  // @finanzasconlucia: 142K followers · ER 4.8 · 3 reels · fee 3.500 · CAC 80.
  const LUCIA = { followers: 142_000, engagementRatePct: 4.8 };

  it("reproduce los números del panel: 44 necesarias · ~52 alcanzables · VIABLE · contra 4.100€", () => {
    const result = negotiationBreakEven({ feeEur: 3500, ...LUCIA });
    assert.equal(result.necesarias, 44);
    assert.equal(Math.round(result.alcanzable), 52);
    // Cobertura: el motor (spec canónica = drawer-partner.html) usa el
    // alcanzable EXACTO (51,5/44 → 117%); inbox.html redondeaba antes la
    // base (52/44 → 118%) — divergencia documentada, gana el motor.
    assert.equal(Math.round(result.ratio * 100), 117);
    assert.equal(result.veredicto, "viable");
    assert.equal(result.veredictoColor, "green");
    // Contraoferta del motor: floor a la centena de 52 × 80 = 4.160 → 4.100 €.
    assert.equal(result.contraofertaEur, 4100);
  });

  it("multiplicador de incentivo empuja SOLO lo alcanzable (×1.5 → ~77)", () => {
    const result = negotiationBreakEven({ feeEur: 3500, incentiveMultiplier: 1.5, ...LUCIA });
    assert.equal(result.necesarias, 44);
    // Motor: 51,53 × 1,5 = 77,3 → ~77 (inbox.html: 52×1,5=78, redondeo previo).
    assert.equal(Math.round(result.alcanzable), 77);
  });

  it("estructura mixta: necesarias = fee / (CAC − CPA)", () => {
    const result = negotiationBreakEven({
      feeEur: 2800,
      structure: "mixto",
      variableCpaEur: 10,
      ...LUCIA,
    });
    assert.equal(result.necesarias, 40); // 2800 / (80 − 10) — la contraoferta del mockup
  });

  it("usa el benchmark del nicho del mockup (4.8) por defecto", () => {
    assert.equal(NICHE_ER_BENCHMARK_PCT, 4.8);
    const result = negotiationBreakEven({ feeEur: 3500, ...LUCIA });
    assert.equal(result.erAdjustment, 1); // 4.8 / 4.8
  });

  it("insertAnalysisParagraph añade y sustituye el P.D. (no lo duplica)", () => {
    const result = negotiationBreakEven({ feeEur: 3500, ...LUCIA });
    const draft = "Hola Lucía,\n\nGracias por la propuesta.";
    const once = insertAnalysisParagraph(draft, result);
    assert.ok(once.includes("P.D."));
    assert.ok(once.includes("3.500€"));
    assert.ok(once.includes("44"));
    assert.ok(once.includes("~52"));
    const twice = insertAnalysisParagraph(once, result);
    assert.equal(twice.match(/P\.D\./g)?.length, 1);
  });
});
