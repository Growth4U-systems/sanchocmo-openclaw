/**
 * seed-partnerships-demo.ts (SAN-78 + SAN-80) — siembra el Yalc LOCAL con los
 * 9 creators canónicos del mockup contactos-lista.html + las conversaciones
 * del Inbox (inbox.html) para desarrollar/verificar la UI de
 * Outreach·Partnerships (Encuentra + Contactos + drawer + Inbox + Plantillas).
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
 *  5. (SAN-80) Registra las búsquedas en Sancho (`brand/{slug}/outreach/
 *     searches/`), siembra la biblioteca de plantillas del mockup e instancia
 *     la secuencia "Primer contacto creators fintech" en la búsqueda activa —
 *     lo que necesita el flujo Contactar (gate + dry-run).
 *  6. (SAN-80) Siembra las conversaciones del Inbox: hilos out/in vía
 *     `POST /api/leads/:id/messages` y `POST /api/webhooks/reply` (replies con
 *     precio para el panel break-even) + 3 personas extra para encender los
 *     chips Reunión / Parado / Rebotado.
 *  7. (SAN-81) Siembra la performance fake de los 3 creators con deal
 *     (posts → clicks → signups → KYC → first_tx, fechas relativas a hoy)
 *     en `brand/{slug}/outreach/performance.json` — enciende Metrics ·
 *     Partnerships (KPIs 90d del mockup: 11.300€ · 9 posts · 24.8K clicks ·
 *     CPA real 13,6€ · ROI 5,9×). El tracking real llega en Fase 2 (Impact).
 *
 * Idempotente: re-ejecutarlo actualiza en vez de duplicar (ancla provider_id='seed:<handle>').
 *
 * Env:
 *   YALC_BASE_URL   (default http://localhost:3847)
 *   YALC_API_TOKEN  o GTM_OS_API_TOKEN (bearer; opcional si el server no exige token)
 *   YALC_DB         ruta a la SQLite de Yalc (default ~/.gtm-os/gtm-os.db;
 *                   también respeta DATABASE_URL=file:<path>)
 *   SANCHO_SLUG     slug del cliente en Sancho para el paso 5 (default: monzo)
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { computeQualityScore, SEED_CREATORS } from "../src/lib/calc-creator-core";
import type { SeedCreator } from "../src/lib/calc-creator-core";
import {
  assignTemplateToSearch,
  ensurePerformanceSeed,
  ensureSeedTemplates,
  getSearch,
  listSearches,
  saveSearch,
} from "../src/lib/partnerships";
import type { DiscoverySearchRecord } from "../src/lib/partnerships";

// ── Config ──

const BASE_URL = (process.env.YALC_BASE_URL || "http://localhost:3847").replace(/\/+$/, "");
const TOKEN = process.env.YALC_API_TOKEN || process.env.GTM_OS_API_TOKEN || "";
const DB_PATH = resolveDbPath();
const SANCHO_SLUG = process.env.SANCHO_SLUG || "monzo";

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

  // ── 5 · (SAN-80) Búsquedas en Sancho + plantillas instanciadas ──
  await seedSanchoSearchesAndTemplates(campaignIds);

  // ── 6 · (SAN-80) Conversaciones del Inbox ──
  await seedInboxConversations(campaignIds);

  // ── 7 · (SAN-81) Performance por creator → Metrics · Partnerships ──
  const perf = ensurePerformanceSeed(SANCHO_SLUG);
  console.log(
    `\n✔ Performance (SAN-81): ${perf.seeded} creators con posts sembrados → ` +
      `Metrics · Partnerships (/dashboard/${SANCHO_SLUG}/metrics?tab=partnerships)`,
  );

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

// ════════ SAN-80 · Búsquedas Sancho-side + plantillas ════════

/**
 * El flujo Contactar necesita el registro de búsqueda de Sancho
 * (brand/{slug}/outreach/searches/{id}.json) con su secuencia INSTANCIADA.
 * El seed lo crea para las 2 búsquedas con candidatos (SAN-79 lo hace solo
 * para búsquedas creadas por chat) y siembra la biblioteca del mockup.
 */
async function seedSanchoSearchesAndTemplates(campaignIds: Map<SearchDef["key"], string>): Promise<void> {
  console.log(`\n▸ Sancho: búsquedas + plantillas para slug "${SANCHO_SLUG}" (SANCHO_SLUG)`);
  ensureSeedTemplates(SANCHO_SLUG);

  const PLAN_BY_KEY: Record<string, { sectors: string[]; networks: string[] }> = {
    "finanzas-es": { sectors: ["finanzas personales", "ahorro"], networks: ["instagram", "tiktok"] },
    "youtubers-inversion": { sectors: ["inversión", "bolsa"], networks: ["youtube"] },
  };

  for (const search of SEARCHES) {
    if (search.status === "draft") continue; // la draft nace por chat (SAN-79)
    const campaignId = campaignIds.get(search.key)!;
    const existing = listSearches(SANCHO_SLUG).find((item) => item.campaignId === campaignId);
    if (existing) {
      console.log(`= Búsqueda Sancho ya existe: ${existing.id} (${search.title})`);
      continue;
    }
    const now = new Date().toISOString();
    const record: DiscoverySearchRecord = {
      id: `ds-seed-${search.key}`,
      slug: SANCHO_SLUG,
      title: search.title,
      plan: {
        title: search.title,
        sectors: PLAN_BY_KEY[search.key]?.sectors ?? ["finanzas"],
        networks: PLAN_BY_KEY[search.key]?.networks ?? ["instagram"],
        tiers: ["micro", "mid", "macro"],
        signals: { adLibrary: true, competitorBrands: ["N26", "Revolut"] },
        templates: [],
        qualificationMode: "hybrid",
        disqualifyThreshold: 40,
      },
      campaignId,
      taskId: null,
      runner: {
        status: "done",
        mode: "fixtures",
        queuedAt: now,
        startedAt: now,
        finishedAt: now,
        error: null,
        stats: null,
      },
      createdAt: now,
      updatedAt: now,
    };
    saveSearch(record);
    console.log(`+ Búsqueda Sancho creada: ${record.id} (${search.title})`);
  }

  // Instanciar la secuencia del mockup en la búsqueda activa (idempotente).
  const activeSearch = listSearches(SANCHO_SLUG).find(
    (item) => item.campaignId === campaignIds.get("finanzas-es"),
  );
  if (activeSearch) {
    const result = assignTemplateToSearch(SANCHO_SLUG, "primer-contacto-creators-fintech", {
      searchId: activeSearch.id,
    });
    const refreshed = getSearch(SANCHO_SLUG, activeSearch.id);
    console.log(
      `✔ Plantillas de «${activeSearch.title}»: ${(refreshed?.templates ?? []).map((t) => t.name).join(" · ") || result.instance.name}`,
    );
  }
}

// ════════ SAN-80 · Conversaciones del Inbox ════════

interface ConvoMessage {
  direction: "in" | "out";
  subject?: string;
  body: string;
  /** Días hacia atrás desde ahora. */
  daysAgo: number;
  /** Solo para direction in: entra por el reply-webhook (marca Replied). */
  viaWebhook?: boolean;
}

interface ConvoDef {
  handle: string;
  /** Estado FINAL tras sembrar los mensajes (los replies mueven a Replied). */
  finalStatus?: string;
  /** Marca el primer toque como ya enviado (email_sent_at + dry_run). */
  markSent?: boolean;
  messages: ConvoMessage[];
  draft?: string;
}

/** Personas extra del Inbox (no están en contactos-lista): encienden Reunión/Parado/Rebotado. */
const EXTRA_INBOX_CREATORS: Array<{
  handle: string;
  network: string;
  followers: number;
  er: number;
  tier: string;
  quality: number;
  busqueda: SearchDef["key"];
}> = [
  { handle: "@elclubdelahorro", network: "Instagram", followers: 96_000, er: 5.1, tier: "mid", quality: 81, busqueda: "finanzas-es" },
  { handle: "@podcastdinero", network: "TikTok", followers: 38_000, er: 4.2, tier: "micro", quality: 72, busqueda: "finanzas-es" },
  { handle: "@criptoclara", network: "Instagram", followers: 54_000, er: 3.6, tier: "micro", quality: 64, busqueda: "finanzas-es" },
];

const INBOX_CONVOS: ConvoDef[] = [
  {
    // Negociando — el hilo estrella del mockup (precio 3.500€ → panel break-even)
    handle: "@finanzasconlucia",
    finalStatus: "Negotiating",
    markSent: true,
    messages: [
      {
        direction: "out",
        subject: "Colaboración Monzo × Lucía",
        daysAgo: 4,
        body:
          "Hola Lucía, soy parte del equipo de partnerships de Monzo en España. Llevamos semanas siguiendo tu contenido — el reel sobre los gastos hormiga nos pareció exactamente el tono que buscamos. Estamos lanzando un programa con creators de finanzas (20K€ de presupuesto este trimestre) y nos encantaría contar contigo. ¿Te cuadraría una colaboración de 2-3 reels presentando la cuenta Monzo a tu audiencia?",
      },
      {
        direction: "in",
        daysAgo: 0,
        viaWebhook: true,
        body:
          "¡Hola! Gracias por escribirme, conozco Monzo y la verdad es que me encaja mucho con mi línea de contenido. Por un pack de 3 reels (guion mío, una ronda de revisión vuestra) mi tarifa sería de 3.500€. Incluiría también compartirlos en stories la semana de publicación. ¿Cómo lo veis?",
      },
    ],
    draft:
      "Hola Lucía,\n\n¡Gracias por la respuesta y por la propuesta tan clara! El formato de 3 reels + stories nos encaja perfecto. El presupuesto que manejamos para este tier está un poco por debajo de tu tarifa, así que te proponemos una alternativa: 2.800€ fijos + 10€ por cada cuenta verificada que llegue desde tu audiencia (link trackeado). Con tu engagement, la parte variable puede superar de largo la diferencia.\n\n¿Lo vemos en una llamada esta semana?\n\nUn saludo,\nEquipo Monzo",
  },
  {
    // Respondió — segunda reply con precio (1.200€)
    handle: "@davidfintech",
    finalStatus: "Replied",
    markSent: true,
    messages: [
      {
        direction: "out",
        subject: "Programa creators Monzo España",
        daysAgo: 3,
        body:
          "Hola David, desde Monzo estamos lanzando un programa con creators de finanzas en España. Tu contenido sobre fintech encaja de lleno. ¿Te interesa una colaboración este trimestre?",
      },
      {
        direction: "in",
        daysAgo: 0,
        viaWebhook: true,
        body:
          "¡Me interesa! El año pasado hice algo parecido con N26 y funcionó muy bien. Mi tarifa ronda 1.200€ por reel, negociable si es un pack. ¿Qué teníais en mente?",
      },
    ],
  },
  {
    // Contactado — primer toque enviado, sin respuesta
    handle: "@ahorroconmarta",
    markSent: true,
    messages: [
      {
        direction: "out",
        subject: "Monzo × Marta — programa creators",
        daysAgo: 1,
        body:
          "Hola Marta, desde Monzo estamos lanzando un programa con creators de ahorro y finanzas personales en España. Tu serie de retos de ahorro en TikTok es exactamente el enfoque que buscamos. ¿Hablamos esta semana?",
      },
    ],
  },
  {
    // Reunión — persona extra (Demo_Booked)
    handle: "@elclubdelahorro",
    finalStatus: "Demo_Booked",
    markSent: true,
    messages: [
      {
        direction: "out",
        subject: "Monzo × El Club del Ahorro",
        daysAgo: 2,
        body: "Hola, desde Monzo nos encantaría contar con vosotros en el programa de creators. ¿Os va una llamada?",
      },
      {
        direction: "in",
        daysAgo: 1,
        viaWebhook: true,
        body: "Perfecto, nos vemos el jueves a las 10:00. Os paso mi calendly: calendly.com/elclubdelahorro",
      },
    ],
  },
  {
    // Parado — persona extra (No_Reply tras 2 follow-ups)
    handle: "@podcastdinero",
    finalStatus: "No_Reply",
    markSent: true,
    messages: [
      {
        direction: "out",
        subject: "Monzo × Podcast Dinero",
        daysAgo: 9,
        body: "Hola, ¿os encajaría una colaboración con Monzo para el podcast? Presupuesto del trimestre abierto.",
      },
      {
        direction: "out",
        subject: "Re: Monzo × Podcast Dinero",
        daysAgo: 6,
        body: "Reflote rápido — seguimos con hueco para este trimestre. Sin respuesta tras 2 follow-ups, Sancho sugiere pausar 2 semanas.",
      },
    ],
  },
  {
    // Rebotado — persona extra (email bounced; prioridad sobre lifecycle)
    handle: "@criptoclara",
    finalStatus: "Queued",
    markSent: true,
    messages: [
      {
        direction: "out",
        subject: "Monzo × Clara",
        daysAgo: 2,
        body: "Hola Clara, nos encantaría hablar de una colaboración con Monzo.",
      },
    ],
  },
];

async function seedInboxConversations(campaignIds: Map<SearchDef["key"], string>): Promise<void> {
  console.log("\n▸ Inbox: conversaciones (SAN-80)");

  // Personas extra (alta mínima + creator-fields por SQL, como el resto del seed)
  for (const extra of EXTRA_INBOX_CREATORS) {
    const campaignId = campaignIds.get(extra.busqueda)!;
    const providerId = `seed:${extra.handle}`;
    const [active, discarded] = await Promise.all([
      api<{ leads?: YalcLead[] }>(`/api/leads?campaignId=${encodeURIComponent(campaignId)}`),
      api<{ leads?: YalcLead[] }>(
        `/api/leads?campaignId=${encodeURIComponent(campaignId)}&lifecycleStatus=Disqualified`,
      ),
    ]);
    let lead = [...(active.leads || []), ...(discarded.leads || [])].find(
      (item) => item.providerId === providerId || item.handle === extra.handle,
    );
    if (!lead) {
      const inserted = await api<{ leads: YalcLead[] }>(`/api/campaigns/${campaignId}/leads/assign`, {
        method: "POST",
        body: {
          leads: [
            {
              providerId,
              firstName: extra.handle,
              source: "pre_scored",
              qualificationScore: extra.quality,
              tags: ["seed:mockup-partnerships", "seed:inbox", `busqueda:${extra.busqueda}`],
            },
          ],
        },
      });
      lead = inserted.leads[0];
      console.log(`+ Lead inbox creado: ${extra.handle} (${lead.id})`);
    }
    runSql([
      `UPDATE campaign_leads SET ` +
        `handle=${sqlValue(extra.handle)}, network=${sqlValue(extra.network)}, ` +
        `followers=${sqlValue(extra.followers)}, engagement_rate=${sqlValue(extra.er)}, ` +
        `tier=${sqlValue(extra.tier)}, quality_score=${sqlValue(extra.quality)}, ` +
        `qualification_score=${sqlValue(extra.quality)}, updated_at=datetime('now') ` +
        `WHERE provider_id=${sqlQuote(providerId)};`,
    ]);
  }

  // Hilos de conversación
  for (const convo of INBOX_CONVOS) {
    const found = await api<{ leads?: YalcLead[] }>(
      `/api/leads?type=Partnerships&q=${encodeURIComponent(convo.handle)}`,
    );
    const lead = (found.leads || []).find((item) => item.handle === convo.handle);
    if (!lead) {
      console.warn(`! Inbox: lead no encontrado para ${convo.handle} — me lo salto`);
      continue;
    }

    // Idempotencia: si el hilo ya tiene mensajes no-draft, no re-sembrar.
    const thread = await api<{ messages?: Array<{ status?: string }> }>(
      `/api/leads/${encodeURIComponent(lead.id)}/messages`,
    );
    const alreadySeeded = (thread.messages || []).some((message) => message.status !== "draft");
    if (!alreadySeeded) {
      for (const message of convo.messages) {
        const createdAt = new Date(Date.now() - message.daysAgo * 86_400_000).toISOString();
        if (message.direction === "in" && message.viaWebhook) {
          // El camino REAL de ingestión (gmail-reply-webhook): marca Replied + hilo.
          await api("/api/webhooks/reply", {
            method: "POST",
            body: {
              leadId: lead.id,
              subject: message.subject,
              body: message.body,
              receivedAt: createdAt,
            },
          });
        } else {
          await api(`/api/leads/${encodeURIComponent(lead.id)}/messages`, {
            method: "POST",
            body: {
              direction: message.direction,
              subject: message.subject,
              body: message.body,
              status: message.direction === "out" ? "dry_run" : "received",
              createdAt,
            },
          });
        }
      }
      console.log(`+ Hilo sembrado: ${convo.handle} (${convo.messages.length} mensajes)`);
    } else {
      console.log(`= Hilo ya existe: ${convo.handle}`);
    }

    // Borrador del Inbox (upsert — siempre se refresca)
    if (convo.draft) {
      await api(`/api/leads/${encodeURIComponent(lead.id)}/messages`, {
        method: "POST",
        body: { direction: "out", body: convo.draft, status: "draft" },
      });
    }

    // Email tracking + estado final (los replies del webhook mueven a Replied;
    // re-asentamos el estado del mockup DESPUÉS de los mensajes).
    if (convo.markSent) {
      const oldestOut = convo.messages.find((message) => message.direction === "out");
      const sentAt = new Date(Date.now() - (oldestOut?.daysAgo ?? 1) * 86_400_000).toISOString();
      runSql([
        `UPDATE campaign_leads SET email_sent_at=${sqlValue(sentAt)}, ` +
          `email_status=${sqlValue(convo.handle === "@criptoclara" ? "bounced" : "dry_run")}` +
          `${convo.handle === "@criptoclara" ? `, email_bounced_at=${sqlValue(sentAt)}` : ""} ` +
          `WHERE id=${sqlQuote(lead.id)};`,
      ]);
    }
    if (convo.finalStatus && lead.lifecycleStatus !== convo.finalStatus) {
      await api(`/api/leads/${encodeURIComponent(lead.id)}/stage`, {
        method: "PATCH",
        body: { lifecycleStatus: convo.finalStatus },
      });
    } else if (convo.finalStatus) {
      // El webhook puede haberlo movido a Replied — re-asentar el estado final.
      const fresh = await api<{ leads?: YalcLead[] }>(
        `/api/leads?type=Partnerships&q=${encodeURIComponent(convo.handle)}`,
      );
      const current = (fresh.leads || []).find((item) => item.id === lead.id);
      if (current && current.lifecycleStatus !== convo.finalStatus) {
        await api(`/api/leads/${encodeURIComponent(lead.id)}/stage`, {
          method: "PATCH",
          body: { lifecycleStatus: convo.finalStatus },
        });
      }
    }
  }
  console.log("✔ Inbox listo: Negociando · Respondió · Contactado · Reunión · Parado · Rebotado");
}

main().catch((error) => {
  console.error(`✖ Seed falló: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
