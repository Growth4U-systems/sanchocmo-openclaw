import crypto from "crypto";
import type { NextApiRequest } from "next";
import { loadClient } from "@/lib/data/clients";

export type McpScope =
  | "sancho:read"
  | "sancho:chat"
  | "tasks:read"
  | "tasks:write"
  | "yalc:read"
  | "yalc:write"
  | "open-design:read"
  | "docs:read";

export interface McpPrincipal {
  id: string;
  scopes: string[];
  clients: string[];
  brands?: string[];
  tokenHash: string;
}

interface McpTokenConfig {
  id?: string;
  token?: string;
  tokenHash?: string;
  scopes?: string[];
  clients?: string[];
  brands?: string[];
}

export class McpAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "McpAuthError";
    this.status = status;
  }
}

export function authenticateMcpRequest(req: NextApiRequest): McpPrincipal {
  const configuredTokens = loadMcpTokenConfigs();
  if (configuredTokens.length === 0) {
    throw new McpAuthError(503, "Sancho MCP token configuration is missing");
  }

  const token = getBearerToken(req);
  if (!token) {
    throw new McpAuthError(401, "Missing MCP bearer token");
  }

  const tokenHash = hashToken(token);
  const match = configuredTokens.find((entry) => tokenMatches(entry, token, tokenHash));
  if (!match) {
    throw new McpAuthError(403, "Invalid MCP bearer token");
  }

  const clients = normalizeList(match.clients);
  const brands = Array.isArray(match.brands) ? normalizeList(match.brands) : clients;

  return {
    id: match.id || `mcp-${tokenHash.slice(0, 12)}`,
    scopes: normalizeList(match.scopes),
    clients,
    brands,
    tokenHash,
  };
}

export function assertMcpScope(principal: McpPrincipal, scope: McpScope): void {
  if (hasMcpScope(principal, scope)) return;
  throw new McpAuthError(403, `MCP token is missing required scope: ${scope}`);
}

export function assertMcpClientAccess(principal: McpPrincipal, clientSlug: string): void {
  const slug = clientSlug.trim();
  if (!slug) throw new McpAuthError(400, "clientSlug is required");
  if (!loadClient(slug)) throw new McpAuthError(404, `Client not found: ${slug}`);
  if (principal.clients.includes("*") || principal.clients.includes(slug)) return;
  throw new McpAuthError(403, `MCP token is not allowed to access client: ${slug}`);
}

export function assertMcpBrandAccess(principal: McpPrincipal, brandSlug: string): void {
  const slug = brandSlug.trim();
  if (!slug) throw new McpAuthError(400, "brandSlug is required");
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    throw new McpAuthError(400, "brandSlug must be a simple slug");
  }
  assertMcpScope(principal, "docs:read");
  const brands = principal.brands ?? principal.clients;
  if (brands.includes("*") || brands.includes(slug)) return;
  throw new McpAuthError(403, `MCP token is not allowed to access brand: ${slug}`);
}

export function hasMcpScope(principal: McpPrincipal, scope: McpScope): boolean {
  if (principal.scopes.includes("*")) return true;
  if (principal.scopes.includes(scope)) return true;
  const [namespace] = scope.split(":");
  return principal.scopes.includes(`${namespace}:*`);
}

function loadMcpTokenConfigs(): McpTokenConfig[] {
  const configs: McpTokenConfig[] = [];

  const rawJson = process.env.SANCHO_MCP_TOKENS?.trim();
  if (rawJson) {
    const parsed = JSON.parse(rawJson) as unknown;
    if (Array.isArray(parsed)) {
      configs.push(...parsed.filter(isTokenConfig));
    } else if (isTokenConfig(parsed)) {
      configs.push(parsed);
    } else {
      throw new McpAuthError(503, "SANCHO_MCP_TOKENS must be a token config object or array");
    }
  }

  const singleToken = process.env.SANCHO_MCP_TOKEN?.trim();
  if (singleToken) {
    configs.push({
      id: process.env.SANCHO_MCP_TOKEN_ID || "sancho-mcp",
      token: singleToken,
      scopes: parseCsv(process.env.SANCHO_MCP_SCOPES),
      clients: parseCsv(process.env.SANCHO_MCP_CLIENTS),
      brands: process.env.SANCHO_MCP_BRANDS === undefined ? undefined : parseCsv(process.env.SANCHO_MCP_BRANDS),
    });
  }

  return configs.filter((entry) => entry.token || entry.tokenHash);
}

function isTokenConfig(value: unknown): value is McpTokenConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const tokenOk = record.token === undefined || typeof record.token === "string";
  const tokenHashOk = record.tokenHash === undefined || typeof record.tokenHash === "string";
  const idOk = record.id === undefined || typeof record.id === "string";
  const scopesOk = record.scopes === undefined || Array.isArray(record.scopes);
  const clientsOk = record.clients === undefined || Array.isArray(record.clients);
  const brandsOk = record.brands === undefined || Array.isArray(record.brands);
  return tokenOk && tokenHashOk && idOk && scopesOk && clientsOk && brandsOk;
}

function getBearerToken(req: NextApiRequest): string | null {
  const header = req.headers.authorization || req.headers.Authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function tokenMatches(entry: McpTokenConfig, token: string, tokenHash: string): boolean {
  if (entry.tokenHash && safeEqual(entry.tokenHash, tokenHash)) return true;
  if (entry.token && safeEqual(hashToken(entry.token), tokenHash)) return true;
  return false;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
