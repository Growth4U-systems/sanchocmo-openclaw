import type { NextApiRequest, NextApiResponse } from "next";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { loadClients } from "@/lib/data/clients";
import { readJSON } from "@/lib/data/json-io";
import { integrationsFile } from "@/lib/data/paths";

/**
 * GET /api/system/integrations-summary
 * Returns aggregated integration status across all clients
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Aggregated cross-client view — admin only.
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const clients = loadClients().filter((c) => c.active);
  const summary: { slug: string; name: string; sources: { name: string; status: string }[] }[] = [];
  let connected = 0;
  let disconnected = 0;
  let error = 0;

  for (const client of clients) {
    const data = readJSON<{ dataSources?: Record<string, { status?: string }> }>(
      integrationsFile(client.slug),
      { dataSources: {} }
    );
    const sources = Object.entries(data.dataSources || {}).map(([name, src]) => {
      const st = src.status || "disconnected";
      if (st === "connected") connected++;
      else if (st === "error") error++;
      else disconnected++;
      return { name, status: st };
    });
    if (sources.length > 0) {
      summary.push({ slug: client.slug, name: client.name, sources });
    }
  }

  res.status(200).json({ connected, disconnected, error, clients: summary });
}

export default compose(withErrorHandler, withAuth)(handler);
