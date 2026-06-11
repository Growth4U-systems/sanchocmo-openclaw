/**
 * SAN-79 · tests del slice Discovery→Selección.
 *
 * Cubre: parser del plan (plan→campaign payload), normalizador de candidatos,
 * qualify-enrich con los fixtures (scores deterministas = mockup) y el
 * end-to-end createDiscoverySearch + runDiscoverySearch contra un Yalc fake
 * (campaign Partnerships + leads scoreados + entrada hybrid).
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-partnerships-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";
delete process.env.DISCOVERY_FIXTURES;

type PartnershipsMod = typeof import("../index");
let lib: PartnershipsMod;

// ── Fake Yalc (entrada hybrid con umbral 40, espejo de resolveEntryStatus) ──
let yalc: http.Server;
const yalcCalls: Array<{ method: string; url: string; body: unknown }> = [];

function startFakeYalc(): Promise<string> {
  yalc = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf-8")) : null;
      const url = req.url || "";
      yalcCalls.push({ method: req.method || "", url, body });

      res.setHeader("Content-Type", "application/json");
      if (req.method === "POST" && url.startsWith("/api/campaigns?")) {
        res.statusCode = 201;
        res.end(
          JSON.stringify({
            ok: true,
            campaignId: "camp-monzo-1",
            campaign: { id: "camp-monzo-1", ...(body as Record<string, unknown>) },
          }),
        );
        return;
      }
      if (req.method === "POST" && url.includes("/leads/assign")) {
        const leads = ((body as { leads?: Array<Record<string, unknown>> })?.leads ?? []).map((lead) => {
          const score = typeof lead.qualityScore === "number" ? lead.qualityScore : null;
          const disqualified = score !== null && score < 40;
          return {
            id: `lead-${String(lead.handle)}`,
            handle: lead.handle,
            qualityScore: score,
            lifecycleStatus: disqualified ? "Disqualified" : "Sourced",
            discardNote: disqualified ? "auto · hybrid: score < 40" : null,
          };
        });
        res.statusCode = 201;
        res.end(JSON.stringify({ ok: true, campaignId: "camp-monzo-1", leads, dropped: [] }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `Unexpected ${req.method} ${url}` }));
    });
  });
  return new Promise((resolve) => {
    yalc.listen(0, "127.0.0.1", () => {
      const { port } = yalc.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

before(async () => {
  fs.writeFileSync(
    path.join(tmp, "clients.json"),
    JSON.stringify({ clients: [{ slug: "monzo", name: "Monzo", active: true }], adminToken: null }),
  );
  process.env.YALC_BASE_URL = await startFakeYalc();
  delete process.env.MONZO_YALC_BASE_URL;
  lib = await import("../index");
});

after(() => {
  yalc?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ── Plan → validación + payload de campaign ─────────────────────────────────

test("parseDiscoveryPlan normaliza redes/tiers y aplica defaults hybrid/40", () => {
  const plan = lib.parseDiscoveryPlan({
    title: "Finanzas personales ES · IG+TikTok",
    sectors: ["Finanzas Personales", "ahorro", ""],
    networks: ["IG", "TikTok", "instagram"],
    tiers: ["Micro", "MID", "galactic"],
    targetVolume: 40,
    audienceEsMinPct: 70,
    signals: { competitorBrands: ["N26", "Revolut"] },
    templates: ["Primer contacto creators fintech", "Brief reel educativo"],
  });
  assert.equal(plan.title, "Finanzas personales ES · IG+TikTok");
  assert.deepEqual(plan.sectors, ["finanzas personales", "ahorro"]);
  assert.deepEqual(plan.networks, ["instagram", "tiktok"]);
  assert.deepEqual(plan.tiers, ["micro", "mid"]);
  assert.equal(plan.qualificationMode, "hybrid");
  assert.equal(plan.disqualifyThreshold, 40);
  assert.equal(plan.signals?.adLibrary, true);
  assert.deepEqual(plan.signals?.competitorBrands, ["N26", "Revolut"]);
  assert.deepEqual(plan.templates, ["Primer contacto creators fintech", "Brief reel educativo"]);
});

test("parseDiscoveryPlan rechaza planes sin título/sectores/redes", () => {
  assert.throws(() => lib.parseDiscoveryPlan(null), lib.DiscoveryPlanError);
  assert.throws(() => lib.parseDiscoveryPlan({ sectors: ["x"], networks: ["ig"] }), /title/);
  assert.throws(() => lib.parseDiscoveryPlan({ title: "x", networks: ["ig"] }), /sectors/);
  assert.throws(() => lib.parseDiscoveryPlan({ title: "x", sectors: ["y"] }), /networks/);
  assert.throws(
    () => lib.parseDiscoveryPlan({ title: "x", sectors: ["y"], networks: ["ig"], qualificationMode: "semi" }),
    /qualificationMode/,
  );
  assert.throws(
    () => lib.parseDiscoveryPlan({ title: "x", sectors: ["y"], networks: ["ig"], disqualifyThreshold: 140 }),
    /disqualifyThreshold/,
  );
});

test("buildCampaignPayload produce una campaign Partnerships con el modo del plan", () => {
  const plan = lib.parseDiscoveryPlan({
    title: "Inversión YouTube",
    sectors: ["inversión"],
    networks: ["youtube"],
    tiers: ["mid", "macro"],
    qualificationMode: "auto",
    disqualifyThreshold: 55,
  });
  const payload = lib.buildCampaignPayload(plan);
  assert.equal(payload.type, "Partnerships");
  assert.equal(payload.title, "Inversión YouTube");
  assert.equal(payload.qualificationMode, "auto");
  assert.equal(payload.disqualifyThreshold, 55);
  assert.deepEqual(payload.channels, ["youtube"]);
  assert.match(payload.hypothesis, /inversión/);
  assert.match(payload.targetSegment, /mid\/macro/);
});

// ── Normalizador de candidatos ───────────────────────────────────────────────

test("normalizeCandidates tolera alias, añade @, deduplica y cuenta inválidos", () => {
  const { candidates, invalid } = lib.normalizeCandidates([
    { username: "finanzasconlucia", platform: "IG", er: "4.8", followers: "142,000" },
    { handle: "@finanzasconlucia", network: "instagram" }, // dupe
    { handle: "@otro", net: "yt", engagement_rate: 2.2, followers: 310000 },
    { handle: "", network: "tiktok" }, // invalid: sin handle
    { handle: "@sinred" }, // invalid: sin red
    "garbage",
  ]);
  assert.equal(candidates.length, 2);
  assert.equal(invalid, 3);
  assert.equal(candidates[0].handle, "@finanzasconlucia");
  assert.equal(candidates[0].network, "instagram");
  assert.equal(candidates[0].engagementRatePct, 4.8);
  assert.equal(candidates[0].followers, 142000);
  assert.equal(candidates[1].network, "youtube");
});

test("normalizeCandidates acepta señales con snake_case y promos de competidores", () => {
  const { candidates } = lib.normalizeCandidates({
    candidates: [
      {
        handle: "money_pau",
        network: "tiktok",
        followers: 510000,
        engagementRatePct: 4,
        signals: {
          fake_followers_pct: 8,
          vertical_match_share: 0.95,
          ad_library_checked: true,
          competitor_promos: [{ brand: "Revolut", count: 3, window_months: 6 }],
          spanish_audience_pct: 87,
          cet_alignment_pct: 75,
          posts_per_week: 5,
          long_gaps_last_6_months: 1,
        },
      },
    ],
  });
  assert.equal(candidates.length, 1);
  const signals = candidates[0].signals!;
  assert.equal(signals.fakeFollowersPct, 8);
  assert.equal(signals.verticalMatchShare, 0.95);
  assert.equal(signals.adLibraryChecked, true);
  assert.deepEqual(signals.competitorPromos, [{ brand: "Revolut", count: 3, windowMonths: 6 }]);
  assert.equal(signals.postsPerWeek, 5);
});

// ── qualify-enrich con fixtures (scores deterministas del mockup) ───────────

const EXPECTED_FIXTURE_SCORES: Record<string, number> = {
  "@finanzasconlucia": 87,
  "@elinversorprudente": 91,
  "@ahorroconmarta": 74,
  "@davidfintech": 82,
  "@cuentasclaras_es": 58,
  "@lauraylasfinanzas": 79,
  "@money_pau": 88,
  "@pelotazo_cripto": 31,
  "@cuentasclaras_es2": 52,
};

test("qualifyCandidates reproduce los scores del mockup con los fixtures", () => {
  const candidates = lib.loadFixtureCandidates();
  assert.equal(candidates.length, 9);
  const qualified = lib.qualifyCandidates(candidates, { searchId: "ds-test" });
  for (const item of qualified) {
    assert.equal(
      item.score.total,
      EXPECTED_FIXTURE_SCORES[item.candidate.handle],
      `score de ${item.candidate.handle}`,
    );
    assert.equal(item.score.components.length, 5, "desglose de 5 componentes");
    assert.equal(item.lead.qualityScore, item.score.total);
    assert.equal(item.lead.source, "discovery");
    assert.equal(item.lead.qualityComponents.engine, "calc-creator-core");
    assert.equal(item.lead.qualityComponents.components.length, 5);
    assert.ok(item.lead.tags.includes("search:ds-test"));
  }
});

test("qualify-enrich sin ad-library puntúa neutro y marca la señal ausente", () => {
  const { candidates } = lib.normalizeCandidates([
    { handle: "@sin_adlibrary", network: "instagram", followers: 50000, er: 6 },
  ]);
  const [item] = lib.qualifyCandidates(candidates);
  assert.ok(item.score.missingSignals.includes("adLibrary"));
  assert.deepEqual(item.lead.qualityComponents.missingSignals, item.score.missingSignals);
  const sectorFit = item.score.components.find((component) => component.key === "sectorFit")!;
  assert.equal(sectorFit.missingData, true);
});

// ── End-to-end: crear búsqueda + runner fixtures contra el Yalc fake ─────────

let firstTaskId: string | null = null;

test("createDiscoverySearch + runDiscoverySearch (fixtures) deja leads scoreados en Yalc", async () => {
  const created = await lib.createDiscoverySearch({
    slug: "monzo",
    plan: {
      title: "Finanzas personales ES · IG+TikTok",
      sectors: ["finanzas personales", "ahorro"],
      networks: ["instagram", "tiktok"],
      tiers: ["micro", "mid"],
      targetVolume: 40,
      signals: { competitorBrands: ["N26", "Revolut"] },
      templates: ["Primer contacto creators fintech"],
    },
  });

  // Campaign Partnerships creada en Yalc con modo hybrid + umbral 40.
  const campaignCall = yalcCalls.find((call) => call.method === "POST" && call.url.startsWith("/api/campaigns?"));
  assert.ok(campaignCall, "POST /api/campaigns llamado");
  const campaignBody = campaignCall!.body as Record<string, unknown>;
  assert.equal(campaignBody.type, "Partnerships");
  assert.equal(campaignBody.qualificationMode, "hybrid");
  assert.equal(campaignBody.disqualifyThreshold, 40);
  assert.equal(created.campaignId, "camp-monzo-1");

  // Búsqueda persistida con runner encolado + tarea Outreach madre.
  assert.equal(created.search.runner.status, "queued");
  assert.equal(created.search.campaignId, "camp-monzo-1");
  assert.ok(created.taskId, "tarea Outreach creada");
  firstTaskId = created.taskId;
  const taskFile = path.join(tmp, "brand", "monzo", "projects", String(created.taskId), "project.json");
  const task = JSON.parse(fs.readFileSync(taskFile, "utf-8")) as Record<string, unknown>;
  assert.equal(task.type, "outreach");
  assert.equal(task.skill, "discovery-search-runner");
  assert.match(String(task.description), /camp-monzo-1/);
  assert.deepEqual(task.output_files, [`outreach/searches/${created.search.id}.json`]);

  // Runner en modo fixtures: 9 creators fake, sin ScrapeCreators.
  const run = await lib.runDiscoverySearch({ slug: "monzo", searchId: created.search.id, fixtures: true });
  assert.equal(run.stats.candidates, 9);
  assert.equal(run.stats.inserted, 9);
  assert.equal(run.stats.disqualified, 1); // @pelotazo_cripto (31 < 40)
  assert.equal(run.stats.sourced, 8);
  assert.equal(run.stats.dropped, 0);
  assert.equal(run.search.runner.status, "done");
  assert.equal(run.search.runner.mode, "fixtures");
  assert.ok(run.search.runner.stats);

  // Payload de leads enviado a Yalc: score + desglose de 5 componentes.
  const assignCall = yalcCalls.find((call) => call.url.includes("/leads/assign"));
  assert.ok(assignCall, "POST /leads/assign llamado");
  assert.ok(assignCall!.url.includes(`/api/campaigns/camp-monzo-1/leads/assign`));
  const leads = (assignCall!.body as { leads: Array<Record<string, unknown>> }).leads;
  assert.equal(leads.length, 9);
  const lucia = leads.find((lead) => lead.handle === "@finanzasconlucia")!;
  assert.equal(lucia.qualityScore, 87);
  assert.equal(lucia.network, "instagram");
  assert.equal(lucia.followers, 142000);
  assert.equal((lucia.qualityComponents as { components: unknown[] }).components.length, 5);
  assert.ok((lucia.tags as string[]).includes(`search:${created.search.id}`));

  // El registro guarda plan + campaignId + estado del runner.
  const record = lib.getSearch("monzo", created.search.id)!;
  assert.equal(record.plan.title, "Finanzas personales ES · IG+TikTok");
  assert.equal(record.campaignId, "camp-monzo-1");
  assert.equal(record.runner.stats?.avgQuality, 71);

  // listSearches lo expone para Encuentra / runner agentic.
  const listed = lib.listSearches("monzo");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.search.id);
});

test("runDiscoverySearch sin candidatos explica el camino agentic y marca error", async () => {
  const created = await lib.createDiscoverySearch({
    slug: "monzo",
    plan: { title: "Sin candidatos", sectors: ["fintech"], networks: ["instagram"] },
  });
  // Regresión: cada búsqueda crea SU tarea (P00 nunca debe reciclarse).
  assert.ok(created.taskId, "segunda tarea creada");
  assert.notEqual(created.taskId, firstTaskId, "task id distinto por búsqueda");
  await assert.rejects(
    () => lib.runDiscoverySearch({ slug: "monzo", searchId: created.search.id }),
    /No candidates provided/,
  );
  const record = lib.getSearch("monzo", created.search.id)!;
  assert.equal(record.runner.status, "error");
  assert.match(String(record.runner.error), /No candidates/);
});
