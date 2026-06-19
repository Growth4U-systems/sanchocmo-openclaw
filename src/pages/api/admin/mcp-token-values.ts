import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { parseEnvContent } from "@/lib/env-file";
import { getAlarifeMcpInstance, resolveAlarifeMcpSecret } from "@/lib/mcp/alarife";
import { McpAuthError } from "@/lib/mcp/auth";
import {
  fingerprintHash,
  hashMcpToken,
  parseMcpTokensJson,
  type McpTokenConfig,
} from "@/lib/mcp/tokens";

const ENV_FILE = path.join(BASE, "..", ".env");

interface RevealTokenBody {
  kind?: unknown;
  id?: unknown;
  source?: unknown;
  hashFingerprint?: unknown;
  clientSlug?: unknown;
  alarifeSlug?: unknown;
}

type RuntimeEnv = Record<string, string | undefined>;

function readEnvFile(): string {
  try {
    return fs.readFileSync(ENV_FILE, "utf-8");
  } catch {
    return "";
  }
}

function readRuntimeEnv(): RuntimeEnv {
  const fileVars = parseEnvContent(readEnvFile());
  return { ...process.env, ...fileVars };
}

function configHash(entry: McpTokenConfig): string {
  if (entry.tokenHash) return entry.tokenHash;
  if (entry.token) return hashMcpToken(entry.token);
  return "";
}

function matchesSanchoRequest(entry: McpTokenConfig, body: RevealTokenBody): boolean {
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const requestedFingerprint = typeof body.hashFingerprint === "string" ? body.hashFingerprint.trim() : "";
  const hash = configHash(entry);
  const entryId = entry.id || `mcp-${hash.slice(0, 12)}`;
  if (id && id !== entryId) return false;
  if (requestedFingerprint && requestedFingerprint !== fingerprintHash(hash)) return false;
  return Boolean(id || requestedFingerprint);
}

function revealSanchoToken(body: RevealTokenBody, env: RuntimeEnv) {
  const source = typeof body.source === "string" ? body.source.trim() : "";

  if (source === "SANCHO_MCP_TOKEN" || !source) {
    const token = env.SANCHO_MCP_TOKEN?.trim();
    if (token) {
      const hash = hashMcpToken(token);
      const entry: McpTokenConfig = {
        id: env.SANCHO_MCP_TOKEN_ID || "sancho-mcp",
        token,
      };
      if (matchesSanchoRequest(entry, body) || source === "SANCHO_MCP_TOKEN") {
        return {
          ok: true as const,
          id: entry.id || "sancho-mcp",
          source: "SANCHO_MCP_TOKEN" as const,
          storage: "plain-env" as const,
          hashFingerprint: fingerprintHash(hash),
          token,
        };
      }
    }
  }

  if (source === "SANCHO_MCP_TOKENS" || !source) {
    const raw = env.SANCHO_MCP_TOKENS?.trim();
    const entries = raw ? parseMcpTokensJson(raw).filter((entry) => entry.token || entry.tokenHash) : [];
    const match = entries.find((entry) => matchesSanchoRequest(entry, body));
    if (match) {
      const hash = configHash(match);
      if (!match.token) {
        return {
          ok: false as const,
          status: 409,
          error: "This Sancho MCP token is hash-only and cannot be revealed. Generate a new token from Sancho to make it recoverable.",
        };
      }
      return {
        ok: true as const,
        id: match.id || `mcp-${hash.slice(0, 12)}`,
        source: "SANCHO_MCP_TOKENS" as const,
        storage: "plain-env" as const,
        hashFingerprint: fingerprintHash(hash),
        token: match.token,
      };
    }
  }

  return {
    ok: false as const,
    status: 404,
    error: "Sancho MCP token not found in this server runtime environment.",
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const body = (req.body || {}) as RevealTokenBody;
  const kind = typeof body.kind === "string" ? body.kind.trim() : "";

  if (kind === "sancho") {
    let result;
    try {
      result = revealSanchoToken(body, readRuntimeEnv());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sancho MCP token configuration is invalid";
      return res.status(503).json({ error: message });
    }
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.status(200).json({ kind, ...result });
  }

  if (kind === "alarife") {
    const clientSlug = typeof body.clientSlug === "string" ? body.clientSlug.trim() : "";
    const alarifeSlug = typeof body.alarifeSlug === "string" ? body.alarifeSlug.trim() : "";
    if (!clientSlug || !alarifeSlug) {
      return res.status(400).json({ error: "clientSlug and alarifeSlug are required" });
    }

    let instance;
    try {
      instance = getAlarifeMcpInstance(clientSlug, alarifeSlug);
    } catch (err) {
      const status = err instanceof McpAuthError ? err.status : 500;
      const message = err instanceof Error ? err.message : "Alarife MCP instance lookup failed";
      return res.status(status).json({ error: message });
    }
    const token = resolveAlarifeMcpSecret(instance);
    if (!token) return res.status(424).json({ error: `Missing Sancho secret: ${instance.secretId}` });

    return res.status(200).json({
      ok: true,
      kind,
      clientSlug: instance.clientSlug,
      alarifeSlug: instance.alarifeSlug,
      name: instance.name,
      mcpUrl: instance.mcpUrl,
      mcpServerName: `alarife-${instance.clientSlug}-${instance.alarifeSlug}`,
      secretEnvKey: instance.secretEnvKey,
      token,
    });
  }

  return res.status(400).json({ error: "kind must be sancho or alarife" });
}

export default compose(withErrorHandler, withAuth)(handler);
