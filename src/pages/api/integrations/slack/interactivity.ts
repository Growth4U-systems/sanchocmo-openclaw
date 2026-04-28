import type { NextApiRequest, NextApiResponse } from "next";
import { verifySlackSignature } from "@/lib/slack-signing";
import { findSlugByTeamId } from "@/lib/data/integrations";
import { recordDecision, type DecisionType } from "@/lib/data/atalaya-decisions";

// Slack interactivity endpoint.
// To enable: api.slack.com/apps → Interactivity & Shortcuts →
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

interface SlackAction {
  action_id?: string;
  block_id?: string;
  value?: string;
  type?: string;
}

interface SlackPayload {
  type?: string;
  team?: { id?: string; domain?: string };
  user?: { id?: string; username?: string; name?: string };
  actions?: SlackAction[];
  callback_id?: string;
  trigger_id?: string;
  response_url?: string;
}

// Recognise common Atalaya signal action_id patterns:
//   "approve" | "reject" | "later"
//   "signal_approve" | "signal_reject" | "signal_later"
//   "signal:approve" | "signal:reject" | "signal:later"
function detectDecision(actionId: string | undefined): DecisionType | null {
  if (!actionId) return null;
  const norm = actionId.toLowerCase().replace(/^signal[_:]/, "");
  if (norm === "approve" || norm === "aprobar") return "approve";
  if (norm === "reject" || norm === "rechazar") return "reject";
  if (norm === "later" || norm === "mas_tarde" || norm === "más_tarde") return "later";
  return null;
}

// Pull a signal_id out of the action value or block_id.
// Convention: "<signal_id>" or "signal:<signal_id>" or pipe-encoded
// "signal_id=<id>|pillar=<p>|..."
function extractSignalId(action: SlackAction): string | null {
  const candidates = [action.value, action.block_id].filter(Boolean) as string[];
  for (const raw of candidates) {
    if (raw.includes("signal_id=")) {
      const m = raw.match(/signal_id=([^|&]+)/);
      if (m) return m[1];
    }
    if (raw.startsWith("signal:")) return raw.slice("signal:".length);
    if (raw.length > 0 && raw.length < 200) return raw; // best-effort fallback
  }
  return null;
}

// Update the original Slack message via response_url to give the user
// feedback. Fire-and-forget: we don't block the 3-second ack on it.
async function ackInSlack(responseUrl: string, text: string): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replace_original: false, response_type: "ephemeral", text }),
    });
  } catch (e) {
    console.warn("[slack/interactivity] response_url post failed:", e);
  }
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

  const params = new URLSearchParams(rawBody);
  const rawPayload = params.get("payload");
  if (!rawPayload) return res.status(400).json({ error: "Missing payload" });

  let payload: SlackPayload;
  try {
    payload = JSON.parse(rawPayload) as SlackPayload;
  } catch {
    return res.status(400).json({ error: "Invalid payload JSON" });
  }

  const teamId = payload.team?.id || "";
  const userId = payload.user?.id || "";
  const slug = teamId ? findSlugByTeamId(teamId) : null;

  // Ack within Slack's 3s window. Do everything else after we send the response.
  res.status(200).end();

  // Process actions (asynchronously vs the response, but inside the same handler):
  for (const action of payload.actions || []) {
    const decision = detectDecision(action.action_id);
    const signalId = extractSignalId(action);

    console.info("[slack/interactivity] action", {
      team_id: teamId,
      slug,
      user_id: userId,
      action_id: action.action_id,
      decision,
      signal_id: signalId,
    });

    if (!decision) continue;

    if (!slug) {
      console.warn("[slack/interactivity] no slug found for team", teamId);
      if (payload.response_url) {
        await ackInSlack(
          payload.response_url,
          `:warning: SanchoCMO no encontró la integración para este workspace. Reconecta en /dashboard/admin/settings.`
        );
      }
      continue;
    }

    recordDecision(slug, {
      signal_id: signalId,
      decision,
      decided_by: userId,
      decided_by_team: teamId,
      decided_at: new Date().toISOString(),
      raw_action_id: action.action_id || "",
      raw_value: action.value,
    });

    if (payload.response_url) {
      const labels: Record<DecisionType, string> = {
        approve: ":white_check_mark: Aprobado",
        reject: ":x: Rechazado",
        later: ":hourglass_flowing_sand: Pospuesto para más tarde",
      };
      await ackInSlack(
        payload.response_url,
        `${labels[decision]} por <@${userId}>${signalId ? ` · signal \`${signalId}\`` : ""}`
      );
    }
  }
}
