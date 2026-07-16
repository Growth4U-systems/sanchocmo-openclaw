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
SANCHO_MCP_SCOPES="sancho:read,clients:read,clients:write,agents:read,agents:write,tasks:read,tasks:write,content:read,content:write,media:read,media:write,publishing:read,publishing:write,integrations:read,integrations:write,yalc:read,yalc:write,open-design:read,open-design:write,chat:read,chat:write,docs:read,docs:write,intelligence:read,intelligence:write,recurring:read,recurring:write,seo:read,seo:write,metrics:read,metrics:write" \
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
    "scopes": ["sancho:read", "clients:read", "clients:write", "agents:read", "agents:write", "tasks:read", "tasks:write", "content:read", "content:write", "media:read", "media:write", "publishing:read", "publishing:write", "integrations:read", "integrations:write", "yalc:read", "yalc:write", "open-design:read", "open-design:write", "chat:read", "chat:write", "docs:read", "docs:write", "intelligence:read", "intelligence:write", "recurring:read", "recurring:write", "seo:read", "seo:write", "metrics:read", "metrics:write"],
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
- `chat:read`
- `chat:write`
- `sancho:chat` (legacy alias for both `chat:read` and `chat:write`; avoid for new tokens)
- `clients:read`
- `clients:write`
- `agents:read`
- `agents:write`
- `tasks:read`
- `tasks:write`
- `content:read`
- `content:write`
- `media:read`
- `media:write`
- `publishing:read`
- `publishing:write`
- `integrations:read`
- `integrations:write`
- `yalc:read`
- `yalc:write`
- `open-design:read`
- `open-design:write`
- `docs:read`
- `docs:write`
- `intelligence:read`
- `intelligence:write`
- `recurring:read`
- `recurring:write`
- `seo:read`
- `seo:write`
- `metrics:read`
- `metrics:write`

Client isolation is explicit. Every client-scoped tool requires `clientSlug`, and the token must include that slug in `clients` or `*`.

Client administration uses `clients:read`/`clients:write`. Legacy `sancho:read` still works for `sancho_list_clients` and `sancho_get_client_context`, but new client-admin tools require the explicit `clients:*` scopes. Agent administration uses `agents:read`/`agents:write`; writes are limited to safe operational model overrides and require dry-run confirmation.

Document access is brand-scoped. Document read tools require `docs:read`; document writes require `docs:write`. In both cases the token must include the `brandSlug` in `brands` or `*`. If `brands` is omitted, it defaults to the token's `clients` list for backwards compatibility. This allows cases like a Growth4U operator token with `clients: ["growth4u"]` and `brands: ["growth4u", "xhype"]`, where XHYPE is a brand folder under Sancho but not a first-class client.

Every tool response includes `traceId` in structured content for request correlation. JSON text responses also include the same `traceId`; audit events store it in metadata.

## Tools

Current scaffolded tools:

- `sancho_mcp_status`
- `sancho_list_clients`
- `sancho_get_client_context`
- `sancho_get_client`
- `sancho_update_client`
- `sancho_list_agents`
- `sancho_get_agent`
- `sancho_set_agent_model`
- `alarife_list_instances`
- `alarife_get_mcp_config`
- `alarife_validate_mcp_connection`
- `sancho_list_documents`
- `sancho_get_document`
- `sancho_update_document`
- `sancho_list_meetings`
- `sancho_get_meeting`
- `sancho_list_intelligence`
- `sancho_get_meeting_intelligence_config`
- `sancho_update_meeting_intelligence_config`
- `sancho_run_meeting_intelligence_sync`
- `sancho_apply_meeting_recommendation`
- `sancho_list_tasks`
- `sancho_get_task`
- `sancho_create_task`
- `sancho_update_task`
- `sancho_delegate`
- `recurring_list_tasks`
- `recurring_set_task_status`
- `sancho_send_message`
- `sancho_list_chat_threads`
- `sancho_get_chat_thread`
- `sancho_intake_create_link`
- `sancho_get_metrics_timeseries`
- `sancho_get_metrics_dashboard`
- `sancho_update_metrics_dashboard`
- `sancho_add_custom_metric`
- `sancho_revert_metrics_dashboard`
- `sancho_apply_metrics_template`
- `sancho_list_keyword_opportunities`
- `sancho_run_keyword_antenna`
- `content_get_state`
- `content_get_config`
- `content_get_calendar`
- `content_get_channel_loops`
- `content_get_dispatch_config`
- `content_get_cron_publish_config`
- `content_get_pillars`
- `content_get_pov_bank`
- `content_list_ideas`
- `content_list_tasks`
- `content_get_task`
- `content_list_drafts`
- `content_get_draft`
- `content_get_reconcile_state`
- `content_list_activity`
- `content_list_signals`
- `content_list_carousel_templates`
- `content_list_crons`
- `content_update_config`
- `content_update_cron_publish_config`
- `content_create_idea`
- `content_update_idea`
- `content_approve_idea`
- `content_update_task`
- `content_transition_task`
- `content_update_draft`
- `content_request_draft_iteration`
- `content_retrigger_writer`
- `content_reconcile`
- `media_list_image_providers`
- `media_list_draft_assets`
- `media_attach_asset`
- `media_remove_asset`
- `media_set_primary_asset`
- `media_generate_image`
- `publishing_list_providers`
- `publishing_get_account_info`
- `publishing_get_post_metrics`
- `publishing_publish_draft`
- `publishing_cancel_post`
- `publishing_get_status`
- `publishing_reconcile`
- `integrations_list_catalog`
- `integrations_get_status`
- `integrations_test_connection`
- `integrations_publish_message`
- `yalc_get_overview`
- `yalc_list_campaigns`
- `yalc_get_campaign`
- `yalc_get_campaign_events`
- `yalc_get_campaign_readiness`
- `yalc_list_gates`
- `yalc_breakeven`
- `yalc_list_leads`
- `yalc_set_lead_stage`
- `yalc_create_search`
- `yalc_assign_template`
- `yalc_approve_gate`
- `yalc_creator_report`
- `yalc_get_model_config`
- `yalc_update_model_config`
- `yalc_get_lead`
- `yalc_list_lead_messages`
- `open_design_health`
- `open_design_list_catalog`
- `open_design_resolve_project`
- `open_design_import_project`
- `open_design_update_project`
- `open_design_export_artifact`
- `open_design_list_project_files`
- `open_design_get_project_file`
- `open_design_list_artifacts`

Mutating tools are side-effecting and require their matching write scope (`clients:write`, `agents:write`, `tasks:write`, `chat:write`, `content:write`, `media:write`, `publishing:write`, `integrations:write`, `open-design:write`, `docs:write`, `intelligence:write`, `recurring:write` or `yalc:write`). They default to dry-run where supported and only write when `dryRun=false` and `confirm=true`.

Confirmed `yalc_create_search` writes also require a caller-generated stable
`commandId`. Reuse that same ID only when retrying the same confirmed search;
changing the plan or execution mode with an existing ID returns a conflict.

`sancho_update_task` only accepts a whitelist of fields (`name`, `status`, `description`, `brief`, `completion`, `owner`) and rejects updates that change nothing.

### Alarife web-build delegation

When an MCP consumer asks Sancho to create a landing page or web page, delegate the build to Alarife. Dulcinea may own landing copy, but Alarife owns draft creation, preview, Lighthouse/PageSpeed QA, Sanson QA handoff and publish-with-approval.

```json
{
  "clientSlug": "client-slug",
  "agent": "alarife",
  "taskType": "web-build",
  "intent": "create-landing-page",
  "skills": [
    "alarife-integration",
    "payload",
    "site-architecture",
    "frontend-design",
    "page-cro",
    "form-cro",
    "lighthouse-landing-qa"
  ],
  "acceptance": {
    "lighthouse": {
      "strategy": "mobile",
      "averageScoreMin": 95,
      "categoryFloor": 90,
      "waivers": "Only user-approved non-scoring audits may be waived"
    },
    "publish": "Requires explicit human approval after preview, Lighthouse QA and Sanson QA"
  }
}
```

### Recurring tasks flow

Use `recurring_list_tasks` to inspect local recurring tasks and OpenClaw cron jobs for one client:

```json
{ "clientSlug": "growth4u", "status": "active", "limit": 50 }
```

It returns a normalized list with `source` (`openclaw-cron` or `local`), `status`, schedule, prompt preview, last/next run metadata, errors and running state. It requires `recurring:read`.

Use `recurring_set_task_status` to pause or activate one recurring task/cron by id:

```json
{ "clientSlug": "growth4u", "taskId": "cron_...", "desiredStatus": "paused" }
```

It defaults to dry-run and only executes with `dryRun:false` plus `confirm:true`. Confirmed local tasks update `brand/<slug>/idea-generation/recurring-tasks.json`; confirmed OpenClaw cron changes call `openclaw cron enable|disable` with the task id. Creating/deleting recurring tasks and editing cron prompts remain outside this slice until they have a narrower contract.

### Chat read flow

Use `sancho_list_chat_threads` to find Mission Control chat threads for the allowed client, then `sancho_get_chat_thread` to read recent messages.

`sancho_get_chat_thread` also extracts pending `:::ask` blocks emitted by Sancho agents and returns:

- `pendingQuestions`: parsed multiple-choice questions with `id`, `prompt`, `mode` and `options`.
- `responseFormat`: the exact text shape Claude Code can send back through `sancho_send_message`, for example:

```text
[ask:q_foundation_scope] respuesta: Foundation completo
```

Both chat read tools require `chat:read` because chat history may contain sensitive client context. Existing tokens with the legacy `sancho:chat` scope still work for read and write, but new tokens should use `chat:read` and `chat:write` separately.

Open Design exposes curated typed tools only; do not expose the generic Open Design proxy through MCP. Project import/registration, project metadata updates and artifact export are available through `open-design:write`, dry-run/confirmation and audit logging. Agentic OD generation/chat remains outside this slice until there is a bounded async job contract.

### Content Engine read flow

Use `content_get_state` for a compact operational snapshot: Content Engine config, idea counts, ContentTask counts and recent activity.

```json
{ "clientSlug": "growth4u", "activityLimit": 25 }
```

Use the list/detail tools for inspection:

```json
{ "clientSlug": "growth4u", "status": "New", "channel": "linkedin", "limit": 50 }
```

```json
{ "clientSlug": "growth4u", "contentTaskId": "idea-2026-06-16-1" }
```

```json
{ "clientSlug": "growth4u", "ideaId": "idea-2026-06-16-1", "channel": "linkedin", "maxChars": 60000 }
```

Use `content_get_calendar` for the posting calendar read model: scheduled posts plus the Ready Queue. Unlike the UI route, the MCP read does not run provider reconciliation as a side effect.

```json
{ "clientSlug": "growth4u", "from": "2026-06-20", "to": "2026-06-30", "maxBodyChars": 4000 }
```

Use `content_get_channel_loops` for the derived per-channel loop state used by the Canales view: cadence, antennas, ideation, creation, published, metrics and next action.

```json
{ "clientSlug": "growth4u" }
```

Use `content_list_signals` for research signals written under `brand/{slug}/content/research-signals`:

```json
{ "clientSlug": "growth4u", "date": "2026-06-20" }
```

Use `content_get_pillars` for `content/content-pillars.md`, `content_get_pov_bank` for the Neon-backed POV Bank diagnostic/state, `content_get_dispatch_config` for Editorial Dispatch routing, and `content_list_carousel_templates` for visual-identity carousel templates.

```json
{ "clientSlug": "growth4u", "channel": "linkedin", "includeDisabled": true }
```

Use `content_list_crons` to inspect Content Engine OpenClaw crons without exposing a generic cron runner:

```json
{ "clientSlug": "growth4u", "status": "active", "query": "Editorial Dispatch", "limit": 50 }
```

Use `content_get_cron_publish_config` to read the configured publish destination for a cron key. Use `content_update_cron_publish_config` to change it; updates require `content:write`, default to dry-run and only write with `dryRun:false` plus `confirm:true`.

```json
{ "clientSlug": "growth4u", "cronKey": "editorial_dispatch" }
```

```json
{ "clientSlug": "growth4u", "cronKey": "editorial_dispatch", "transport": "slack", "channelId": "C123", "channelName": "content" }
```

Content Engine read tools require `content:read`.

Controlled Content Engine writes currently require `content:write`:

```json
{ "clientSlug": "growth4u", "imageGeneration": { "mode": "fixed", "provider": "replicate", "model": "..." } }
```

```json
{ "clientSlug": "growth4u", "title": "Idea title", "targetChannel": "linkedin" }
```

```json
{ "clientSlug": "growth4u", "ideaId": "idea-...", "status": "Deferred", "targetDate": "2026-06-20" }
```

```json
{ "clientSlug": "growth4u", "ideaId": "idea-...", "triggerWriter": true }
```

`content_update_config`, `content_create_idea`, `content_update_idea` and `content_approve_idea` default to dry-run and only write with `dryRun:false` and `confirm:true`. `content_update_idea` intentionally excludes `Approved`; approval is handled by `content_approve_idea` because it changes the idea status, provisions the weekly project/task, creates the ContentTask and draft/support docs, and can best-effort trigger the writer through the ContentTask chat thread.

ContentTask and draft lifecycle writes also require `content:write`:

```json
{ "clientSlug": "growth4u", "contentTaskId": "P-Content-Semana-25-T02-C01", "channelPhases": { "linkedin": "draft" } }
```

```json
{ "clientSlug": "growth4u", "contentTaskId": "P-Content-Semana-25-T02-C01", "action": "approve-draft" }
```

```json
{ "clientSlug": "growth4u", "ideaId": "idea-...", "channel": "linkedin", "body": "..." }
```

`content_update_task`, `content_transition_task` and `content_update_draft` default to dry-run and only write with `dryRun:false` and `confirm:true`. `content_transition_task` supports content lifecycle actions (`approve-draft`, `approve-media`, `discard`, `defer`); provider-side publishing is handled by the dedicated `publishing:*` tools below.

Writer control and reconciliation tools also require `content:write`:

```json
{ "clientSlug": "growth4u", "ideaId": "idea-...", "channel": "linkedin", "instruction": "Make the proof point sharper" }
```

```json
{ "clientSlug": "growth4u", "contentTaskId": "P-Content-Semana-25-T02-C01", "channel": "linkedin", "instruction": "Retry with the latest clarify answer" }
```

```json
{ "clientSlug": "growth4u" }
```

`content_request_draft_iteration` snapshots the current draft, stores the iteration request in frontmatter, moves the channel phase back to `drafting`, and posts a chat marker. `content_retrigger_writer` best-effort forwards the writer request to the chat gateway; it defaults to dry-run to avoid accidental agent runs. `content_get_reconcile_state` is read-only and returns the last persisted reconciler run; `content_reconcile` requires `content:write`, defaults to dry-run and only runs with `dryRun:false` plus `confirm:true`.

### Media flow

Use `media_list_image_providers` to inspect configured image-generation providers, brand image-generation defaults and R2 storage readiness:

```json
{ "clientSlug": "growth4u" }
```

Use `media_list_draft_assets` to inspect the canonical `media[]` array for a draft:

```json
{ "clientSlug": "growth4u", "ideaId": "idea-...", "channel": "linkedin" }
```

Use `media_attach_asset` to attach an existing public asset URL using the canonical `MediaAsset` schema. This is for URLs already uploaded to R2 or another public store; it is not a binary upload endpoint.

```json
{ "clientSlug": "growth4u", "ideaId": "idea-...", "channel": "linkedin", "url": "https://cdn.example.com/card.png", "type": "image/png" }
```

Use `media_set_primary_asset` to move one attached URL to index `0`, and `media_remove_asset` to remove one media reference without deleting the remote file. Both default to dry-run and require `dryRun:false` plus `confirm:true`.

Use `media_generate_image` to generate an image through the configured provider, upload it to R2 and attach it to the draft. It defaults to dry-run and only spends provider credits with `dryRun:false` plus `confirm:true`:

```json
{ "clientSlug": "growth4u", "ideaId": "idea-...", "channel": "linkedin", "prompt": "Product launch visual, clean B2B style", "aspectRatio": "1:1" }
```

Media reads require `media:read`; media mutations/generation require `media:write`. Direct binary upload and carousel rendering are intentionally outside this slice; keep using the existing HTTP UI/API paths until MCP gets a signed-upload or file-resource contract.

### Publishing and integrations flow

Use `publishing_list_providers` to inspect which publishing providers are known and configured for a client/channel:

```json
{ "clientSlug": "growth4u", "channel": "linkedin" }
```

Use `publishing_get_post_metrics` to read the latest stored metrics snapshot for a published URL:

```json
{ "clientSlug": "growth4u", "externalUrl": "https://example.com/post" }
```

Use `publishing_get_account_info` for connected Metricool account/network info when configured. It returns `ok:false` with an error instead of throwing when credentials are missing or the provider rejects the request.

Use `publishing_get_status` for stored draft publishing metadata. By default this is read-only and requires `publishing:read`:

```json
{ "clientSlug": "growth4u", "ideaId": "idea-...", "channel": "linkedin" }
```

Set `refresh:true` to poll the provider and persist any state change; that path requires `publishing:write`.

Use `publishing_publish_draft` to publish now or schedule one approved draft. It defaults to dry-run and only sends to the provider with `dryRun:false` and `confirm:true`:

```json
{ "clientSlug": "growth4u", "ideaId": "idea-...", "channel": "linkedin", "providerId": "metricool", "publishAt": "2026-06-17T10:00:00.000Z" }
```

Use `publishing_cancel_post` to cancel one scheduled draft and mark local state as canceled. It defaults to dry-run and requires `dryRun:false` plus `confirm:true`.

Use `publishing_reconcile` to sweep due scheduled posts for one client and refresh local state/metrics. It defaults to dry-run and requires `dryRun:false` plus `confirm:true`.

Use `integrations_list_catalog` to inspect the available integration catalog and `integrations_get_status` for sanitized per-client status. Status intentionally returns config keys/env var names and connection errors, but not secret values, config values or encrypted Slack bot tokens.

Use `integrations_test_connection` to run the existing Sancho integration test script for one source or all configured sources. Use `integrations_publish_message` to publish one generic message through a configured transport or cron publish target. Both default to dry-run and only execute with `dryRun:false` plus `confirm:true`.

Publishing reads require `publishing:read`. Publishing side effects require `publishing:write` and explicit confirmation. Integration reads require `integrations:read`; integration test/publish side effects require `integrations:write`. Secret entry, OAuth connection/disconnection and raw dispatch-channel setup remain outside MCP; use the UI/API path until there is a dedicated credential contract.

### YALC campaign read flow

Use `yalc_list_campaigns` to discover campaigns, then `yalc_get_campaign` for detail. Before any publish/live operation, use `yalc_get_campaign_readiness`; for timeline/debugging use `yalc_get_campaign_events`.

```json
{ "clientSlug": "growth4u", "campaignId": "campaign_123" }
```

All three campaign-detail tools require `yalc:read` and are read-only.

### YALC lead read flow

Use `yalc_list_leads` to discover leads. For campaign-specific lead detail, use:

```json
{ "clientSlug": "growth4u", "campaignId": "campaign_123", "leadId": "lead_456" }
```

Use `yalc_list_lead_messages` to read the Inbox conversation for a lead:

```json
{ "clientSlug": "growth4u", "leadId": "lead_456" }
```

Both tools require `yalc:read` and are read-only. Lead stage changes remain behind `yalc:write` via `yalc_set_lead_stage`.

### Open Design read flow

Use `open_design_list_catalog` for global OD catalog resources:

```json
{ "clientSlug": "growth4u", "type": "projects" }
```

Use `open_design_resolve_project` to find an existing OD project for a client brand folder and optional brand-relative scope. This MCP tool is read-only: it does not import folders, create projects or write the OD mapping file.

```json
{ "clientSlug": "growth4u", "scope": "content/assets" }
```

Once you have a project id:

```json
{ "clientSlug": "growth4u", "projectId": "od_project_123", "limit": 100 }
```

```json
{ "clientSlug": "growth4u", "projectId": "od_project_123", "filePath": "index.html", "maxChars": 60000 }
```

```json
{ "clientSlug": "growth4u", "projectId": "od_project_123" }
```

The project file tool only accepts project-relative paths and rejects traversal. It reads UTF-8 text through the OD daemon and truncates large files.

Use `open_design_import_project` when the project does not exist yet. It validates that the scope stays under `brand/<clientSlug>/`, imports/registers the folder in OD, persists the local project mapping and best-effort sets `designSystemId` to the client slug. It defaults to dry-run and only writes with `dryRun:false` plus `confirm:true`.

Use `open_design_update_project` for curated project metadata changes (`name`, `skillId`, `designSystemId`) and `open_design_export_artifact` to export one artifact in `html`, `pdf`, `pptx`, `zip`, `mp4` or `md` format. Both default to dry-run and require `dryRun:false` plus `confirm:true`.

Open Design reads require `open-design:read`; project import/update/export requires `open-design:write`. OD chat/generation remains via the OD UI/API path for now.

### Intelligence read flow

Use `sancho_list_meetings` to discover Meeting Intelligence meetings for an allowed client, then `sancho_get_meeting` to read the full detail for one meeting.

Examples:

```json
{ "clientSlug": "growth4u", "limit": 25 }
```

```json
{ "clientSlug": "growth4u", "meetingId": "mim_..." }
```

Use `sancho_list_intelligence` for cross-meeting intelligence. It returns `intelligence`, `decisions`, `documents`, `proposals`, `totals`, `lastSync` and `lastRun`, with optional filters:

```json
{ "clientSlug": "growth4u", "kind": "Decision", "status": "accepted" }
```

Use `sancho_get_meeting_intelligence_config` to read source/sync/routing config and cron status.

```json
{ "clientSlug": "growth4u" }
```

Meeting Intelligence read tools require `intelligence:read` and the same `clients` allowlist as other client-scoped tools. If `DATABASE_URL` is not configured, they return the existing storage diagnostic with empty lists instead of reading JSON fallback data.

Controlled Meeting Intelligence writes require `intelligence:write`:

```json
{ "clientSlug": "growth4u", "config": { "enabled": true, "sync": { "enabled": true, "time": "18:00", "limit": 30 } } }
```

```json
{ "clientSlug": "growth4u", "trigger": "mcp", "limit": 30 }
```

```json
{ "clientSlug": "growth4u", "recommendationId": "mirc_...", "action": "approve" }
```

`sancho_update_meeting_intelligence_config`, `sancho_run_meeting_intelligence_sync` and `sancho_apply_meeting_recommendation` default to dry-run and only write/run with `dryRun:false` plus `confirm:true`. Recommendation actions only change recommendation/task status (`approve`, `reject`, `convert`); they do not edit Brand Brain/Foundation documents directly.

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

Use `sancho_update_document` to replace one `.md` or `.html` document. It rejects path traversal, cross-brand paths, unsupported extensions and hidden/system/chat folders. It defaults to dry-run and only writes with `dryRun:false` plus `confirm:true`. For concurrency safety, pass `expectedSha256` from a previous read/preview; the write fails if the document changed in between.

```json
{
  "brandSlug": "xhype",
  "docPath": "market-and-us/market/current.md",
  "content": "# Updated Market\n\n...",
  "expectedSha256": "previous-current-sha256",
  "dryRun": false,
  "confirm": true
}
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

The recommended staging operator token is a single shared token enabled for all clients (`clients: ["*"]`) with:

```json
["sancho:read", "clients:read", "clients:write", "agents:read", "agents:write", "tasks:read", "tasks:write", "content:read", "content:write", "media:read", "media:write", "publishing:read", "publishing:write", "integrations:read", "integrations:write", "yalc:read", "yalc:write", "open-design:read", "open-design:write", "chat:read", "chat:write", "docs:read", "docs:write", "intelligence:read", "intelligence:write", "recurring:read", "recurring:write", "seo:read", "seo:write", "metrics:read", "metrics:write"]
```

This is a shared token: audit events attribute every call to the same principal, and it can read and write across any staging client. Existing staging tokens that still carry `sancho:chat` remain compatible, but should be rotated to separate `chat:read` / `chat:write`. For production, issue per-person/per-client tokens scoped to the narrowest set needed.

Install the single staging MCP in Claude Code with:

```bash
SANCHO_MCP_TOKEN="$(cat .context/sancho-mcp-staging-operator-token.txt)"

claude mcp add --transport http sancho-staging https://staging.example.com/api/mcp/sancho \
  --header "Authorization: Bearer $SANCHO_MCP_TOKEN"
```

This is still one MCP server and one endpoint; the token scopes define what Claude Code may do.

## Tracing

Every MCP HTTP request gets an `X-Request-Id` response header. If the caller sends `X-Request-Id` or `X-Correlation-Id`, Sancho reuses it; otherwise it generates a UUID.

MCP tools propagate that trace id to downstream Sancho chat, YALC and Open Design calls as:

- `X-Request-Id`
- `X-Sancho-MCP-Trace-Id`

Audit events store the trace id in `metadata.traceId`.
