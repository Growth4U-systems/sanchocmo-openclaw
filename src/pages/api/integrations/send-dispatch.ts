/**
 * POST /api/integrations/send-dispatch
 *
 * Server-side dispatcher: posts the day's editorial dispatch to the
 * configured transport (Slack/Discord). Replaces direct Slack calls from
 * the cron agent (those used MCP tools that misreport scope errors).
 *
 * Body: { slug, ideaIds: string[], projectId?, taskId? }
 *
 * Slack message structure (v2 — grouped by target_channel):
 * - One message per target_channel ("blog", "linkedin", "twitter", ...)
 * - Header: "📝 Blog — elige 1 de N" (or whatever the channel is)
 * - Per idea: signal section + POV section + actions row (3 buttons)
 *   with stable block_ids so the interactivity endpoint can replace the
 *   actions block in place when the user clicks a button.
 *
 * Block IDs convention (used by interactivity to find/swap blocks):
 *   header__{channel}                      — channel header
 *   idea__{ideaId}__signal                 — signal info
 *   idea__{ideaId}__pov                    — angle / POV
 *   idea__{ideaId}__actions                — buttons (replaced on click)
 *   idea__{ideaId}__divider                — divider
 */
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

interface DispatchChannelConfig {
  transport: "slack" | "discord";
  channel_id: string;
  channel_name?: string;
}

interface Idea {
  id: string;
  title?: string;
  pillar_id: string;
  content_type: string;
  target_channel: string;
  signal: { summary: string; source: string; url?: string; date: string };
  angle_draft: string;
  pov_confidence: number;
}

function stripPovPrefix(text: string): string {
  return (text || "")
    .replace(/^\s*(nuestro\s+pov|our\s+pov|pov)\s*:\s*/i, "")
    .trim();
}

function getIdeaTitle(idea: Idea): string {
  if (idea.title?.trim()) return idea.title.trim();
  const cleanAngle = stripPovPrefix(idea.angle_draft || "");
  const candidate = cleanAngle || (idea.signal?.summary || "").trim();
  if (!candidate) return idea.id;
  const m = candidate.match(/^([^.!?\n]{12,160}[.!?])/);
  const out = m ? m[1] : candidate.split("\n")[0];
  return out.length > 140 ? out.slice(0, 137).trimEnd() + "…" : out;
}

const TARGET_CHANNEL_LABELS: Record<string, { emoji: string; label: string }> = {
  linkedin:   { emoji: "💼", label: "LinkedIn" },
  twitter:    { emoji: "🐦", label: "X / Twitter" },
  blog:       { emoji: "📝", label: "Blog" },
  newsletter: { emoji: "📧", label: "Newsletter" },
};

function loadBrandEnv(slug: string): Record<string, string> {
  const envPath = path.join(BASE, "brand", slug, ".env");
  const vars: Record<string, string> = {};
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    }
  } catch { /* optional */ }
  return vars;
}

function getMcBaseUrl(_req: NextApiRequest): string {
  return process.env.MC_PUBLIC_URL || "https://sancho-cmo.taild48df2.ts.net:8443";
}

// Resolve pillar_name from content/configs/news-prompts/{P}.yml
function loadPillarNames(slug: string): Record<string, string> {
  const dir = path.join(BASE, "brand", slug, "content", "configs", "news-prompts");
  const out: Record<string, string> = {};
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".yml")) continue;
      const data = yaml.load(fs.readFileSync(path.join(dir, f), "utf-8")) as { pillar_id?: string; pillar_name?: string } | null;
      if (data?.pillar_id && data.pillar_name) out[data.pillar_id] = data.pillar_name;
    }
  } catch { /* optional */ }
  return out;
}

function buildIdeaBlocks(idea: Idea, slug: string, mcUrl: string, pillarName: string, projectId?: string, taskId?: string): unknown[] {
  const conf = Math.round((idea.pov_confidence || 0) * 100);
  const slugUpper = slug.toUpperCase();
  const taskLink = projectId && taskId
    ? ` · <${mcUrl}/dashboard/${slug}/projects/${projectId}/tasks/${taskId}|📋 Tarea>`
    : "";
  const title = getIdeaTitle(idea);
  const cleanAngle = stripPovPrefix(idea.angle_draft || "");
  return [
    // Title — header SECTION, lo PRIMERO que se ve
    {
      type: "section",
      block_id: `idea__${idea.id}__title`,
      text: { type: "mrkdwn", text: `*${title}*` },
    },
    // Signal
    {
      type: "section",
      block_id: `idea__${idea.id}__signal`,
      text: {
        type: "mrkdwn",
        text:
          `_${idea.content_type} · ${idea.pillar_id} ${pillarName} · ${conf}% confianza${taskLink}_\n\n` +
          `📰 *Signal* (${idea.signal?.date || "fecha desconocida"} · _${idea.signal?.source || "fuente desconocida"}_)\n` +
          `${idea.signal?.summary || "(sin summary)"}` +
          (idea.signal?.url ? `\n<${idea.signal.url}|🔗 Ver artículo original>` : ""),
      },
    },
    // POV (header de sección ya dice el qué — no repetir "Nuestro POV:" en el texto)
    {
      type: "section",
      block_id: `idea__${idea.id}__pov`,
      text: {
        type: "mrkdwn",
        text: `✍️ *Nuestro ángulo*\n${cleanAngle || "(sin ángulo)"}`,
      },
    },
    // Actions (será reemplazado al pulsar botón)
    {
      type: "actions",
      block_id: `idea__${idea.id}__actions`,
      elements: [
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", text: "✅ Aprobar" },
          action_id: `${slugUpper}__${idea.id}__approve`,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "🕓 Más tarde" },
          action_id: `${slugUpper}__${idea.id}__later`,
        },
        {
          type: "button",
          style: "danger",
          text: { type: "plain_text", text: "❌ Rechazar" },
          action_id: `${slugUpper}__${idea.id}__reject`,
        },
      ],
    },
    {
      type: "divider",
      block_id: `idea__${idea.id}__divider`,
    },
  ];
}

async function postToSlack(token: string, channelId: string, text: string, blocks: unknown[]): Promise<{ ok: boolean; error?: string; ts?: string }> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel: channelId, text, blocks }),
  });
  return (await res.json()) as { ok: boolean; error?: string; ts?: string };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Forbidden" });

  const { slug, ideaIds, projectId, taskId } = req.body || {};
  if (!slug || !Array.isArray(ideaIds) || ideaIds.length === 0) {
    return res.status(400).json({ error: "Missing slug or ideaIds[]" });
  }

  // Load dispatch channel config
  const cfgPath = path.join(BASE, "brand", slug, "content", "configs", "dispatch-channel.yml");
  if (!fs.existsSync(cfgPath)) {
    return res.status(400).json({ error: "dispatch-channel.yml not found. Configure en MC UI → Inputs → 📬 Canal de envío." });
  }
  let dispatch: DispatchChannelConfig;
  try {
    dispatch = yaml.load(fs.readFileSync(cfgPath, "utf-8")) as DispatchChannelConfig;
  } catch (e) {
    return res.status(400).json({ error: `Failed to parse dispatch-channel.yml: ${(e as Error).message}` });
  }

  // Load ideas
  const queue = JSON.parse(fs.readFileSync(path.join(BASE, "brand", slug, "content", "idea-queue.json"), "utf-8")) as Idea[];
  const ideas = ideaIds.map((id: string) => queue.find((i) => i.id === id)).filter(Boolean) as Idea[];
  if (ideas.length === 0) {
    return res.status(400).json({ error: "No matching ideas found in queue" });
  }

  // Load pillar names
  const pillarNames = loadPillarNames(slug);

  // Group ideas by target_channel
  const byChannel = new Map<string, Idea[]>();
  for (const idea of ideas) {
    const ch = idea.target_channel || "other";
    if (!byChannel.has(ch)) byChannel.set(ch, []);
    byChannel.get(ch)!.push(idea);
  }

  const mcUrl = getMcBaseUrl(req);

  if (dispatch.transport === "slack") {
    const env = loadBrandEnv(slug);
    const token = env[`${slug.toUpperCase()}_SLACK_BOT_TOKEN`] || env.SLACK_BOT_TOKEN;
    if (!token) return res.status(400).json({ error: "Slack token not in env" });

    const results: { channel: string; ok: boolean; error?: string; ts?: string; ideaCount: number }[] = [];

    for (const [channelKey, channelIdeas] of byChannel.entries()) {
      const cv = TARGET_CHANNEL_LABELS[channelKey] || { emoji: "📄", label: channelKey };
      const blocks: unknown[] = [
        {
          type: "header",
          block_id: `header__${channelKey}`,
          text: {
            type: "plain_text",
            text: `${cv.emoji} ${cv.label} — elige ${channelIdeas.length === 1 ? "1" : `1 de ${channelIdeas.length}`}`,
          },
        },
      ];
      for (const idea of channelIdeas) {
        const pn = pillarNames[idea.pillar_id] || "";
        blocks.push(...buildIdeaBlocks(idea, slug, mcUrl, pn, projectId, taskId));
      }
      const text = `${cv.emoji} ${cv.label}: ${channelIdeas.length} candidata${channelIdeas.length === 1 ? "" : "s"}`;
      const r = await postToSlack(token, dispatch.channel_id, text, blocks);
      results.push({ channel: channelKey, ok: r.ok, error: r.error, ts: r.ts, ideaCount: channelIdeas.length });
    }

    const errors = results.filter((r) => !r.ok).map((r) => `${r.channel}: ${r.error}`);
    return res.status(200).json({
      ok: errors.length === 0,
      transport: "slack",
      channel_id: dispatch.channel_id,
      messages_sent: results.filter((r) => r.ok).length,
      total_ideas: ideas.length,
      grouped_by_channel: Array.from(byChannel.keys()),
      errors,
      results,
    });
  }

  if (dispatch.transport === "discord") {
    return res.status(501).json({ error: "Discord transport not yet implemented in send-dispatch endpoint." });
  }

  return res.status(400).json({ error: `Unknown transport: ${dispatch.transport}` });
}

export default compose(withErrorHandler, withAuth)(handler);
