import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { McpAuthError, authenticateMcpRequest } from "@/lib/mcp/auth";
import { deliverAlarifeMcpToken } from "@/lib/mcp/alarife";
import { auditMcpToolCall } from "@/lib/mcp/audit";

/**
 * SAN-232 — Alarife MCP token delivery.
 *
 * Returns the REAL Alarife MCP bearer token for an allowed (clientSlug, alarifeSlug)
 * so an install script can configure a DIRECT Claude Code connection to that Alarife
 * (full CRUD). This is intentionally a plain authenticated HTTP endpoint and NOT an
 * MCP tool, so the token never enters an LLM transcript.
 *
 * Auth: same bearer model as `/api/mcp/sancho` (Sancho team/principal token).
 * Isolation: gated by principal scope + allowed clients; cross-client fails closed.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const traceId = getTraceId(req);
  res.setHeader("X-Request-Id", traceId);
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST.", traceId });
  }

  let principal;
  try {
    principal = authenticateMcpRequest(req);
  } catch (err) {
    const status = err instanceof McpAuthError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Authentication failed";
    return res.status(status).json({ error: message, traceId });
  }

  const body = (req.body || {}) as { clientSlug?: unknown; alarifeSlug?: unknown };
  const clientSlug = typeof body.clientSlug === "string" ? body.clientSlug.trim() : "";
  const alarifeSlug = typeof body.alarifeSlug === "string" ? body.alarifeSlug.trim() : "";

  if (!clientSlug || !alarifeSlug) {
    return res.status(400).json({ error: "clientSlug and alarifeSlug are required", traceId });
  }

  try {
    const delivery = deliverAlarifeMcpToken(principal, clientSlug, alarifeSlug);

    await auditMcpToolCall({
      principal,
      toolName: "alarife_deliver_mcp_token",
      ok: true,
      clientSlug,
      metadata: { alarifeSlug, traceId, action: "token_delivery" },
    });

    return res.status(200).json({
      ok: true,
      clientSlug: delivery.clientSlug,
      alarifeSlug: delivery.alarifeSlug,
      mcpServerName: delivery.mcpServerName,
      mcpUrl: delivery.mcpUrl,
      secretEnvKey: delivery.secretEnvKey,
      token: delivery.token,
      traceId,
    });
  } catch (err) {
    const status = err instanceof McpAuthError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Internal error";

    await auditMcpToolCall({
      principal,
      toolName: "alarife_deliver_mcp_token",
      ok: false,
      clientSlug,
      error: message,
      metadata: { alarifeSlug, traceId, action: "token_delivery" },
    }).catch(() => undefined);

    return res.status(status).json({ error: message, traceId });
  }
}

function getTraceId(req: NextApiRequest): string {
  const header = req.headers["x-request-id"] || req.headers["x-correlation-id"];
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 128);
  return crypto.randomUUID();
}
