#!/usr/bin/env tsx
/**
 * SAN-79 · entrypoint CLI del discovery-search-runner (Partnerships).
 *
 * Crea y/o ejecuta una búsqueda de creators contra el Yalc configurado
 * (env YALC_BASE_URL / {SLUG}_YALC_BASE_URL + token). Es el camino del
 * verificador del DoD: con Yalc local corriendo y modo fixture, deja una
 * campaign Partnerships con N leads scoreados (los <40 Disqualified con nota
 * auto, el resto Sourced con desglose de 5 componentes).
 *
 * Uso:
 *   # end-to-end: crear búsqueda (campaign+tarea) y correr el runner con fixtures
 *   npx tsx scripts/run-discovery-search.mts --slug monzo --plan plan.json --fixtures
 *
 *   # crear sin ejecutar (runner queued para el agente)
 *   npx tsx scripts/run-discovery-search.mts --slug monzo --plan plan.json --no-run
 *
 *   # ejecutar una búsqueda existente (fixtures o candidatos de un scraping)
 *   npx tsx scripts/run-discovery-search.mts --slug monzo --search ds-XXXX --fixtures
 *   npx tsx scripts/run-discovery-search.mts --slug monzo --search ds-XXXX --candidates cands.json
 *
 *   # sin --plan: usa un plan demo (Monzo finanzas ES) — útil para smoke tests
 *   npx tsx scripts/run-discovery-search.mts --slug monzo --fixtures
 *
 * Flags: --slug <slug> (obligatorio) · --plan <file> · --search <id> ·
 *        --fixtures (o env DISCOVERY_FIXTURES=1) · --candidates <file> · --no-run
 */

import fs from "node:fs";
import { createRequire } from "node:module";

// CJS/ESM interop: el repo compila src/** como CJS bajo tsx; los scripts .mts
// importan vía createRequire (mismo patrón que scripts/audit-doc-paths.mts).
const require = createRequire(import.meta.url);
const {
  createDiscoverySearch,
  fixturesEnabledByEnv,
  getSearch,
  runDiscoverySearch,
} = require("../src/lib/partnerships/index.ts") as typeof import("../src/lib/partnerships/index");

interface CliArgs {
  slug?: string;
  plan?: string;
  search?: string;
  candidates?: string;
  fixtures: boolean;
  run: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { fixtures: false, run: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--slug") args.slug = argv[++i];
    else if (arg === "--plan") args.plan = argv[++i];
    else if (arg === "--search") args.search = argv[++i];
    else if (arg === "--candidates") args.candidates = argv[++i];
    else if (arg === "--fixtures") args.fixtures = true;
    else if (arg === "--no-run") args.run = false;
    else if (arg === "--help" || arg === "-h") {
      console.log("Ver cabecera del script para uso. Flags: --slug --plan --search --candidates --fixtures --no-run");
      process.exit(0);
    } else {
      console.error(`Flag desconocido: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

const DEMO_PLAN = {
  title: "Finanzas personales ES · IG+TikTok",
  sectors: ["finanzas personales", "ahorro", "inversión básica"],
  networks: ["instagram", "tiktok", "youtube"],
  tiers: ["micro", "mid"],
  audienceEsMinPct: 70,
  targetVolume: 40,
  signals: { adLibrary: true, competitorBrands: ["N26", "Revolut"] },
  templates: ["Primer contacto creators fintech", "Brief reel educativo"],
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug) {
    console.error("Falta --slug <slug>");
    process.exit(1);
  }
  const slug = args.slug;
  const fixtures = args.fixtures || fixturesEnabledByEnv();

  let searchId = args.search;
  if (!searchId) {
    const plan: unknown = args.plan
      ? (JSON.parse(fs.readFileSync(args.plan, "utf-8")) as unknown)
      : DEMO_PLAN;
    if (!args.plan) console.log("ℹ️  Sin --plan: usando el plan demo (Monzo finanzas ES).");
    const created = await createDiscoverySearch({ slug, plan });
    searchId = created.search.id;
    console.log(
      `✅ Búsqueda creada: ${searchId}\n   campaign Yalc: ${created.campaignId}\n   tarea Outreach: ${created.taskId ?? "—"}\n   runner: queued`,
    );
    if (!args.run) return;
  } else if (!getSearch(slug, searchId)) {
    console.error(`Búsqueda no encontrada: ${searchId} (${slug})`);
    process.exit(1);
  }

  const candidates: unknown = args.candidates
    ? (JSON.parse(fs.readFileSync(args.candidates, "utf-8")) as unknown)
    : undefined;

  const result = await runDiscoverySearch({ slug, searchId, fixtures, candidates });
  const { stats } = result;
  console.log(
    `🏁 Runner ${result.search.runner.mode} terminado para ${searchId}:\n` +
      `   candidatos: ${stats.candidates} (inválidos: ${stats.invalid})\n` +
      `   insertados: ${stats.inserted} → ${stats.sourced} Sourced · ${stats.disqualified} Disqualified (auto) · ${stats.dropped} drop\n` +
      `   quality medio: ${stats.avgQuality ?? "—"}`,
  );
  for (const item of result.qualified) {
    const entry = result.inserted.find((lead) => lead.handle === item.lead.handle);
    console.log(
      `   · ${item.lead.handle} (${item.lead.network}) → ${item.score.total} [${item.score.band}] ${entry?.lifecycleStatus ?? ""}${entry?.discardNote ? ` — ${entry.discardNote}` : ""}`,
    );
  }
}

main().catch((err) => {
  console.error(`❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
