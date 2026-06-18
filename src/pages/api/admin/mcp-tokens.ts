import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { parseEnvContent, upsertEnvContent } from "@/lib/env-file";
import {
  MCP_SCOPES,
  appendMcpTokenConfig,
  generateMcpToken,
  listMcpTokenSummaries,
  parseMcpTokensJson,
  type McpTokenConfig,
} from "@/lib/mcp/tokens";

const ENV_FILE = path.join(BASE, "..", ".env");
const DEFAULT_SCOPES = ["sancho:read", "docs:read", "intelligence:read"];
const ISSUABLE_SCOPES = MCP_SCOPES.filter((scope) => scope !== "yalc:write");

interface CreateTokenBody {
  id?: unknown;
  scopes?: unknown;
  clients?: unknown;
  brands?: unknown;
  activate?: unknown;
}

function readEnvFile(): string {
  try {
    return fs.readFileSync(ENV_FILE, "utf-8");
  } catch {
    return "";
  }
}

function writeEnvFile(content: string): void {
  fs.writeFileSync(ENV_FILE, content, "utf-8");
}

function readRuntimeMcpTokensRaw(): string | undefined {
  const fileVars = parseEnvContent(readEnvFile());
  return fileVars.SANCHO_MCP_TOKENS || process.env.SANCHO_MCP_TOKENS;
}

function activateToken(config: McpTokenConfig): { nextJson: string; count: number } {
  const content = readEnvFile();
  const fileVars = parseEnvContent(content);
  const currentRaw = fileVars.SANCHO_MCP_TOKENS || process.env.SANCHO_MCP_TOKENS;
  const nextJson = JSON.stringify(parseMcpTokensJson(appendMcpTokenConfig(currentRaw, config)));

  writeEnvFile(upsertEnvContent(content, { SANCHO_MCP_TOKENS: nextJson }));
  process.env.SANCHO_MCP_TOKENS = nextJson;

  return { nextJson, count: parseMcpTokensJson(nextJson).length };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  if (req.method === "GET") {
    const raw = readRuntimeMcpTokensRaw();
    return res.status(200).json({
      ok: true,
      envFile: ENV_FILE,
      availableScopes: ISSUABLE_SCOPES,
      defaultScopes: DEFAULT_SCOPES,
      configured: Boolean(process.env.SANCHO_MCP_TOKENS || process.env.SANCHO_MCP_TOKEN || raw),
      tokens: listMcpTokenSummaries({
        ...process.env,
        ...(raw ? { SANCHO_MCP_TOKENS: raw } : {}),
      }),
      note: "Existing MCP bearer tokens are not recoverable from hashes. Generate a new token to reveal it once.",
    });
  }

  if (req.method === "POST") {
    const body = (req.body || {}) as CreateTokenBody;
    const activate = body.activate !== false;

    let generated;
    try {
      generated = generateMcpToken({
        id: typeof body.id === "string" ? body.id : "",
        scopes: toStringArray(body.scopes),
        clients: toStringArray(body.clients),
        brands: Array.isArray(body.brands) ? toStringArray(body.brands) : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid MCP token request";
      return res.status(400).json({ error: message });
    }

    let activated = false;
    let persistedCount: number | null = null;
    const configJson = JSON.stringify(generated.config, null, 2);

    if (activate) {
      try {
        const result = activateToken(generated.config);
        activated = true;
        persistedCount = result.count;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not activate MCP token";
        return res.status(500).json({ error: message });
      }
    }

    return res.status(201).json({
      ok: true,
      token: generated.token,
      config: generated.config,
      configJson,
      activated,
      persistedCount,
      tokens: listMcpTokenSummaries(),
      warning: "This is the only response that includes the plaintext token. Store it in a secure password manager now.",
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
