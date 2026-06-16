import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";

/**
 * Estado de las conexiones MCP del lado Sancho (SAN-175) — Settings · Conexiones.
 *
 *   GET /api/partnerships/mcp-health?slug=…[&ping=1]
 *     → { connections: [{ id, name, status, detail }] }
 *
 * ScrapeCreators NO es un provider de Yalc: es el MCP del agente
 * (`mcp__scrapecreators__*`, https://api.scrapecreators.com) que usa
 * `discovery-search-runner` para perfiles + ad-library. Aquí solo se expone su
 * estado: la clave vive en `SCRAPECREATORS_API_KEY` del entorno de Sancho.
 * Sin `ping=1` se comprueba solo la configuración; con `ping=1` se hace una
 * llamada real con timeout corto.
 */

const SCRAPECREATORS_BASE = "https://api.scrapecreators.com";
const PING_TIMEOUT_MS = 6_000;

type McpStatus = "green" | "red" | "gray";

interface McpConnection {
  id: string;
  name: string;
  status: McpStatus;
  description: string;
  hasHealthProbe: boolean;
}

async function pingScrapeCreators(apiKey: string): Promise<{ status: McpStatus; description: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(`${SCRAPECREATORS_BASE}/v1/account/credit-balance`, {
      headers: { "x-api-key": apiKey },
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      return { status: "red", description: "clave inválida o sin permisos" };
    }
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { balance?: number; credits?: number } | null;
      const credits = body?.balance ?? body?.credits;
      return {
        status: "green",
        description:
          typeof credits === "number" ? `conectado · ${credits.toLocaleString("es-ES")} créditos` : "conectado",
      };
    }
    // Endpoint de balance no disponible pero el host responde: configurado.
    return { status: "green", description: `configurado · ping no concluyente (HTTP ${res.status})` };
  } catch {
    return { status: "red", description: "no alcanzable (red o timeout)" };
  } finally {
    clearTimeout(timer);
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const ping = req.query.ping === "1";
  const apiKey = process.env.SCRAPECREATORS_API_KEY || "";

  let scrape: McpConnection;
  if (!apiKey) {
    scrape = {
      id: "scrapecreators",
      name: "ScrapeCreators (MCP de Sancho)",
      status: "gray",
      description: "sin configurar — define SCRAPECREATORS_API_KEY en el entorno de Sancho",
      hasHealthProbe: false,
    };
  } else if (ping) {
    const result = await pingScrapeCreators(apiKey);
    scrape = {
      id: "scrapecreators",
      name: "ScrapeCreators (MCP de Sancho)",
      status: result.status,
      description: result.description,
      hasHealthProbe: true,
    };
  } else {
    scrape = {
      id: "scrapecreators",
      name: "ScrapeCreators (MCP de Sancho)",
      status: "green",
      description: "clave configurada — usa Probar conexión para el ping real",
      hasHealthProbe: true,
    };
  }

  return res.status(200).json({ connections: [scrape] });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
