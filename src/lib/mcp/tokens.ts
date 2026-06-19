import crypto from "crypto";

export const MCP_SCOPES = [
  "sancho:read",
  "sancho:chat",
  "tasks:read",
  "tasks:write",
  "yalc:read",
  "yalc:write",
  "open-design:read",
  "docs:read",
  "intelligence:read",
  "seo:read",
  "seo:write",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export interface McpTokenConfig {
  id?: string;
  token?: string;
  tokenHash?: string;
  scopes?: string[];
  clients?: string[];
  brands?: string[];
}

export interface McpTokenSummary {
  id: string;
  source: "SANCHO_MCP_TOKENS" | "SANCHO_MCP_TOKEN";
  storage: "sha256-hash" | "plain-env";
  scopes: string[];
  clients: string[];
  brands: string[];
  hashFingerprint: string;
  tokenRecoverable: boolean;
}

export interface GeneratedMcpToken {
  token: string;
  config: Required<Pick<McpTokenConfig, "id" | "tokenHash" | "scopes" | "clients">> & {
    brands?: string[];
  };
}

type EnvLike = Pick<NodeJS.ProcessEnv, string>;

export function loadMcpTokenConfigs(env: EnvLike = process.env): McpTokenConfig[] {
  const configs: McpTokenConfig[] = [];

  const rawJson = env.SANCHO_MCP_TOKENS?.trim();
  if (rawJson) {
    const parsed = parseMcpTokensJson(rawJson);
    configs.push(...parsed);
  }

  const singleToken = env.SANCHO_MCP_TOKEN?.trim();
  if (singleToken) {
    configs.push({
      id: env.SANCHO_MCP_TOKEN_ID || "sancho-mcp",
      token: singleToken,
      scopes: parseCsv(env.SANCHO_MCP_SCOPES),
      clients: parseCsv(env.SANCHO_MCP_CLIENTS),
      brands: env.SANCHO_MCP_BRANDS === undefined ? undefined : parseCsv(env.SANCHO_MCP_BRANDS),
    });
  }

  return configs.filter((entry) => entry.token || entry.tokenHash);
}

export function listMcpTokenSummaries(env: EnvLike = process.env): McpTokenSummary[] {
  const summaries: McpTokenSummary[] = [];
  const rawJson = env.SANCHO_MCP_TOKENS?.trim();

  if (rawJson) {
    parseMcpTokensJson(rawJson)
      .filter((entry) => entry.token || entry.tokenHash)
      .forEach((entry, index) => {
        const tokenHash = resolveTokenHash(entry);
        summaries.push({
          id: entry.id || `mcp-${tokenHash.slice(0, 12) || index + 1}`,
          source: "SANCHO_MCP_TOKENS",
          storage: entry.token ? "plain-env" : "sha256-hash",
          scopes: normalizeStringList(entry.scopes),
          clients: normalizeStringList(entry.clients),
          brands: entry.brands === undefined ? normalizeStringList(entry.clients) : normalizeStringList(entry.brands),
          hashFingerprint: fingerprintHash(tokenHash),
          tokenRecoverable: Boolean(entry.token),
        });
      });
  }

  const singleToken = env.SANCHO_MCP_TOKEN?.trim();
  if (singleToken) {
    const tokenHash = hashMcpToken(singleToken);
    summaries.push({
      id: env.SANCHO_MCP_TOKEN_ID || "sancho-mcp",
      source: "SANCHO_MCP_TOKEN",
      storage: "plain-env",
      scopes: parseCsv(env.SANCHO_MCP_SCOPES),
      clients: parseCsv(env.SANCHO_MCP_CLIENTS),
      brands: env.SANCHO_MCP_BRANDS === undefined ? parseCsv(env.SANCHO_MCP_CLIENTS) : parseCsv(env.SANCHO_MCP_BRANDS),
      hashFingerprint: fingerprintHash(tokenHash),
      tokenRecoverable: true,
    });
  }

  return summaries;
}

export function generateMcpToken(input: {
  id: string;
  scopes: string[];
  clients: string[];
  brands?: string[];
}): GeneratedMcpToken {
  const id = normalizeTokenId(input.id);
  const scopes = validateKnownScopes(input.scopes);
  const clients = normalizeRequiredList(input.clients, "clients");
  const brands = input.brands === undefined ? undefined : normalizeStringList(input.brands);
  const token = `sancho_mcp_${crypto.randomBytes(32).toString("base64url")}`;

  return {
    token,
    config: {
      id,
      tokenHash: hashMcpToken(token),
      scopes,
      clients,
      ...(brands !== undefined ? { brands } : {}),
    },
  };
}

export function appendMcpTokenConfig(rawJson: string | undefined, config: McpTokenConfig): string {
  const existing = rawJson?.trim() ? parseMcpTokensJson(rawJson) : [];
  const next = [...existing, config];
  return JSON.stringify(next, null, 2);
}

export function parseMcpTokensJson(rawJson: string): McpTokenConfig[] {
  let parsed = JSON.parse(rawJson) as unknown;
  if (typeof parsed === "string") parsed = JSON.parse(parsed) as unknown;
  if (Array.isArray(parsed)) return parsed.filter(isTokenConfig);
  if (isTokenConfig(parsed)) return [parsed];
  throw new Error("SANCHO_MCP_TOKENS must be a token config object or array");
}

export function isTokenConfig(value: unknown): value is McpTokenConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const tokenOk = record.token === undefined || typeof record.token === "string";
  const tokenHashOk = record.tokenHash === undefined || typeof record.tokenHash === "string";
  const idOk = record.id === undefined || typeof record.id === "string";
  const scopesOk = record.scopes === undefined || isStringArray(record.scopes);
  const clientsOk = record.clients === undefined || isStringArray(record.clients);
  const brandsOk = record.brands === undefined || isStringArray(record.brands);
  return tokenOk && tokenHashOk && idOk && scopesOk && clientsOk && brandsOk;
}

export function hashMcpToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function fingerprintHash(hash: string): string {
  if (!hash) return "missing";
  if (hash.length <= 20) return hash;
  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
}

export function normalizeStringList(value: unknown): string[] {
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

export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveTokenHash(entry: McpTokenConfig): string {
  if (entry.tokenHash) return entry.tokenHash;
  if (entry.token) return hashMcpToken(entry.token);
  return "";
}

function normalizeTokenId(value: string): string {
  const id = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(id)) {
    throw new Error("Token id must be 3-81 chars and use letters, numbers, dots, underscores or dashes");
  }
  return id;
}

function validateKnownScopes(scopes: string[]): string[] {
  const normalized = normalizeRequiredList(scopes, "scopes");
  const known = new Set<string>(MCP_SCOPES);
  const unknown = normalized.filter((scope) => !known.has(scope));
  if (unknown.length > 0) throw new Error(`Unknown MCP scopes: ${unknown.join(", ")}`);
  return normalized;
}

function normalizeRequiredList(value: unknown, field: string): string[] {
  const normalized = normalizeStringList(value);
  if (normalized.length === 0) throw new Error(`${field} must include at least one value`);
  return normalized;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
