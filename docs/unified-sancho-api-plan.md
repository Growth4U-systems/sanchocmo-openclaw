# Unified Sancho API Plan

This plan is separate from the runtime-adapter bridge work. Runtime adapters let
Sancho choose an execution engine. The unified API is the external control plane:
one supported way for Claude Code, Codex CLI, automations, or another client to
operate Sancho without using the web UI.

## Goal

Expose Sancho as one coherent application API for agent clients:

```text
Claude Code / Codex CLI / automation
  -> Unified Sancho API
  -> clients, context, docs, tasks, content, outbound, publishing, metrics
  -> jobs / daemon / runtime when execution is long-running
```

The agent-facing entrypoint should be MCP-first because Claude Code already
speaks MCP over HTTP and Codex CLI has MCP management commands. The browser app
and daemon can continue using REST/internal APIs, but both surfaces should call
the same domain services and job contracts instead of duplicating behavior.

## Current State

Sancho already has the start of the unified control plane:

- `/api/mcp/sancho` exposes a stateless Streamable HTTP MCP endpoint.
- MCP auth supports bearer tokens, scopes, client allowlists, brand allowlists
  and trace ids.
- `docs/sancho-mcp.md` documents the MCP surface.
- `docs/sancho-mcp-runbook.md` documents token issuance, kill switches,
  dependency-down behavior and smoke tests.
- The current MCP server registers 109 tools across clients, agents, docs,
  meeting intelligence, tasks, chat, recurring tasks, content, media,
  publishing, integrations, YALC/Partnerships, Open Design, metrics and SEO.
- The app also has about 281 REST API route files under `src/pages/api`.

This is good coverage, but it is not yet a finished unified API. Many MCP tools
wrap existing route/domain behavior directly, long-running execution is still
mostly chat/thread oriented, runtime control is admin-UI oriented, and daemon/job
semantics are not yet a stable external contract.

## Non-Goals

- Do not make the Claude Code or Codex runtime bridges the unified API.
  They are execution-plane adapters.
- Do not expose every Next.js route directly as public API.
- Do not replace the web UI APIs in one rewrite.
- Do not make MCP the only internal protocol. MCP is the agent-facing protocol;
  REST/internal APIs can remain for web UI and daemon integration.

## Target Architecture

```text
Agent clients
  - Claude Code
  - Codex CLI
  - external automations

Public agent endpoint
  - /api/mcp/sancho
  - token scopes, client/brand allowlists, audit, trace ids

Unified capability layer
  - typed action contracts
  - shared validation
  - dry-run/confirm semantics
  - idempotency keys
  - audit metadata

Job and execution layer
  - create job
  - read job state
  - stream/poll job events
  - cancel job
  - route to daemon/runtime adapter

Domain services
  - content
  - outbound / YALC
  - tasks
  - docs
  - publishing
  - media
  - metrics
  - integrations
  - Open Design
  - Meeting Intelligence
```

## Key Design Decisions

### MCP vs REST

MCP should be the supported agent/client entrypoint. REST should remain as the
web app and service-to-service entrypoint. The underlying implementation should
converge around shared capability modules, not around duplicated handlers.

### Unified API vs runtime adapter

The unified API answers: "What can an external client ask Sancho to do?"

The runtime adapter answers: "Which engine executes a Sancho turn or job?"

They meet at job execution. For example, `sancho_start_job` creates a job through
the unified API, then the daemon/runtime adapter executes it.

### Synchronous tools vs jobs

Short reads and safe writes can stay as normal MCP tool calls. Long operations
need a job contract:

- content generation
- outbound campaign runs
- publishing reconciliation
- meeting intelligence syncs
- runtime turns
- media generation
- Open Design exports
- any daemon-backed workflow

## Proposed MCP Additions

The existing MCP surface is broad. The main missing piece is a small set of
generic job/runtime tools that all long-running workflows can share.

### Job Tools

- `sancho_list_jobs`
- `sancho_get_job`
- `sancho_start_job`
- `sancho_cancel_job`
- `sancho_get_job_events`

Initial job types:

- `chat.turn`
- `content.generate_draft`
- `content.reconcile`
- `outbound.discovery_search`
- `outbound.campaign_run`
- `publishing.reconcile`
- `media.generate_image`
- `meeting_intelligence.sync`
- `open_design.export`

### Runtime Tools

- `sancho_get_runtime_status`
- `sancho_list_runtime_options`
- `sancho_set_runtime_selection` (admin/write, dry-run + confirm)
- `sancho_get_runtime_capabilities`

These should wrap the existing runtime selection and health logic behind MCP
scopes instead of exposing admin UI routes directly.

### Token / Connection Tools

Admin-only tools can make Claude/Codex setup a first-class Sancho workflow:

- `sancho_list_api_tokens`
- `sancho_create_api_token`
- `sancho_revoke_api_token`
- `sancho_get_client_connection_profile`

The connection profile should return copy-paste install commands/config for:

- Claude Code MCP HTTP
- Codex CLI MCP
- future automation clients

## Capability Layer

Create a shared capability layer before adding many more MCP wrappers:

```text
src/lib/unified-api/
  capabilities.ts
  jobs.ts
  authz.ts
  dry-run.ts
  audit.ts
  schemas/
```

Each capability should declare:

- id
- description
- input schema
- output schema
- required scope
- client/brand access rules
- side-effect level
- dry-run support
- idempotency support
- job behavior (`sync`, `async`, `daemon`, `runtime`)

MCP tools and REST routes can both call the same capability implementation.

## Phase Plan

### Phase 0: Inventory and Contract Freeze

Deliverables:

- Confirm the current MCP tool list and route coverage.
- Map top user workflows to existing tools.
- Mark each workflow as covered, partially covered, or missing.
- Decide first public API version, for example `sancho.v1`.

Acceptance:

- A documented matrix exists for content, outbound, tasks, docs, metrics,
  publishing, integrations, runtime and daemon workflows.

### Phase 1: Job Contract MVP

Deliverables:

- Add a canonical job store/API abstraction.
- Normalize `agent-runs` into the job model or add an adapter around it.
- Add MCP tools for list/get/cancel/job events.
- Keep existing chat send flow working.

Acceptance:

- Claude Code can start a job, poll its state, inspect events and cancel it
  through one MCP endpoint.
- Existing chat runs still appear in the job ledger.

### Phase 2: Runtime and Daemon Control

Deliverables:

- Add MCP runtime status/options/capabilities tools.
- Add admin-scoped runtime selection with dry-run/confirm.
- Define daemon handoff shape: enqueue, event callback, final callback,
  cancellation.

Acceptance:

- An admin token can inspect runtime state from Claude Code.
- A runtime-backed job can be started and observed without using the UI.

### Phase 3: Workflow Coverage MVP

Deliverables:

- Convert the highest-value workflows to job-aware capability calls:
  content generation, outbound discovery/campaign, publishing reconcile,
  media generation and meeting sync.
- Keep existing domain-specific MCP tools as convenience wrappers where useful.

Acceptance:

- Claude Code can complete a practical workflow end-to-end:
  read client context, create/update content or outbound work, start the
  long-running job, observe progress, inspect result and publish/send only with
  explicit confirmation.

### Phase 4: Token and Connection UX

Deliverables:

- Admin UI/API for per-person/per-client token profiles.
- MCP/REST connection profile generation for Claude Code and Codex CLI.
- Rotation/revocation flows.

Acceptance:

- A user can get a scoped connection profile without manual env editing.
- Tokens are auditable by person/purpose, not just shared operator tokens.

### Phase 5: Hardening

Deliverables:

- Idempotency keys for mutating calls.
- Rate limits and abuse protection by token.
- Audit coverage for all public side-effecting calls.
- Structured errors with retryability hints.
- Stable API versioning and deprecation policy.

Acceptance:

- The API can be safely exposed beyond internal operators.
- A broken dependency returns structured errors without taking down the endpoint.

## Workflow Coverage Matrix

| Area | Current MCP Coverage | Gap |
| --- | --- | --- |
| Clients/context | Good | Connection profile and onboarding flows missing |
| Docs/Brand Brain | Good | Batch patch/diff workflow could improve |
| Tasks | Good | Job linkage and async task execution missing |
| Chat | Good basic send/read | Runs are chat-thread specific, not generic jobs |
| Content Engine | Broad | Some long operations should become jobs |
| Media | Broad | Generation should be job-aware |
| Publishing | Broad | Reconcile/publish events should be job-aware |
| Integrations | Broad | Provider operation events should be job-aware |
| Outbound/YALC | Broad reads/writes | Campaign execution should become job-aware |
| Open Design | Broad | Exports should be job-aware |
| Meeting Intelligence | Broad | Sync should be job-aware |
| Metrics | Good | Background ingest/schedules need job linkage |
| Runtime | UI/admin API exists | MCP runtime tools missing |
| Daemon | Not first-class | Enqueue/cancel/events contract missing |
| Tokens/connections | Admin REST exists | MCP/admin connection profile and per-user flow missing |

## Implementation Principles

- Prefer shared capability modules over copying route logic into MCP.
- Keep every mutating operation scoped, audited and dry-run capable where
  practical.
- Treat agent clients as first-class users: good names, compact responses,
  trace ids, structured errors and clear next actions.
- Make long operations job-first rather than hiding them behind synchronous
  tool calls.
- Keep runtime adapters interchangeable. The unified API should not care whether
  a job runs on OpenClaw, Hermes, Claude Code, Codex CLI or a future daemon.

## First Implementation PRs

1. `docs: add unified Sancho API plan`
   - This document.

2. `feat: add unified job contract`
   - Shared job types/store/helpers.
   - Adapter from current agent-runs.
   - MCP read tools for jobs/events.

3. `feat: expose runtime status through MCP`
   - `sancho_get_runtime_status`
   - `sancho_list_runtime_options`
   - `sancho_get_runtime_capabilities`

4. `feat: start runtime jobs through unified API`
   - `sancho_start_job`
   - `sancho_cancel_job`
   - Route to existing chat/runtime send path first.

5. `feat: add connection profiles`
   - Claude Code MCP config.
   - Codex CLI MCP config.
   - Token profile UX and revocation.

## Open Questions

- Should the canonical job store live in DB first, or start as a file-backed
  adapter over `agent-runs` and move later?
- Which workflows are part of the first external-operator MVP: content,
  outbound, or both?
- How much runtime selection should be allowed from agent clients versus admin
  UI only?
- Should MCP expose token creation, or should token issuance stay admin REST/UI
  only for the first version?
- What is the minimum daemon contract Alfonso's runtime plan needs:
  queue-only, queue plus streaming events, or full durable workflow engine?
