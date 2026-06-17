import { test } from "node:test";
import assert from "node:assert/strict";

// renderTrustScoreDoc vive en src/pages/api/trust-score.ts (función exportada para test).
// parseFrontmatter es el parser canónico del repo: el round-trip de abajo prueba que el
// frontmatter que emite el render siempre se vuelve a parsear (antes se armaba a mano y
// rompía el YAML, ver SAN-194). Mismo patrón CJS/namespace que strip-markdown-frontmatter.test.mts.
import * as apiMod from "../../pages/api/trust-score";
import * as fmMod from "../data/markdown-frontmatter";

const { renderTrustScoreDoc } =
  (apiMod as unknown as { default: typeof apiMod }).default ?? apiMod;
const { parseFrontmatter } =
  (fmMod as unknown as { default: typeof fmMod }).default ?? fmMod;

// ── tipos mínimos para construir fixtures sin arrastrar todo client.ts ──
type Pillar = { score: number | null; findings: string[] };
const PILLAR_KEYS = [
  "borrowed_trust",
  "serp_trust",
  "brand_assets",
  "geo_presence",
  "outbound_readiness",
  "demand_engine",
] as const;

type PillarOverrides = Partial<Record<(typeof PILLAR_KEYS)[number], Partial<Pillar>>>;

function makePillars(overrides: PillarOverrides = {}): Record<string, Pillar> {
  const out: Record<string, Pillar> = {};
  // scores base distintos por pilar para poder verificar orden/round-trip sin ambigüedad.
  const base: Record<string, number> = {
    borrowed_trust: 70,
    serp_trust: 60,
    brand_assets: 50,
    geo_presence: 40,
    outbound_readiness: 30,
    demand_engine: 20,
  };
  for (const k of PILLAR_KEYS) {
    out[k] = { score: base[k], findings: [`finding default ${k}`], ...overrides[k] };
  }
  return out;
}

// CompareResult de prueba. Acepta overrides puntuales para cada caso.
function makeResult(opts: {
  trust_score?: number | null;
  verdict?: string;
  brand_name?: string;
  domain?: string;
  pillars?: PillarOverrides;
  top_gaps?: string[];
  serp_highlight?: string;
  geo_highlight?: string;
  competitors?: Array<{ brand_name: string; trust_score: number | null }>;
  primary_gaps?: string[];
} = {}) {
  return {
    primary: {
      url: "https://acme.com",
      domain: opts.domain ?? "acme.com",
      brand_name: opts.brand_name ?? "Acme",
      sector: "saas",
      region: "ES",
      trust_score: opts.trust_score ?? 55,
      pillars: makePillars(opts.pillars),
      top_gaps: opts.top_gaps ?? ["gap a", "gap b"],
      serp_highlight: opts.serp_highlight ?? "aparece en top 3 para X",
      geo_highlight: opts.geo_highlight ?? "mencionada por 2/4 LLMs",
      verdict: opts.verdict ?? "Marca sólida con brechas en outbound.",
    },
    competitors: (opts.competitors ?? [
      { brand_name: "Rival Uno", trust_score: 62 },
      { brand_name: "Rival Dos", trust_score: 48 },
    ]).map((c) => ({
      url: "https://" + c.brand_name.toLowerCase().replace(/\s+/g, "") + ".com",
      domain: c.brand_name.toLowerCase().replace(/\s+/g, "") + ".com",
      brand_name: c.brand_name,
      sector: "saas",
      region: "ES",
      trust_score: c.trust_score,
      pillars: makePillars(),
      top_gaps: [],
      serp_highlight: "",
      geo_highlight: "",
      verdict: "",
    })),
    comparison: {
      pillar_winners: {},
      primary_advantages: [],
      primary_gaps: opts.primary_gaps ?? ["brecha vs competidores 1", "brecha vs competidores 2"],
      insights: [],
      verdict: "",
    },
  } as unknown as Parameters<typeof renderTrustScoreDoc>[0];
}

const FETCHED_AT = "2026-06-15T10:00:00.000Z";

// ── CASO 1: ROUND-TRIP — el output SIEMPRE se vuelve a parsear con data no vacío ──
test("round-trip: el output siempre se reparsea con frontmatter no vacío (url normal)", () => {
  const md = renderTrustScoreDoc(makeResult(), "https://acme.com", FETCHED_AT);
  const { data } = parseFrontmatter<Record<string, unknown>>(md);
  assert.ok(Object.keys(data).length > 0, "frontmatter no debe quedar vacío");
  assert.equal(data.doc, "trust-score");
  assert.equal(data.url, "https://acme.com");
});

for (const weirdUrl of ["https://acme.com: weird", "@evil", 'https://x.com/"q"']) {
  test(`round-trip: url rara no rompe el YAML del frontmatter (${weirdUrl})`, () => {
    const md = renderTrustScoreDoc(makeResult(), weirdUrl, FETCHED_AT);
    const { data } = parseFrontmatter<Record<string, unknown>>(md);
    // El bug arreglado: con frontmatter armado a mano, estas urls rompían el YAML y
    // parseFrontmatter devolvía data={} → el Strategic Plan perdía TODOS los scores.
    assert.ok(Object.keys(data).length > 0, "frontmatter no debe romperse con url rara");
    assert.equal(data.url, weirdUrl, "la url debe round-trippear exacta");
    assert.ok(data.pillars && typeof data.pillars === "object", "pillars debe sobrevivir");
  });
}

test("round-trip: verdict con ':' y comillas no rompe el YAML (no toca frontmatter, pero confirma)", () => {
  // El verdict va al cuerpo, no al frontmatter; aun así verificamos que el doc completo
  // se reparsea y que los scores del frontmatter llegan intactos.
  const md = renderTrustScoreDoc(
    makeResult({ verdict: 'Alerta: "marca débil" en geo: 0 menciones' }),
    "https://acme.com",
    FETCHED_AT,
  );
  const { data } = parseFrontmatter<Record<string, number>>(md);
  assert.ok(Object.keys(data).length > 0);
  assert.equal((data as Record<string, unknown>).trust_score, 55);
});

// ── CASO 2: pillars + trust_score correctos en el frontmatter parseado ──
test("frontmatter parseado trae los 6 scores de pillars y el trust_score correctos", () => {
  const md = renderTrustScoreDoc(
    makeResult({ trust_score: 73 }),
    "https://acme.com",
    FETCHED_AT,
  );
  const { data } = parseFrontmatter<{
    trust_score: number;
    pillars: Record<string, number | null>;
  }>(md);

  assert.equal(data.trust_score, 73);
  assert.ok(data.pillars && typeof data.pillars === "object");
  // los 6 keys presentes
  assert.deepEqual(Object.keys(data.pillars).sort(), [...PILLAR_KEYS].sort());
  // valores = los base de makePillars
  assert.equal(data.pillars.borrowed_trust, 70);
  assert.equal(data.pillars.serp_trust, 60);
  assert.equal(data.pillars.brand_assets, 50);
  assert.equal(data.pillars.geo_presence, 40);
  assert.equal(data.pillars.outbound_readiness, 30);
  assert.equal(data.pillars.demand_engine, 20);
});

// ── CASO 3: SANITIZACIÓN — '\n' o '|' en finding / brand_name NO rompe la tabla ──
function pillarTableRows(body: string): string[] {
  // filas de la tabla de pilares: líneas que empiezan con '|' bajo el header de Pilares,
  // excluyendo el header y el separador.
  const lines = body.split("\n");
  const start = lines.findIndex((l) => l.startsWith("| Pilar |"));
  assert.ok(start >= 0, "debe existir la tabla de pilares");
  const rows: string[] = [];
  for (let i = start + 2; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith("|")) break;
    rows.push(l);
  }
  return rows;
}

function columnCount(row: string): number {
  // celdas reales en una fila markdown '| a | b | c |' = pipes sin escapar - 1.
  // Contamos pipes NO precedidos por backslash.
  const unescaped = (row.match(/(?<!\\)\|/g) ?? []).length;
  return unescaped - 1;
}

test("sanitización: finding con '\\n' y '|' no rompe la fila ni cambia el nº de columnas", () => {
  const md = renderTrustScoreDoc(
    makeResult({
      pillars: {
        demand_engine: {
          score: 20,
          findings: ["línea uno\nlínea dos | con pipe\r\notra línea | más"],
        },
      },
    }),
    "https://acme.com",
    FETCHED_AT,
  );
  const { body } = parseFrontmatter(md);
  const rows = pillarTableRows(body);
  assert.equal(rows.length, 6, "deben quedar exactamente 6 filas de pilares");
  for (const r of rows) {
    assert.ok(!r.includes("\n"), "ninguna fila debe contener salto de línea");
    assert.equal(columnCount(r), 3, `fila con nº de columnas != 3: ${r}`);
  }
});

test("sanitización: brand_name (primary y competidor) con '\\n'/'|' no rompe sus tablas", () => {
  const md = renderTrustScoreDoc(
    makeResult({
      brand_name: "Ac\nme | Corp",
      competitors: [
        { brand_name: "Riv\nal | Uno", trust_score: 62 },
        { brand_name: "Rival\r\nDos", trust_score: 48 },
      ],
    }),
    "https://acme.com",
    FETCHED_AT,
  );
  const { body } = parseFrontmatter(md);

  // el título (primary brand_name) usa cell() → debe ser UNA línea sin pipe crudo problemático
  const titleLine = body.split("\n").find((l) => l.startsWith("# Trust Score:"));
  assert.ok(titleLine, "debe existir el título");
  assert.ok(!titleLine!.includes("\nme"), "el brand_name del título no debe meter salto");

  // tabla de competidores: cada fila una línea, 2 columnas
  const lines = body.split("\n");
  const start = lines.findIndex((l) => l.startsWith("| Marca |"));
  assert.ok(start >= 0, "debe existir la tabla de competidores");
  const rows: string[] = [];
  for (let i = start + 2; i < lines.length; i++) {
    if (!lines[i].startsWith("|")) break;
    rows.push(lines[i]);
  }
  assert.equal(rows.length, 2, "deben quedar 2 filas de competidores");
  for (const r of rows) {
    assert.ok(!r.includes("\n"));
    assert.equal(columnCount(r), 2, `fila competidor con nº columnas != 2: ${r}`);
  }
});

// ── CASO 4: ORDEN — pilar con score null va PRIMERO; score 0 también va primero ──
function pillarOrderFromBody(body: string): string[] {
  // devuelve las etiquetas (primera celda) de las filas de la tabla de pilares, en orden.
  return pillarTableRows(body).map((r) => {
    // '| Label | score | findings |'  → segunda parte tras el primer '| '
    const cells = r.split("|").map((c) => c.trim());
    // cells[0] = '' (antes del primer pipe), cells[1] = label
    return cells[1];
  });
}

test("orden: un pilar con score null queda PRIMERO en la tabla (prioridad máxima)", () => {
  const md = renderTrustScoreDoc(
    makeResult({
      // outbound_readiness con score null pese a no ser el de menor número
      pillars: { outbound_readiness: { score: null, findings: ["sin datos del crawler"] } },
    }),
    "https://acme.com",
    FETCHED_AT,
  );
  const { body } = parseFrontmatter(md);
  const order = pillarOrderFromBody(body);
  assert.equal(order[0], "Outbound Readiness", `null debe ir primero; orden real: ${order.join(" > ")}`);
});

test("orden: un pilar con score 0 también queda primero", () => {
  const md = renderTrustScoreDoc(
    makeResult({
      pillars: { brand_assets: { score: 0, findings: ["cero activos de marca"] } },
    }),
    "https://acme.com",
    FETCHED_AT,
  );
  const { body } = parseFrontmatter(md);
  const order = pillarOrderFromBody(body);
  assert.equal(order[0], "Brand Assets", `score 0 debe ir primero; orden real: ${order.join(" > ")}`);
});

test("orden: null gana sobre 0 cuando ambos están presentes (null = primero absoluto)", () => {
  const md = renderTrustScoreDoc(
    makeResult({
      pillars: {
        outbound_readiness: { score: null, findings: ["sin dato"] },
        brand_assets: { score: 0, findings: ["cero"] },
      },
    }),
    "https://acme.com",
    FETCHED_AT,
  );
  const { body } = parseFrontmatter(md);
  const order = pillarOrderFromBody(body);
  assert.equal(order[0], "Outbound Readiness", `null debe ir antes que 0; orden real: ${order.join(" > ")}`);
});
