# Alarife MCP token delivery (SAN-232)

How a team member connects Claude Code **directly** to a client's Alarife with full
edit access, getting the bearer token from Sancho without ever pasting or printing it.

## Model

- The **work MCP is each Alarife's own** `/api/mcp` (independent, full CRUD — 38 tools).
- **Sancho is the keyring**: it holds the real Alarife tokens (`brand/<slug>/.env`) and
  hands the right one to an authorized caller.
- Claude Code connects **directly** to the Alarife — not through Sancho.

The discovery tools (`alarife_list_instances`, `alarife_get_mcp_config`,
`alarife_validate_mcp_connection`) still **never** return tokens (`tokenReturned: false`).
Token delivery is a separate, non-MCP endpoint so the secret never lands in an LLM transcript.

## Endpoint

`POST /api/alarife/mcp-token`

Auth: same bearer as `/api/mcp/sancho`. Body: `{ "clientSlug": "...", "alarifeSlug": "..." }`.

Gating (fails closed):
- requires scope `sancho:read`,
- requires the principal's allowed clients to include `clientSlug` (a client-scoped token
  can only fetch its own Alarife token),
- `424` if the secret is not configured in Sancho for that instance.

Returns `{ ok, clientSlug, alarifeSlug, mcpServerName, mcpUrl, secretEnvKey, token, traceId }`.
Every call is audited (`alarife_deliver_mcp_token`) with principal + client + alarife — never the token.

## Install (team member)

```bash
SANCHO_MCP_TOKEN=<team token> scripts/install-alarife-mcp.sh growth4u web
```

The script asks Sancho for the token and runs `claude mcp add` for the **direct** Alarife
connection (`alarife-<client>-<alarife>`), never printing the secret. Restart Claude Code
afterwards.

## Security trade-offs / follow-ups

- The endpoint returns a **full-access** Alarife token. It is currently gated by `sancho:read`;
  a dedicated `alarife:install` scope would be tighter (deferred — the shared team token only
  carries `sancho:read` today).
- "Llave directa" means the full token lands on each team member's machine
  (`~/.claude.json`). Rotating an Alarife token requires re-running the install. The more
  hardened alternative is a server-side relay (token never leaves Sancho) — see SAN-232 notes.
- **Staging has no tokens loaded** (`secretConfigured: false`); use production.
