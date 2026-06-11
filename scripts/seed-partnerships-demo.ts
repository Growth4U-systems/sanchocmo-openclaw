/**
 * seed-partnerships-demo.ts (SAN-78) — siembra el Yalc LOCAL con los 9 creators
 * canónicos del mockup contactos-lista.html para desarrollar/verificar la UI
 * de Outreach·Partnerships (Encuentra + Contactos + drawer).
 *
 * Uso (ver scripts/seed-partnerships-demo.README.md):
 *
 *   npx tsx scripts/seed-partnerships-demo.ts
 *
 * Qué hace:
 *  1. Crea (o reusa) 3 búsquedas = campañas Yalc `type=Partnerships`
 *     (hybrid por defecto): 2 con candidatos + 1 draft ("Podcasts fintech").
 *  2. Inserta los 9 creators como leads vía API (POST /api/campaigns/:id/leads/assign),
 *     con quality score calculado por calc-creator-core (SAN-75) — el motor
 *     reproduce EXACTAMENTE la columna quality del mockup (91/88/87/82/79/74/58/52/31).
 *  3. Completa los creator-fields (handle/red/followers/ER/tier/precio/quality
 *     components) con UPDATE directo a la SQLite de Yalc — la API de escritura
 *     de esos campos llega con el discovery runner (SAN-79); hasta entonces el
 *     seed escribe lo que el runner escribirá.
 *  4. Mueve cada lead a su stage del mockup vía PATCH /api/leads/:id/stage
 *     (incl. los 2 Descartados con su nota auto/manual, reversibles).
 *
 * Idempotente: re-ejecutarlo actualiza en vez de duplicar (ancla provider_id='seed:<handle>').
 *
 * Env:
 *   YALC_BASE_URL   (default http://localhost:3847)
 *   YALC_API_TOKEN  o GTM_OS_API_TOKEN (bearer; opcional si el server no exige token)
 *   YALC_DB         ruta a la SQLite de Yalc (default ~/.gtm-os/gtm-os.db;
 *                   también respeta DATABASE_URL=file:<path>)
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { computeQualityScore, SEED_CREATORS } from "../src/lib/calc-creator-core";
import type { SeedCreator } from "../src/lib/calc-creator-core";

// ── Config ──

const BASE_URL = (process.env.YALC_BASE_URL || "http://localhost:3847").replace(/\/+$/, "");
const TOKEN = process.env.YALC_API_TOKEN || process.env.GTM_OS_API_TOKEN || "";
const DB_PATH = resolveDbPath();

function resolveDbPath(): string {
  if (process.env.YALC_DB) return process.env.YALC_DB;
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl?.startsWith("file:")) return dbUrl.slice("file:".length);
  return join(homedir(), ".gtm-os", "gtm-os.db");
}

// ── Búsquedas (campañas type=Partnerships). El campo `busqueda` de cada seed
//    creator (calc-creator-core) referencia una de estas dos keys. ──

interface SearchDef {
  key: "finanzas-es" | "youtubers-inversion" | "podcasts-draft";
  title: string;
  hypothesis: string;
  targetSegment: string;
  /** Estado para la card de Encuentra: active → Running · completed → Done · draft → Draft. */
  status: "active" | "completed" | "draft";
}

const SEARCHES: SearchDef[] = [
  {
    key: "finanzas-es",
    title: "Creators finanzas personales ES · IG+TikTok",
    hypothesis: "Creators de finanzas personales en español traen clientes Monzo a CAC rentable.",
    targetSegment: "sectores: finanzas personales, ahorro · tiers Micro–Macro",
    status: "active",
  },
  {
    key: "youtubers-inversion",
    title: "YouTubers inversión ES",
    hypothesis: "YouTubers de inversión para principiantes convierten audiencia ES de alto intent.",
    targetSegment: "sectores: inversión, bolsa · tiers Mid–Macro",
    status: "completed",
  },
  {
    key: "podcasts-draft",
    title: "Podcasts fintech",
    hypothesis: "Podcasts de fintech en español como canal de autoridad (plan sin lanzar).",
    targetSegment: "Spotify + Apple Podcasts",
    status: "draft",
  },
];

/** Stage del mockup → lifecycleStatus canónico de Yalc (mapeo SAN-77). */
const STAGE_TO_STATUS: Record<SeedCreator["stage"], string> = {
  Discovered: "Sourced",
  Shortlist: "Qualified",
  Contacted: "Queued",
  Replied: "Replied",
  Negotiating: "Negotiating",
  Signed: "Deal_Created",
  Active: "Closed_Won",
  Discarded: "Disqualified",
};

// ── Helpers ──

async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method || (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${init.method || "GET"} ${path} → ${res.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload as T;
}

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlValue(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return sqlQuote(value);
}

function runSql(statements: string[]): void {
  const script = [".timeout 3000", ...statements].join("\n");
  execFileSync("sqlite3", [DB_PATH], { input: script, stdio: ["pipe", "inherit", "inherit"] });
}

interface YalcCampaign {
  id: string;
  title?: string;
  type?: string;
}
interface YalcLead {
  id: string;
  providerId?: string | null;
  handle?: string | null;
  lifecycleStatus?: string | null;
  campaignId?: string;
}

async function main(): Promise<void> {
  console.log(`▸ Yalc:   ${BASE_URL}${TOKEN ? " (bearer)" : " (sin token)"}`);
  console.log(`▸ SQLite: ${DB_PATH}`);
  if (!existsSync(DB_PATH)) {
    throw new Error(
      `No existe la SQLite de Yalc en ${DB_PATH}. Arranca el server de Yalc (rama san-77: pnpm server) o pasa YALC_DB=<ruta>.`,
    );
  }

  // 1 · Campañas (find-or-create por título + type)
  const existing = await api<{ campaigns?: YalcCampaign[] }>("/api/campaigns?type=Partnerships");
  const byTitle = new Map((existing.campaigns || []).map((c) => [c.title, c]));
  const campaignIds = new Map<SearchDef["key"], string>();

  for (const search of SEARCHES) {
    const found = byTitle.get(search.title);
    if (found) {
      campaignIds.set(search.key, found.id);
      console.log(`= Búsqueda ya existe: "${search.title}" (${found.id})`);
      continue;
    }
    const created = await api<{ campaignId: string }>("/api/campaigns", {
      method: "POST",
      body: {
        title: search.title,
        hypothesis: search.hypothesis,
        targetSegment: search.targetSegment,
        channels: ["email"],
        type: "Partnerships", // → qualification_mode 'hybrid' + umbral 40 por defecto (SAN-77)
      },
    });
    campaignIds.set(search.key, created.campaignId);
    console.log(`+ Búsqueda creada: "${search.title}" (${created.campaignId})`);
  }

  // Estado de la card de Encuentra (no hay API de status arbitrario → SQL)
  runSql(
    SEARCHES.map(
      (search) =>
        `UPDATE campaigns SET status=${sqlQuote(search.status)} WHERE id=${sqlQuote(campaignIds.get(search.key)!)};`,
    ),
  );

  // 2-4 · Leads
  const summary: Array<{ handle: string; quality: number; stage: string; campaign: string }> = [];

  for (const seed of SEED_CREATORS) {
    const handle = seed.metrics.handle || "(sin handle)";
    const campaignId = campaignIds.get(seed.busqueda);
    if (!campaignId) throw new Error(`Seed ${handle}: búsqueda desconocida ${seed.busqueda}`);
    const providerId = `seed:${handle}`;

    // Quality score con el motor real (SAN-75) — reproduce el mockup
    const score = computeQualityScore(seed.metrics);
    if (score.total !== seed.expectedQuality) {
      console.warn(
        `! ${handle}: quality ${score.total} ≠ esperado ${seed.expectedQuality} (¿cambió la config del motor?)`,
      );
    }
    const componentsMap = Object.fromEntries(score.components.map((c) => [c.key, c.score]));

    // Lead existente (los Disqualified no salen en el GET por defecto → 2 consultas)
    const [active, discarded] = await Promise.all([
      api<{ leads?: YalcLead[] }>(`/api/leads?campaignId=${encodeURIComponent(campaignId)}`),
      api<{ leads?: YalcLead[] }>(
        `/api/leads?campaignId=${encodeURIComponent(campaignId)}&lifecycleStatus=Disqualified`,
      ),
    ]);
    let lead = [...(active.leads || []), ...(discarded.leads || [])].find(
      (item) => item.providerId === providerId || item.handle === handle,
    );

    if (!lead) {
      const inserted = await api<{ leads: YalcLead[] }>(`/api/campaigns/${campaignId}/leads/assign`, {
        method: "POST",
        body: {
          leads: [
            {
              providerId,
              firstName: handle,
              source: "pre_scored",
              qualificationScore: score.total,
              tags: ["seed:mockup-partnerships", `busqueda:${seed.busqueda}`],
            },
          ],
        },
      });
      lead = inserted.leads[0];
      console.log(`+ Lead creado: ${handle} (${lead.id})`);
    } else {
      console.log(`= Lead ya existe: ${handle} (${lead.id})`);
    }

    // 3 · Creator-fields vía SQL (la API de escritura llega con SAN-79)
    runSql([
      `UPDATE campaign_leads SET ` +
        `handle=${sqlValue(handle)}, ` +
        `network=${sqlValue(seed.metrics.network || null)}, ` +
        `followers=${sqlValue(seed.metrics.followers ?? null)}, ` +
        `engagement_rate=${sqlValue(seed.metrics.engagementRatePct ?? null)}, ` +
        `tier=${sqlValue(score.tier)}, ` +
        `offered_price=${sqlValue(seed.feeEur)}, ` +
        `quality_score=${sqlValue(score.total)}, ` +
        `quality_components=${sqlValue(JSON.stringify(componentsMap))}, ` +
        `qualification_score=${sqlValue(score.total)}, ` +
        `updated_at=datetime('now') ` +
        `WHERE provider_id=${sqlQuote(providerId)};`,
    ]);

    // 4 · Stage del mockup (PATCH /api/leads/:id/stage — el mismo endpoint que usa la UI)
    const targetStatus = STAGE_TO_STATUS[seed.stage];
    if (lead.lifecycleStatus !== targetStatus) {
      await api(`/api/leads/${encodeURIComponent(lead.id)}/stage`, {
        method: "PATCH",
        body: {
          lifecycleStatus: targetStatus,
          // Nota de descarte del mockup ('auto · hybrid: score < 40' | 'manual · 11 jun')
          ...(seed.stage === "Discarded" && seed.discardNote ? { note: seed.discardNote } : {}),
        },
      });
    }

    summary.push({
      handle,
      quality: score.total,
      stage: `${seed.stage} (${targetStatus})`,
      campaign: SEARCHES.find((s) => s.key === seed.busqueda)?.title || seed.busqueda,
    });
  }

  // Verificación final contra la API (lo que verá la UI)
  const check = await api<{ leads?: unknown[]; count?: number }>("/api/leads?type=Partnerships");
  const checkDiscarded = await api<{ count?: number }>("/api/leads?type=Partnerships&lifecycleStatus=Disqualified");

  console.log("\n── Resumen ──");
  console.table(summary);
  console.log(
    `✔ Yalc listo: ${check.count ?? check.leads?.length ?? 0} leads en pipeline + ${checkDiscarded.count ?? 0} descartados (type=Partnerships).`,
  );
  console.log("→ Arranca Sancho (npm run dev con YALC_BASE_URL/YALC_API_TOKEN) y abre /dashboard/<slug>/yalc");
}

main().catch((error) => {
  console.error(`✖ Seed falló: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
