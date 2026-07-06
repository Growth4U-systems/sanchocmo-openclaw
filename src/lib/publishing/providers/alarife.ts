import { readBrandSecret } from "@/lib/brand-env";
import { readJSON } from "@/lib/data/json-io";
import { integrationsFile } from "@/lib/data/paths";
import { markdownToHtml, splitTitle } from "@/lib/publishing/providers/wordpress";
import type {
  PublishInput,
  PublishProvider,
  PublishResult,
  PublishStatus,
} from "@/lib/publishing/types";
import { slugify } from "@/lib/slugify";

/**
 * Alarife Payload publishing provider (SAN-161).
 *
 * Alarife is Growth4U's own site platform (Payload CMS at
 * https://alarife-payload.growth4u.io). Blog articles publish as pages with a
 * single `raw_html` section — same shape the alarife-integration skill uses:
 *
 *   POST /api/clients/{clientId}/pages
 *   { title, path, category, status: "draft"|"published",
 *     sections: [{ type: "raw_html", config: { html } }] }
 *
 * Auth is `Authorization: Bearer {key}` with the api-connect conventions:
 *   - secret  `{SLUG}_ALARIFE_PAYLOAD_API_KEY` in `brand/{slug}/.env`
 *     (global fallback `ALARIFE_PAYLOAD_API_KEY` — same precedence the
 *     alarife-integration skill documents)
 *   - config  `integrations.json → dataSources["alarife-payload"].config`:
 *       CLIENT_ID        site slug in Alarife (required)
 *       BASE_URL         API base (default https://alarife-payload.growth4u.io)
 *       PUBLIC_URL       public site origin, used to build the post URL
 *       BLOG_BASE_PATH   path prefix for articles (default /blog)
 *
 * Payload pages are draft|published — there is no future-dated publish, so
 * this provider advertises `schedule: false` and rejects scheduled publishes
 * instead of pretending.
 */

const DEFAULT_BASE_URL = "https://alarife-payload.growth4u.io";

interface AlarifeConfig {
  baseUrl: string;
  clientId: string;
  apiKey: string;
  publicUrl: string | null;
  blogBasePath: string;
}

interface IntegrationsData {
  dataSources?: Record<string, { config?: Record<string, string> }>;
}

function loadConfig(slug: string): { ok: true; cfg: AlarifeConfig } | { ok: false; missing: string } {
  const apiKey = readBrandSecret(slug, "alarife-payload", "API_KEY");
  if (!apiKey) {
    return { ok: false, missing: "Falta API_KEY de Alarife Payload. Conéctala en Ajustes → APIs → Alarife." };
  }
  const integrations = readJSON<IntegrationsData>(integrationsFile(slug), {});
  const cfg = integrations.dataSources?.["alarife-payload"]?.config || {};
  const clientId = cfg.CLIENT_ID || "";
  if (!clientId) {
    return { ok: false, missing: "Falta CLIENT_ID (slug del site en Alarife). Configúralo en Ajustes → APIs → Alarife." };
  }
  return {
    ok: true,
    cfg: {
      baseUrl: (cfg.BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
      clientId,
      apiKey,
      publicUrl: cfg.PUBLIC_URL ? cfg.PUBLIC_URL.replace(/\/+$/, "") : null,
      blogBasePath: `/${(cfg.BLOG_BASE_PATH || "blog").replace(/^\/+|\/+$/g, "")}`,
    },
  };
}

export function slugifyPath(title: string): string {
  return slugify(title, { maxLen: 80, fallback: "articulo" });
}

interface AlarifePage {
  id?: string;
  doc?: { id?: string; path?: string; status?: string };
  path?: string;
  status?: string;
  message?: string;
  errors?: { message?: string }[];
}

function pageError(data: AlarifePage, httpStatus: number): string {
  return data.errors?.[0]?.message || data.message || `Alarife respondió ${httpStatus}`;
}

export const alarifeProvider: PublishProvider = {
  id: "alarife-payload",
  name: "Alarife",
  supportedChannels: ["blog"],
  capabilities: { publishNow: true, schedule: false, media: false },

  inspect(slug) {
    const res = loadConfig(slug);
    return res.ok ? { configured: true } : { configured: false, missing: res.missing };
  },

  async publish(input: PublishInput): Promise<PublishResult> {
    const res = loadConfig(input.slug);
    if (!res.ok) return { ok: false, error: res.missing };
    const { cfg } = res;

    if (input.schedule) {
      return {
        ok: false,
        error: "Alarife publica draft/published sin fecha programada — publica ahora o usa un provider con scheduling.",
      };
    }

    const { title, body } = splitTitle(input.draft.body);
    const path = `${cfg.blogBasePath}/${slugifyPath(title)}`;
    const html = `<article class="blog-post"><h1>${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</h1>\n${markdownToHtml(body)}</article>`;

    try {
      const resp = await fetch(`${cfg.baseUrl}/api/clients/${encodeURIComponent(cfg.clientId)}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          title,
          path,
          category: "blog",
          status: "published",
          sections: [{ type: "raw_html", config: { html } }],
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as AlarifePage;
      const pageId = data.doc?.id || data.id;
      if (!resp.ok || !pageId) {
        return { ok: false, error: pageError(data, resp.status) };
      }
      return {
        ok: true,
        externalJobId: String(pageId),
        externalUrl: cfg.publicUrl
          ? `${cfg.publicUrl}${path}`
          : `${cfg.baseUrl}/api/clients/${encodeURIComponent(cfg.clientId)}/pages/${pageId}/preview`,
        publishedAt: new Date().toISOString(),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Error de red contra Alarife" };
    }
  },

  async getStatus(slug, externalJobId): Promise<PublishStatus> {
    const res = loadConfig(slug);
    if (!res.ok) return { status: "failed", error: res.missing };
    const { cfg } = res;
    try {
      const resp = await fetch(
        `${cfg.baseUrl}/api/clients/${encodeURIComponent(cfg.clientId)}/pages/${encodeURIComponent(externalJobId)}`,
        { headers: { Authorization: `Bearer ${cfg.apiKey}` } },
      );
      if (resp.status === 404) return { status: "canceled" };
      const data = (await resp.json().catch(() => ({}))) as AlarifePage;
      if (!resp.ok) return { status: "failed", error: pageError(data, resp.status) };
      const status = data.doc?.status || data.status;
      const path = data.doc?.path || data.path;
      if (status === "published") {
        return {
          status: "published",
          externalUrl: cfg.publicUrl && path ? `${cfg.publicUrl}${path}` : null,
        };
      }
      // draft = created but not live yet (publication is immediate here, so
      // a lingering draft means someone demoted it in the Alarife admin).
      return { status: "publishing" };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : "Error de red contra Alarife" };
    }
  },
};
