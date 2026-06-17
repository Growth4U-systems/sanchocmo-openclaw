# Sancho MCP — Operator Runbook

Operational guide for issuing access, troubleshooting, and safely disabling the Sancho MCP. For the architecture/contract and the tool reference, see [`sancho-mcp.md`](./sancho-mcp.md).

- **Staging endpoint:** `https://staging.sanchocmo.ai/api/mcp/sancho`
- **One MCP server, one endpoint.** What a caller can do is decided entirely by the **token** (its scopes + allowed clients).
- **Repo:** `Growth4U-systems/sanchocmo-openclaw`. Token config lives in the GitHub **Environment** secret `SANCHO_MCP_TOKENS` (per environment: `staging`, `production`).

---

## 1. Tokens: issuance, scopes, rotation

### 1.1 Scope selection

| Scope | Grants | Side effects |
|-------|--------|--------------|
| `sancho:read` | list clients, client context | none |
| `tasks:read` | list/get tasks | none |
| `yalc:read` | YALC overview / campaigns / gates (read) | none |
| `open-design:read` | OD health / catalog (read) | none |
| `docs:read` | list/read Brand Brain/Foundation docs by `brandSlug` + path | none |
| `intelligence:read` | list/read Meeting Intelligence meetings + cross-meeting insights | none |
| `sancho:chat` | read chat threads **and** `sancho_send_message` | sends chat messages (dry-run default) |
| `tasks:write` | `sancho_create_task`, `sancho_update_task` | writes tasks (dry-run default) |

Notes:
- `yalc:write` is **not shipped** (SAN-68 paused — single shared YALC daemon has no per-tenant isolation). Do not add it until that blocker is resolved.
- `clients` is an explicit allowlist of slugs, or `["*"]` for all. Every client-scoped tool requires `clientSlug` and the token must include it.
- `brands` is an explicit allowlist for document tools. If omitted, it defaults to `clients`. Use it for sub-brands like XHYPE: `clients: ["growth4u"]`, `brands: ["growth4u", "xhype"]`.
- **Principle of least privilege:** grant the narrowest scopes + the fewest clients a user actually needs. Prefer read-only tokens for anyone just exploring.

### 1.2 Issue a token

1. Generate a strong random token (e.g. `openssl rand -hex 32`). **Never commit it; never paste it in a channel.**
2. Hash it:
   ```bash
   printf %s "$SANCHO_MCP_TOKEN" | shasum -a 256
   ```
3. Add an entry to the `SANCHO_MCP_TOKENS` JSON array (store **only the hash**):
   ```json
   [
     {
       "id": "claude-code-<person-or-purpose>",
       "tokenHash": "<sha256-hex>",
       "scopes": ["sancho:read", "tasks:read", "yalc:read", "open-design:read", "docs:read", "intelligence:read"],
       "clients": ["growth4u"],
       "brands": ["growth4u", "xhype"]
     }
   ]
   ```
   The `id` is what shows up in the audit log — make it identifiable (per person/purpose).
4. Push the updated secret and redeploy (the deploy applies it to the VPS `.env`):
   ```bash
   printf '%s' "$JSON" | gh secret set SANCHO_MCP_TOKENS --env staging --repo Growth4U-systems/sanchocmo-openclaw
   ```
5. Deliver the **plaintext** token to the user via a secure channel (1Password / Bitwarden), never git or chat.

### 1.3 Rotate / revoke a token

- **Rotate (no downtime):** add the new token's hash to the array *alongside* the old one, deploy, hand out the new token, then remove the old hash and deploy again.
- **Revoke immediately:** remove that entry's hash from `SANCHO_MCP_TOKENS` and redeploy. The old token then fails auth (`403`).
- A token is just a bearer string → treat a leak like a credential leak: revoke + reissue.

> ⚠️ The current staging token is a **single shared operator token** with `clients: ["*"]` and write scopes. Shared tokens mean audit attributes every call to the same `id`. For production, issue **per-person, per-client** tokens.

---

## 2. Kill switches — disable side-effecting tools fast

There is no per-tool toggle in code; the lever is the **token config** + redeploy.

| Goal | Action |
|------|--------|
| Stop task writes, keep reads | Re-issue `SANCHO_MCP_TOKENS` without `tasks:write`, deploy. |
| Stop chat sends | Remove `sancho:chat`, deploy. Note: this also disables chat thread reads because chat history uses the same scope today. |
| Disable the MCP **entirely** | Remove `SANCHO_MCP_TOKENS` (and `SANCHO_MCP_TOKEN`) → endpoint returns `503` for everyone. |
| Cut off **one** user/token | Remove that entry's hash, deploy → that token gets `403`. |
| Lock to specific clients | Set `clients` to an explicit slug list (remove `["*"]`), deploy. |
| Lock document access to specific brands | Set `brands` to an explicit slug list (remove `["*"]`), deploy. |

All side-effecting tools (`sancho_send_message`, `sancho_create_task`, `sancho_update_task`) already default to **dry-run** and only execute with `dryRun=false` + `confirm=true`, so accidental fire requires an explicit override.

---

## 3. Dependency-down playbook

The MCP server stays up even when a backend is down; affected tools return structured errors instead of crashing.

| Backend down | Symptom | What still works | Operator check |
|--------------|---------|------------------|----------------|
| **YALC daemon** | `yalc_get_overview` returns per-check `ok:false`; `yalc_list_campaigns`/`yalc_list_gates` return a YALC error | everything non-YALC | Confirm `YALC_BASE_URL`/`YALC_API_TOKEN` on the VPS `.env`; check the YALC container (`ENABLE_YALC_SERVICE`). Default base is `http://localhost:3847`. |
| **Open Design daemon** | `open_design_health` reports unhealthy; `open_design_list_catalog` errors or falls back to filesystem listing | everything non-OD | Check `OD_DAEMON_URL` reachability. OD may be local-only and not reachable from the staging host. |
| **Mission Control gateway / OpenClaw** | `sancho_send_message` (live send) throws "gateway rejected"; chat reads still work from disk state | reads, tasks, YALC/OD reads | Check `MC_CHAT_GATEWAY` + `MC_CHAT_SECRET`; verify the gateway/OpenClaw process. |
| **DB (tasks/audit)** | task reads/writes error; if `SANCHO_MCP_AUDIT_BACKEND=db` + `FAIL_CLOSED=true`, tool calls fail closed | status, clients, chat reads | Check DB connectivity; audit can fall back to JSONL if not fail-closed. |

Health probe: `curl -s https://staging.sanchocmo.ai/api/health` returns `{ok, commit, env}` — confirm `commit` matches the SHA you expect after a deploy.

---

## 4. Common Claude Code install mistakes

```bash
SANCHO_MCP_TOKEN="<token from 1Password>"
claude mcp add --scope local --transport http sancho-staging \
  https://staging.sanchocmo.ai/api/mcp/sancho \
  --header "Authorization: Bearer $SANCHO_MCP_TOKEN"
```

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Tools don't appear after install | Session not reloaded | **Close and reopen Cursor / restart the Claude Code session.** |
| `503` on every call | No token configured server-side | Check `SANCHO_MCP_TOKENS` exists for that environment + was deployed. |
| `401` | No / malformed `Authorization` header | Ensure `--header "Authorization: Bearer <token>"`. |
| `403 Invalid MCP bearer token` | Wrong token or hash not in `SANCHO_MCP_TOKENS` | Verify the token; confirm its hash is in the deployed secret. |
| `403 missing required scope` | Token lacks the scope the tool needs | Add the scope (see §1.1) and redeploy. |
| `403 not allowed to access client` | `clientSlug` not in token's `clients` | Add the slug or use a token scoped to it. |
| Token visible to teammates / in repo | Installed with `--scope project` | Use `--scope local` so the header/token isn't written to repo config. |
| `sancho-local` not found / refused | Local dev server not running | Start the app on the expected port with the dev env vars (see `sancho-mcp.md`). |

Verify an install:
```bash
claude mcp get sancho-staging   # Status: ✓ Connected
```

---

## 5. Smoke-test checklist (post-deploy)

Run after any deploy that touches the MCP, with a real token:

- [ ] `curl -s .../api/health` → `commit` == deployed SHA.
- [ ] `sancho_mcp_status` → `ok`, expected `scopes` + `clients`, `traceId` present.
- [ ] `sancho_list_clients` → expected client set (matches token `clients`).
- [ ] `sancho_get_client_context` for one client → returns status.
- [ ] `sancho_list_documents` for one allowed brand → returns expected Brand Brain/Foundation docs.
- [ ] `sancho_get_document` for one allowed `.md` path → returns content, `canonicalPath`, `traceId`.
- [ ] `sancho_list_tasks` / `sancho_get_task` → OK.
- [ ] `sancho_create_task` **dry-run** (no `confirm`) → `dryRun:true, requiresConfirmation:true`, nothing written.
- [ ] `sancho_list_chat_threads` + `sancho_get_chat_thread` → reads; `:::ask` detection works.
- [ ] `yalc_get_overview`, `open_design_health` → reachable or clean structured error.
- [ ] `alarife_list_instances` for `growth4u` → returns `web` and `sancho-web`.
- [ ] `alarife_list_instances` for `paymatico` → returns `web`.
- [ ] `alarife_get_mcp_config` → returns MCP URL + secret reference, **not** the bearer token.
- [ ] `alarife_validate_mcp_connection` → `ok:true`, expected tool count, `leadDestinationsExposed:false`.
- [ ] Negative: a tool requiring a scope the token lacks → `403`; a disallowed `clientSlug` or `brandSlug` → `403`; path traversal in `docPath` → error.

### Alarife MCP secrets

Alarife tokens live under the client workspace, not globally:

```text
brand/growth4u/.env
GROWTH4U_ALARIFE_WEB_MCP_TOKEN=<secret>
GROWTH4U_ALARIFE_SANCHO_WEB_MCP_TOKEN=<secret>

brand/paymatico/.env
PAYMATICO_ALARIFE_WEB_MCP_TOKEN=<secret>
```

Do not paste these tokens in Slack, Linear, GitHub, or MCP responses. The Alarife helper tools only expose secret ids/env var names and use the secret internally for validation.

---

## 6. Audit & tracing

- Audit sink: dedicated DB table `mcp_audit_events` when `SANCHO_MCP_AUDIT_BACKEND=db` (+ `SANCHO_MCP_AUDIT_FAIL_CLOSED=true` to refuse calls if audit fails); otherwise JSONL at `SANCHO_MCP_AUDIT_FILE` (dev default `.context/sancho-mcp-audit.jsonl`).
- Records: timestamp, principal `id`, token hash, tool, `clientSlug`, success/failure, error, `metadata.traceId`. **No tool payloads.**
- Tracing: every request returns `X-Request-Id`; the trace id propagates downstream as `X-Request-Id` / `X-Sancho-MCP-Trace-Id`. To correlate a report, ask for the trace id and grep the audit sink.

To inspect recent audit events (DB):
```sql
SELECT created_at, principal_id, tool_name, client_slug, ok, error
FROM mcp_audit_events ORDER BY created_at DESC LIMIT 50;
```

---

## 7. Escalation

- **Auth/scope/client errors:** operator can fix via `SANCHO_MCP_TOKENS` + redeploy (§1, §2).
- **YALC/OD/gateway down:** infra/daemon owner (the MCP only proxies).
- **Resuming YALC write tools (SAN-68):** blocked on per-tenant YALC daemon isolation — see the SAN-68 comment for the design, must-fixes, and preconditions before re-opening.
