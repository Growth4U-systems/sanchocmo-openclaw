import { afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import type { DiscoveryPlan } from "../discovery-types";

type LiveDiscoveryMod = typeof import("../scrapecreators-live");
let live: LiveDiscoveryMod;

const realFetch = globalThis.fetch;
const originalEnv = {
  apiKey: process.env.SCRAPECREATORS_API_KEY,
  max: process.env.PARTNERSHIPS_LIVE_DISCOVERY_MAX_CANDIDATES,
  timeout: process.env.PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS,
  requestTimeout: process.env.SCRAPECREATORS_TIMEOUT_MS,
  concurrency: process.env.PARTNERSHIPS_LIVE_DISCOVERY_CONCURRENCY,
};

before(async () => {
  live = await import("../scrapecreators-live");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore("SCRAPECREATORS_API_KEY", originalEnv.apiKey);
  restore("PARTNERSHIPS_LIVE_DISCOVERY_MAX_CANDIDATES", originalEnv.max);
  restore("PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS", originalEnv.timeout);
  restore("SCRAPECREATORS_TIMEOUT_MS", originalEnv.requestTimeout);
  restore("PARTNERSHIPS_LIVE_DISCOVERY_CONCURRENCY", originalEnv.concurrency);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function plan(overrides: Partial<DiscoveryPlan> = {}): DiscoveryPlan {
  return {
    title: "Salud capilar ES",
    sectors: ["salud capilar"],
    hashtags: ["#trasplantecapilar"],
    networks: ["instagram"],
    tiers: ["micro", "mid"],
    audienceEsMinPct: 70,
    targetVolume: 3,
    ...overrides,
  };
}

test("live discovery pagina con cursor, agrega sectores+hashtags, deduplica y tolera fallos parciales", async () => {
  process.env.SCRAPECREATORS_API_KEY = "test-key";
  process.env.PARTNERSHIPS_LIVE_DISCOVERY_CONCURRENCY = "5";
  const urls: string[] = [];
  const detailCalls = new Map<string, number>();

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urls.push(url.toString());

    if (url.pathname === "/v1/instagram/search/profiles") {
      const query = url.searchParams.get("query");
      const cursor = url.searchParams.get("cursor");
      assert.equal(query, "salud capilar");
      if (!cursor) {
        return json({
          success: true,
          profiles: [
            { username: "clinica_a", full_name: "Clínica A", follower_count: 50_000 },
            { username: "global_b", full_name: "Global B", follower_count: 60_000 },
            { username: "perfil_error", follower_count: 70_000 },
          ],
          cursor: "2",
        });
      }
      assert.equal(cursor, "2");
      return json({
        success: true,
        profiles: [
          { username: "global_b", follower_count: 60_000 },
          { username: "doctor_c", full_name: "Doctor C", follower_count: 80_000 },
        ],
        // Cursor repetido: el runner debe cortar y no entrar en bucle.
        cursor: "2",
      });
    }

    if (url.pathname === "/v1/instagram/search/hashtag") {
      const hashtag = url.searchParams.get("hashtag");
      if (hashtag === "trasplantecapilar") {
        return json({
          success: true,
          posts: [
            { owner: { username: "doctor_c", full_name: "Doctor C", follower_count: 80_000 } },
            { owner: { username: "salud_d", full_name: "Salud D", follower_count: 90_000 } },
          ],
        });
      }
      assert.equal(hashtag, "saludcapilar");
      return json({ success: true, posts: [] });
    }

    if (url.pathname === "/v1/instagram/profile") {
      const handle = String(url.searchParams.get("handle"));
      detailCalls.set(handle, (detailCalls.get(handle) || 0) + 1);
      if (handle === "perfil_error") return json({ message: "temporary" }, 500);
      const spanish = handle !== "global_b";
      return json({
        success: true,
        data: {
          user: {
            username: handle,
            full_name: handle,
            category_name: handle === "clinica_a" ? "Health/Beauty" : undefined,
            external_url: handle === "clinica_a" ? "https://clinica-a.example" : undefined,
            business_email: handle === "clinica_a" ? "hola@clinica-a.example" : undefined,
            biography: spanish
              ? "Clínica de salud en España para tratamiento capilar con pacientes"
              : "Worldwide beauty creator and hair tips",
            edge_followed_by: { count: 50_000 },
          },
        },
      });
    }

    if (url.pathname === "/v2/instagram/user/posts") {
      const handle = String(url.searchParams.get("handle"));
      return json({
        success: true,
        items: [
          {
            like_count: 1_000,
            comment_count: 50,
            taken_at: 1_783_000_000,
            url: `https://www.instagram.com/p/${handle}-1/`,
            caption: {
              text: handle === "global_b" ? "hair tips" : "tratamiento de salud para pacientes en España",
            },
          },
          {
            like_count: 900,
            comment_count: 40,
            taken_at: 1_782_395_200,
            caption: handle === "global_b" ? "beauty worldwide" : "clínica capilar con médicos de España",
          },
        ],
      });
    }

    return json({ message: `unexpected ${url.pathname}` }, 404);
  }) as typeof fetch;

  const candidates = await live.scrapeLiveDiscoveryCandidates(plan());
  assert.deepEqual(candidates.map((candidate) => candidate.handle), ["@clinica_a", "@global_b", "@doctor_c"]);
  assert.equal(candidates.length, 3, "respeta targetVolume después de gates");
  assert.equal(candidates[0].email, "hola@clinica-a.example");
  assert.deepEqual(candidates[0].customVariables, {
    nombre_perfil: "clinica_a",
    categoria: "Health/Beauty",
    biografia: "Clínica de salud en España para tratamiento capilar con pacientes",
    enlace_bio: "https://clinica-a.example",
    email_publico: "hola@clinica-a.example",
    ultimo_post_texto: "tratamiento de salud para pacientes en España",
    ultimo_post_url: "https://www.instagram.com/p/clinica_a-1/",
    sector_plan: "salud capilar",
  });
  assert.equal(candidates[0].signals?.fakeFollowersPct, undefined);
  assert.equal(candidates[0].signals?.suspiciousGrowthSpikes, undefined);
  assert.equal(detailCalls.get("doctor_c"), 1, "deduplica el owner encontrado por query y hashtag");
  assert.equal(detailCalls.get("perfil_error"), 2, "reintenta un 5xx sin abortar los demás perfiles");
  assert.ok(urls.some((url) => url.includes("cursor=2")), "consume el cursor oficial");
  assert.ok(urls.every((url) => !url.includes("page=")), "no usa el parámetro page obsoleto");
  assert.ok(urls.every((url) => !url.includes("count=")), "no envía parámetros no documentados");
  assert.ok(urls.some((url) => url.includes("search%2Fhashtag") || url.includes("search/hashtag")));
  assert.ok(urls.every((url) => !/inteligencia|tecnologia|consultoria/i.test(url)));
});

test("targetVolume no está fijado en 50 y el cap operativo sigue siendo configurable", async () => {
  process.env.SCRAPECREATORS_API_KEY = "test-key";
  process.env.PARTNERSHIPS_LIVE_DISCOVERY_MAX_CANDIDATES = "2";
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/instagram/search/profiles") {
      return json({
        success: true,
        profiles: [
          { username: "uno", follower_count: 50_000 },
          { username: "dos", follower_count: 50_000 },
          { username: "tres", follower_count: 50_000 },
          { username: "cuatro", follower_count: 50_000 },
        ],
      });
    }
    if (url.pathname === "/v1/instagram/search/hashtag") return json({ success: true, posts: [] });
    if (url.pathname === "/v1/instagram/profile") {
      const handle = url.searchParams.get("handle");
      return json({
        success: true,
        data: { user: { username: handle, biography: "contenido", edge_followed_by: { count: 50_000 } } },
      });
    }
    if (url.pathname === "/v2/instagram/user/posts") return json({ success: true, items: [] });
    return json({}, 404);
  }) as typeof fetch;

  const candidates = await live.scrapeLiveDiscoveryCandidates(plan({
    audienceEsMinPct: undefined,
    targetVolume: 137,
  }));
  assert.equal(candidates.length, 2);
});

test("targetVolume puede devolver más de diez perfiles", async () => {
  process.env.SCRAPECREATORS_API_KEY = "test-key";
  process.env.PARTNERSHIPS_LIVE_DISCOVERY_MAX_CANDIDATES = "50";
  const profiles = Array.from({ length: 12 }, (_, index) => ({
    username: `creator_${index + 1}`,
    follower_count: 50_000,
  }));
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/instagram/search/profiles") {
      return json({ success: true, profiles });
    }
    if (url.pathname === "/v1/instagram/search/hashtag") return json({ success: true, posts: [] });
    if (url.pathname === "/v1/instagram/profile") {
      const handle = url.searchParams.get("handle");
      return json({
        success: true,
        data: { user: { username: handle, edge_followed_by: { count: 50_000 } } },
      });
    }
    if (url.pathname === "/v2/instagram/user/posts") return json({ success: true, items: [] });
    return json({}, 404);
  }) as typeof fetch;

  const candidates = await live.scrapeLiveDiscoveryCandidates(plan({
    audienceEsMinPct: undefined,
    targetVolume: 12,
  }));
  assert.equal(candidates.length, 12);
});

test("audienceEsMinPct aplica el hard gate CET con timestamps reales", async () => {
  process.env.SCRAPECREATORS_API_KEY = "test-key";
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/instagram/search/profiles") {
      return json({
        success: true,
        profiles: [
          { username: "horario_cet", follower_count: 50_000 },
          { username: "madrugada_cet", follower_count: 50_000 },
        ],
      });
    }
    if (url.pathname === "/v1/instagram/search/hashtag") return json({ success: true, posts: [] });
    if (url.pathname === "/v1/instagram/profile") {
      const handle = url.searchParams.get("handle");
      return json({
        success: true,
        data: { user: { username: handle, edge_followed_by: { count: 50_000 } } },
      });
    }
    if (url.pathname === "/v2/instagram/user/posts") {
      const handle = url.searchParams.get("handle");
      return json({
        success: true,
        items: [{
          taken_at: handle === "horario_cet"
            ? "2026-07-01T10:00:00+02:00"
            : "2026-07-01T03:00:00+02:00",
        }],
      });
    }
    return json({}, 404);
  }) as typeof fetch;

  const candidates = await live.scrapeLiveDiscoveryCandidates(plan({ targetVolume: 2 }));
  assert.deepEqual(candidates.map((candidate) => candidate.handle), ["@horario_cet"]);
  assert.equal(candidates[0].signals?.cetAlignmentPct, 100);
});

test("live server-side rechaza planes mixtos en vez de ignorar redes", async () => {
  process.env.SCRAPECREATORS_API_KEY = "test-key";
  const mixed = plan({ networks: ["instagram", "tiktok", "youtube"] });
  assert.equal(live.supportsLiveDiscovery(mixed), false);
  assert.deepEqual(live.unsupportedLiveDiscoveryNetworks(mixed), ["tiktok", "youtube"]);
  await assert.rejects(() => live.scrapeLiveDiscoveryCandidates(mixed), /solo soporta Instagram/);
});

test("buildLiveDiscoveryQueries solo usa el nicho del plan", () => {
  assert.deepEqual(live.buildLiveDiscoveryQueries(plan()), {
    profileQueries: ["salud capilar"],
    hashtags: ["trasplantecapilar", "saludcapilar"],
  });
});
