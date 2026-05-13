/**
 * POST /api/integrations/slack/interactivity
 *
 * Endpoint público que Slack llama cuando el usuario pulsa un botón
 * en un mensaje (Editorial Dispatch: ✅ Aprobar / 🕓 Más tarde / ❌ Rechazar).
 *
 * Slack Settings → tu app → Interactivity & Shortcuts → Request URL =
 *   https://sancho-cmo.taild48df2.ts.net:8443/api/integrations/slack/interactivity
 *
 * Auth: Slack firma cada request con su signing_secret
 * (X-Slack-Signature + X-Slack-Request-Timestamp headers). Verificamos
 * antes de procesar para evitar requests forjadas.
 *
 * Body shape: application/x-www-form-urlencoded con un único campo
 * `payload` que es un JSON. El JSON tiene `actions[]` con `action_id`
 * y `block_id` que codifican qué idea + acción.
 *
 * Convención de action_id: `${SLUG}__${IDEA_ID}__${ACTION}` donde
 * ACTION ∈ {approve, later, reject}.
 *
 * NOTA: Next API routes parsean body por defecto. Para verificar la
 * firma necesitamos el body RAW. Por eso desactivamos bodyParser y lo
 * leemos manualmente.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { BASE } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";
import { logActivity } from "@/lib/data/activity-log";

export const config = { api: { bodyParser: false } };

interface SlackUser { id: string; name?: string; username?: string }
interface SlackAction {
  action_id: string;
  block_id?: string;
  value?: string;
  type: string;
}
interface SlackPayload {
  type: string;
  user: SlackUser;
  channel?: { id: string; name?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message?: { ts: string; text?: string; blocks?: any[] };
  response_url: string;
  actions?: SlackAction[];
  team?: { id: string; domain?: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface IdeaQueueEntry { id: string; status: string; [k: string]: any }

// ── Read raw body (bodyParser is disabled) ────────────────────
function readRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

// ── Slack signature verification ──────────────────────────────
function verifySlackSignature(req: NextApiRequest, body: string, signingSecret: string): boolean {
  const ts = req.headers["x-slack-request-timestamp"] as string;
  const sig = req.headers["x-slack-signature"] as string;
  if (!ts || !sig) return false;
  // Reject requests older than 5 min (replay protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts, 10)) > 60 * 5) return false;
  const baseString = `v0:${ts}:${body}`;
  const expected = "v0=" + crypto.createHmac("sha256", signingSecret).update(baseString).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Find which client the channel belongs to ──────────────────
// Reads dispatch-channel.yml (new home for the configured channel) and
// falls back to integrations.json (legacy field) so old configs still work.
function findClientByChannel(channelId: string): string | null {
  const brandDir = path.join(BASE, "brand");
  if (!fs.existsSync(brandDir)) return null;
  for (const slug of fs.readdirSync(brandDir)) {
    // 1. Preferred: read content/configs/dispatch-channel.yml
    const dispatchPath = path.join(brandDir, slug, "content", "configs", "dispatch-channel.yml");
    if (fs.existsSync(dispatchPath)) {
      try {
        const dc = yaml.load(fs.readFileSync(dispatchPath, "utf-8")) as { channel_id?: string; transport?: string } | null;
        if (dc?.channel_id === channelId) return slug;
      } catch { /* malformed, continue */ }
    }
    // 2. Fallback: legacy integrations.json fields
    const integ = readJSON<Record<string, unknown>>(
      path.join(brandDir, slug, "integrations.json"),
      {}
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slack = ((integ.dataSources as any)?.slack || (integ.services as any)?.slack) as { config?: Record<string, string> } | undefined;
    const cid = slack?.config?.DISPATCH_CHANNEL_ID || slack?.config?.APPROVAL_CHANNEL_ID;
    if (cid === channelId) return slug;
  }
  return null;
}

// ── Get signing secret for client ─────────────────────────────
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

function getSigningSecret(slug: string): string | null {
  // Look in brand/{slug}/.env first (where SLACK_SIGNING_SECRET lives per-client),
  // then fall back to global env.
  const brandEnv = loadBrandEnv(slug);
  const upper = slug.toUpperCase();
  return brandEnv[`${upper}_SLACK_SIGNING_SECRET`]
    || brandEnv.SLACK_SIGNING_SECRET
    || process.env[`${upper}_SLACK_SIGNING_SECRET`]
    || process.env.SLACK_SIGNING_SECRET
    || null;
}

// ── Idea precheck ─────────────────────────────────────────────
// Verifies the idea exists before we kick off the async PATCH. Returns
// the idea so the caller has it for downstream message-edit + logging.
function findIdea(slug: string, ideaId: string): { ok: boolean; error?: string; idea?: IdeaQueueEntry } {
  const queuePath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  if (!fs.existsSync(queuePath)) return { ok: false, error: "idea-queue.json not found" };
  let queue: IdeaQueueEntry[];
  try { queue = JSON.parse(fs.readFileSync(queuePath, "utf-8")); }
  catch (e) { return { ok: false, error: `parse: ${(e as Error).message}` }; }
  const idea = queue.find((i) => i.id === ideaId);
  if (!idea) return { ok: false, error: `Idea ${ideaId} not found` };
  return { ok: true, idea };
}

// ── Fire-and-forget PATCH to /api/content-engine/ideas ────────
// Routing the update through the canonical endpoint guarantees the
// approve→generate-drafts auto-trigger runs (the source of truth for
// status transitions and side effects). We do NOT await — Slack expects
// an ACK in <3s and generate-drafts can take longer.
function dispatchIdeaUpdate(slug: string, ideaId: string, action: "approve" | "later" | "reject", actor: string) {
  const now = new Date().toISOString();
  const fields: Record<string, string> =
    action === "approve" ? { status: "Approved", approved_at: now, approved_via: "slack-button", approved_by: actor }
    : action === "reject" ? { status: "Discarded", archived_at: now, archived_via: "slack-button", archived_by: actor }
    : { status: "Deferred", deferred_at: now, deferred_by: actor }; // later: park in Deferred queue
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  fetch(`${baseUrl}/api/content-engine/ideas`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, ideaId, fields }),
  }).catch((e) => console.error("[slack-interactivity] PATCH failed:", (e as Error).message));

  // Activity log (Engine/Estado feed)
  try {
    if (action === "approve") {
      logActivity(slug, {
        type: "approve",
        text: `<b>${actor}</b> aprobó <span class="font-mono">${ideaId}</span> desde Slack`,
        icon: "✓", accent: "sage",
        meta: { ideaId, actor, via: "slack-button" },
      });
    } else if (action === "reject") {
      logActivity(slug, {
        type: "discard",
        text: `<b>${actor}</b> descartó <span class="font-mono">${ideaId}</span> desde Slack`,
        icon: "✗", accent: "brick",
        meta: { ideaId, actor, via: "slack-button" },
      });
    }
  } catch (e) {
    console.error("[slack-interactivity] activity log failed:", (e as Error).message);
  }
}

// ── Update the original Slack message via response_url ────────
// Preserves the original message contents — only swaps the action row of
// the clicked idea for a "✅ APROBADA por @user · 📝 Redactar en MC" context.
// All other ideas in the same message keep their buttons intact.
async function updateSlackMessage(
  responseUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalBlocks: any[] | undefined,
  ideaId: string,
  action: "approve" | "later" | "reject",
  actor: string,
  slug: string,
  mcUrl: string
) {
  const verb =
    action === "approve" ? "✅ APROBADA"
    : action === "reject" ? "❌ RECHAZADA"
    : "🕓 POSPUESTA";
  const when = new Date().toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });

  if (!originalBlocks || originalBlocks.length === 0) {
    // Fallback when we somehow lost the originals
    return fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        replace_original: "true",
        text: `${verb} por @${actor}`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `${verb} \`${ideaId}\` por @${actor} · ${when}` } }],
        unfurl_links: false,
        unfurl_media: false,
      }),
    }).catch((e) => console.error("[slack-interactivity] fallback update failed:", e));
  }

  const targetBlockId = `idea__${ideaId}__actions`;
  // Goes through the redirect endpoint so the destination is resolved at
  // click time (draft page if generate-drafts finished, parent task page
  // while it's still running).
  const mcLink = `${mcUrl}/api/content-engine/idea-redirect?slug=${encodeURIComponent(slug)}&ideaId=${encodeURIComponent(ideaId)}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newBlocks = originalBlocks.map((b: any) => {
    if (b?.block_id === targetBlockId) {
      // Replace this actions row with a context strip
      return {
        type: "context",
        block_id: targetBlockId, // keep the id so re-clicks (shouldn't happen) stay sane
        elements: [
          {
            type: "mrkdwn",
            text:
              `${verb} por *@${actor}* · ${when}` +
              (action === "approve" ? ` · <${mcLink}|📝 Redactar en MC>` : ""),
          },
        ],
      };
    }
    return b;
  });

  try {
    const res = await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replace_original: "true", blocks: newBlocks, unfurl_links: false, unfurl_media: false }),
    });
    if (!res.ok) {
      console.error("[slack-interactivity] update HTTP", res.status, await res.text());
    }
  } catch (e) {
    console.error("[slack-interactivity] update message failed:", (e as Error).message);
  }
}

function getMcBaseUrl(): string {
  return process.env.MC_PUBLIC_URL || "https://sancho-cmo.taild48df2.ts.net:8443";
}

// ── Handler ───────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const raw = await readRawBody(req);

  // Slack sends form-encoded body with single field "payload"
  const params = new URLSearchParams(raw);
  const payloadStr = params.get("payload");
  if (!payloadStr) return res.status(400).json({ error: "Missing payload" });
  let payload: SlackPayload;
  try { payload = JSON.parse(payloadStr); }
  catch { return res.status(400).json({ error: "Invalid JSON payload" }); }

  const channelId = payload.channel?.id || "";
  const slug = findClientByChannel(channelId);
  if (!slug) {
    console.warn("[slack-interactivity] no client for channel", channelId);
    return res.status(200).json({ text: `⚠️ Canal ${channelId} no asociado a ningún cliente. Configura DISPATCH_CHANNEL_ID en MC UI → Settings → APIs → Slack.` });
  }

  const signingSecret = getSigningSecret(slug);
  if (!signingSecret) {
    return res.status(500).json({ error: `SLACK_SIGNING_SECRET not configured for ${slug}` });
  }
  if (!verifySlackSignature(req, raw, signingSecret)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const action = payload.actions?.[0];
  if (!action) return res.status(400).json({ error: "No action" });

  // action_id convention: "{SLUG}__{IDEA_ID}__{approve|later|reject}"
  const parts = action.action_id.split("__");
  if (parts.length < 3) return res.status(400).json({ error: "Bad action_id format" });
  const [, ideaId, actionVerb] = parts;
  if (!["approve", "later", "reject"].includes(actionVerb)) {
    return res.status(400).json({ error: `Unknown action verb: ${actionVerb}` });
  }

  const actor = payload.user.username || payload.user.name || payload.user.id;
  // Sync precheck so we can return a friendly error to Slack if the idea is gone.
  const found = findIdea(slug, ideaId);
  if (!found.ok) {
    return res.status(200).json({ text: `❌ Error: ${found.error}` });
  }
  // Route the actual mutation through the canonical PATCH endpoint so the
  // approve→generate-drafts auto-trigger fires. Fire-and-forget — Slack
  // expects an ACK in <3s.
  dispatchIdeaUpdate(slug, ideaId, actionVerb as "approve" | "later" | "reject", actor);

  // Update the message: preserve everything, replace ONLY the action row
  // of the clicked idea with a "✅ APROBADA por @user · 📝 Redactar en MC" context.
  if (payload.response_url) {
    // fire-and-forget — don't block the ACK
    updateSlackMessage(
      payload.response_url,
      payload.message?.blocks,
      ideaId,
      actionVerb as "approve" | "later" | "reject",
      actor,
      slug,
      getMcBaseUrl()
    );
  }

  // ACK fast (Slack expects <3s response)
  return res.status(200).end();
}
