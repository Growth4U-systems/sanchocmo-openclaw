import { readBrandSecret } from "@/lib/brand-env";
import {
  McpAuthError,
  assertMcpClientAccess,
  assertMcpScope,
  type McpPrincipal,
} from "@/lib/mcp/auth";

export interface AlarifeMcpInstance {
  clientSlug: string;
  alarifeSlug: string;
  name: string;
  description?: string;
  adminUrl: string;
  mcpUrl: string;
  secretId: string;
  secretEnvKey: string;
  secretApiId: string;
}

interface JsonRpcToolsList {
  result?: {
    tools?: Array<{ name?: string }>;
  };
}

const ALARIFE_MCP_INSTANCES: AlarifeMcpInstance[] = [
  {
    clientSlug: "growth4u",
    alarifeSlug: "web",
    name: "Growth4U web",
    description: "Sitio web principal de Growth4U.",
    adminUrl: "https://admin.alarife-payload.growth4u.io/admin",
    mcpUrl: "https://admin.alarife-payload.growth4u.io/api/mcp",
    secretId: "alarife/growth4u/web/mcp-token",
    secretEnvKey: "GROWTH4U_ALARIFE_WEB_MCP_TOKEN",
    secretApiId: "alarife-web",
  },
  {
    clientSlug: "growth4u",
    alarifeSlug: "sancho-web",
    name: "Sancho web",
    description: "Web de Sancho dentro del cliente Growth4U.",
    adminUrl: "https://admin.alarife.sanchocmo.ai/admin",
    mcpUrl: "https://admin.alarife.sanchocmo.ai/api/mcp",
    secretId: "alarife/growth4u/sancho-web/mcp-token",
    secretEnvKey: "GROWTH4U_ALARIFE_SANCHO_WEB_MCP_TOKEN",
    secretApiId: "alarife-sancho-web",
  },
  {
    clientSlug: "example",
    alarifeSlug: "web",
    name: "Example web",
    description: "Sitio web principal de Example.",
    adminUrl: "https://admin.alarife-example.growth4u.io/admin",
    mcpUrl: "https://admin.alarife-example.growth4u.io/api/mcp",
    secretId: "alarife/example/web/mcp-token",
    secretEnvKey: "EXAMPLE_ALARIFE_WEB_MCP_TOKEN",
    secretApiId: "alarife-web",
  },
];

export function listAlarifeMcpInstances(clientSlug?: string): AlarifeMcpInstance[] {
  const slug = clientSlug?.trim();
  return ALARIFE_MCP_INSTANCES.filter((instance) => !slug || instance.clientSlug === slug);
}

export function getAlarifeMcpInstance(clientSlug: string, alarifeSlug: string): AlarifeMcpInstance {
  const instance = ALARIFE_MCP_INSTANCES.find(
    (candidate) =>
      candidate.clientSlug === clientSlug.trim() &&
      candidate.alarifeSlug === alarifeSlug.trim(),
  );
  if (!instance) {
    throw new McpAuthError(404, `Alarife MCP instance not found: ${clientSlug}/${alarifeSlug}`);
  }
  return instance;
}

export function resolveAlarifeMcpSecret(instance: AlarifeMcpInstance): string | undefined {
  return readBrandSecret(instance.clientSlug, instance.secretApiId, "MCP_TOKEN");
}

export interface AlarifeMcpTokenDelivery {
  clientSlug: string;
  alarifeSlug: string;
  name: string;
  mcpUrl: string;
  mcpServerName: string;
  secretEnvKey: string;
  token: string;
}

/**
 * Resolves the real Alarife MCP bearer token for an allowed (clientSlug, alarifeSlug)
 * so an install flow can configure a DIRECT Claude Code connection to that Alarife.
 *
 * SECURITY: this returns the secret value, so it MUST NOT be wired into an MCP tool
 * (that would leak the token into an LLM transcript). Only the dedicated authenticated
 * HTTP endpoint (`/api/alarife/mcp-token`) and the install script may call it.
 *
 * Access is gated by the principal scope (`sancho:read`) AND allowed-clients; a token
 * scoped to one client can never resolve another client's Alarife secret (fails closed).
 */
export function deliverAlarifeMcpToken(
  principal: McpPrincipal,
  clientSlug: string,
  alarifeSlug: string,
): AlarifeMcpTokenDelivery {
  assertMcpScope(principal, "sancho:read");
  assertMcpClientAccess(principal, clientSlug);

  const instance = getAlarifeMcpInstance(clientSlug, alarifeSlug);
  const token = resolveAlarifeMcpSecret(instance);
  if (!token) {
    throw new McpAuthError(424, `Missing Sancho secret: ${instance.secretId}`);
  }

  return {
    clientSlug: instance.clientSlug,
    alarifeSlug: instance.alarifeSlug,
    name: instance.name,
    mcpUrl: instance.mcpUrl,
    mcpServerName: `alarife-${instance.clientSlug}-${instance.alarifeSlug}`,
    secretEnvKey: instance.secretEnvKey,
    token,
  };
}

export function publicAlarifeMcpInstance(instance: AlarifeMcpInstance) {
  const secretConfigured = Boolean(resolveAlarifeMcpSecret(instance));
  return {
    clientSlug: instance.clientSlug,
    alarifeSlug: instance.alarifeSlug,
    name: instance.name,
    description: instance.description,
    adminUrl: instance.adminUrl,
    mcpUrl: instance.mcpUrl,
    secretId: instance.secretId,
    secretEnvKey: instance.secretEnvKey,
    secretLocation: `brand/${instance.clientSlug}/.env`,
    secretConfigured,
  };
}

export function buildAlarifeMcpInstallProfile(instance: AlarifeMcpInstance) {
  return {
    mcpServerName: `alarife-${instance.clientSlug}-${instance.alarifeSlug}`,
    transport: "http",
    url: instance.mcpUrl,
    headers: {
      Authorization: `Bearer \${${instance.secretEnvKey}}`,
    },
  };
}

export async function validateAlarifeMcpConnection(instance: AlarifeMcpInstance) {
  const token = resolveAlarifeMcpSecret(instance);
  if (!token) {
    throw new McpAuthError(424, `Missing Sancho secret: ${instance.secretId}`);
  }

  const response = await fetch(instance.mcpUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
  });

  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: text.slice(0, 240),
    };
  }

  const tools = parseToolNames(text);
  return {
    ok: true,
    status: response.status,
    toolCount: tools.length,
    leadDestinationsExposed: tools.some((name) => /leadDestinations|lead[-_]?destinations/i.test(name)),
  };
}

function parseToolNames(payload: string): string[] {
  const candidates = [payload];
  for (const line of payload.split(/\r?\n/)) {
    if (line.startsWith("data:")) candidates.push(line.slice("data:".length).trim());
  }

  for (const candidate of candidates) {
    const names = parseToolNamesFromJson(candidate);
    if (names.length > 0) return names;
  }

  return [];
}

function parseToolNamesFromJson(payload: string): string[] {
  try {
    const json = JSON.parse(payload) as JsonRpcToolsList;
    const tools = json.result?.tools || [];
    return tools.map((tool) => tool.name).filter((name): name is string => Boolean(name));
  } catch {
    return [];
  }
}
