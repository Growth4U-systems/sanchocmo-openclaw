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

const API_BASE = "https://app.metricool.com/api/v1";

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
  // userId + blogId always go as query params; the token lives in the X-Mc-Auth header.
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${API_BASE}${endpoint}${sep}userId=${encodeURIComponent(cfg.userId)}&blogId=${encodeURIComponent(cfg.blogId)}`;
  return fetch(url, {
    ...init,
    headers: {
      "X-Mc-Auth": cfg.apiToken,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

/** Download a URL into a base64 string. Used to attach images / PDFs to
 *  Metricool posts (their API expects raw base64 in `media[i].data`). */
async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
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

    // Pick the carousel PDF if present (LinkedIn document post), otherwise
    // fall back to the first image. We send a single media entry — Metricool
    // multi-image posts use a list of images but LinkedIn renders that as a
    // gallery, not a swipeable carousel.
    const carouselPdf = input.media.find((m) => m.type === "application/pdf");
    const firstImage = input.media.find((m) => m.type.startsWith("image/"));
    const chosen = carouselPdf || firstImage || null;

    let media: Array<{ name: string; data: string }> = [];
    if (chosen) {
      try {
        const data = await urlToBase64(chosen.url);
        const name = carouselPdf
          ? "carousel.pdf"
          : `image.${(chosen.type.split("/")[1] || "png").replace("jpeg", "jpg")}`;
        media = [{ name, data }];
      } catch (e) {
        return { ok: false, error: `Failed to attach media: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

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
      const data = (await res.json().catch(() => ({}))) as {
        id?: string | number;
        url?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        return { ok: false, error: data.message || data.error || `HTTP ${res.status}` };
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

export const _internals = { loadConfig, NETWORK_BY_CHANNEL } as const;
export type { Channel };
