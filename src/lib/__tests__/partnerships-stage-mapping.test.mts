import { test } from "node:test";
import assert from "node:assert/strict";
// stage-mapping.ts se consume como CommonJS desde Next (el package.json raíz no
// declara "type": "module"), así que bajo tsx --test los named exports pueden
// vivir en el namespace `default`. Mismo patrón que format-elapsed.test.mts.
import * as mod from "../partnerships/stage-mapping";
const {
  PIPELINE_STAGES,
  ROSTER_STAGES,
  DISCARDED_STAGE,
  DISQUALIFIED_STATUS,
  EMPTY_LIST_FILTER,
  stageForStatus,
  canonicalStatusForStage,
  qualityBand,
  leadDisplayName,
  normalizeNetwork,
  formatFollowers,
  formatEur,
  formatIntEs,
  formatTier,
  feeStageNote,
  filterAndSortLeads,
  groupLeadsByStage,
  isDiscarded,
} = (mod as unknown as { default: typeof mod }).default ?? mod;

import type { PartnershipLead } from "../partnerships/types";

// ── Mapeo columnas ↔ lifecycleStatus (comment SAN-77, decisiones 2026-06-11) ──

test("kanban: las 8 columnas en el orden del mockup", () => {
  assert.deepEqual(
    PIPELINE_STAGES.map((s) => s.key),
    ["Discovered", "Shortlist", "Contacted", "Replied", "Negotiating", "Signed", "Active", "Closed"],
  );
});

test("stageForStatus: mapeo canónico del comment de SAN-77", () => {
  assert.equal(stageForStatus("Sourced"), "Discovered");
  assert.equal(stageForStatus("Qualified"), "Shortlist");
  assert.equal(stageForStatus("Queued"), "Contacted");
  assert.equal(stageForStatus("Connect_Sent"), "Contacted");
  assert.equal(stageForStatus("Connected"), "Contacted");
  assert.equal(stageForStatus("DM1_Sent"), "Contacted");
  assert.equal(stageForStatus("DM2_Sent"), "Contacted");
  assert.equal(stageForStatus("No_Reply"), "Contacted");
  assert.equal(stageForStatus("Replied"), "Replied");
  assert.equal(stageForStatus("Negotiating"), "Negotiating");
  assert.equal(stageForStatus("Demo_Booked"), "Negotiating");
  assert.equal(stageForStatus("Deal_Created"), "Signed");
  assert.equal(stageForStatus("Closed_Won"), "Active");
  assert.equal(stageForStatus("Closed_Lost"), "Closed");
  assert.equal(stageForStatus("Expired"), "Closed");
});

test("stageForStatus: Disqualified es estado oculto (Discarded), nunca columna", () => {
  assert.equal(stageForStatus(DISQUALIFIED_STATUS), DISCARDED_STAGE);
  assert.ok(!PIPELINE_STAGES.some((s) => (s.statuses as readonly string[]).includes(DISQUALIFIED_STATUS)));
});

test("stageForStatus: desconocido o vacío → null", () => {
  assert.equal(stageForStatus("Banana"), null);
  assert.equal(stageForStatus(null), null);
  assert.equal(stageForStatus(undefined), null);
});

test("canonicalStatusForStage: round-trip columna → status → misma columna", () => {
  for (const stage of PIPELINE_STAGES) {
    const canonical = canonicalStatusForStage(stage.key);
    assert.equal(stageForStatus(canonical), stage.key, `round-trip de ${stage.key}`);
  }
  assert.equal(canonicalStatusForStage(DISCARDED_STAGE), DISQUALIFIED_STATUS);
});

test("sublabels yalc: cada columna documenta su estado del Cockpit", () => {
  for (const stage of PIPELINE_STAGES) {
    assert.match(stage.yalcSublabel, /^yalc: /, `${stage.key} lleva sublabel yalc:`);
  }
});

test("roster = Signed + Active (filtro, no pantalla aparte)", () => {
  assert.deepEqual([...ROSTER_STAGES], ["Signed", "Active"]);
});

// ── Quality bands (verde ≥85 · ámbar 70-84 · rojo <70) ──

test("qualityBand: cortes de banda del mockup", () => {
  assert.equal(qualityBand(91), "high");
  assert.equal(qualityBand(85), "high");
  assert.equal(qualityBand(84), "medium");
  assert.equal(qualityBand(70), "medium");
  assert.equal(qualityBand(69), "low");
  assert.equal(qualityBand(0), "low");
  assert.equal(qualityBand(null), null);
  assert.equal(qualityBand(undefined), null);
});

// ── Display helpers ──

function lead(partial: Partial<PartnershipLead>): PartnershipLead {
  return { id: "l1", campaignId: "c1", ...partial };
}

test("leadDisplayName: handle > nombre > email > id", () => {
  assert.equal(leadDisplayName(lead({ handle: "@finanzasconlucia", firstName: "Lucía" })), "@finanzasconlucia");
  assert.equal(leadDisplayName(lead({ firstName: "Lucía", lastName: "Pérez" })), "Lucía Pérez");
  assert.equal(leadDisplayName(lead({ email: "lucia@x.es" })), "lucia@x.es");
  assert.equal(leadDisplayName(lead({})), "l1");
});

test("normalizeNetwork: variantes de red", () => {
  assert.equal(normalizeNetwork("Instagram"), "instagram");
  assert.equal(normalizeNetwork("instagram"), "instagram");
  assert.equal(normalizeNetwork("YouTube"), "youtube");
  assert.equal(normalizeNetwork("TikTok"), "tiktok");
  assert.equal(normalizeNetwork("twitch"), "other");
  assert.equal(normalizeNetwork(null), "other");
});

test("formatFollowers / formatEur / formatTier", () => {
  assert.equal(formatFollowers(142_000), "142K");
  assert.equal(formatFollowers(1_500_000), "1.5M");
  assert.equal(formatFollowers(900), "900");
  assert.equal(formatFollowers(null), "—");
  // Convención del producto (mockups/seeds): SIEMPRE separador de miles,
  // también en 4 dígitos — a diferencia de toLocaleString("es-ES"), que
  // por CLDR no agrupa números de 4 cifras (3500 → "3500").
  assert.equal(formatEur(3500), "3.500€");
  assert.equal(formatEur(900), "900€");
  assert.equal(formatEur(null), "—");
  assert.equal(formatTier("mid"), "Mid");
  assert.equal(formatTier("MACRO"), "Macro");
  assert.equal(formatTier(null), null);
});

test("formatIntEs: agrupación de miles determinista (sin ICU)", () => {
  assert.equal(formatIntEs(4100), "4.100");
  assert.equal(formatIntEs(999), "999");
  assert.equal(formatIntEs(51_529), "51.529");
  assert.equal(formatIntEs(1_234_567), "1.234.567");
  assert.equal(formatIntEs(-4100), "-4.100");
  assert.equal(formatIntEs(4099.6), "4.100"); // redondea antes de agrupar
});

test("feeStageNote: ofertado/pedido/firmado según stage", () => {
  assert.equal(feeStageNote("Negotiating"), "ofertado");
  assert.equal(feeStageNote("Replied"), "pedido");
  assert.equal(feeStageNote("Signed"), "firmado");
  assert.equal(feeStageNote("Active"), "firmado");
  assert.equal(feeStageNote("Discovered"), null);
  assert.equal(feeStageNote(null), null);
});

// ── Filtro + orden de la Lista ──

const LEADS: PartnershipLead[] = [
  lead({ id: "a", campaignId: "c1", handle: "@finanzasconlucia", network: "Instagram", lifecycleStatus: "Negotiating", qualityScore: 87, offeredPrice: 3500 }),
  lead({ id: "b", campaignId: "c2", handle: "@elinversorprudente", network: "YouTube", lifecycleStatus: "Deal_Created", qualityScore: 91, offeredPrice: 2800 }),
  lead({ id: "c", campaignId: "c1", handle: "@ahorroconmarta", network: "TikTok", lifecycleStatus: "Queued", qualityScore: 74, offeredPrice: null }),
  lead({ id: "d", campaignId: "c1", handle: "@pelotazo_cripto", network: "TikTok", lifecycleStatus: "Disqualified", qualityScore: 31, discardNote: "auto · hybrid: score < 40" }),
  lead({ id: "e", campaignId: "c2", handle: "@cuentasclaras_es2", network: "YouTube", lifecycleStatus: "Disqualified", qualityScore: 52, discardNote: "manual · 11 jun" }),
  lead({ id: "f", campaignId: "c1", handle: "@lauraylasfinanzas", network: "Instagram", lifecycleStatus: "Qualified", qualityScore: 79 }),
];

test("filterAndSortLeads: los descartados quedan fuera por defecto", () => {
  const out = filterAndSortLeads(LEADS, EMPTY_LIST_FILTER);
  assert.deepEqual(out.map((l) => l.id).sort(), ["a", "b", "c", "f"]);
});

test("filterAndSortLeads: filtro 🗑 Descartados los muestra (y solo a ellos)", () => {
  const out = filterAndSortLeads(LEADS, { ...EMPTY_LIST_FILTER, stage: DISCARDED_STAGE });
  assert.deepEqual(out.map((l) => l.id).sort(), ["d", "e"]);
  assert.ok(out.every((l) => isDiscarded(l)));
});

test("filterAndSortLeads: filtro por stage de columna", () => {
  const out = filterAndSortLeads(LEADS, { ...EMPTY_LIST_FILTER, stage: "Shortlist" });
  assert.deepEqual(out.map((l) => l.id), ["f"]);
});

test("filterAndSortLeads: ?busqueda= restringe a la campaña", () => {
  const out = filterAndSortLeads(LEADS, { ...EMPTY_LIST_FILTER, busqueda: "c2" });
  assert.deepEqual(out.map((l) => l.id).sort(), ["b"]);
});

test("filterAndSortLeads: busqueda + Descartados combinan", () => {
  const out = filterAndSortLeads(LEADS, { ...EMPTY_LIST_FILTER, busqueda: "c2", stage: DISCARDED_STAGE });
  assert.deepEqual(out.map((l) => l.id), ["e"]);
});

test("filterAndSortLeads: buscador por handle (case-insensitive)", () => {
  const out = filterAndSortLeads(LEADS, { ...EMPTY_LIST_FILTER, search: "LUCIA" });
  assert.deepEqual(out.map((l) => l.id), ["a"]);
});

test("filterAndSortLeads: chips de red", () => {
  const out = filterAndSortLeads(LEADS, { ...EMPTY_LIST_FILTER, networks: ["youtube"] });
  assert.deepEqual(out.map((l) => l.id), ["b"]);
});

test("filterAndSortLeads: orden por quality desc (lo más alto arriba)", () => {
  const out = filterAndSortLeads(LEADS, { ...EMPTY_LIST_FILTER, sortKey: "quality", sortDir: -1 });
  assert.deepEqual(out.map((l) => l.qualityScore), [91, 87, 79, 74]);
});

test("filterAndSortLeads: orden por precio — sin precio al final en desc (orden estable)", () => {
  const out = filterAndSortLeads(LEADS, { ...EMPTY_LIST_FILTER, sortKey: "fee", sortDir: -1 });
  assert.deepEqual(out.map((l) => l.id), ["a", "b", "c", "f"]);
  assert.equal(out[0].offeredPrice, 3500);
  assert.equal(out[out.length - 1].offeredPrice ?? null, null);
});

// ── Agrupación del kanban ──

test("groupLeadsByStage: agrupa por columna y excluye descartados", () => {
  const groups = groupLeadsByStage(LEADS);
  assert.deepEqual(groups.Negotiating.map((l) => l.id), ["a"]);
  assert.deepEqual(groups.Signed.map((l) => l.id), ["b"]);
  assert.deepEqual(groups.Contacted.map((l) => l.id), ["c"]);
  assert.deepEqual(groups.Shortlist.map((l) => l.id), ["f"]);
  assert.deepEqual(groups.Discovered, []);
  const total = Object.values(groups).reduce((sum, list) => sum + list.length, 0);
  assert.equal(total, 4, "los 2 Disqualified no cuentan en ninguna columna");
});
