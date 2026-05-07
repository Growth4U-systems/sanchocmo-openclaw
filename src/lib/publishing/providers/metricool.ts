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
      const externalJobId = data.id != null ? String(data.id) : undefined;
      const isImmediate = !input.schedule;
      return {
        ok: true,
        externalJobId,
        externalUrl: data.url,
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
