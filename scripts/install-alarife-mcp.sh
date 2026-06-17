#!/usr/bin/env bash
#
# install-alarife-mcp — SAN-232
#
# Configures a DIRECT Claude Code MCP connection to a client's Alarife, fetching the
# bearer token from Sancho. The token is never printed to stdout/stderr.
#
# A team member only needs the shared Sancho team token; Sancho decides which Alarife
# they may reach (allowed-clients gating) and hands back the matching Alarife token.
#
# Usage:
#   SANCHO_MCP_TOKEN=<team token> scripts/install-alarife-mcp.sh <clientSlug> <alarifeSlug>
#
# Optional env:
#   SANCHO_URL   default https://app.sanchocmo.ai
#   MCP_SCOPE    claude mcp scope: local (default) | user | project
#
# Example:
#   SANCHO_MCP_TOKEN=*** scripts/install-alarife-mcp.sh growth4u web
#
set -euo pipefail

CLIENT_SLUG="${1:-}"
ALARIFE_SLUG="${2:-}"
SANCHO_URL="${SANCHO_URL:-https://app.sanchocmo.ai}"
MCP_SCOPE="${MCP_SCOPE:-local}"

if [[ -z "$CLIENT_SLUG" || -z "$ALARIFE_SLUG" ]]; then
  echo "Usage: install-alarife-mcp <clientSlug> <alarifeSlug>" >&2
  exit 2
fi
if [[ -z "${SANCHO_MCP_TOKEN:-}" ]]; then
  echo "Error: SANCHO_MCP_TOKEN is required (the Sancho team bearer token)." >&2
  exit 2
fi
command -v claude >/dev/null 2>&1 || { echo "Error: 'claude' CLI not found on PATH." >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: 'jq' is required (brew install jq)." >&2; exit 1; }

# Ask Sancho for the token + install profile for this Alarife.
resp="$(curl -fsS -X POST "$SANCHO_URL/api/alarife/mcp-token" \
  -H "Authorization: Bearer $SANCHO_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"clientSlug\":\"$CLIENT_SLUG\",\"alarifeSlug\":\"$ALARIFE_SLUG\"}")" || {
  echo "Error: Sancho rejected the request (check your team token and that you may access '$CLIENT_SLUG')." >&2
  exit 1
}

server_name="$(printf '%s' "$resp" | jq -r '.mcpServerName // empty')"
mcp_url="$(printf '%s' "$resp" | jq -r '.mcpUrl // empty')"
token="$(printf '%s' "$resp" | jq -r '.token // empty')"

if [[ -z "$server_name" || -z "$mcp_url" || -z "$token" ]]; then
  echo "Error: Sancho response did not include mcpServerName, mcpUrl and token." >&2
  exit 1
fi

# Replace any previous entry, then add the DIRECT connection to the Alarife MCP.
# The token is passed inline and never echoed.
claude mcp remove --scope "$MCP_SCOPE" "$server_name" >/dev/null 2>&1 || true
claude mcp add --transport http --scope "$MCP_SCOPE" "$server_name" "$mcp_url" \
  -H "Authorization: Bearer $token" >/dev/null

unset token resp

echo "✓ Installed MCP server '$server_name' -> $mcp_url (scope: $MCP_SCOPE)"
echo "  Restart Claude Code. It can now operate the ${CLIENT_SLUG}/${ALARIFE_SLUG} Alarife (full tools)."
