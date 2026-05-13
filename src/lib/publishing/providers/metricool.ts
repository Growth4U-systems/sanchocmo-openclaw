import { readBrandSecret } from "@/lib/brand-env";
import { readJSON } from "@/lib/data/json-io";
import { integrationsFile } from "@/lib/data/paths";
import type {
  Channel,
  PublishInput,
  PublishProvider,
  PublishResult,
  PublishStatus,
} from "@/lib/publishing/types";

/**
 * Metricool publishing provider.
 *
 * Metricool's docs: https://developer.metricool.com/
 *
 * Auth: token is sent via the `X-Mc-Auth` header. `userId` and `blogId` go as
 * query params on every call. `blogId`/`userId` are extracted from the
 * dashboard URL the user pastes during api-connect setup
 * (`integrations.json → metricool.config.METRICOOL_URL`).
 *
 * The brand-scoped token lives in `brand/{slug}/.env` as
 * `{SLUG}_METRICOOL_API_TOKEN` (api-connect convention) and falls back to a
 * workspace-level `METRICOOL_API_TOKEN` so single-tenant setups Just Work.
 *
 * Carousel handling — LinkedIn carousels must be uploaded as a multi-page
 * PDF (not as a list of images). When `input.media` contains an entry with
 * `type: "application/pdf"` we send that PDF base64-encoded. Otherwise we
 * fetch each image and send the first one as a single-image post.
 */

const NETWORK_BY_CHANNEL: Record<string, string> = {
  linkedin: "linkedin",
  twitter: "twitter",
  x: "twitter",
  instagram: "instagram",
  facebook: "facebook",
  tiktok: "tiktok",
  youtube: "youtube",
};

const API_BASE = "https://app.metricool.com/api/v2";

interface MetricoolConfig {
  blogId: string;
  userId: string;
  apiToken: string;
}

interface IntegrationsData {
  dataSources?: Record<string, { config?: Record<string, string> }>;
}

function loadConfig(slug: string): { ok: true; cfg: MetricoolConfig } | { ok: false; missing: string } {
  const apiToken = readBrandSecret(slug, "metricool", "API_TOKEN");
  if (!apiToken) return { ok: false, missing: "Falta API_TOKEN de Metricool. Conéctala en Ajustes → APIs." };

  const integrations = readJSON<IntegrationsData>(integrationsFile(slug), {});
  const url = integrations.dataSources?.metricool?.config?.METRICOOL_URL || "";
  const blogId = url.match(/[?&]blogId=([^&]+)/)?.[1];
  const userId = url.match(/[?&]userId=([^&]+)/)?.[1];
  if (!blogId || !userId) {
    return {
      ok: false,
      missing: "Falta METRICOOL_URL con blogId y userId. Pégala en Ajustes → APIs → Metricool.",
    };
  }
  return { ok: true, cfg: { blogId, userId, apiToken } };
}

/** List scheduler posts within ±5 min of `dateTime` for the given network and
 *  return the matching post's id. Used right after a successful schedule
 *  POST when Metricool's response didn't include an `id` field, so we can
 *  still capture the scheduler id for later reconciliation. */
async function findSchedulerIdByMatch(
  cfg: MetricoolConfig,
  network: string,
  dateTime: string,
): Promise<string | undefined> {
  const target = Date.parse(`${dateTime}Z`);
  if (Number.isNaN(target)) return undefined;
  // ±5 min window is enough — schedule POST is synchronous so the post
  // exists immediately in Metricool's scheduler.
  const fromIso = new Date(target - 5 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "");
  const toIso = new Date(target + 5 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "");
  const sep = "&";
  const endpoint =
    `/scheduler/posts?start=${encodeURIComponent(fromIso)}` +
    `${sep}end=${encodeURIComponent(toIso)}` +
    `${sep}timezone=UTC`;
  const res = await metricoolFetch(cfg, endpoint);
  if (!res.ok) return undefined;
  const text = await res.text();
  let posts: unknown;
  try { posts = JSON.parse(text); } catch { return undefined; }
  if (!Array.isArray(posts)) return undefined;
  const list = posts as Array<Record<string, unknown>>;
  // Match by network + closest scheduledTime to our target.
  let best: { id: string; delta: number } | null = null;
  for (const p of list) {
    const pubDate = (p.publicationDate as { dateTime?: string } | undefined)?.dateTime;
    const providers = (p.providers as Array<{ network?: string }> | undefined) ?? [];
    if (!pubDate || providers.length === 0) continue;
    if (!providers.some((pr) => pr.network === network)) continue;
    const ts = Date.parse(`${pubDate}Z`);
    if (Number.isNaN(ts)) continue;
    const delta = Math.abs(ts - target);
    const id = p.id != null ? String(p.id) : undefined;
    if (!id) continue;
    if (!best || delta < best.delta) best = { id, delta };
  }
  return best?.id;
}

async function metricoolFetch(
  cfg: MetricoolConfig,
  endpoint: string,
  init: RequestInit = {},
): Promise<Response> {
  // v2 expects auth as query params (userToken + userId + blogId) AND the
  // legacy X-Mc-Auth header (kept for compat with mixed-auth endpoints).
  // Sending both is what the official metricool-cli does — safer than
  // guessing which one any given path enforces.
  const sep = endpoint.includes("?") ? "&" : "?";
  const url =
    `${API_BASE}${endpoint}${sep}` +
    `userToken=${encodeURIComponent(cfg.apiToken)}` +
    `&userId=${encodeURIComponent(cfg.userId)}` +
    `&blogId=${encodeURIComponent(cfg.blogId)}`;
  return fetch(url, {
    ...init,
    headers: {
      "X-Mc-Auth": cfg.apiToken,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export const metricoolProvider: PublishProvider = {
  id: "metricool",
  name: "Metricool",
  supportedChannels: ["linkedin", "twitter", "x", "instagram", "tiktok", "youtube"],
  capabilities: { publishNow: true, schedule: true, media: true },

  inspect(slug) {
    const result = loadConfig(slug);
    return result.ok ? { configured: true } : { configured: false, missing: result.missing };
  },

  async publish(input: PublishInput): Promise<PublishResult> {
    const result = loadConfig(input.slug);
    if (!result.ok) return { ok: false, error: result.missing };
    const cfg = result.cfg;

    const network = NETWORK_BY_CHANNEL[input.draft.channel];
    if (!network) {
      return { ok: false, error: `Canal "${input.draft.channel}" no soportado por Metricool` };
    }

    // v2 takes media as an array of public URLs that Metricool fetches
    // server-side. The legacy v1 base64 approach is gone. Pick the carousel
    // PDF first (LinkedIn document post); otherwise fall back to the first
    // image. We send a single media entry per post.
    const carouselPdf = input.media.find((m) => m.type === "application/pdf");
    const firstImage = input.media.find((m) => m.type.startsWith("image/"));
    const chosen = carouselPdf || firstImage || null;
    const media: string[] = chosen ? [chosen.url] : [];

    const publishAt = input.schedule?.publishAt ?? new Date(Date.now() + 60_000).toISOString();
    // Metricool wants `YYYY-MM-DDTHH:mm:ss` (no Z, no millis) + a separate
    // `timezone`. We always send UTC so the user-configured TZ in Metricool
    // doesn't shift the post unexpectedly.
    const dateTime = new Date(publishAt).toISOString().replace(/\.\d{3}Z$/, "");
    const body = {
      providers: [{ network }],
      text: input.draft.body,
      media,
      publicationDate: { dateTime, timezone: "UTC" },
      autoPublish: true,
      draft: false,
    };

    try {
      const res = await metricoolFetch(cfg, "/scheduler/posts", {
        method: "POST",
        body: JSON.stringify(body),
      });
      // Read raw text first so we can surface the real Metricool error even
      // when the response isn't valid JSON (some 4xx come back as HTML/plain).
      const rawText = await res.text();
      let data: { id?: string | number; url?: string; error?: string; message?: string } = {};
      try { data = JSON.parse(rawText); } catch { /* non-JSON response */ }
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error(
          `[metricool] POST /scheduler/posts failed: HTTP ${res.status}\n` +
          `  URL: ${API_BASE}/scheduler/posts (userId/blogId in query)\n` +
          `  Body sent: ${JSON.stringify(body).slice(0, 400)}\n` +
          `  Response: ${rawText.slice(0, 600)}`,
        );
        const detail = data.message || data.error || rawText.slice(0, 200) || "";
        return {
          ok: false,
          error: detail ? `HTTP ${res.status}: ${detail}` : `HTTP ${res.status}`,
        };
      }
      // Metricool's v2 schedule POST sometimes responds with `id` and
      // sometimes with the post nested under `post.id` / `data.id`. Capture
      // any of those, and as a final fallback list scheduler posts in a
      // narrow window around our publishAt to find ours by network +
      // dateTime match. The id is critical for reconciliation later.
      const dataAny = data as Record<string, unknown>;
      const candidateId =
        (typeof dataAny.id !== "undefined" && dataAny.id !== null && String(dataAny.id)) ||
        (typeof dataAny.postId !== "undefined" && dataAny.postId !== null && String(dataAny.postId)) ||
        (dataAny.post && typeof dataAny.post === "object" && (dataAny.post as { id?: unknown }).id != null
          && String((dataAny.post as { id: unknown }).id)) ||
        (dataAny.data && typeof dataAny.data === "object" && (dataAny.data as { id?: unknown }).id != null
          && String((dataAny.data as { id: unknown }).id)) ||
        undefined;
      let externalJobId: string | undefined = typeof candidateId === "string" ? candidateId : undefined;
      if (!externalJobId) {
        // Last-resort lookup: list scheduler posts in a 5-min window
        // surrounding our publishAt and find ours by dateTime + network.
        // Don't fail the publish if this lookup fails — the post is
        // already scheduled in Metricool.
        try {
          externalJobId = await findSchedulerIdByMatch(cfg, network, dateTime);
          if (!externalJobId) {
            // eslint-disable-next-line no-console
            console.warn(
              `[metricool] Schedule succeeded but no id captured. ` +
              `Response keys: ${Object.keys(dataAny).join(", ") || "(empty)"}. ` +
              `Reconciliation will fall back to text matching.`,
            );
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`[metricool] post-schedule id lookup failed: ${(e as Error).message}`);
        }
      }
      const isImmediate = !input.schedule;
      return {
        ok: true,
        externalJobId,
        externalUrl: typeof dataAny.url === "string" ? dataAny.url : undefined,
        scheduledAt: isImmediate ? undefined : publishAt,
        publishedAt: isImmediate ? new Date().toISOString() : undefined,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async getStatus(slug, externalJobId): Promise<PublishStatus> {
    const result = loadConfig(slug);
    if (!result.ok) return { status: "failed", error: result.missing };
    try {
      const res = await metricoolFetch(result.cfg, `/scheduler/posts/${encodeURIComponent(externalJobId)}`);
      if (!res.ok) return { status: "failed", error: `HTTP ${res.status}` };
      const data = (await res.json()) as {
        status?: string;
        publishedDate?: string;
        url?: string;
        error?: string;
      };
      const raw = (data.status || "").toLowerCase();
      const status: PublishStatus["status"] = raw.includes("publish") && data.publishedDate
        ? "published"
        : raw.includes("error") || raw.includes("fail")
          ? "failed"
          : raw.includes("cancel")
            ? "canceled"
            : "scheduled";
      return {
        status,
        externalUrl: data.url ?? null,
        publishedAt: data.publishedDate ?? null,
        error: data.error ?? null,
      };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
  },

  async cancel(slug, externalJobId) {
    const result = loadConfig(slug);
    if (!result.ok) return { ok: false, error: result.missing };
    try {
      const res = await metricoolFetch(result.cfg, `/scheduler/posts/${encodeURIComponent(externalJobId)}`, {
        method: "DELETE",
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  /**
   * Pull current engagement for a batch of published posts. Groups by
   * channel/network, makes one analytics call per network covering the
   * full window from the earliest publish date to today, then matches
   * each input to a post by URL. One Metricool call per network is much
   * cheaper than one per post; this is run daily so amortized cost is fine.
   *
   * Returns a Map keyed by `externalUrl`. Inputs without a matching post
   * (e.g. the post was deleted on the platform) are omitted from the map.
   */
  async fetchPostMetrics(slug, inputs) {
    const out = new Map<string, import("@/lib/data/drafts").PostMetricsSnapshot>();
    if (inputs.length === 0) return out;
    const result = loadConfig(slug);
    if (!result.ok) return out;
    const cfg = result.cfg;

    // Group requests by Metricool network.
    const byNetwork = new Map<string, typeof inputs>();
    for (const q of inputs) {
      const net = NETWORK_BY_CHANNEL[q.channel];
      if (!net) continue;
      const list = byNetwork.get(net) || [];
      list.push(q);
      byNetwork.set(net, list);
    }

    // Earliest publishedAt across the batch, default to 90 days ago.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000);
    const earliest = inputs
      .map((q) => (q.publishedAt ? Date.parse(q.publishedAt) : NaN))
      .filter((t) => !Number.isNaN(t))
      .reduce((min, t) => (t < min ? t : min), Date.now());
    const fromDate = new Date(Math.min(earliest, ninetyDaysAgo.getTime()));
    const fromStr = `${fromDate.toISOString().slice(0, 10)}T00:00:00`;
    const todayStr = new Date().toISOString().slice(0, 10) + "T23:59:59";

    for (const [network, queries] of byNetwork) {
      try {
        const endpoint =
          `/analytics/posts/${encodeURIComponent(network)}` +
          `?from=${encodeURIComponent(fromStr)}` +
          `&to=${encodeURIComponent(todayStr)}`;
        const res = await metricoolFetch(cfg, endpoint);
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.warn(`[metricool] analytics ${network} HTTP ${res.status}`);
          continue;
        }
        const data = await res.json().catch(() => ({})) as { data?: unknown[] };
        const posts = (Array.isArray(data) ? data : data.data) as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(posts)) continue;

        const byUrl = new Map<string, Record<string, unknown>>();
        for (const post of posts) {
          const url = typeof post.url === "string" ? post.url : "";
          if (url) byUrl.set(url, post);
        }

        const measured_at = new Date().toISOString();
        for (const q of queries) {
          const post = byUrl.get(q.externalUrl);
          if (!post) continue;
          const num = (k: string) => {
            const v = post[k];
            return typeof v === "number" ? v : 0;
          };
          out.set(q.externalUrl, {
            impressions: num("impressions"),
            likes: num("likes") || num("likeCount"),
            clicks: num("clicks"),
            comments: num("comments") || num("commentCount"),
            engagement_pct: Math.round((num("engagement") || 0) * 100) / 100,
            measured_at,
          });
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[metricool] analytics ${network} failed: ${(e as Error).message}`);
      }
    }
    return out;
  },
};

/**
 * Pull connected networks + brand name from Metricool. Used by the
 * `/api/publishing/account-info` endpoint to surface in MC "publishing on
 * X account, networks Y/Z" so the user can verify before scheduling.
 *
 * Endpoint is `/admin/simpleProfiles` (no /v2 prefix — admin endpoints
 * live under /api directly). Returns an array of brands that this user
 * has access to; we filter to the one matching the configured blogId.
 */
export interface AccountInfo {
  brand_name: string | null;
  brand_id: string;
  networks: Array<{ network: string; handle?: string | null; connected: boolean }>;
}

export async function fetchAccountInfo(slug: string): Promise<{ ok: true; info: AccountInfo } | { ok: false; error: string }> {
  const result = loadConfig(slug);
  if (!result.ok) return { ok: false, error: result.missing };
  const cfg = result.cfg;

  // Admin endpoints live at /api/admin/*, not /api/v2/admin/*.
  const url =
    `https://app.metricool.com/api/admin/simpleProfiles` +
    `?userToken=${encodeURIComponent(cfg.apiToken)}` +
    `&userId=${encodeURIComponent(cfg.userId)}` +
    `&blogId=${encodeURIComponent(cfg.blogId)}`;

  try {
    const res = await fetch(url, {
      headers: { "X-Mc-Auth": cfg.apiToken, "Content-Type": "application/json" },
    });
    const rawText = await res.text();
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(`[metricool] simpleProfiles failed: HTTP ${res.status} — ${rawText.slice(0, 300)}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    let data: unknown;
    try { data = JSON.parse(rawText); } catch { return { ok: false, error: "Invalid JSON from Metricool" }; }
    if (!Array.isArray(data)) return { ok: false, error: "Unexpected response shape from simpleProfiles" };
    const profiles = data as Array<Record<string, unknown>>;
    const brand = profiles.find((p) => String(p.id) === String(cfg.blogId));
    if (!brand) return { ok: false, error: `Blog ${cfg.blogId} not found in user profiles` };

    // Extract a sensible name. Metricool exposes "title" (brand display name)
    // and sometimes "url". Fall back to whichever non-empty string we find.
    const brandName =
      (typeof brand.title === "string" && brand.title) ||
      (typeof brand.label === "string" && brand.label) ||
      (typeof brand.name === "string" && brand.name) ||
      null;

    function pickHandle(value: unknown): string | null {
      if (typeof value === "string" && value) return value;
      if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        if (typeof obj.username === "string") return obj.username;
        if (typeof obj.name === "string") return obj.name;
      }
      return null;
    }

    const networks: AccountInfo["networks"] = [
      { network: "linkedin",  handle: pickHandle(brand.linkedinCompany), connected: !!brand.linkedinCompany },
      { network: "instagram", handle: pickHandle(brand.instagram),       connected: !!brand.instagram },
      { network: "facebook",  handle: pickHandle(brand.facebook),        connected: !!brand.facebook || !!brand.facebookPageId },
      { network: "twitter",   handle: pickHandle(brand.twitter),         connected: !!brand.twitter },
      { network: "tiktok",    handle: pickHandle(brand.tiktok),          connected: !!brand.tiktok },
      { network: "youtube",   handle: pickHandle(brand.youtube),         connected: !!brand.youtube },
    ];

    return {
      ok: true,
      info: {
        brand_name: brandName,
        brand_id: cfg.blogId,
        networks,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const _internals = { loadConfig, NETWORK_BY_CHANNEL } as const;
export type { Channel };
