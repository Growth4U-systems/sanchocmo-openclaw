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
const yalcCalls: Array<{ method: string; url: string; body: unknown; headers: http.IncomingHttpHeaders }> = [];

function startFakeYalc(): Promise<string> {
  yalc = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf-8")) : null;
      const url = req.url || "";
      yalcCalls.push({ method: req.method || "", url, body, headers: req.headers });

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

async function waitFor<T>(read: () => T, predicate: (value: T) => boolean, ms = 3000): Promise<T> {
  const deadline = Date.now() + ms;
  let value = read();
  while (Date.now() < deadline) {
    value = read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return value;
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
    hashtags: ["FinanzasPersonales", "#Ahorro", "#ahorro", ""],
    networks: ["IG", "TikTok", "instagram"],
    tiers: ["Micro", "MID", "galactic"],
    targetVolume: 40,
    audienceEsMinPct: 70,
    signals: { competitorBrands: ["N26", "Revolut"] },
    templates: ["Primer contacto creators fintech", "Brief reel educativo"],
  });
  assert.equal(plan.title, "Finanzas personales ES · IG+TikTok");
  assert.deepEqual(plan.sectors, ["finanzas personales", "ahorro"]);
  assert.deepEqual(plan.hashtags, ["#finanzaspersonales", "#ahorro"]);
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
  assert.throws(
    () => lib.parseDiscoveryPlan({ title: "x", sectors: ["y"], networks: ["ig"], audienceEsMinPct: 101 }),
    /audienceEsMinPct/,
  );
  assert.throws(
    () => lib.parseDiscoveryPlan({ title: "x", sectors: ["y"], networks: ["ig"], targetVolume: 2.5 }),
    /targetVolume/,
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
  assert.equal(payload.campaignKind, "creator");
  assert.equal(payload.title, "Inversión YouTube");
  assert.equal(payload.qualificationMode, "auto");
  assert.equal(payload.disqualifyThreshold, 55);
  assert.deepEqual(payload.channels, ["youtube"]);
  assert.match(payload.hypothesis, /inversión/);
  assert.match(payload.targetSegment, /mid\/macro/);
});

test("buildCampaignPayload acepta type B2B (SAN-349) y mantiene Partnerships por defecto", () => {
  const plan = lib.parseDiscoveryPlan({ title: "Agencias SaaS", sectors: ["agencias"], networks: ["linkedin"] });
  assert.equal(lib.buildCampaignPayload(plan).type, "Partnerships");
  assert.equal(lib.buildCampaignPayload(plan, "B2B").type, "B2B");
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

test("applyDiscoveryPlanGates excluye red/tier ajenos y followers desconocidos", () => {
  const result = lib.applyDiscoveryPlanGates(
    [
      { handle: "@ok", network: "instagram", followers: 50_000 },
      { handle: "@otra_red", network: "tiktok", followers: 50_000 },
      { handle: "@macro", network: "instagram", followers: 500_000 },
      { handle: "@sin_followers", network: "instagram" },
    ],
    {
      title: "Micro Instagram",
      sectors: ["salud capilar"],
      networks: ["instagram"],
      tiers: ["micro"],
      targetVolume: 10,
    },
  );
  assert.deepEqual(result.candidates.map((candidate) => candidate.handle), ["@ok"]);
  assert.equal(result.filtered, 3);
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
      title: "Finanzas personales ES · IG+TikTok+YouTube",
      sectors: ["finanzas personales", "ahorro"],
      networks: ["instagram", "tiktok", "youtube"],
      tiers: ["nano", "micro", "mid", "macro"],
      targetVolume: 40,
      signals: { competitorBrands: ["N26", "Revolut"] },
      templates: ["Primer contacto creators fintech"],
    },
    threadId: "monzo:discovery-new-1782311712194",
  });

  // Campaign Partnerships creada en Yalc con modo hybrid + umbral 40.
  const campaignCall = yalcCalls.find((call) => call.method === "POST" && call.url.startsWith("/api/campaigns?"));
  assert.ok(campaignCall, "POST /api/campaigns llamado");
  const campaignBody = campaignCall!.body as Record<string, unknown>;
  assert.equal(campaignBody.type, "Partnerships");
  assert.equal(campaignBody.campaignKind, "creator");
  assert.equal(campaignBody.qualificationMode, "hybrid");
  assert.equal(campaignBody.disqualifyThreshold, 40);
  assert.equal(created.campaignId, "camp-monzo-1");

  // Búsqueda persistida con runner encolado + proyecto de campaña sembrado (SAN-195).
  assert.equal(created.search.runner.status, "queued");
  assert.equal(created.search.campaignId, "camp-monzo-1");
  // SAN-328: el hilo donde se construyó el plan queda persistido para que la
  // tarjeta de Encuentra reabra esa misma sesión (no un hilo nuevo).
  assert.equal(created.search.threadId, "monzo:discovery-new-1782311712194");
  const projectId = created.search.projectId;
  assert.ok(projectId, "proyecto de campaña creado");
  assert.equal(created.taskId, `${projectId}-T01`, "tarea madre = T01 (runner)");
  firstTaskId = created.taskId;

  // project.json: type=project, category outreach-campaign, referencia la campaña.
  const projDir = path.join(tmp, "brand", "monzo", "projects", String(projectId));
  const proj = JSON.parse(fs.readFileSync(path.join(projDir, "project.json"), "utf-8")) as Record<string, unknown>;
  assert.equal(proj.category, "outreach-campaign");
  assert.match(String(proj.description), /camp-monzo-1/);
  assert.equal(proj.seedFromTaskSet, undefined, "seed directive no se filtra a project.json");

  // tasks.json: el task-set outreach-campaign sembrado y anclado.
  const seeded = JSON.parse(fs.readFileSync(path.join(projDir, "tasks.json"), "utf-8")) as Array<Record<string, unknown>>;
  assert.equal(seeded.length, 4, "4 tareas sembradas (runner→enrich→sequences→launch)");
  assert.equal(seeded[0].id, `${projectId}-T01`);
  assert.equal(seeded[0].skill, "discovery-search-runner");
  assert.equal(seeded[0].agent, "rocinante");
  assert.equal(seeded[0].mc_chat_thread_id, `task-${String(projectId).toLowerCase()}-t01`);
  assert.equal(seeded[3].skill, "yalc-operator");

  // Runner en modo fixtures: 9 creators fake, sin ScrapeCreators.
  const run = await lib.runDiscoverySearch({ slug: "monzo", searchId: created.search.id, fixtures: true });
  assert.equal(run.stats.candidates, 9);
  assert.equal(run.stats.filtered, 0);
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
  assert.equal(record.plan.title, "Finanzas personales ES · IG+TikTok+YouTube");
  assert.equal(record.campaignId, "camp-monzo-1");
  assert.equal(record.runner.stats?.avgQuality, 71);

  // listSearches lo expone para Encuentra / runner agentic.
  const listed = lib.listSearches("monzo");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.search.id);
});

test("enqueueDiscoverySearchRun devuelve rápido y completa el runner en background", async () => {
  const created = await lib.createDiscoverySearch({
    slug: "monzo",
    plan: { title: "Async fixtures", sectors: ["fintech"], networks: ["instagram"], tiers: ["micro"] },
  });

  const queued = lib.enqueueDiscoverySearchRun({
    slug: "monzo",
    searchId: created.search.id,
    fixtures: true,
  });
  assert.equal(queued.runner.jobId, `partnerships.discovery:${created.search.id}`);
  assert.match(queued.runner.status, /queued|running/);

  const done = await waitFor(
    () => lib.getSearch("monzo", created.search.id),
    (record) => record?.runner.status === "done",
  );
  assert.equal(done?.runner.status, "done");
  assert.equal(done?.runner.mode, "fixtures");
  assert.equal(done?.runner.attempts, 1);
  assert.equal(done?.runner.retryable, false);
  assert.ok(done?.runner.stats?.inserted);

  const assignCall = yalcCalls
    .filter((call) => call.url.includes("/leads/assign"))
    .at(-1);
  assert.ok(assignCall, "POST /leads/assign llamado desde el job async");
  assert.equal(assignCall!.headers["idempotency-key"], `partnerships.discovery:${created.search.id}`);
  const leads = (assignCall!.body as { leads: Array<Record<string, unknown>> }).leads;
  assert.equal(
    (leads[0].provenance as Record<string, unknown>).jobId,
    `partnerships.discovery:${created.search.id}`,
  );
  assert.equal(
    (leads[0].scoreProvenance as Record<string, unknown>).provider,
    "calc-creator-core",
  );
});

test("retry server-side abre un intento nuevo sin inflarlo al arrancar", async () => {
  const created = await lib.createDiscoverySearch({
    slug: "monzo",
    plan: {
      title: "Retry fixtures",
      sectors: ["fintech"],
      networks: ["instagram"],
    },
  });
  lib.updateRunnerState("monzo", created.search.id, {
    status: "error",
    mode: "fixtures",
    attempts: 1,
    error: "previous failure",
  });

  const queued = lib.enqueueDiscoverySearchRun({
    slug: "monzo",
    searchId: created.search.id,
    fixtures: true,
  });
  assert.equal(queued.runner.attempts, 2);

  const done = await waitFor(
    () => lib.getSearch("monzo", created.search.id),
    (record) => record?.runner.status === "done",
  );
  assert.equal(done?.runner.attempts, 2);
});

test("archiveSearch conserva el registro y bloquea reintentos del runner", async () => {
  const created = await lib.createDiscoverySearch({
    slug: "monzo",
    plan: { title: "Archivable search", sectors: ["fintech"], networks: ["instagram"] },
  });
  lib.updateRunnerState("monzo", created.search.id, {
    status: "queued",
    jobId: lib.discoveryJobId(created.search.id),
  });

  const archived = lib.archiveSearch("monzo", created.search.id, "test archive");
  assert.ok(archived.archivedAt);
  assert.equal(archived.archiveReason, "test archive");

  const stored = lib.getSearch("monzo", created.search.id)!;
  assert.equal(stored.id, created.search.id);
  assert.ok(stored.archivedAt, "la búsqueda sigue en disco para histórico");

  const resumed = await lib.resumeQueuedDiscoverySearches("monzo");
  assert.ok(!resumed.includes(created.search.id), "archivada no se re-encola");
  assert.throws(
    () => lib.enqueueDiscoverySearchRun({ slug: "monzo", searchId: created.search.id, fixtures: true }),
    /archived/,
  );
});

test("resumeQueuedDiscoverySearches no ejecuta búsquedas queued sin job server-side", async () => {
  const created = await lib.createDiscoverySearch({
    slug: "monzo",
    plan: { title: "Solo crear", sectors: ["fintech"], networks: ["instagram"] },
  });

  const resumed = await lib.resumeQueuedDiscoverySearches("monzo");
  assert.ok(!resumed.includes(created.search.id));
  const record = lib.getSearch("monzo", created.search.id)!;
  assert.equal(record.runner.status, "queued");
  assert.equal(record.runner.jobId, undefined);
});

test("runDiscoverySearch sin candidatos explica el camino agentic y marca error", async () => {
  const created = await lib.createDiscoverySearch({
    slug: "monzo",
    plan: { title: "Sin candidatos", sectors: ["fintech"], networks: ["instagram"] },
  });
  // Regresión: cada búsqueda crea SU proyecto/tarea (nunca debe reciclarse).
  assert.ok(created.taskId, "segunda tarea creada");
  assert.ok(created.search.projectId, "segundo proyecto creado");
  assert.notEqual(created.taskId, firstTaskId, "task id distinto por búsqueda");
  await assert.rejects(
    () => lib.runDiscoverySearch({ slug: "monzo", searchId: created.search.id, candidates: [] }),
    /No candidates provided/,
  );
  const record = lib.getSearch("monzo", created.search.id)!;
  assert.equal(record.runner.status, "error");
  assert.match(String(record.runner.error), /No candidates/);
});

test("runDiscoverySearch aplica audienceEsMinPct antes de insertar (CET no sustituye audiencia)", async () => {
  const created = await lib.createDiscoverySearch({
    slug: "monzo",
    plan: {
      title: "Gate audiencia ES",
      sectors: ["salud capilar"],
      networks: ["instagram"],
      audienceEsMinPct: 70,
      targetVolume: 10,
    },
  });
  const callsBeforeRun = yalcCalls.length;
  const run = await lib.runDiscoverySearch({
    slug: "monzo",
    searchId: created.search.id,
    candidates: [
      {
        handle: "@audiencia_es",
        network: "instagram",
        followers: 50_000,
        signals: { spanishAudiencePct: 80, cetAlignmentPct: 20 },
      },
      {
        handle: "@solo_cet",
        network: "instagram",
        followers: 50_000,
        signals: { spanishAudiencePct: 20, cetAlignmentPct: 90 },
      },
      {
        handle: "@sin_dato",
        network: "instagram",
        followers: 50_000,
      },
    ],
  });
  assert.equal(run.stats.candidates, 1);
  assert.equal(run.stats.filtered, 2);
  const assignCall = yalcCalls
    .slice(callsBeforeRun)
    .find((call) => call.url.includes("/leads/assign"));
  assert.ok(assignCall);
  const leads = (assignCall!.body as { leads: Array<{ handle: string }> }).leads;
  assert.deepEqual(leads.map((lead) => lead.handle), ["@audiencia_es"]);
});
