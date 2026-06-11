import { readBrandSecret } from "@/lib/brand-env";
import { readJSON } from "@/lib/data/json-io";
import { integrationsFile } from "@/lib/data/paths";
import type {
  PublishInput,
  PublishProvider,
  PublishResult,
  PublishStatus,
} from "@/lib/publishing/types";

/**
 * WordPress publishing provider (SAN-161 / F4 de canales-loops).
 *
 * First provider for the `blog` channel: SEO articles approved in the
 * calendar publish through the WordPress REST API instead of by hand.
 *
 * Auth: [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/)
 * sent as HTTP Basic (`username:app-password`). Works on any WP ≥ 5.6 with
 * the REST API exposed — no plugin required.
 *
 * Config follows the api-connect conventions (same as Metricool):
 *   - secret  `{SLUG}_WORDPRESS_APP_PASSWORD` in `brand/{slug}/.env`
 *   - config  `integrations.json → dataSources.wordpress.config.SITE_URL`
 *   - config  `integrations.json → dataSources.wordpress.config.USERNAME`
 *
 * Drafts arrive as markdown (writer output). WordPress renders raw markdown
 * as literal text, so we convert the subset seo-content actually emits
 * (headings, emphasis, links, lists, code) — full md spec is not the goal.
 */

interface WordPressConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
}

interface IntegrationsData {
  dataSources?: Record<string, { config?: Record<string, string> }>;
}

function loadConfig(slug: string): { ok: true; cfg: WordPressConfig } | { ok: false; missing: string } {
  const appPassword = readBrandSecret(slug, "wordpress", "APP_PASSWORD");
  if (!appPassword) {
    return { ok: false, missing: "Falta APP_PASSWORD de WordPress. Conéctala en Ajustes → APIs → WordPress." };
  }
  const integrations = readJSON<IntegrationsData>(integrationsFile(slug), {});
  const cfg = integrations.dataSources?.wordpress?.config || {};
  const siteUrl = (cfg.SITE_URL || "").replace(/\/+$/, "");
  const username = cfg.USERNAME || "";
  if (!siteUrl || !username) {
    return { ok: false, missing: "Faltan SITE_URL y USERNAME de WordPress. Configúralos en Ajustes → APIs → WordPress." };
  }
  return { ok: true, cfg: { siteUrl, username, appPassword } };
}

function authHeader(cfg: WordPressConfig): string {
  return "Basic " + Buffer.from(`${cfg.username}:${cfg.appPassword}`).toString("base64");
}

/** Split the draft into title + body: the first `# H1` wins (and is removed
 *  from the content so WP doesn't render it twice); else the first line. */
export function splitTitle(markdown: string): { title: string; body: string } {
  const lines = markdown.split("\n");
  const h1Idx = lines.findIndex((l) => /^#\s+\S/.test(l.trim()));
  if (h1Idx >= 0) {
    const title = lines[h1Idx].trim().replace(/^#\s+/, "").trim();
    const body = [...lines.slice(0, h1Idx), ...lines.slice(h1Idx + 1)].join("\n").trim();
    return { title, body };
  }
  const first = lines.find((l) => l.trim()) || "Sin título";
  return { title: first.trim().slice(0, 120), body: markdown.trim() };
}

/** Minimal markdown → HTML for the constructs seo-content emits. */
export function markdownToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  const out: string[] = [];
  const lines = md.split("\n");
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  let para: string[] = [];
  let inCode = false;
  let code: string[] = [];

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim().startsWith("```")) {
      if (inCode) { out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); code = []; inCode = false; }
      else { flushPara(); flushList(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(raw); continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (heading) {
      flushPara(); flushList();
      const level = Math.min(heading[1].length + 1, 6); // draft H1 became the post title
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (ul) {
      flushPara();
      if (!list || list.tag !== "ul") { flushList(); list = { tag: "ul", items: [] }; }
      list.items.push(ul[1]);
    } else if (ol) {
      flushPara();
      if (!list || list.tag !== "ol") { flushList(); list = { tag: "ol", items: [] }; }
      list.items.push(ol[1]);
    } else if (!line.trim()) {
      flushPara(); flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  if (inCode && code.length) out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
  flushPara(); flushList();
  return out.join("\n");
}

interface WpPostResponse {
  id?: number;
  link?: string;
  status?: string;
  date_gmt?: string;
  message?: string;
}

export const wordpressProvider: PublishProvider = {
  id: "wordpress",
  name: "WordPress",
  supportedChannels: ["blog"],
  capabilities: { publishNow: true, schedule: true, media: false },

  inspect(slug) {
    const res = loadConfig(slug);
    return res.ok ? { configured: true } : { configured: false, missing: res.missing };
  },

  async publish(input: PublishInput): Promise<PublishResult> {
    const res = loadConfig(input.slug);
    if (!res.ok) return { ok: false, error: res.missing };
    const { cfg } = res;

    const { title, body } = splitTitle(input.draft.body);
    const payload: Record<string, unknown> = {
      title,
      content: markdownToHtml(body),
      status: input.schedule ? "future" : "publish",
    };
    if (input.schedule) payload.date_gmt = input.schedule.publishAt.replace(/Z$/, "");

    try {
      const resp = await fetch(`${cfg.siteUrl}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader(cfg) },
        body: JSON.stringify(payload),
      });
      const data = (await resp.json().catch(() => ({}))) as WpPostResponse;
      if (!resp.ok || !data.id) {
        return { ok: false, error: data.message || `WordPress respondió ${resp.status}` };
      }
      return {
        ok: true,
        externalJobId: String(data.id),
        externalUrl: data.link,
        ...(input.schedule
          ? { scheduledAt: input.schedule.publishAt }
          : { publishedAt: new Date().toISOString() }),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Error de red contra WordPress" };
    }
  },

  async getStatus(slug, externalJobId): Promise<PublishStatus> {
    const res = loadConfig(slug);
    if (!res.ok) return { status: "failed", error: res.missing };
    try {
      const resp = await fetch(`${res.cfg.siteUrl}/wp-json/wp/v2/posts/${externalJobId}?context=edit`, {
        headers: { Authorization: authHeader(res.cfg) },
      });
      if (resp.status === 404) return { status: "canceled" };
      const data = (await resp.json().catch(() => ({}))) as WpPostResponse;
      if (!resp.ok) return { status: "failed", error: data.message || `WordPress respondió ${resp.status}` };
      if (data.status === "publish") {
        return { status: "published", externalUrl: data.link, publishedAt: data.date_gmt ? `${data.date_gmt}Z` : null };
      }
      if (data.status === "future") return { status: "scheduled" };
      return { status: "canceled" };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : "Error de red contra WordPress" };
    }
  },

  async cancel(slug, externalJobId) {
    const res = loadConfig(slug);
    if (!res.ok) return { ok: false, error: res.missing };
    try {
      const resp = await fetch(`${res.cfg.siteUrl}/wp-json/wp/v2/posts/${externalJobId}`, {
        method: "DELETE",
        headers: { Authorization: authHeader(res.cfg) },
      });
      if (!resp.ok) {
        const data = (await resp.json().catch(() => ({}))) as WpPostResponse;
        return { ok: false, error: data.message || `WordPress respondió ${resp.status}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Error de red contra WordPress" };
    }
  },
};
