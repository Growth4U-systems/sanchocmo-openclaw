import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { loadClients } from "@/lib/data/clients";

/**
 * GET /api/chat/find-by-discord/:discordId
 * Ported from mc-server.js:5201-5235
 * Finds MC thread linked to a Discord thread ID
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const discordThreadId = decodeURIComponent(req.query.discordId as string);
  if (!discordThreadId) {
    return res.status(400).json({ error: "Missing discordThreadId" });
  }

  const clients = loadClients();
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

export default withErrorHandler(handler);
