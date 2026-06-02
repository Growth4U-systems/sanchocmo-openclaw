# Yalc Agent Capability Map

This map is derived from the Growth4U YALC fork and the Yalc handoff doc. It prevents Yalc Agent from collapsing YALC into a single "send email" tool.

## Architecture Rule

Yalc Agent is the orchestrator-facing agent. `yalc-operator` is its adapter. The adapter does not reimplement YALC skills; it invokes YALC's API and registered runtime skills through `/api/skills/run/:name`.

Before running a skill, use:

```bash
node skills/yalc-operator/scripts/yalc-client.mjs skills --slug growth4u
```

If a skill is not listed by YALC at runtime, do not claim it is executable through the skill-run HTTP API. Use another explicit API endpoint or an allowlisted CLI fallback.

## API Surface Covered By Sancho

| Surface | Wrapper Commands |
|---|---|
| Health and daily feed | `health`, `today` |
| Skill catalog and execution | `skills`, `skill-info`, `run-skill` |
| Brain and setup | `brain`, `brain-update`, `setup-preview`, `setup-update-preview`, `setup-regenerate`, `setup-commit` |
| Human gates | `gates`, `approve-gate`, `reject-gate` |
| Campaigns | `campaigns`, `create-campaign-draft`, `add-campaign-step`, `campaign`, `campaign-leads`, `campaign-lead`, `campaign-report`, `campaign-timeline`, `campaign-export`, `campaign-chat`, `pause-campaign`, `resume-campaign`, `update-lead-status` |
| Providers / MCP-backed providers | `providers`, `provider-knowledge`, `provider-test` |
| Dashboards and visualization | `dashboard-list`, `dashboard`, `visualizations`, `visualization` |
| Escape hatches | `api` for confirmed `/api/*` gaps; `cli` for allowlisted read-only commands |

Do not use `api` to write credentials. YALC keys must be configured through Mission Control.

## API-Invocable Runtime Skills

These are built-in or markdown skills registered by the current YALC runtime and are safe to expose through Sancho after live catalog verification with side-effect controls:

| Skill | Use For | Side Effect Notes |
|---|---|---|
| `find-companies` | ICP/company sourcing | Read/provider usage |
| `find-people` | Decision maker discovery | Read/provider usage |
| `enrich-leads` | Waterfall enrichment | Provider usage, may spend credits |
| `qualify-leads` | Reproducible lead qualification | Read/scoring |
| `export-data` | Export YALC result sets | Reads DB, returns content |
| `visualize-campaigns` | Campaign dashboards/views | Read/reporting |
| `scrape-linkedin` | LinkedIn post/profile scraping | Read/provider usage |
| `answer-comments` | LinkedIn comment replies | Side-effecting; dry-run required first |
| `email-sequence` | Draft email sequence copy | Draft generation |
| `monthly-campaign-report` | Campaign reporting | Read/reporting |
| `send-email-sequence` | Instantly email campaign creation/leads | Side-effecting; dry-run required first |
| `multi-channel-campaign` | LinkedIn + email sequence execution | Side-effecting; dry-run required first |
| `personalize` | Per-lead message personalization | Draft generation |
| `competitive-intel` | Competitor research/profile | Research/provider usage |
| `research` | Open research with citations | Research/provider usage |
| `md:*` skills listed by `/api/skills/list` | Declarative YALC skills such as `icp-company-search`, `people-enrich`, `email-campaign-create`, `score-lead`, `verify-campaign-launch` | Depends on capability; sending/launching skills require dry-run first |

## Known YALC Skills Not Guaranteed Through `/api/skills/run`

These exist in the YALC source tree, docs, or Claude Code skill layer, but are not guaranteed as registered HTTP skills in the current Growth4U fork. Use them only after `skills --slug` confirms they are registered, via another explicit API endpoint, or via the wrapper's allowlisted CLI fallback.

| Capability | Examples |
|---|---|
| LinkedIn URL/profile utilities | `find-linkedin`, `reply-to-comments`, `track-campaign` |
| Markdown capability skills | `icp-company-search`, `people-enrich`, `email-campaign-create`, `linkedin-campaign-create`, `score-lead`, `qualify-engagers`, `verify-campaign-launch`, `fetch-inbox-replies`, `classify-replies`, `classify-mentions`, `monitor-competitor-content`, `research-company`, `propose-campaigns` |
| Claude Code operational skills | `import-leads`, `launch-linkedin-campaign`, `track-campaigns`, `scrape-post-engagers`, `send-cold-email`, `prospect-discovery-pipeline`, `find-lookalikes`, `run-competitive-intel`, `campaign-dashboard`, `yalc-orientation` |

## Routing By User Intent

| User Intent | Yalc Agent Action |
|---|---|
| "Check if YALC is alive" | `health` |
| "What can YALC do?" | `skills`, then summarize using this map |
| "Check providers / MCP" | `providers`, `provider-knowledge`, and `provider-test --provider <id>` |
| "Approve a YALC gate" | `gates`, summarize payload, wait for explicit confirmation, then `approve-gate --confirm-side-effect` |
| "Qualify these leads" | `run-skill --skill qualify-leads` |
| "Find companies / people" | `find-companies` then `find-people`; enrich only if needed |
| "Prepare cold email" | Sancho/Rocinante drafts strategy/copy, then Yalc Agent persists a reviewable YALC draft with `create-campaign-draft`; include the email sequence in `skillInput.sequence` |
| "Create campaign for review" | `create-campaign-draft`; return the YALC campaign ID and ask the user to review before any Instantly dry-run. If a draft already exists but lacks emails, use `add-campaign-step` with `send-email-sequence` instead of duplicating it |
| "Launch/send campaign" | Start from an existing YALC campaign ID. If none exists, create a YALC draft first. Then dry-run with `send-email-sequence` or `multi-channel-campaign`, show warnings, wait for explicit confirmation, then rerun with `--confirm-side-effect` |
| "Track/report campaign" | `campaigns`, `monthly-campaign-report`, or `visualize-campaigns` |
| "Inspect one campaign" | `campaign`, `campaign-leads`, `campaign-timeline`, `campaign-report` |
| "Use full autonomous YALC orchestration" | Do not use `orchestrate` via HTTP until API-level approval gates are supported; decompose into explicit allowlisted skills instead |

## Growth4U Migration Notes From Handoff

The handoff recommends treating YALC as the execution/learning layer, not replacing Sancho:

- Sancho remains the conversational CMO and owns strategy, brand, ICP decisions, and client-facing synthesis.
- YALC adds robust outbound plumbing: qualification gates, waterfall enrichment, Instantly/LinkedIn execution, A/B testing, intelligence store, and campaign dashboarding.
- Recommended rollout: observer mode first, then one full YALC pilot campaign, then migrate new outbound creation if the pilot proves value.
- For Growth4U specifically: preserve the real ICP scoring already defined for HOT/APPROVED/DISAPPROVED and avoid replacing it with generic YALC defaults.
