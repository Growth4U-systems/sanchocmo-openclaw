import type { NextApiRequest, NextApiResponse } from "next";
import { verifySlackSignature } from "@/lib/slack-signing";

// Slack interactivity endpoint.
// Receives button clicks, modal submissions, and shortcut invocations from
// any workspace where SanchoCMO is installed. Slack signs every request, so we
// MUST verify the HMAC against the raw body before parsing.
//
// To enable: api.slack.com/apps → Your App → Interactivity & Shortcuts →
//   Request URL: https://<host>/api/integrations/slack/interactivity

export const config = {
  api: { bodyParser: false }, // raw body needed for signature verification
};

function readRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

interface SlackPayload {
  type?: string;
  team?: { id?: string; domain?: string };
  user?: { id?: string; username?: string };
  actions?: Array<{ action_id?: string; value?: string; type?: string }>;
  callback_id?: string;
  trigger_id?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawBody = await readRawBody(req);

  const sig = verifySlackSignature({
    timestamp: req.headers["x-slack-request-timestamp"] as string | undefined,
    signature: req.headers["x-slack-signature"] as string | undefined,
    rawBody,
  });
  if (!sig.valid) {
    console.warn("[slack/interactivity] signature rejected:", sig.reason);
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Slack sends interactivity payloads as application/x-www-form-urlencoded
  // with a single "payload" field whose value is JSON.
  const params = new URLSearchParams(rawBody);
  const rawPayload = params.get("payload");
  if (!rawPayload) {
    return res.status(400).json({ error: "Missing payload" });
  }

  let payload: SlackPayload;
  try {
    payload = JSON.parse(rawPayload) as SlackPayload;
  } catch {
    return res.status(400).json({ error: "Invalid payload JSON" });
  }

  console.info("[slack/interactivity] received:", {
    type: payload.type,
    team_id: payload.team?.id,
    user_id: payload.user?.id,
    actions: payload.actions?.map((a) => a.action_id).filter(Boolean),
    callback_id: payload.callback_id,
  });

  // TODO: route to per-feature handlers (approve content, reject content, etc.)
  // The contract (Slack expects 200 within 3 seconds) is to ack immediately;
  // long-running work should be posted to a queue or done via response_url.

  return res.status(200).json({ ok: true });
}
