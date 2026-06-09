/**
 * POST /api/integrations/send-dispatch
 *
 * Server-side dispatcher: posts the day's editorial dispatch to the
 * configured transport (Slack/Discord). Replaces direct Slack calls from
 * the cron agent (those used MCP tools that misreport scope errors).
 *
 * Body: { slug, ideaIds: string[], projectId?, taskId? }
 *
 * Slack message structure (v3 — root + threaded per-channel replies):
 * - Root message: daily summary (date + totals + per-channel counts).
 *   Captured ts is reused as thread_ts so the channel only sees one
 *   top-level entry per day. If root post fails, falls back to v2
 *   behaviour (top-level per-channel) so dispatch still goes out.
 * - One reply per target_channel ("blog", "linkedin", "twitter", ...)
 *   in the root's thread. Header: "📝 Blog — elige 1 de N".
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
import { logActivity } from "@/lib/data/activity-log";
import { postToSlack, resolveSlackToken } from "@/lib/publish/slack";

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

function getMcBaseUrl(_req: NextApiRequest): string {
  const url = process.env.BASE_URL || process.env.NEXTAUTH_URL;
  if (!url) {
    throw new Error("No app base URL configured — set BASE_URL (canonical) or NEXTAUTH_URL");
  }
  return url.replace(/\/+$/, "");
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
    ? ` · <${mcUrl}/dashboard/${slug}/tasks/${taskId}|📋 Tarea>`
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

function buildRootMessage(
  byChannel: Map<string, Idea[]>,
  mcUrl: string,
  slug: string,
  projectId?: string,
  taskId?: string,
): { text: string; blocks: unknown[] } {
  const totalIdeas = Array.from(byChannel.values()).reduce((acc, arr) => acc + arr.length, 0);
  const dateLabel = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const channelSummary = Array.from(byChannel.entries())
    .map(([key, arr]) => {
      const cv = TARGET_CHANNEL_LABELS[key] || { emoji: "📄", label: key };
      return `${cv.emoji} ${cv.label} (${arr.length})`;
    })
    .join(" · ");
  const taskLink = projectId && taskId
    ? ` · <${mcUrl}/dashboard/${slug}/tasks/${taskId}|📋 Tarea>`
    : "";
  const text = `📬 Editorial Dispatch — ${dateLabel} · ${totalIdeas} idea${totalIdeas === 1 ? "" : "s"}`;
  const blocks: unknown[] = [
    {
      type: "section",
      block_id: "dispatch__root",
      text: {
        type: "mrkdwn",
        text: `*📬 Editorial Dispatch — ${dateLabel}*\n${totalIdeas} idea${totalIdeas === 1 ? "" : "s"} en ${channelSummary}${taskLink}`,
      },
    },
    {
      type: "context",
      block_id: "dispatch__root_hint",
      elements: [{ type: "mrkdwn", text: "👇 _Detalle por canal en hilo_" }],
    },
  ];
  return { text, blocks };
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
    // Token lookup (integrations.json OAuth → brand/.env → process.env) lives in
    // the shared publish lib so it stays consistent with the generic publish
    // endpoint and the admin UI's "Slack connected" state.
    const token = resolveSlackToken(slug);
    if (!token) {
      return res.status(400).json({
        error:
          `Slack bot token not configured for ${slug}. Either reconnect Slack at ` +
          `/dashboard/admin/settings?tab=apis (OAuth, writes encrypted to integrations.json), ` +
          `add ${slug.toUpperCase()}_SLACK_BOT_TOKEN to brand/${slug}/.env, or set the ` +
          `workspace-wide SLACK_BOT_TOKEN env var.`,
      });
    }

    const results: { channel: string; ok: boolean; error?: string; ts?: string; ideaCount: number }[] = [];

    // Post root message first so per-channel messages can thread under it.
    // If root post fails, fall back to top-level per-channel posts.
    const root = buildRootMessage(byChannel, mcUrl, slug, projectId, taskId);
    const rootRes = await postToSlack(token, dispatch.channel_id, root.text, root.blocks);
    const rootTs = rootRes.ok ? rootRes.ts : undefined;
    if (!rootRes.ok) {
      console.error("[send-dispatch] root post failed, falling back to top-level per-channel:", rootRes.error);
    }

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
      const r = await postToSlack(token, dispatch.channel_id, text, blocks, rootTs);
      results.push({ channel: channelKey, ok: r.ok, error: r.error, ts: r.ts, ideaCount: channelIdeas.length });
    }

    const errors = results.filter((r) => !r.ok).map((r) => `${r.channel}: ${r.error}`);
    const messagesSent = results.filter((r) => r.ok).length;

    // Persist dispatch metadata back onto the dispatched ideas. Without this,
    // dispatch_date stays null and the UI's "Solo HOY" filter / downstream
    // analytics never know what was sent today. Only mark ideas in channels
    // where the Slack post actually succeeded.
    if (messagesSent > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const dispatchedIds = new Set<string>();
      for (const r of results) {
        if (!r.ok) continue;
        for (const idea of byChannel.get(r.channel) || []) {
          dispatchedIds.add(idea.id);
        }
      }
      if (dispatchedIds.size > 0) {
        try {
          const queuePath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
          const fullQueue = JSON.parse(fs.readFileSync(queuePath, "utf-8")) as Array<Record<string, unknown> & { id: string; target_channel?: string }>;
          let mutated = false;
          for (const idea of fullQueue) {
            if (!dispatchedIds.has(idea.id)) continue;
            idea.dispatch_date = today;
            idea.dispatch_slot = idea.target_channel || null;
            // Only stamp the routing pointers if the idea hasn't been promoted
            // to a ContentTask yet. Once `content_task_id` exists the parent
            // task is fixed (the CT lives inside that parent's `tasks.json`),
            // so a re-dispatch on a different day must not move the pointer —
            // otherwise project_task_id ends up referencing today's daily task
            // while content_task_id still points to the CT under the original
            // parent, and "Abrir draft" 404s.
            if (!idea.content_task_id) {
              if (taskId) idea.project_task_id = taskId;
              if (projectId) idea.project_id = projectId;
            }
            mutated = true;
          }
          if (mutated) fs.writeFileSync(queuePath, JSON.stringify(fullQueue, null, 2));
        } catch (e) {
          console.error("[send-dispatch] persisting dispatch metadata failed:", (e as Error).message);
        }
      }
    }

    // Activity log — Editorial Dispatch enviado
    if (messagesSent > 0) {
      try {
        const channelList = results.filter((r) => r.ok).map((r) => r.channel).join(", ");
        logActivity(slug, {
          type: "publish",
          text: `Editorial Dispatch enviado a Slack — <b>${ideas.length} ideas</b> en ${channelList}`,
          icon: "📤", accent: "navy",
          meta: { ideaCount: ideas.length, channels: results.map((r) => r.channel), errors, rootTs },
        });
      } catch (e) {
        console.error("[send-dispatch] activity log failed:", (e as Error).message);
      }
    }

    return res.status(200).json({
      ok: errors.length === 0,
      transport: "slack",
      channel_id: dispatch.channel_id,
      root_ts: rootTs,
      messages_sent: messagesSent,
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
