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
2. An explicit request such as "crea una base", "busca personas", "enriquece" or "prepara la campaña" authorizes the corresponding draft, provider-read and internal persistence steps in that turn. Pass the wrapper confirmation flag, but do not ask the user to confirm the inferred ICP, campaign draft or any internal step again.
3. Never ask the user to approve a preview, proposal, internal draft or `dryRun`. Execute or skip those under the original request. Ask once immediately before the first real contact send or a material provider cost that was not implied by the request.
4. Do not ask the user to choose implementation techniques such as signal-based vs role-based personalization, provider, skill, scoring model or merge variables. Select the best available path and report the choice in the result.
5. Use the wrapper script instead of direct `curl` so auth, live catalog verification and dry-run behavior stay consistent.
6. Do not ask users for YALC tokens in chat. If YALC is not configured, send them to Mission Control API setup.
7. Keep client isolation: pass `--slug {slug}` and only write outputs under `brand/{slug}/yalc/`.
8. For the standard unified outbound flow, use the fast path below and do not read the capability map, list the skill catalog, inspect standalone provider scripts or call provider APIs directly. Read `references/yalc-capability-map.md` only for a legacy command or an unsupported capability.
9. Missing brand documents or a `partial` context pack are not blockers when the request already specifies a usable audience, channel and objective. State the fallback briefly in the completed result, use only facts from the request, and proceed. Never stop at a proposal or ask permission to create the draft in this case.
10. In chat, never call `clarify`, `ask_user` or another interactive tool for approval. Return the three message samples and the live-send question together as the plain final answer, then end the turn.
11. Never use fixtures, demo candidates, generated people, or provider payloads marked as mock/simulated. `manual` is valid only when the user supplied real records. Before creating a campaign, run `providers` and verify a green real source for the requested audience. If none is available, do not create a placeholder campaign: report the exact missing connector and stop before persistence.

## Interaction Model

Chat is the primary control surface. The Outreach UI is the persistent view of the same YALC campaigns: status, sample messages, exceptions, approval and results. Never create a parallel chat-only campaign or leave generated copy only in the conversation.

When the user describes an outcome:

1. Infer the ICP, offer and channel from the current request plus brand context. If the user did not provide an ICP, recommend one and proceed with it without asking the user to approve the recommendation. Ask at most one question, and only when a missing business fact makes execution unsafe or meaningless.
2. Check provider readiness first. Create or reuse one YALC campaign only after a real source is green (or the user supplied real records), then source, enrich, score and prepare messages through that campaign. Do not narrate a menu of tools or ask which skill to run.
3. Choose personalization per lead in this order: verified recent person/company signal; verified company context; role + company relevance; company + campaign contact reason. Never invent a signal. If signal tools are unavailable or return nothing, use the fallback automatically.
4. Fetch the actual channel preview and present the resulting audience size, selected strategy, three representative messages, exceptions and the next safe batch. `outbound.personalize` with `channel: "linkedin"` returns this automatically in `preview.items`; quote three returned `preview.items[].message` values. Only call `outbound.linkedin_autopilot.plan` separately as a compatibility fallback when `preview` is absent. `outbound.status` alone is not a message preview. Do not require review of every lead.
5. Ask for one explicit confirmation before live external contact. The user may confirm in chat or in the UI; both must call the same YALC execution contract.

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

**Passing payloads — never write under `brand/{slug}/yalc/payloads/`.** Your
file-write root does not match the wrapper's resolution root, so a relative
`brand/.../payloads/x.json` either lands where the wrapper can't read it or fails
outright (a literal `$OPENCLAW_HOME/...` write the runtime never expands). Use one
of these instead:

- **Small, quote-free payloads (filters, ids):** pass inline with `--json '<json>'`
  — no file at all. (This is what `campaign-sequence-approve/publish/live` already do.)
- **Large or quote/newline-heavy payloads (email copy, full drafts):** write the
  JSON to an **absolute** path under `/tmp` (e.g. `/tmp/yalc-campaign-draft.json`)
  and pass `--input /tmp/yalc-campaign-draft.json`. The wrapper reads absolute
  paths as-is, and `/tmp` always exists and is writable.

```bash
node skills/yalc-operator/scripts/yalc-client.mjs health --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs skills --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs catalog --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs providers --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs gates --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs campaigns --slug growth4u
node skills/yalc-operator/scripts/yalc-client.mjs brain --slug growth4u
```

Create the internal YALC campaign draft first. The draft carries email copy, so
write it to an absolute `/tmp` file and pass it with `--input`:

```bash
node skills/yalc-operator/scripts/yalc-client.mjs create-campaign-draft \
  --slug growth4u \
  --input /tmp/yalc-campaign-draft.json
```

If an existing draft is missing the reviewable email copy, add the email step to that draft instead of creating a duplicate campaign:

```bash
node skills/yalc-operator/scripts/yalc-client.mjs add-campaign-step \
  --slug growth4u \
  --id <yalc-campaign-id> \
  --input /tmp/yalc-campaign-email-step.json
```

Search, enrich, review, and publish through the explicit campaign lifecycle:

```bash
node skills/yalc-operator/scripts/yalc-client.mjs campaign-leads-search \
  --slug growth4u \
  --id <yalc-campaign-id> \
  --json '{"limit":50}' \
  --confirm-side-effect

node skills/yalc-operator/scripts/yalc-client.mjs campaign-leads-enrich \
  --slug growth4u \
  --id <yalc-campaign-id> \
  --json '{}' \
  --confirm-side-effect

node skills/yalc-operator/scripts/yalc-client.mjs campaign-leads-personalize \
  --slug growth4u \
  --id <yalc-campaign-id> \
  --json '{"channel":"linkedin","overwrite":false}' \
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

Creating an Instantly draft is allowed when the user asked to prepare or create the campaign and it does not contact anyone. Launching it requires explicit confirmation:

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

- `skill-info`, `today`, `create-campaign-draft`, `add-campaign-step`, `campaign`, `campaign-leads-search`, `campaign-leads-enrich`, `campaign-leads-personalize`, `campaign-leads`, `campaign-lead`, `campaign-sequence-update`, `campaign-sequence-approve`, `campaign-sequence-request-changes`, `campaign-dry-run`, `campaign-publish`, `campaign-live`, `campaign-report`, `campaign-timeline`, `campaign-export`, `campaign-chat`
- `pause-campaign`, `resume-campaign`, `update-lead-status` with confirmation
- `brain-update` with confirmation
- `gates`, `approve-gate`, `reject-gate` with confirmation
- `providers`, `provider-knowledge`, `provider-test`
- `setup-preview`, `setup-update-preview`, `setup-regenerate`, `setup-commit` with confirmation
- `dashboard-list`, `dashboard`, `visualizations`, `visualization`
- `api` for intentionally confirmed `/api/*` gaps, except credential writes
- `cli` for allowlisted read-only CLI fallback commands only

## Async jobs

YALC converts long-running ops to background jobs. The long ops are: lead enrichment (`campaign-leads-enrich`), Instantly publish (`campaign-publish`), skill runs (`run-skill`), and gate resume (`approve-gate` / `reject-gate`). When YALC runs one as a job, the wrapper returns `{ "ok": true, "async": true, "jobId": "…", "statusUrl": "…" }` (top-level `async: true`) instead of the normal sync result.

When you call any of these long ops you MUST:

1. The wrapper automatically reads the current chat callback context from the runtime and attaches it so YALC can deliver the result back to this exact thread. This applies to search, enrichment, personalization, publish and other calls that return an async job. Use explicit `--callback-context` only as a CLI/debug fallback:

   ```bash
   node skills/yalc-operator/scripts/yalc-client.mjs campaign-leads-enrich \
     --slug growth4u \
     --id <yalc-campaign-id> \
     --confirm-side-effect \
     --callback-context '{"slug":"<slug>","threadId":"<threadId>","agent":"<agent>"}'
   ```

   `slug`, `threadId`, and `agent` come from `[MC Chat Context]`. The wrapper attaches `callbackUrl` (`SANCHO_BASE_URL`/`BASE_URL` + `/api/yalc/job-callback`) automatically.

2. **On `async: true`, tell the user it's running and you'll notify them when it finishes** (e.g. "Lo dejé corriendo en YALC, te aviso en este hilo cuando termine."), then **END the turn**.

3. **Do NOT poll `/api/jobs/:id` or `statusUrl` in a loop.** The result arrives as a brand-new message in this same thread when the job completes — YALC POSTs to `/api/yalc/job-callback`, which re-engages you with a synthetic prompt summarizing the job (status, type, output, jobId). At that point you report the result to the user (e.g. "✅ YALC terminó: 132 leads. ¿Enriquezco?") and suggest the next step.

If the op returns a normal sync result (no `async` flag), handle it as before. Do not spend tool calls reconstructing callback metadata during normal chat operation; the runtime already supplies it.

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

## Unified Outbound Commands

Prefer the Mission Control command surface for new B2B and Partnerships work:

```bash
node skills/yalc-operator/scripts/yalc-client.mjs outbound-command --slug <slug> --json '<payload>' --confirm-side-effect
```

The payload always uses one of:

- `{"command":"outbound.plan","campaignType":"B2B"|"Partnerships","goal":"...","hypothesis":"recipient-facing reason for contact","target":{...},"channels":["email"|"linkedin"]}`
- `{"command":"outbound.source","campaignId":"...","profileKind":"b2b_contact"|"creator","provider":"apollo"|"crustdata"|"manual"|"company-db","criteria":{"query":"software","titles":["Founder","Co-Founder","CEO"],"organizationLocations":["Spain"],"employeeRanges":["1,10","11,50"]},"limit":25}`
- `{"command":"outbound.enrich","campaignId":"...","providers":["apollo"|"crustdata"]}`
- `{"command":"outbound.score","campaignId":"...","scoreModel":"b2b_fit_v1"|"creator_quality_v1"}`
- `{"command":"outbound.personalize","campaignId":"...","profileKind":"b2b_contact"|"creator","channel":"email"|"linkedin","enrichWithCrustdata":true}`
- `{"command":"outbound.draft_sequence","campaignId":"...","channel":"email"|"linkedin","profileKind":"b2b_contact"|"creator","sequence":[...]}`
- `{"command":"outbound.linkedin_autopilot.plan","campaignId":"...","leadIds":["..."]}`
- `{"command":"outbound.linkedin_autopilot.execute","campaignId":"...","leadIds":["..."],"dryRun":true}`
- `{"command":"outbound.approve_and_publish","campaignId":"...","channel":"email"|"linkedin","profileKind":"b2b_contact"|"creator","dryRun":true}`
- `{"command":"outbound.status","campaignId":"..."}`

`outbound.status` is read-only and does not need `--confirm-side-effect`; every other command does. The wrapper flag is a technical guard, not a reason to ask the user again: the original request authorizes plan, source, enrich, score, personalize, preview and dry-run operations. Old campaign-specific commands (`campaign-leads-search`, `campaign-sequence-update`, `campaign-publish`, `campaign-live`) remain compatibility fallbacks for debugging existing runs, but do not use them as the primary contract for new operator work.

## Workflow

1. Read the user's outcome and available brand context. Infer a concrete recommended ICP and a recipient-facing contact reason. Save that reason as `hypothesis`; it must be a natural standalone sentence (for example, "Creemos que podemos ayudar a simplificar vuestro outbound"), and must never be a copy of the search goal such as "encontrar founders". Partial or missing optional brand documents require a truthful fallback, not a question. Ask only for a critical missing business fact.
2. For a new B2B or Partnerships campaign, run only `health` and `providers` as preflight. Do not run `skills`, `catalog`, standalone Apollo scripts, direct `curl`, web research or the capability map on this known path. For a B2B database, require a green real source such as Apollo or user-supplied real records; for signal enrichment use only green providers; for delivery require Instantly (email) or Unipile (LinkedIn). A gray/missing provider is a blocker for that capability, never a reason to synthesize data.
3. Create or reuse the internal campaign with `outbound.plan` only after the source preflight passes. Never create a duplicate for the same request.
4. If the user asked for a database or campaign, continue in the same turn with `outbound.source`, enrichment when needed, and `outbound.score`. The original request is sufficient authorization for these non-contact steps.
5. If the user asks for signals, or signal tools are available and relevant, run the appropriate research/detection skills and then `campaign-leads-personalize`. Select the strongest verified strategy per lead automatically. Fall back to role/company or company/contact-reason copy without asking the user to choose a technique.
6. Prepare the channel sequence. Email uses `outbound.draft_sequence`; LinkedIn uses the saved campaign reason and `outbound.personalize`, whose response includes a three-message `preview`. Persist every artifact on the campaign.
7. If a dry-run adds useful validation, run it automatically; otherwise stop at the channel preview. Never ask whether to run a dry-run. Present audience count, three actual returned messages, exceptions, daily capacity and the exact live action awaiting approval.
8. Ask once: "Tengo listo el lote de N contactos. ¿Confirmas el envío real por LinkedIn/email?" This question must refer to the real external send, never to a test or dry-run. Do not add intermediate confirmation gates for approving copy, creating the provider draft or launching unless those actions have materially different external consequences.
9. After explicit confirmation, execute the approved batch with the live command and save the returned JSON in `brand/{slug}/yalc/runs/YYYY-MM-DDTHH-mm-ss-*.json`.
10. Report the YALC campaign ID, external provider ID when present, sent/skipped/failed counts, remaining audience and next scheduled or available batch.

When any unified command returns top-level `async: true`, stop issuing tools immediately and end the turn after saying that YALC is processing it. The callback will reopen this same thread. On that callback, continue the remaining authorized internal workflow automatically. After a personalization job completes, fetch the LinkedIn preview with `outbound.linkedin_autopilot.plan`; do not call personalization a second time and do not ask the user for another internal approval.

## Campaign Lifecycle

Chat copy is not enough. Yalc Agent must persist a YALC campaign draft before Instantly. The default lifecycle is:

1. Sancho/Yalc Agent drafts the strategy and copy in chat.
2. Yalc Agent creates a YALC `draft` campaign with `create-campaign-draft`.
3. The user reviews the draft in Sancho/YALC Cockpit or by asking chat to inspect the campaign ID.
4. Yalc Agent searches/enriches/assigns leads only through the campaign endpoints or provided leads.
5. Yalc Agent approves the reviewable email sequence under the user's request to prepare the campaign; this is internal state and does not contact anyone.
6. Yalc Agent may run an Instantly dry-run under that same request without another question.
7. Yalc Agent may publish an unlaunched Instantly draft when the user asked to create or prepare the provider campaign and no contact is sent.
8. Yalc Agent launches the published Instantly campaign only after explicit live-send approval.

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
