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
  - brand/{slug}/company-brief/company-brief.current.md
  - brand/{slug}/go-to-market/ecps/ecps.current.md
  - brand/{slug}/go-to-market/positioning/*/*.current.md
  - brand/{slug}/brand-voice/brand-voice.current.md
  - brand/{slug}/integrations.json
context_writes:
  - brand/{slug}/yalc/runs/
  - brand/{slug}/operational/learnings.md
  - brand/{slug}/projects/P*/tasks.json
  - brand/{slug}/chat/
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

Run these from the agent workspace (`skills/` resolves to the central skills catalog — this skill is owned by Rocinante):

```bash
node skills/yalc-operator/scripts/yalc-client.mjs health --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs skills --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs catalog --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs providers --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs gates --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs campaigns --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs brain --slug growth4u
```

Create the internal YALC campaign draft first:

```bash
node skills/yalc-operator/scripts/yalc-client.mjs create-campaign-draft \
  --slug growth4u \
  --input brand/growth4u/yalc/payloads/campaign-draft.json
```

If an existing draft is missing the reviewable email copy, add the email step to that draft instead of creating a duplicate campaign:

```bash
node skills/yalc-operator/scripts/yalc-client.mjs add-campaign-step \
  --slug growth4u \
  --id <yalc-campaign-id> \
  --input brand/growth4u/yalc/payloads/campaign-email-step.json
```

Search, enrich, review, and publish through the explicit campaign lifecycle:

```bash
node skills/yalc-operator/scripts/yalc-client.mjs campaign-leads-search \
  --slug growth4u \
  --id <yalc-campaign-id> \
  --input brand/growth4u/yalc/payloads/lead-search.json \
  --confirm-side-effect

node skills/yalc-operator/scripts/yalc-client.mjs campaign-leads-enrich \
  --slug growth4u \
  --id <yalc-campaign-id> \
  --input brand/growth4u/yalc/payloads/lead-enrich.json \
  --confirm-side-effect

node skills/yalc-operator/scripts/yalc-client.mjs campaign-sequence-approve \
  --slug growth4u \
  --id <yalc-campaign-id> \
  --json '{"actorLabel":"Sancho"}' \
  --confirm-side-effect

node skills/yalc-operator/scripts/yalc-client.mjs campaign-dry-run \
  --slug growth4u \
  --id <yalc-campaign-id> \
  --confirm-side-effect
```

Creating the Instantly campaign and launching it require separate explicit confirmations:

```bash
node skills/yalc-operator/scripts/yalc-client.mjs campaign-publish \
  --slug growth4u \
  --id <yalc-campaign-id> \
  --json '{"actorLabel":"Sancho"}' \
  --confirm-side-effect

node skills/yalc-operator/scripts/yalc-client.mjs campaign-live \
  --slug growth4u \
  --id <yalc-campaign-id> \
  --json '{"actorLabel":"Sancho"}' \
  --confirm-side-effect
```

Other YALC API surfaces covered by the wrapper:

- `skill-info`, `today`, `create-campaign-draft`, `add-campaign-step`, `campaign`, `campaign-leads-search`, `campaign-leads-enrich`, `campaign-leads`, `campaign-lead`, `campaign-sequence-update`, `campaign-sequence-approve`, `campaign-sequence-request-changes`, `campaign-dry-run`, `campaign-publish`, `campaign-live`, `campaign-report`, `campaign-timeline`, `campaign-export`, `campaign-chat`
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
5. For any outbound campaign, create the internal YALC draft first with `create-campaign-draft`. Include title, hypothesis, target segment, channels, success metrics, and planned steps. Email drafts must include reviewable email copy before approval: add a `send-email-sequence` step where `skillInput.sequence` is a non-empty array of `{ subject?, body, delay_days? }`. The email/Instantly step must stay `dryRun: true` inside `skillInput`.
6. Present the YALC draft campaign ID, what was saved for review, and where to inspect it in Sancho/YALC Cockpit before doing any Instantly call.
7. If the campaign exists but has no reviewable email sequence, use `add-campaign-step` to attach the `send-email-sequence` draft step to the existing YALC campaign. Do not create a duplicate campaign for the same request.
8. If the user requested lead sourcing, run `campaign-leads-search` with `--confirm-side-effect`. If Apollo credentials fail, report the provider error and continue only with user-provided leads or manual test leads.
9. Run `campaign-leads-enrich` with `--confirm-side-effect` when assigned leads need email enrichment. Do not claim the campaign is ready for dry-run until readiness says so.
10. After the user approves the email sequence, run `campaign-sequence-approve --confirm-side-effect`.
11. Ask for explicit confirmation before the Instantly dry-run: "Confirmas que pruebe esta campana en Instantly en dry-run?"
12. After confirmation, run `campaign-dry-run --confirm-side-effect`.
13. Present the dry-run result, lead count, sequence count, readiness, and any warnings.
14. Ask for explicit confirmation before creating the Instantly campaign: "Confirmas que cree la campana en Instantly sin lanzarla?"
15. After confirmation, run `campaign-publish --confirm-side-effect`. This creates/updates the campaign in Instantly but does not launch it.
16. Ask for explicit confirmation before live external execution: "Confirmas que lance la campana live en Instantly?"
17. Only after confirmation, run `campaign-live --confirm-side-effect`.
18. Save the returned JSON in `brand/{slug}/yalc/runs/YYYY-MM-DDTHH-mm-ss-*.json`.
19. Report back with the YALC campaign ID, external Instantly ID when present, status, and next tracking command.

## Campaign Lifecycle

Chat copy is not enough. Yalc Agent must persist a YALC campaign draft before Instantly. The default lifecycle is:

1. Sancho/Yalc Agent drafts the strategy and copy in chat.
2. Yalc Agent creates a YALC `draft` campaign with `create-campaign-draft`.
3. The user reviews the draft in Sancho/YALC Cockpit or by asking chat to inspect the campaign ID.
4. Yalc Agent searches/enriches/assigns leads only through the campaign endpoints or provided leads.
5. Yalc Agent approves the reviewable email sequence only after user approval.
6. Yalc Agent runs Instantly dry-run only after explicit approval.
7. Yalc Agent publishes to Instantly without launching only after explicit approval.
8. Yalc Agent launches the published Instantly campaign only after explicit approval.

Never jump from chat copy directly to an Instantly placeholder campaign when no YALC campaign ID exists. If the user says "crea la campana para revisar", that means create the YALC draft, not a live external campaign.

Never say a campaign is ready for approval if the YALC draft has no email sequence saved. In that case, generate the sequence and attach it with `add-campaign-step` first.

## Crear task de seguimiento al confirmar (manager-intake)

La consola YALC es una herramienta persistente; lo que se materializa como **task** en Mission Control es el **trabajo que lanzas desde ella**: una **campaña** que se publica/lanza o una **búsqueda de discovery** que se confirma. Crea la task **al confirmar**, nunca al abrir el chat (confirm-first, igual que `sancho-manager`).

**Cuándo crear la task**
- Tras `campaign-publish`/`campaign-live` confirmado → 1 task de campaña (seguimiento del run).
- Al confirmar una nueva búsqueda de discovery desde la consola (si no la creó ya la app vía "Nueva búsqueda") → 1 task de búsqueda.
- No dupliques: si la búsqueda/campaña ya tiene una task (la app pudo sembrarla), añade el resultado a esa task en vez de crear otra.

**Cómo (confirm-first)**
1. **Propón, no ejecutes.** "Esto lo registro como una task de seguimiento: «{resumen}». ¿La creo? La asignaría a **Rocinante** (skill `yalc-operator`)." Recoge lo mínimo que falte (máx 2 preguntas).
2. **Espera confirmación explícita** ("sí, créala").
3. **Crea la task** (recién aquí), añadida al proyecto de Outreach activo (`project.category == "outreach"`) si existe; si no, a un proyecto ligero. Shape canónico (los **3 anchors**: `skill` + `deliverable_file` + `mc_chat_thread_id`; status `todo`):
   ```json
   {
     "id": "P{XX}-T{YY}",
     "name": "Campaña: {título}",
     "description": "Seguimiento del run de la campaña/búsqueda lanzada desde YALC.",
     "deliverable": "Run de la campaña en brand/{slug}/yalc/runs/",
     "done_criteria": "Campaña lanzada y reportada.",
     "depends_on": null,
     "status": "todo",
     "owner": "Sancho",
     "agent": "rocinante",
     "channel": "prospecting",
     "type": "execution",
     "skill": "yalc-operator",
     "deliverable_file": "brand/{slug}/yalc/runs/{run-id}.json",
     "mc_chat_thread_id": "task-p{xx}-t{yy}",
     "created": "{hoy}",
     "completed": null,
     "output_files": []
   }
   ```
4. Crea el **hilo de chat vacío** `brand/{slug}/chat/{mc_chat_thread_id}.json` (`{ "messages": [], "createdAt": "{hoy}" }`) y actualiza `tasks_total` en `project.json`. Mission Control lee `tasks.json` **en vivo** — sin paso de regeneración.

> Para búsquedas de discovery cuyo ejecutor es `discovery-search-runner`, usa `skill: "discovery-search-runner"` (también owner Rocinante) y `deliverable_file` la ruta de la búsqueda.

## Current Limitation

Do not use YALC's `outreach-campaign-builder` framework for email launch until it supports an email branch. The framework still ends in `linkedin-campaign-create` in the handoff branch. Use the explicit campaign lifecycle commands above for email outbound instead.
