# Sancho MCP

> **Operators:** for token issuance/rotation, kill switches, dependency-down playbook, install troubleshooting and the smoke-test checklist, see [`sancho-mcp-runbook.md`](./sancho-mcp-runbook.md).

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
SANCHO_MCP_SCOPES="sancho:read,tasks:read,yalc:read,open-design:read,sancho:chat,docs:read,intelligence:read" \
SANCHO_MCP_CLIENTS="client-slug" \
SANCHO_MCP_BRANDS="client-slug" \
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
    "scopes": ["sancho:read", "tasks:read", "yalc:read", "open-design:read", "docs:read", "intelligence:read"],
    "clients": ["client-slug"],
    "brands": ["client-slug"]
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
SANCHO_MCP_BRANDS="client-slug"
```

If no MCP token is configured, the endpoint returns `503`. If the request omits or fails Bearer auth, it returns `401` or `403`.

## Scopes

Available scopes:

- `sancho:read`
- `sancho:chat`
- `tasks:read`
- `tasks:write`
- `yalc:read`
- `open-design:read`
- `docs:read`
- `intelligence:read`

Client isolation is explicit. Every client-scoped tool requires `clientSlug`, and the token must include that slug in `clients` or `*`.

Document access is brand-scoped. Document tools require `docs:read` and a `brandSlug`; the token must include that slug in `brands` or `*`. If `brands` is omitted, it defaults to the token's `clients` list for backwards compatibility. This allows cases like a Growth4U operator token with `clients: ["growth4u"]` and `brands: ["growth4u", "xhype"]`, where XHYPE is a brand folder under Sancho but not a first-class client.

## Tools

Current scaffolded tools:

- `sancho_mcp_status`
- `sancho_list_clients`
- `sancho_get_client_context`
- `sancho_list_documents`
- `sancho_get_document`
- `sancho_list_tasks`
- `sancho_get_task`
- `sancho_create_task`
- `sancho_update_task`
- `sancho_send_message`
- `sancho_list_chat_threads`
- `sancho_get_chat_thread`
- `sancho_list_meetings`
- `sancho_get_meeting`
- `sancho_list_intelligence`
- `yalc_get_overview`
- `yalc_list_campaigns`
- `yalc_list_gates`
- `open_design_health`
- `open_design_list_catalog`

`sancho_send_message`, `sancho_create_task` and `sancho_update_task` are side-effecting. They require `tasks:write` (except `sancho_send_message`, which requires `sancho:chat`), default to dry-run, and only write when `dryRun=false` and `confirm=true`.

`sancho_update_task` only accepts a whitelist of fields (`name`, `status`, `description`, `brief`, `completion`, `owner`) and rejects updates that change nothing.

### Chat read flow

Use `sancho_list_chat_threads` to find Mission Control chat threads for the allowed client, then `sancho_get_chat_thread` to read recent messages.

`sancho_get_chat_thread` also extracts pending `:::ask` blocks emitted by Sancho agents and returns:

- `pendingQuestions`: parsed multiple-choice questions with `id`, `prompt`, `mode` and `options`.
- `responseFormat`: the exact text shape Claude Code can send back through `sancho_send_message`, for example:

```text
[ask:q_foundation_scope] respuesta: Foundation completo
```

Both chat read tools require `sancho:chat` because chat history may contain sensitive client context.

YALC and Open Design are read-only in this scaffold. Do not expose the generic Open Design proxy or YALC side-effect skills through MCP until the dry-run/confirmation layer and audit requirements are completed.

### Document read flow

Use `sancho_list_documents` to discover Brand Brain/Foundation documents for a brand, then `sancho_get_document` to read one `.md` or `.html` document by path.

Examples:

```json
{ "brandSlug": "xhype", "pathPrefix": "market-and-us" }
```

```json
{ "brandSlug": "xhype", "docPath": "market-and-us/market/current.md" }
```

`docPath` can be either brand-relative or a full `brand/<slug>/...` path. Reads are capped by `maxChars` (default `60000`, max `200000`) and return `truncated:true` when content is clipped.

### Intelligence read flow

Use `sancho_list_meetings` to get a lightweight index of a client's Meeting Intelligence meetings (id, title, date, source, status, decision/action counts) plus totals and last sync/run, then `sancho_get_meeting` to read one meeting's full detail (artifact, insights, decisions, document impacts, recommendations). Use `sancho_list_intelligence` to read the cross-meeting feed (insights, decisions, impacted documents, proposals) without opening each meeting; filter it with the optional `kind` (`Decision`, `Action`, `Insight`, `Quote`, `Risk`) and `status` arguments.

All three require `intelligence:read` and are read-only — run/approve/reject actions are intentionally not exposed. They wrap the same shared services as the Intelligence UI, so Claude Code and Sancho read the exact same data. When Meeting Intelligence has no database configured they degrade cleanly: empty arrays and `storage.configured:false`, never an error.

Examples:

```json
{ "clientSlug": "growth4u", "limit": 20 }
```

```json
{ "clientSlug": "growth4u", "kind": "Decision" }
```

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

`deploy-staging.yml` applies those values to the VPS `.env` and runs `npm run db:migrate:mcp` in the `sanchocmo` container when `RUN_DB_MIGRATIONS=1`.

The current staging token is a single shared operator token enabled for all clients (`clients: ["*"]`) with:

```json
["sancho:read", "tasks:read", "tasks:write", "yalc:read", "open-design:read", "sancho:chat", "docs:read", "intelligence:read"]
```

This is a shared token: audit events attribute every call to the same principal, and it can read and write across any staging client. For production, issue per-person/per-client tokens scoped to the narrowest set needed.

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
