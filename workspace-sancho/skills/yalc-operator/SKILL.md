---
name: yalc-operator
description: "Operate YALC/GTM-OS from Sancho for outbound workflows: health checks, lead qualification, cold email campaign dry-runs, campaign status, and reporting. Use when the user asks Sancho to run YALC, qualify leads in YALC, prepare or launch outbound via Instantly through YALC, check YALC campaigns, sync YALC status, or troubleshoot YALC."
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

# YALC Operator

Operate YALC as Sancho's outbound execution engine.

YALC is the source of truth for the GTM operating workflow: lead import, qualification, campaign creation, Instantly send, campaign tracking, and learning from outcomes. Sancho remains the CMO/orchestrator: it decides what should happen, asks for approvals, and reports results back to the user.

## Hard Rules

1. Never send email, add leads to a live campaign, or launch a campaign without explicit user confirmation in the current thread.
2. Default every potentially side-effecting YALC call to `dryRun: true`.
3. Use the wrapper script instead of direct `curl` so auth, allowlisting, and dry-run behavior stay consistent.
4. Do not ask users for YALC tokens in chat. If YALC is not configured, send them to Mission Control API setup.
5. Keep client isolation: pass `--slug {slug}` and only write outputs under `brand/{slug}/yalc/`.

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

Use these from `workspace-sancho/`:

```bash
node skills/yalc-operator/scripts/yalc-client.mjs health --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs skills --slug growth4u
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

## Routing

Use YALC for:

- lead qualification against Growth4U/YALC rules
- cold outbound campaign execution via Instantly
- campaign status and performance reporting
- YALC health checks and troubleshooting

Use existing Sancho skills for:

- strategy and ICP decisions
- copywriting drafts before handoff to YALC
- QA and brand review
- client-facing summaries

## Workflow

1. Clarify the user's requested outcome: qualify leads, prepare campaign, launch, track, or report.
2. Run `health` before the first YALC operation in a thread.
3. If launching/sending, prepare a dry-run payload and run YALC with `dryRun: true`.
4. Present the YALC dry-run result, lead count, sequence count, and any warnings.
5. Ask for explicit confirmation: "Confirmas que lance esta campana en YALC/Instantly?"
6. Only after confirmation, rerun with `--confirm-side-effect`.
7. Save the returned JSON in `brand/{slug}/yalc/runs/YYYY-MM-DDTHH-mm-ss-*.json`.
8. Report back with the YALC campaign ID and next tracking command.

## Current Limitation

Do not use YALC's `outreach-campaign-builder` framework for email launch until it supports an email branch. The framework still ends in `linkedin-campaign-create` in the handoff branch. Use `send-email-sequence` or direct email flow instead.
