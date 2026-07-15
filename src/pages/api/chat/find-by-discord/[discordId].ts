import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { loadClients } from "@/lib/data/clients";
import { getRuntime } from "@/lib/runtime";

/**
 * GET /api/chat/find-by-discord/:discordId
 * Ported from mc-server.js:5201-5235
 * Finds MC thread linked to a Discord thread ID
 */
export async function findByDiscordHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const discordThreadId = typeof req.query.discordId === "string"
    ? req.query.discordId.trim()
    : "";
  if (!discordThreadId) {
    return res.status(400).json({ error: "Missing discordThreadId" });
  }
  if (discordThreadId.length > 256) {
    return res.status(400).json({ error: "Invalid discordThreadId" });
  }

  // Discord ids do not encode a tenant. Search only the caller's authorized
  // clients so a miss cannot reveal another tenant's thread mapping.
  const clients = loadClients().filter((client) => canAccessSlug(req.ctx, client.slug));
  for (const client of clients) {
    const chatDir = path.join(BASE, "brand", client.slug, "chat");
    if (!fs.existsSync(chatDir)) continue;
    const files = fs.readdirSync(chatDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const threadData = JSON.parse(
          fs.readFileSync(path.join(chatDir, file), "utf-8")
        );
        if (threadData.discordThreadId === discordThreadId) {
          const shortId = file.replace(".json", "");
          const threadId = `${client.slug}:${shortId}`;
          return res.status(200).json({ ok: true, threadId, slug: client.slug });
        }
      } catch {
        // skip invalid files
      }
    }
  }

  res.status(404).json({ ok: false, error: "No MC thread linked to this Discord thread" });
}

const sessionAuthed = compose(withErrorHandler, withAuth)(findByDiscordHandler);
const runtimeAuthed = withErrorHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  const expected = getRuntime().messaging.getSharedSecret?.();
  const supplied = Array.isArray(req.headers["x-mc-secret"])
    ? req.headers["x-mc-secret"][0]
    : req.headers["x-mc-secret"];
  if (!expected) return res.status(503).json({ error: "MC_CHAT_SECRET not configured" });
  if (!supplied || supplied !== expected) return res.status(403).json({ error: "Forbidden" });
  req.ctx = {
    isAdmin: true,
    clientSlug: null,
    allowedSlugs: null,
    adminToken: null,
    portalClient: null,
  };
  return findByDiscordHandler(req, res);
});

export default function entry(req: NextApiRequest, res: NextApiResponse) {
  if (req.headers["x-mc-secret"] !== undefined) return runtimeAuthed(req, res);
  return sessionAuthed(req, res);
}
