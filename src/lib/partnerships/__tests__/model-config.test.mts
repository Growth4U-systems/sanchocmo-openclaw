/**
 * SAN-76 · model config efectiva + integración con discovery.
 *
 * Contra un Yalc fake con GET/PUT /api/model-config con estado:
 *  - getEffectiveModelConfig mergea overrides (source yalc/defaults, degradación).
 *  - putModelConfigOverrides hace PUT parcial y valida claves.
 *  - El ER de tier editado cambia el quality score de qualify-enrich.
 *  - El umbral editado fluye a las búsquedas NUEVAS (campaign payload) y el
 *    run de fixtures descarta con el umbral nuevo (DoD de la issue).
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-model-config-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";
delete process.env.DISCOVERY_FIXTURES;

type PartnershipsMod = typeof import("../index");
let lib: PartnershipsMod;

// ── Fake Yalc con model-config CON estado + campañas que respetan su umbral ──

let yalc: http.Server;
let storedOverrides: Record<string, unknown> = {};
let storedUpdatedAt: string | null = null;
const campaigns = new Map<string, Record<string, unknown>>();
let campaignSeq = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Deep-merge espejo del PUT real de Yalc (objetos mergean, arrays reemplazan
 * SALVO tiers — merge por key —, null borra).
 */
function mergeDocs(base: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null) {
      delete out[key];
      continue;
    }
    if (key === "tiers" && Array.isArray(value)) {
      const byKey = new Map<string, Record<string, unknown>>();
      for (const item of Array.isArray(out[key]) ? (out[key] as unknown[]) : []) {
        if (isRecord(item) && typeof item.key === "string") byKey.set(item.key, { ...item });
      }
      for (const item of value) {
        if (!isRecord(item) || typeof item.key !== "string") continue;
        const merged = { ...(byKey.get(item.key) ?? { key: item.key }) };
        for (const [field, fieldValue] of Object.entries(item)) {
          if (fieldValue === null) delete merged[field];
          else merged[field] = fieldValue;
        }
        merged.key = item.key;
        if (Object.keys(merged).length > 1) byKey.set(item.key, merged);
        else byKey.delete(item.key);
      }
      out[key] = Array.from(byKey.values());
      continue;
    }
    out[key] = isRecord(out[key]) && isRecord(value) ? mergeDocs(out[key] as Record<string, unknown>, value) : value;
  }
  return out;
}

function startFakeYalc(): Promise<string> {
  yalc = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf-8")) as unknown) : null;
      const url = req.url || "";
      res.setHeader("Content-Type", "application/json");

      if (url.startsWith("/api/model-config")) {
        if (req.method === "GET") {
          res.end(JSON.stringify({ ok: true, tenantId: "default", overrides: storedOverrides, updatedAt: storedUpdatedAt }));
          return;
        }
        if (req.method === "PUT") {
          const raw = isRecord(body) ? body : {};
          const partial = isRecord(raw.overrides) ? raw.overrides : raw;
          storedOverrides = mergeDocs(raw.reset === true ? {} : storedOverrides, partial as Record<string, unknown>);
          storedUpdatedAt = new Date().toISOString();
          res.end(JSON.stringify({ ok: true, tenantId: "default", overrides: storedOverrides, updatedAt: storedUpdatedAt }));
          return;
        }
      }

      if (req.method === "POST" && url.startsWith("/api/campaigns?")) {
        const id = `camp-${++campaignSeq}`;
        campaigns.set(id, body as Record<string, unknown>);
        res.statusCode = 201;
        res.end(JSON.stringify({ ok: true, campaignId: id, campaign: { id, ...(body as Record<string, unknown>) } }));
        return;
      }

      const assignMatch = url.match(/\/api\/campaigns\/([^/]+)\/leads\/assign/);
      if (req.method === "POST" && assignMatch) {
        // Espejo de resolveEntryStatus (hybrid): usa el umbral DE LA CAMPAÑA.
        const campaign = campaigns.get(assignMatch[1]) || {};
        const threshold = typeof campaign.disqualifyThreshold === "number" ? campaign.disqualifyThreshold : 40;
        const leads = ((body as { leads?: Array<Record<string, unknown>> })?.leads ?? []).map((lead) => {
          const score = typeof lead.qualityScore === "number" ? lead.qualityScore : null;
          const disqualified = score !== null && score < threshold;
          return {
            id: `lead-${String(lead.handle)}`,
            handle: lead.handle,
            qualityScore: score,
            lifecycleStatus: disqualified ? "Disqualified" : "Sourced",
            discardNote: disqualified ? `auto · hybrid: score < ${threshold}` : null,
          };
        });
        res.statusCode = 201;
        res.end(JSON.stringify({ ok: true, campaignId: assignMatch[1], leads, dropped: [] }));
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

// ── Efectiva: defaults ↔ overrides ↔ degradación ─────────────────────────────

test("sin overrides: efectiva = defaults con source 'defaults'", async () => {
  const effective = await lib.getEffectiveModelConfig("monzo");
  assert.equal(effective.source, "defaults");
  assert.deepEqual(effective.overrides, {});
  assert.equal(effective.config.qualification.threshold, 40);
  assert.equal(effective.config.tiers.find((tier) => tier.key === "mid")?.erBenchmarkPct, 4.0);
});

test("putModelConfigOverrides: PUT parcial → GET devuelve lo editado (DoD)", async () => {
  const afterPut = await lib.putModelConfigOverrides("monzo", {
    tiers: [{ key: "mid", erBenchmarkPct: 8.0 }],
  });
  assert.equal(afterPut.source, "yalc");
  assert.equal(afterPut.config.tiers.find((tier) => tier.key === "mid")?.erBenchmarkPct, 8.0);

  // Segundo PUT parcial: el primero sobrevive (deep-merge en Yalc).
  await lib.putModelConfigOverrides("monzo", { qualification: { threshold: 55 } });
  const effective = await lib.getEffectiveModelConfig("monzo");
  assert.equal(effective.source, "yalc");
  assert.equal(effective.config.tiers.find((tier) => tier.key === "mid")?.erBenchmarkPct, 8.0);
  assert.equal(effective.config.qualification.threshold, 55);
  // El resto sigue en defaults.
  assert.equal(effective.config.qualification.defaultMode, "hybrid");
  assert.deepEqual([...effective.config.verticals], ["finanzas personales", "inversión", "ahorro", "fintech"]);
});

test("editar un tier después NO borra el override de otro (merge por key en el documento)", async () => {
  // mid 8.0 sigue almacenado; editar micro debe conservarlo.
  await lib.putModelConfigOverrides("monzo", { tiers: [{ key: "micro", erBenchmarkPct: 6.0 }] });
  const effective = await lib.getEffectiveModelConfig("monzo");
  assert.equal(effective.config.tiers.find((tier) => tier.key === "mid")?.erBenchmarkPct, 8.0);
  assert.equal(effective.config.tiers.find((tier) => tier.key === "micro")?.erBenchmarkPct, 6.0);
  // Y el preview local (dry-run MCP) refleja la misma semántica.
  const preview = await lib.previewModelConfigUpdate("monzo", { tiers: [{ key: "nano", erBenchmarkPct: 7.0 }] });
  const tiers = preview.wouldStore.tiers as Array<{ key: string; erBenchmarkPct: number }>;
  assert.deepEqual(
    tiers.map((tier) => tier.key).sort(),
    ["micro", "mid", "nano"],
  );
});

test("putModelConfigOverrides valida claves desconocidas (espejo del 400 de Yalc)", async () => {
  await assert.rejects(
    () => lib.putModelConfigOverrides("monzo", { tires: [] }),
    lib.ModelConfigValidationError,
  );
  await assert.rejects(() => lib.putModelConfigOverrides("monzo", {}), /Empty update/);
});

test("el ER de tier editado cambia el quality score de qualify-enrich", async () => {
  // mid 8.0 sigue almacenado del test anterior; Lucía (142K, ER 4.8, mid)
  // pasa de 'por encima del benchmark' (4.0) a 'por debajo' (8.0) → score < 87.
  const effective = await lib.getEffectiveModelConfig("monzo");
  const candidates = lib.loadFixtureCandidates();
  const lucia = lib
    .qualifyCandidates(candidates, { config: effective.config })
    .find((item) => item.candidate.handle === "@finanzasconlucia")!;
  assert.equal(lucia.lead.qualityComponents.erBenchmarkPct, 8.0);
  assert.ok(lucia.score.total < 87, `score con benchmark 8.0 debe bajar de 87 (fue ${lucia.score.total})`);

  // Con la config default, paridad intacta (87).
  const baseline = lib
    .qualifyCandidates(candidates, {})
    .find((item) => item.candidate.handle === "@finanzasconlucia")!;
  assert.equal(baseline.score.total, 87);
});

// ── DoD: el umbral nuevo aplica a búsquedas nuevas + run de fixtures ─────────

test("umbral editado → búsqueda nueva lo congela y el run de fixtures descarta con él", async () => {
  // Reset: SOLO umbral 55 (sin tocar tiers → scores del mockup intactos).
  await lib.putModelConfigOverrides("monzo", { qualification: { threshold: 55 } }, { reset: true });

  const created = await lib.createDiscoverySearch({
    slug: "monzo",
    plan: {
      title: "Finanzas ES · umbral nuevo",
      sectors: ["finanzas personales"],
      networks: ["instagram"],
      // SIN qualificationMode ni disqualifyThreshold → defaults efectivos.
    },
  });

  // El payload de la campaign llevó el umbral editado (se congela al crear).
  const campaign = campaigns.get(created.campaignId)!;
  assert.equal(campaign.qualificationMode, "hybrid");
  assert.equal(campaign.disqualifyThreshold, 55);
  assert.equal(created.plan.disqualifyThreshold, 55);

  // Run con fixtures: scores del mockup 87/91/74/82/58/79/88/31/52 → con
  // umbral 55 caen @pelotazo_cripto (31) y @cuentasclaras_es2 (52).
  const run = await lib.runDiscoverySearch({ slug: "monzo", searchId: created.search.id, fixtures: true });
  assert.equal(run.stats.candidates, 9);
  assert.equal(run.stats.disqualified, 2);
  assert.equal(run.stats.sourced, 7);
  const disqualified = run.inserted
    .filter((lead) => lead.lifecycleStatus === "Disqualified")
    .map((lead) => lead.handle)
    .sort();
  assert.deepEqual(disqualified, ["@cuentasclaras_es2", "@pelotazo_cripto"]);
  assert.match(String(run.inserted.find((lead) => lead.handle === "@pelotazo_cripto")?.discardNote), /score < 55/);
});

test("plan explícito gana al default efectivo (no se pisa lo que pide el operador)", async () => {
  const created = await lib.createDiscoverySearch({
    slug: "monzo",
    plan: {
      title: "Umbral explícito 30",
      sectors: ["fintech"],
      networks: ["youtube"],
      disqualifyThreshold: 30,
      qualificationMode: "manual",
    },
  });
  const campaign = campaigns.get(created.campaignId)!;
  assert.equal(campaign.disqualifyThreshold, 30);
  assert.equal(campaign.qualificationMode, "manual");
});

test("Yalc caído: la efectiva degrada a defaults y reporta el error", async () => {
  const previous = process.env.YALC_BASE_URL;
  process.env.YALC_BASE_URL = "http://127.0.0.1:1";
  try {
    const effective = await lib.getEffectiveModelConfig("monzo");
    assert.equal(effective.source, "defaults");
    assert.equal(effective.config.qualification.threshold, 40);
    assert.ok(effective.yalcError, "reporta el error de transporte");
  } finally {
    process.env.YALC_BASE_URL = previous;
  }
});
