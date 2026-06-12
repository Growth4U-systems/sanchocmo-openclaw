/**
 * POST /api/intake/:token — Public intake form submission (SAN-17).
 *
 * Token-authenticated (stateless HMAC). Anyone with the link can submit. On a
 * valid submission: upsert intake_submissions, write the company-brief seed
 * doc, and queue a notification. One submission per client (re-submit upserts).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { resolveIntakeRequest } from "@/lib/intake/request";
import { renderIntakeMarkdown, writeIntakeSeedDoc } from "@/lib/intake/render";
import { upsertIntakeSubmission } from "@/lib/intake/submissions";
import { loadClient } from "@/lib/data/clients";
import { addNotification } from "@/lib/data/notifications";

// Soft per-IP rate limit (mirrors the comments endpoint).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_POSTS = 10;
const postTimestamps = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (postTimestamps.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_POSTS) {
    postTimestamps.set(ip, recent);
    return true;
  }
  recent.push(now);
  postTimestamps.set(ip, recent);
  return false;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { token } = req.query;
  const tokenStr = Array.isArray(token) ? token[0] : token;

  // Honeypot: bots filling the hidden `hp_url` field get a fake success.
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body === "object" && typeof body.hp_url === "string" && body.hp_url) {
    return res.status(201).json({ ok: true });
  }

  const ip =
    (typeof req.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0].trim()
      : null) ||
    req.socket?.remoteAddress ||
    "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Too many submissions, slow down" });
  }

  const resolved = resolveIntakeRequest(tokenStr, req.body);
  if (resolved.error) {
    return res.status(resolved.error.status).json({ error: resolved.error.message });
  }
  const slug = resolved.slug!;
  const input = resolved.input!;

  const client = loadClient(slug);
  if (!client || client.active === false) {
    return res.status(403).json({ error: "Invalid token" });
  }

  // Write the seed doc first so the durable handoff exists before the DB row.
  try {
    const markdown = renderIntakeMarkdown({
      clientName: client.name || slug,
      respondentName: input.respondentName,
      respondentEmail: input.respondentEmail,
      submittedAt: new Date(),
      answers: input.answers,
    });
    writeIntakeSeedDoc(slug, markdown);
  } catch (e) {
    return res
      .status(500)
      .json({ error: e instanceof Error ? e.message : "Could not write seed doc" });
  }

  await upsertIntakeSubmission(slug, input);

  // Notification (non-fatal if it fails).
  try {
    addNotification(slug, {
      type: "intake_submitted",
      title: "Formulario inicial recibido",
      body: `${input.respondentName} rellenó el formulario inicial. Reanuda el kickoff para generar el company-brief.`,
      metadata: { respondentEmail: input.respondentEmail },
    });
  } catch {
    // swallow — the submission is already persisted
  }

  return res.status(201).json({ ok: true });
}

export default withErrorHandler(handler);
