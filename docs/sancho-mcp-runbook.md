# Sancho MCP — Operator Runbook

Operational guide for issuing access, troubleshooting, and safely disabling the Sancho MCP. For the architecture/contract and the tool reference, see [`sancho-mcp.md`](./sancho-mcp.md).

- **Staging endpoint:** `https://staging.example.com/api/mcp/sancho`
- **One MCP server, one endpoint.** What a caller can do is decided entirely by the **token** (its scopes + allowed clients).
- **Traceability:** every tool response includes `traceId`; audit events store the same value in metadata.
- **Repo:** `Growth4U-systems/sanchocmo-openclaw`. Token config lives in the GitHub **Environment** secret `SANCHO_MCP_TOKENS` (per environment: `staging`, `production`).

---

## 1. Tokens: issuance, scopes, rotation

### 1.1 Scope selection

| Scope | Grants | Side effects |
|-------|--------|--------------|
| `sancho:read` | legacy core reads (`sancho_list_clients`, `sancho_get_client_context`) | none |
| `clients:read` | list/get sanitized client config and context for allowed clients | none |
| `clients:write` | update safe client metadata fields (`active`, `name`, `emoji`, `phase`, `url`, `language`, `enabledFeatures`) | writes `clients.json` (dry-run default) |
| `agents:read` | list/get OpenClaw/Sancho agent profiles, model overrides and recommendations | may read OpenClaw config/runtime metadata |
| `agents:write` | set/clear agent model override | OpenClaw config writes (dry-run default) |
| `tasks:read` | list/get tasks | none |
| `content:read` | Content Engine state, config, ideas, ContentTasks, drafts and activity | none |
| `content:write` | update Content Engine config, create ideas, safely update idea metadata/triage status, approve ideas into ContentTasks/drafts | writes local Content Engine files (dry-run default) |
| `media:read` | image-provider/storage readiness and draft media assets | none |
| `media:write` | attach existing media URLs, reorder/remove draft media, generate images through configured providers | local draft writes, R2 upload, provider credits (dry-run/confirm default) |
| `publishing:read` | publishing providers, connected account info and stored post metrics | none |
| `publishing:write` | publish/schedule drafts, cancel scheduled posts, refresh status and reconcile scheduled publishing state | provider side effects and local draft/task state writes (dry-run/confirm default) |
| `integrations:read` | sanitized integration status, config keys and env var names | none |
| `integrations:write` | test configured integration connections and publish generic integration messages | external provider calls/messages and local integration status writes (dry-run/confirm default) |
| `yalc:read` | YALC overview / campaigns / gates / leads / lead messages (read) | none |
| `yalc:write` | YALC/Partnerships stage changes, discovery searches, template assignment, gate approval and model config writes | writes to YALC/Partnerships (dry-run/confirmation where supported) |
| `open-design:read` | OD health, catalog, project resolution, files and artifacts | none |
| `open-design:write` | import/register brand folders as OD projects, update curated project metadata and export artifacts | OD daemon project/mapping/export writes (dry-run/confirm default) |
| `docs:read` | list/read Brand Brain/Foundation docs by `brandSlug` + path | none |
| `docs:write` | replace/create allowed `.md`/`.html` Brand Brain/Foundation docs by `brandSlug` + path | writes brand documents (dry-run/confirm default, optional sha256 guard) |
| `intelligence:read` | list/read Meeting Intelligence meetings, insights, decisions, impacted documents and proposals | none |
| `intelligence:write` | update Meeting Intelligence config, run sync and approve/reject/convert recommendations | Neon writes, source fetch/provider calls and cron writes (dry-run/confirm default) |
| `recurring:read` | list local recurring tasks and OpenClaw cron jobs for a client | none |
| `recurring:write` | pause/activate local recurring tasks and OpenClaw cron jobs | local recurring-task writes or `openclaw cron enable/disable` (dry-run/confirm default) |
| `seo:read` | Keyword Antenna opportunities and SEO candidate state | none |
| `seo:write` | run/promote Keyword Antenna opportunities into content ideas | local SEO/content writes (dry-run/confirm default) |
| `metrics:read` | metrics time-series, surfaces, trends and dashboard definitions | none |
| `metrics:write` | update metrics dashboard definitions, custom metrics, templates and reverts | metrics dashboard DB writes (dry-run/confirm default) |
| `chat:read` | list/read chat threads | none |
| `chat:write` | `sancho_send_message` | sends chat messages (dry-run default) |
| `sancho:chat` | legacy alias for both `chat:read` and `chat:write` | same as both scopes; avoid for new tokens |
| `tasks:write` | `sancho_create_task`, `sancho_update_task` | writes tasks (dry-run default) |

Notes:
- `yalc:write` is shipped for controlled Partnerships operations. Keep it off exploratory/read-only tokens; reserve it for operators who can mutate YALC state.
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
      "scopes": ["sancho:read", "clients:read", "clients:write", "agents:read", "agents:write", "tasks:read", "tasks:write", "content:read", "content:write", "media:read", "media:write", "publishing:read", "publishing:write", "integrations:read", "integrations:write", "yalc:read", "yalc:write", "open-design:read", "open-design:write", "chat:read", "chat:write", "docs:read", "docs:write", "intelligence:read", "intelligence:write", "recurring:read", "recurring:write", "seo:read", "seo:write", "metrics:read", "metrics:write"],
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
| Stop client reads | Remove `clients:read`; for legacy client context/listing also remove `sancho:read`, deploy. |
| Stop client metadata writes | Remove `clients:write`, deploy. |
| Stop agent reads | Remove `agents:read`, deploy. |
| Stop agent model writes | Remove `agents:write`, deploy. |
| Stop task writes, keep reads | Re-issue `SANCHO_MCP_TOKENS` without `tasks:write`, deploy. |
| Stop chat sends | Remove `chat:write`, deploy. If the token still has legacy `sancho:chat`, remove it too. |
| Stop chat reads | Remove `chat:read`, deploy. If the token still has legacy `sancho:chat`, remove it too. |
| Stop Meeting Intelligence reads | Remove `intelligence:read`, deploy. |
| Stop Meeting Intelligence side effects | Remove `intelligence:write`, deploy. |
| Stop recurring-task reads | Remove `recurring:read`, deploy. |
| Stop recurring-task side effects | Remove `recurring:write`, deploy. |
| Stop Content Engine reads | Remove `content:read`, deploy. |
| Stop Content Engine writes | Remove `content:write`, deploy. |
| Stop media reads | Remove `media:read`, deploy. |
| Stop media side effects | Remove `media:write`, deploy. |
| Stop publishing reads | Remove `publishing:read`, deploy. |
| Stop publishing side effects | Remove `publishing:write`, deploy. |
| Stop integration-status reads | Remove `integrations:read`, deploy. |
| Stop integration side effects | Remove `integrations:write`, deploy. |
| Stop Open Design side effects | Remove `open-design:write`, deploy. |
| Stop document reads | Remove `docs:read`, deploy. |
| Stop document writes | Remove `docs:write`, deploy. |
| Disable the MCP **entirely** | Remove `SANCHO_MCP_TOKENS` (and `SANCHO_MCP_TOKEN`) → endpoint returns `503` for everyone. |
| Cut off **one** user/token | Remove that entry's hash, deploy → that token gets `403`. |
| Lock to specific clients | Set `clients` to an explicit slug list (remove `["*"]`), deploy. |
| Lock document access to specific brands | Set `brands` to an explicit slug list (remove `["*"]`), deploy. |

Side-effecting MCP tools default to **dry-run** where supported and only execute with `dryRun=false` + `confirm=true`, so accidental fire requires an explicit override.

---

## 3. Dependency-down playbook

The MCP server stays up even when a backend is down; affected tools return structured errors instead of crashing.

| Backend down | Symptom | What still works | Operator check |
|--------------|---------|------------------|----------------|
| **YALC daemon** | `yalc_get_overview` returns per-check `ok:false`; `yalc_list_campaigns`/`yalc_list_gates` return a YALC error | everything non-YALC | Confirm `YALC_BASE_URL`/`YALC_API_TOKEN` on the VPS `.env`; check the YALC container (`ENABLE_YALC_SERVICE`). Default base is `http://localhost:3847`. |
| **Open Design daemon** | `open_design_health` reports unhealthy; `open_design_list_catalog` errors or falls back to filesystem listing | everything non-OD | Check `OD_DAEMON_URL` reachability. OD may be local-only and not reachable from the staging host. |
| **Mission Control gateway / OpenClaw** | `sancho_send_message` (live send) throws "gateway rejected"; chat reads still work from disk state | reads, tasks, YALC/OD reads | Check `MC_CHAT_GATEWAY` + `MC_CHAT_SECRET`; verify the gateway/OpenClaw process. |
| **DB (tasks/audit)** | task reads/writes error; if `SANCHO_MCP_AUDIT_BACKEND=db` + `FAIL_CLOSED=true`, tool calls fail closed | status, clients, chat reads | Check DB connectivity; audit can fall back to JSONL if not fail-closed. |
| **DB (Meeting Intelligence)** | `sancho_list_meetings`, `sancho_get_meeting` and `sancho_list_intelligence` return `storage.configured:false` with empty read payloads | everything non-DB-backed | Check `DATABASE_URL`; these tools intentionally do not read JSON fallback data as processed intelligence. |

Health probe: `curl -s https://staging.example.com/api/health` returns `{ok, commit, env}` — confirm `commit` matches the SHA you expect after a deploy.

---

## 4. Common Claude Code install mistakes

```bash
SANCHO_MCP_TOKEN="<token from 1Password>"
claude mcp add --scope local --transport http sancho-staging \
  https://staging.example.com/api/mcp/sancho \
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
- [ ] `sancho_get_client` for one client → returns sanitized config and no `mcToken`.
- [ ] `sancho_update_client` dry-run → previews safe metadata updates and requires explicit confirmation.
- [ ] `sancho_list_agents` + `sancho_get_agent` → returns agent profiles/model state.
- [ ] `sancho_set_agent_model` dry-run → previews model override and requires explicit confirmation.
- [ ] `sancho_list_documents` for one allowed brand → returns expected Brand Brain/Foundation docs.
- [ ] `sancho_get_document` for one allowed `.md` path → returns content, `canonicalPath`, `traceId`.
- [ ] `sancho_update_document` dry-run for one allowed `.md` path → previews sha256/size changes and requires explicit confirmation.
- [ ] `sancho_list_meetings` → returns meetings plus `totals`, `lastSync` and `lastRun` for a client with `intelligence:read`.
- [ ] `sancho_get_meeting` for one returned meeting id → returns artifact, insights, decisions, impacts and recommendations.
- [ ] `sancho_list_intelligence` with `kind`/`status` filters → returns filtered cross-meeting intelligence.
- [ ] `sancho_get_meeting_intelligence_config` → returns source/sync/routing config and cron status.
- [ ] `sancho_update_meeting_intelligence_config` dry-run → previews normalized config and requires explicit confirmation.
- [ ] `sancho_run_meeting_intelligence_sync` dry-run → previews trigger/limit without fetching sources.
- [ ] `sancho_apply_meeting_recommendation` dry-run → previews approve/reject/convert without changing status.
- [ ] `sancho_list_tasks` / `sancho_get_task` → OK.
- [ ] `sancho_create_task` **dry-run** (no `confirm`) → `dryRun:true, requiresConfirmation:true`, nothing written.
- [ ] `recurring_list_tasks` → returns local recurring tasks/OpenClaw crons with status, schedule and run metadata.
- [ ] `recurring_set_task_status` dry-run → previews pause/activate and requires explicit confirmation.
- [ ] `sancho_list_chat_threads` + `sancho_get_chat_thread` → reads; `:::ask` detection works.
- [ ] `content_get_state` → returns config, idea/task counts, recent activity and `traceId`.
- [ ] `content_get_calendar` → returns scheduled posts and Ready Queue without running provider reconciliation.
- [ ] `content_get_channel_loops` → returns cadence, antennas, ideation/creation/published/metrics stages.
- [ ] `content_list_signals` → returns research signals from `content/research-signals` with date/day filters.
- [ ] `content_get_pillars` + `content_get_pov_bank` → returns content pillars plus POV Bank storage diagnostic/state.
- [ ] `content_get_dispatch_config` + `content_list_carousel_templates` → returns Editorial Dispatch routing and visual templates.
- [ ] `content_list_crons` + `content_get_cron_publish_config` → returns Content Engine cron schedule/run metadata and publish target.
- [ ] `content_update_cron_publish_config` dry-run → previews publish target changes and requires explicit confirmation.
- [ ] `content_list_ideas` + `content_list_tasks` with status/channel filters → returns scoped Content Engine rows.
- [ ] `content_list_drafts` + `content_get_draft` for one idea/channel → returns draft metadata/body, truncation flag and `traceId`.
- [ ] `content_update_config` dry-run → returns `preview` and does not write; confirmed run updates config.
- [ ] `content_create_idea` dry-run → returns preview and does not write; confirmed run appends to `idea-queue.json`.
- [ ] `content_update_idea` dry-run → returns preview and does not write; confirmed run updates allowed metadata/triage status.
- [ ] `content_approve_idea` dry-run → returns planned project/task/draft paths and does not write; confirmed run sets `Approved`, provisions ContentTask/drafts and optionally triggers writer.
- [ ] `content_update_task` dry-run → previews safe field/status/channel phase changes; confirmed run updates ContentTask state.
- [ ] `content_transition_task` dry-run → previews `approve-draft`, `approve-media`, `discard` or `defer`; confirmed run performs the lifecycle action.
- [ ] `content_update_draft` dry-run → previews body/frontmatter changes; confirmed run updates the draft `.md`.
- [ ] `content_request_draft_iteration` dry-run → previews snapshot path, next iteration and chat thread ids.
- [ ] `content_retrigger_writer` dry-run → previews writer trigger payload without forwarding to the gateway.
- [ ] `content_get_reconcile_state` → returns last persisted reconciler state or `neverRan:true`.
- [ ] `content_reconcile` dry-run → previews that reconcile would run and requires explicit confirmation.
- [ ] `media_list_image_providers` → returns configured providers, image-generation config and R2 readiness.
- [ ] `media_list_draft_assets` → returns canonical `media[]`, media policy and ContentTask phase context.
- [ ] `media_attach_asset` dry-run → previews canonical MediaAsset append; confirmed run updates draft frontmatter.
- [ ] `media_set_primary_asset` dry-run → previews reorder; confirmed run moves URL to index `0`.
- [ ] `media_remove_asset` dry-run → previews removal; confirmed run removes only the reference, not the remote file.
- [ ] `media_generate_image` dry-run → previews provider/model/aspect ratio/storage; confirmed run only in an environment with provider + R2 configured.
- [ ] `publishing_list_providers` for one channel → returns configured/missing provider status.
- [ ] `publishing_get_post_metrics` for one known published URL → returns stored metrics or `found:false`.
- [ ] `publishing_get_status` without `refresh` → returns stored draft publishing metadata without provider calls.
- [ ] `publishing_publish_draft` dry-run → previews provider/channel/schedule and does not mutate draft frontmatter.
- [ ] `publishing_cancel_post` dry-run → previews scheduled post cancellation; confirmed run cancels provider when possible and marks local state canceled.
- [ ] `publishing_reconcile` dry-run → previews due scheduled drafts; confirmed run reconciles provider status and metrics.
- [ ] `integrations_list_catalog` → returns the available integration catalog or `found:false` without secrets.
- [ ] `integrations_get_status` → returns sanitized status; no secret/config values or encrypted Slack bot token.
- [ ] `integrations_test_connection` dry-run for one source → previews targets and requires explicit confirmation.
- [ ] `integrations_publish_message` dry-run → previews target transport/channel and requires explicit confirmation.
- [ ] `yalc_get_overview`, `open_design_health` → reachable or clean structured error.
- [ ] `yalc_list_campaigns` + `yalc_get_campaign` + `yalc_get_campaign_readiness` + `yalc_get_campaign_events` for one campaign → read-only responses with `traceId`.
- [ ] `yalc_list_leads` + `yalc_get_lead` for one campaign lead + `yalc_list_lead_messages` for that lead → read-only responses with `traceId`.
- [ ] `open_design_list_catalog` with `type:"projects"` → lists projects or returns clean OD daemon error.
- [ ] `open_design_resolve_project` for an existing brand folder → returns existing `projectId` or `found:false`; it must not import/create.
- [ ] `open_design_import_project` dry-run for one brand folder/scope → previews baseDir/mapping and requires explicit confirmation.
- [ ] `open_design_update_project` dry-run → previews project metadata patch and requires explicit confirmation.
- [ ] `open_design_export_artifact` dry-run → previews artifact export request and requires explicit confirmation.
- [ ] `open_design_list_project_files` / `open_design_get_project_file` for one project → reads project files with `traceId`.
- [ ] Negative: a tool requiring a scope the token lacks → `403`; a disallowed `clientSlug` or `brandSlug` → `403`; path traversal in `docPath` → error.

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
