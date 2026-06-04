# Sancho MCP

Sancho exposes a stateless Streamable HTTP MCP endpoint at:

```text
/api/mcp/sancho
```

Claude Code currently recommends HTTP for remote MCP servers and supports Bearer headers with:

```bash
claude mcp add --transport http sancho https://SANCHO_HOST/api/mcp/sancho \
  --header "Authorization: Bearer $SANCHO_MCP_TOKEN"
```

For local development:

```bash
SANCHO_MCP_TOKEN="dev-token" \
SANCHO_MCP_SCOPES="sancho:read,tasks:read,yalc:read,open-design:read,sancho:chat" \
SANCHO_MCP_CLIENTS="client-slug" \
npm run dev -- -p 3057

claude mcp add --transport http sancho-local http://localhost:3057/api/mcp/sancho \
  --header "Authorization: Bearer dev-token"
```

Reference: https://code.claude.com/docs/en/mcp

## Authentication

Production should configure tokens with `SANCHO_MCP_TOKENS`:

```json
[
  {
    "id": "claude-code-operator",
    "tokenHash": "sha256-hex-token-hash",
    "scopes": ["sancho:read", "tasks:read", "yalc:read", "open-design:read"],
    "clients": ["client-slug"]
  }
]
```

Generate a token hash with:

```bash
printf %s "$SANCHO_MCP_TOKEN" | shasum -a 256
```

Development can use the single-token fallback:

```bash
SANCHO_MCP_TOKEN="dev-token"
SANCHO_MCP_SCOPES="sancho:read,tasks:read"
SANCHO_MCP_CLIENTS="client-slug"
```

If no MCP token is configured, the endpoint returns `503`. If the request omits or fails Bearer auth, it returns `401` or `403`.

## Scopes

Available scopes:

- `sancho:read`
- `sancho:chat`
- `tasks:read`
- `yalc:read`
- `open-design:read`

Client isolation is explicit. Every client-scoped tool requires `clientSlug`, and the token must include that slug in `clients` or `*`.

## Tools

Current scaffolded tools:

- `sancho_mcp_status`
- `sancho_list_clients`
- `sancho_get_client_context`
- `sancho_list_tasks`
- `sancho_get_task`
- `sancho_send_message`
- `yalc_get_overview`
- `yalc_list_campaigns`
- `yalc_list_gates`
- `open_design_health`
- `open_design_list_catalog`

`sancho_send_message` is side-effecting. It defaults to dry-run and only sends when `dryRun=false` and `confirm=true`.

YALC and Open Design are read-only in this scaffold. Do not expose the generic Open Design proxy or YALC side-effect skills through MCP until the dry-run/confirmation layer and audit requirements are completed.

## Audit

Tool calls append JSONL audit entries to:

```text
.context/sancho-mcp-audit.jsonl
```

Override with:

```bash
SANCHO_MCP_AUDIT_FILE="/path/to/audit.jsonl"
```

Production can write to the dedicated DB table:

```bash
SANCHO_MCP_AUDIT_BACKEND="db"
SANCHO_MCP_AUDIT_FAIL_CLOSED="true"
```

Run migration `src/db/migrations/0006_mcp_audit_events.sql` before enabling DB audit.

Audit records include timestamp, principal id, token hash, tool name, client slug, success/failure and error message. They intentionally do not store tool payloads.

## Staging Deploy

The staging GitHub Environment must define:

- Secret `SANCHO_MCP_TOKENS`
- Variable `SANCHO_MCP_AUDIT_BACKEND=db`
- Variable `SANCHO_MCP_AUDIT_FAIL_CLOSED=true`
- Variable `RUN_DB_MIGRATIONS=1`

`deploy-staging.yml` applies those values to the VPS `.env` and runs `npm run db:migrate` in the `sanchocmo` container when `RUN_DB_MIGRATIONS=1`.

The current staging token is a single operator token for client `growth4u` with:

```json
["sancho:read", "tasks:read", "yalc:read", "open-design:read", "sancho:chat"]
```

Install the single staging MCP in Claude Code with:

```bash
SANCHO_MCP_TOKEN="$(cat .context/sancho-mcp-staging-operator-token.txt)"

claude mcp add --transport http sancho-staging https://staging.sanchocmo.ai/api/mcp/sancho \
  --header "Authorization: Bearer $SANCHO_MCP_TOKEN"
```

This is still one MCP server and one endpoint; the token scopes define what Claude Code may do.

## Tracing

Every MCP HTTP request gets an `X-Request-Id` response header. If the caller sends `X-Request-Id` or `X-Correlation-Id`, Sancho reuses it; otherwise it generates a UUID.

MCP tools propagate that trace id to downstream Sancho chat, YALC and Open Design calls as:

- `X-Request-Id`
- `X-Sancho-MCP-Trace-Id`

Audit events store the trace id in `metadata.traceId`.
