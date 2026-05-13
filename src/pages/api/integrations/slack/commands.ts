import type { NextApiRequest, NextApiResponse } from "next";
import { verifySlackSignature } from "@/lib/slack-signing";
import { findSlugByTeamId, loadIntegrations } from "@/lib/data/integrations";
import { recordDecision, listDecisions } from "@/lib/data/atalaya-decisions";

// Slack Slash Commands endpoint.
// To enable: api.slack.com/apps → Slash Commands →
//   Create new → /sancho → Request URL https://<host>/api/integrations/slack/commands
//
// We dispatch on the first whitespace-separated token of `text`.

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

interface SlackCommandFields {
  command: string;
  text: string;
  user_id: string;
  user_name: string;
  team_id: string;
  channel_id: string;
  response_url: string;
}

function parseFields(rawBody: string): SlackCommandFields {
  const p = new URLSearchParams(rawBody);
  return {
    command: p.get("command") || "",
    text: (p.get("text") || "").trim(),
    user_id: p.get("user_id") || "",
    user_name: p.get("user_name") || "",
    team_id: p.get("team_id") || "",
    channel_id: p.get("channel_id") || "",
    response_url: p.get("response_url") || "",
  };
}

function ephemeral(text: string) {
  return { response_type: "ephemeral" as const, text };
}

function inChannel(text: string) {
  return { response_type: "in_channel" as const, text };
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
    console.warn("[slack/commands] signature rejected:", sig.reason);
    return res.status(401).json({ error: "Invalid signature" });
  }

  const fields = parseFields(rawBody);
  const slug = fields.team_id ? findSlugByTeamId(fields.team_id) : null;

  if (!slug) {
    return res.status(200).json(
      ephemeral(":warning: Este workspace no está conectado a SanchoCMO. Conéctalo en /dashboard/admin/settings.")
    );
  }

  const [subcommand, ...rest] = fields.text.split(/\s+/);
  const args = rest.join(" ");
  const sub = subcommand.toLowerCase();

  console.info("[slack/commands]", {
    team_id: fields.team_id,
    slug,
    user_id: fields.user_id,
    command: fields.command,
    sub,
    args,
  });

  switch (sub) {
    case "":
    case "help":
      return res.status(200).json(ephemeral(helpText(fields.command || "/sancho")));

    case "status":
      return res.status(200).json(ephemeral(statusText(slug)));

    case "approve": {
      if (!args) return res.status(200).json(ephemeral(":warning: Falta el `signal_id`. Uso: `/sancho approve <signal_id>`"));
      recordDecision(slug, {
        signal_id: args,
        decision: "approve",
        decided_by: fields.user_id,
        decided_by_team: fields.team_id,
        decided_at: new Date().toISOString(),
        raw_action_id: "slash_approve",
        raw_value: args,
      });
      return res.status(200).json(inChannel(`:white_check_mark: Aprobado signal \`${args}\` por <@${fields.user_id}>`));
    }

    case "reject": {
      if (!args) return res.status(200).json(ephemeral(":warning: Falta el `signal_id`. Uso: `/sancho reject <signal_id>`"));
      recordDecision(slug, {
        signal_id: args,
        decision: "reject",
        decided_by: fields.user_id,
        decided_by_team: fields.team_id,
        decided_at: new Date().toISOString(),
        raw_action_id: "slash_reject",
        raw_value: args,
      });
      return res.status(200).json(inChannel(`:x: Rechazado signal \`${args}\` por <@${fields.user_id}>`));
    }

    case "decisions": {
      const recent = listDecisions(slug).slice(-5).reverse();
      if (recent.length === 0) {
        return res.status(200).json(ephemeral(`Sin decisiones registradas para \`${slug}\` aún.`));
      }
      const lines = recent.map((d) => {
        const icon = d.decision === "approve" ? ":white_check_mark:" : d.decision === "reject" ? ":x:" : ":hourglass_flowing_sand:";
        const when = new Date(d.decided_at).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        return `${icon} \`${d.signal_id || "—"}\` por <@${d.decided_by}> · ${when}`;
      });
      return res.status(200).json(ephemeral(`*Últimas 5 decisiones de \`${slug}\`:*\n${lines.join("\n")}`));
    }

    default:
      return res.status(200).json(
        ephemeral(`:question: Comando \`${sub}\` no reconocido.\n${helpText(fields.command || "/sancho")}`)
      );
  }
}

function helpText(cmd: string): string {
  return [
    `*${cmd} commands disponibles:*`,
    `• \`${cmd} help\` — esta ayuda`,
    `• \`${cmd} status\` — estado de la integración con este workspace`,
    `• \`${cmd} approve <signal_id>\` — aprueba un signal de Atalaya`,
    `• \`${cmd} reject <signal_id>\` — rechaza un signal`,
    `• \`${cmd} decisions\` — últimas 5 decisiones tomadas`,
  ].join("\n");
}

function statusText(slug: string): string {
  const data = loadIntegrations(slug);
  const slack = data.slack;
  if (!slack) return `:red_circle: Slack no está conectado para \`${slug}\`.`;
  const installed = slack.installed_at
    ? new Date(slack.installed_at).toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  const icon = slack.status === "connected" ? ":large_green_circle:" : slack.status === "error" ? ":red_circle:" : ":white_circle:";
  return [
    `${icon} *${slug}* · estado: \`${slack.status}\``,
    `Workspace: *${slack.team_name}* (\`${slack.team_id}\`)`,
    `Bot user: \`${slack.bot_user_id}\``,
    `Conectado: ${installed}`,
    slack.last_error ? `Último error: ${slack.last_error}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
