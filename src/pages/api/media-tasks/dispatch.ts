/**
 * POST /api/media-tasks/dispatch
 *
 * Dispara una task type=media para Maese Pedro. v1: persistimos un archivo en el "inbox" del
 * agente (`~/.openclaw/workspace-maese-pedro/inbox/<id>.json`) que el agente recoge en su
 * próximo tick. La integración con el dispatcher principal de Sancho (proyectos + tasks.json
 * + Discord gateway) va en una iteración posterior — ver TODO al final.
 *
 * Body: { slug, prompt, skill?, upstreamSkill?, designSystemId?, kind?, context? }
 * Returns: { ok: true, taskId, inboxPath }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { installHome } from "@/lib/data/paths";

interface DispatchRequest {
  slug: string;
  prompt: string;
  skill?: string;
  upstreamSkill?: string;
  designSystemId?: string;
  kind?: "template" | "mockup" | "logo" | "style-reference" | "export" | "design-md" | "misc";
  context?: Record<string, unknown>;
  /** Block que originó el prompt (palette, typography, logos…). Para tracking UI. */
  source?: string;
}

// workspace-maese-pedro lives in the install home next to workspace-sancho —
// runtime-agnostic on purpose (SAN-485).
function inboxDir(): string {
  return path.join(installHome(), "workspace-maese-pedro", "inbox");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as DispatchRequest;
  if (!body || !body.slug || !body.prompt) {
    res.status(400).json({ error: "slug and prompt are required" });
    return;
  }

  const taskId = `media-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const skill = body.skill ?? "od-generate";

  const inbox = inboxDir();
  await fs.mkdir(inbox, { recursive: true });
  const inboxPath = path.join(inbox, `${taskId}.json`);

  const task = {
    taskId,
    type: "media",
    agent: "maese-pedro",
    skill,
    upstreamSkill: body.upstreamSkill,
    designSystemId: body.designSystemId,
    kind: body.kind ?? "misc",
    slug: body.slug,
    prompt: body.prompt,
    source: body.source,
    context: body.context,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  await fs.writeFile(inboxPath, JSON.stringify(task, null, 2) + "\n", "utf8");

  res.status(200).json({ ok: true, taskId, inboxPath, task });

  // TODO: cuando el dispatcher de Sancho exponga API server-side, también:
  //   - Crear task real en `brand/{slug}/projects/<P>/tasks.json` con type=media
  //   - Notificar al agente vía Discord gateway
  //   - Retornar el thread_id real
}
