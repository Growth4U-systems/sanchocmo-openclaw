/**
 * Proxy server-side hacia el daemon de Open Design (localhost:7456).
 * La UI de MC llama a su propio dominio (`/api/open-design/<endpoint>`) → este handler reenvía
 * al daemon. Evita CORS, abstrae la URL del daemon, y permite passthrough de SSE.
 *
 * GET  /api/open-design/skills        → daemon/api/skills
 * POST /api/open-design/chat          → daemon/api/chat (SSE)
 * POST /api/open-design/import/folder → daemon/api/import/folder
 * etc.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { resolveOdConfig } from "@/lib/open-design/client";

export const config = {
  api: {
    bodyParser: false, // pasamos body raw para SSE/binary; lo recolectamos manualmente
    responseLimit: false,
  },
};

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { daemonUrl } = resolveOdConfig();

  const pathParts = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean);
  const targetPath = pathParts.join("/");
  const queryEntries = Object.entries(req.query).filter(([k]) => k !== "path");
  const queryString = queryEntries.length
    ? "?" +
      queryEntries
        .flatMap(([k, v]) =>
          Array.isArray(v)
            ? v.map((vv) => `${encodeURIComponent(k)}=${encodeURIComponent(String(vv))}`)
            : [`${encodeURIComponent(k)}=${encodeURIComponent(String(v ?? ""))}`],
        )
        .join("&")
    : "";

  const url = `${daemonUrl}/api/${targetPath}${queryString}`;

  // Forward headers excluyendo Host y Connection
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v) continue;
    const lower = k.toLowerCase();
    if (["host", "connection", "content-length", "transfer-encoding"].includes(lower)) continue;
    headers[k] = Array.isArray(v) ? v.join(",") : v;
  }

  const method = (req.method ?? "GET").toUpperCase();
  const body = method !== "GET" && method !== "HEAD" ? await readRawBody(req) : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: body && body.length > 0 ? new Uint8Array(body) : undefined,
    });
  } catch (err) {
    res.status(503).json({
      error: "OD daemon offline",
      message: `Cannot reach daemon at ${daemonUrl}`,
      cause: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // Forward status + headers
  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (["transfer-encoding", "connection"].includes(key.toLowerCase())) return;
    res.setHeader(key, value);
  });

  const contentType = upstream.headers.get("content-type") ?? "";
  const isSse = contentType.includes("text/event-stream");

  if (isSse) {
    // SSE passthrough — escribir chunks según llegan
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    if (upstream.body) {
      const reader = upstream.body.getReader();
      const closed = new Promise<void>((resolve) => {
        const flush = async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) res.write(Buffer.from(value));
            }
          } catch {
            // upstream cancelled
          } finally {
            res.end();
            resolve();
          }
        };
        flush();
      });
      req.on("close", () => {
        try {
          reader.cancel();
        } catch {
          // ignore
        }
      });
      await closed;
    } else {
      res.end();
    }
    return;
  }

  // Respuesta normal: copiamos buffer entero
  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.end(buffer);
}
