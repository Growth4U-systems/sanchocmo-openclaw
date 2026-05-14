---
name: yalc-operator
description: "Operate YALC/GTM-OS from Sancho for outbound workflows: health checks, provider/MCP status, brain/setup, human gates, lead qualification, cold email campaign dry-runs, campaign status, and reporting. Use when the user asks Sancho to run YALC, qualify leads in YALC, prepare or launch outbound via Instantly through YALC, check YALC campaigns, sync YALC status, or troubleshoot YALC."
metadata:
  author: Growth4U
  version: '0.1'
  system: SanchoCMO
  phase: Execute (one-to-one)
  pillar: yalc-operator
  layer: Execute
  depends_on: outreach-sequence-builder, contact-enrichment
  chains_to: campaign-tracking, performance-analysis
context_required:
  - brand/{slug}/company-brief/current.md
  - brand/{slug}/go-to-market/ecps/current.md
  - brand/{slug}/go-to-market/positioning/*/current.md
  - brand/{slug}/brand-voice/current.md
  - brand/{slug}/integrations.json
context_writes:
  - brand/{slug}/yalc/runs/
  - brand/{slug}/operational/learnings.md
---

# Yalc Agent Operator

Operate YALC through Yalc Agent as Sancho's outbound execution engine.

YALC is the source of truth for the GTM operating workflow: lead import, qualification, campaign creation, Instantly send, campaign tracking, and learning from outcomes. Sancho remains the CMO/orchestrator: it decides what should happen, asks for approvals, and reports results back to the user.

## Hard Rules

1. Never send email, add leads to a live campaign, or launch a campaign without explicit user confirmation in the current thread.
2. Default every potentially side-effecting YALC call to `dryRun: true`.
3. Use the wrapper script instead of direct `curl` so auth, live catalog verification, and dry-run behavior stay consistent.
4. Do not ask users for YALC tokens in chat. If YALC is not configured, send them to Mission Control API setup.
5. Keep client isolation: pass `--slug {slug}` and only write outputs under `brand/{slug}/yalc/`.
6. Read `references/yalc-capability-map.md` before deciding which YALC skill to invoke.

## Configuration

YALC is expected to run locally or on a private URL:

```bash
YALC_BASE_URL=http://localhost:3847
YALC_API_TOKEN=<same value as GTM_OS_API_TOKEN in YALC, if enabled>
```

Per-client overrides are supported by the wrapper:

```bash
GROWTH4U_YALC_BASE_URL=http://localhost:3847
GROWTH4U_YALC_API_TOKEN=<token>
```

The wrapper also reads `brand/{slug}/.env` if present.

## Commands

Use these from `workspace-yalc/` or `workspace-sancho/`:

```bash
node skills/yalc-operator/scripts/yalc-client.mjs health --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs skills --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs catalog --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs providers --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs gates --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs campaigns --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs brain --slug growth4u
```

Run a YALC skill:

```bash
node skills/yalc-operator/scripts/yalc-client.mjs run-skill \
  --slug growth4u \
  --skill send-email-sequence \
  --input brand/growth4u/yalc/payloads/campaign-dry-run.json
```

Live execution requires an explicit confirmation flag:

```bash
node skills/yalc-operator/scripts/yalc-client.mjs run-skill \
  --slug growth4u \
  --skill send-email-sequence \
  --input brand/growth4u/yalc/payloads/campaign-live.json \
  --confirm-side-effect
```

Other YALC API surfaces covered by the wrapper:

- `skill-info`, `today`, `campaign`, `campaign-leads`, `campaign-lead`, `campaign-report`, `campaign-timeline`, `campaign-export`, `campaign-chat`
- `pause-campaign`, `resume-campaign`, `update-lead-status` with confirmation
- `brain-update` with confirmation
- `gates`, `approve-gate`, `reject-gate` with confirmation
- `providers`, `provider-knowledge`, `provider-test`
- `setup-preview`, `setup-update-preview`, `setup-regenerate`, `setup-commit` with confirmation
- `dashboard-list`, `dashboard`, `visualizations`, `visualization`
- `api` for intentionally confirmed `/api/*` gaps, except credential writes
- `cli` for allowlisted read-only CLI fallback commands only

## Routing

Use YALC for:

- YALC/GTM-OS health, provider and MCP-backed provider status
- YALC setup preview, brain reads, and confirmed brain/setup edits
- human gates that YALC exposes through `/api/gates/*`
- sourcing companies and people when the user wants YALC/GTM-OS execution
- waterfall enrichment and reproducible qualification
- lead qualification against Growth4U/YALC rules
- cold outbound dry-runs and campaign execution via Instantly
- LinkedIn/comment operations only when available in the live YALC skills list
- campaign status and performance reporting
- campaign dashboards and cross-campaign learnings
- YALC health checks and troubleshooting

Interface priority:

1. HTTP API through `yalc-client.mjs`.
2. Runtime skills exposed by `/api/skills/list` and `/api/skills/run/:name`.
3. YALC CLI fallback only for allowlisted read-only commands.
4. MCP is handled inside YALC as provider plumbing; Yalc Agent checks and operates MCP-backed providers through YALC provider endpoints, not by connecting Sancho directly to external MCP servers.

Use existing Sancho skills for:

- strategy and ICP decisions
- strategic copy direction and brand/ICP decisions before handoff to YALC
- QA and brand review
- client-facing summaries

## Workflow

1. Clarify the user's requested outcome: qualify leads, prepare campaign, launch, track, or report.
2. Run `health` before the first YALC operation in a thread.
3. Run `skills` and compare the requested action against `references/yalc-capability-map.md`.
4. Decompose multi-step requests into explicit YALC API/skill calls instead of calling generic autonomous orchestration.
5. If launching/sending, prepare a dry-run payload and run YALC with `dryRun: true`.
6. Present the YALC dry-run result, lead count, sequence count, and any warnings.
7. Ask for explicit confirmation: "Confirmas que lance esta campana en YALC/Instantly?"
8. Only after confirmation, rerun with `--confirm-side-effect`.
9. Save the returned JSON in `brand/{slug}/yalc/runs/YYYY-MM-DDTHH-mm-ss-*.json`.
10. Report back with the YALC campaign ID and next tracking command.

## Current Limitation

Do not use YALC's `outreach-campaign-builder` framework for email launch until it supports an email branch. The framework still ends in `linkedin-campaign-create` in the handoff branch. Use `send-email-sequence` or direct email flow instead.
