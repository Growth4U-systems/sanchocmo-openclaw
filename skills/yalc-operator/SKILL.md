---
name: yalc-operator
description: "Operate YALC/GTM-OS from Sancho through deterministic outbound workflows: provider checks, campaign preparation, verified personalization, immutable batch approval, LinkedIn/Unipile execution, email/Instantly handoff, status, and reporting. Use when the user asks Sancho to prepare, review, send, inspect, or troubleshoot outbound."
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
  - brand/{slug}/brand-book/brand-voice/brand-voice.current.md
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
2. For a new B2B campaign, the only human choice before preparation is the ECP/ICP. Before presenting it, compile each option into two separate profiles: `accountTarget` (which companies fit) and `personTarget` (which roles inside them fit). Present at most three Foundation-backed options and wait for that choice. Once selected, the request authorizes campaign creation, sourcing, enrichment, deterministic qualification and message preparation as one workflow; never ask for separate sourcing or enrichment confirmation.
3. Never ask the user to approve a preview, proposal, internal draft or `dryRun`. Execute or skip those under the original request. Ask once immediately before the first real contact send or a material provider cost that was not implied by the request.
4. Do not ask the user to choose implementation techniques such as signal-based vs role-based personalization, provider, skill, scoring model or merge variables. Select the best available path and report the choice in the result.
5. Use the wrapper script instead of direct `curl` so auth, live catalog verification and dry-run behavior stay consistent.
6. Do not ask users for YALC tokens in chat. If YALC is not configured, send them to Mission Control API setup.
7. Keep client isolation: pass `--slug {slug}` and only write outputs under `brand/{slug}/yalc/`.
8. For a new B2B LinkedIn campaign, `outbound.workflow.start` is the only permitted entrypoint. Never call `outbound.plan`, `outbound.source`, `outbound.enrich`, `outbound.score`, `outbound.personalize` or `outbound.workflow.prepare` separately. YALC alone creates or reuses one campaign and runs sourcing, enrichment, qualification, rendering and approval preparation.
9. Missing brand documents or a `partial` context pack are not blockers when the request already specifies a usable audience, channel and objective. State the fallback briefly in the completed result, use only facts from the request, and proceed. Never stop at a proposal or ask permission to create the draft in this case.
10. The ECP/ICP option selection is the only allowed pre-workflow question. Do not ask about channel, provider, scoring, personalization technique, sourcing, enrichment or internal approval. Phase 1 is LinkedIn-only; an email request is unsupported and must be reported without changing or duplicating the campaign.
11. Never use fixtures, demo candidates, generated people, or provider payloads marked as mock/simulated. `outbound.workflow.start` performs the provider preflight before persistence and fails without creating a campaign when Apollo is unavailable.
12. A preparation cohort is 1,000 contacts by default and at most 2,000 when the user explicitly requests it. Apollo's total is informational; never turn it into one giant run and never continue to the next cohort automatically.
13. `manual` is valid only when the user supplied real records. Never synthesize manual leads as a fallback for a provider failure.
14. Never treat a role, seniority or personal location as the company ICP. A normal campaign uses `account_first_v1`: find matching companies first, keep only usable domains, then search the target roles inside those domains. A signal-first recipe is a separate versioned workflow and must not be improvised from chat.

## Interaction Model

Chat is the primary control surface. The Outreach UI is the persistent view of the same YALC campaigns: status, sample messages, exceptions, approval and results. Never create a parallel chat-only campaign or leave generated copy only in the conversation.

When the user asks for a new B2B outbound campaign:

1. Read `go-to-market/ecps/config.json` and the Foundation ECPs once. Compile at most three proposals. Every proposal must contain a concrete company profile and a concrete role profile that can be executed with the installed providers. Do not offer an ECP whose defining signal cannot be sourced by an operational recipe.
2. Present the proposals in one `:::ask` block with `id:"outbound_ecp_v1"` and `mode:"single"`. Keep each label concise but explicit: `<persona> · <tipo/tamaño/país de empresa> · <roles>`. Recommend one, wait for the user's selection and do not create a campaign yet.
3. Every option must include a hidden `workflowIntent` object with the complete canonical payload: `schemaVersion`, `channel:"linkedin"`, `title`, `ecpId`, `targetSegment`, `contactReason`, `batchSize`, `discoveryStrategy:"account_first_v1"`, `accountTarget`, and `personTarget`. The UI displays only `label`; Mission Control resolves the selected option from the persisted bot message and does not trust a browser-supplied payload.
4. After the click, Mission Control calls `outbound.workflow.start` directly and exactly once. The answer must not return to the model, read Foundation files again or reinterpret the selection. The stable thread id derives the idempotency key, so retries reuse the same campaign and run.
5. If the command is asynchronous, report that the workflow is processing and end the turn. The callback updates persisted workflow status directly; it never becomes a user prompt and never invokes the model.
6. When the persisted run reaches `awaiting_approval`, show the company count, contact count and up to three exact persisted samples. Never regenerate messages in chat and never require one-by-one review.
7. For a live send, ask once. After explicit confirmation call `outbound.workflow.approve` and `outbound.workflow.execute` using the same `runId`. Internal approval is not a separate user decision.
8. If Apollo reports more results, show `prepared of total` and offer the next cohort as a normal follow-up. Call `outbound.workflow.continue` only after an explicit request, passing the exact previous `runId`; it reuses the campaign, the selected account set and the stored people cursor without reusing prior leads.

Phase 1 discovery always uses `account_first_v1`: source companies from the account ICP, then source people only inside the returned domains. Phase 1 copy uses `company_reason_v1`: known first name, company and the campaign's contact reason. `linkedin_post_authors_v1`, `hiring_signal_v1`, and `recent_news_v1` remain separate modular recipes for later activation only after their real provider path passes an end-to-end test; never invent or silently fall back from a promised signal.

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

The commands below are compatibility paths for email and pre-existing campaigns. Do not use them to prepare a new B2B LinkedIn batch; use `outbound.workflow.start` instead.

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

2. **On `async: true`, tell the user the workflow is running**, include the campaign/run identifiers returned by the command, then **END the turn**.

3. **Do NOT poll `/api/jobs/:id` or `statusUrl` in a loop.** YALC POSTs completion to `/api/yalc/job-callback`, which updates one structured workflow event by `jobId`. The callback never re-engages the agent and never asks the model to choose another step.

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

- `{"command":"outbound.workflow.start","intent":{"schemaVersion":1,"channel":"linkedin","title":"...","ecpId":"...","targetSegment":"...","contactReason":"...","batchSize":1000,"discoveryStrategy":"account_first_v1","accountTarget":{"description":"Empresas SaaS B2B post-PMF en España, 5-200 empleados","keywords":"B2B SaaS post-PMF","industries":["Software"],"locations":["Spain"],"employeeRanges":["5,200"]},"personTarget":{"description":"Founders y CEOs","titles":["Founder","Co-Founder","CEO"],"seniorities":["founder","c_suite"]}}}` — the only entrypoint for a new B2B LinkedIn campaign. Do not provide `idempotencyKey`; the wrapper derives it from the chat thread.
- `{"command":"outbound.workflow.continue","runId":"..."}` — prepares exactly one next cohort in the same campaign. Use only after the user explicitly asks to continue.
- `{"command":"outbound.plan","campaignType":"B2B"|"Partnerships","goal":"...","hypothesis":"recipient-facing reason for contact","target":{...},"channels":["email"|"linkedin"]}`
- `{"command":"outbound.source","campaignId":"...","profileKind":"b2b_contact"|"creator","provider":"apollo"|"crustdata"|"manual"|"company-db","criteria":{"query":"software","titles":["Founder","Co-Founder","CEO"],"organizationLocations":["Spain"],"employeeRanges":["1,10","11,50"]},"limit":25}`
- `{"command":"outbound.enrich","campaignId":"...","providers":["apollo"|"crustdata"]}`
- `{"command":"outbound.score","campaignId":"...","scoreModel":"b2b_fit_v1"|"creator_quality_v1"}`
- `{"command":"outbound.workflow.prepare","campaignId":"...","spec":{"channels":["linkedin"],"contactReason":"...","leadIds":["..."],"source":{"enabled":false,"provider":"apollo","limit":25,"criteria":{}},"enrichment":{"enabled":false},"strategyPack":{"strategies":[{"id":"company_reason_v1","version":1,"priority":100,"enabled":true,"parameters":{}}],"minimumScore":0.65,"allowFallback":true},"approval":{"required":true,"sampleSize":3},"sender":{}}}`
- `{"command":"outbound.workflow.status","runId":"..."}`
- `{"command":"outbound.workflow.approve","runId":"...","actor":"Sancho"}`
- `{"command":"outbound.workflow.execute","runId":"...","dryRun":true}`
- `{"command":"outbound.workflow.execute","runId":"...","dryRun":false,"confirmLinkedInSend":true}`
- `{"command":"outbound.draft_sequence","campaignId":"...","channel":"email"|"linkedin","profileKind":"b2b_contact"|"creator","sequence":[...]}`
- `{"command":"outbound.approve_and_publish","campaignId":"...","channel":"email"|"linkedin","profileKind":"b2b_contact"|"creator","dryRun":true}`
- `{"command":"outbound.status","campaignId":"..."}`

`outbound.status` and `outbound.workflow.status` are read-only and do not need `--confirm-side-effect`; every other command does. The wrapper flag is a technical guard, not a reason to ask the user again. `outbound.personalize` and `outbound.linkedin_autopilot.*` remain compatibility fallbacks for existing campaigns only; never use them to prepare a new LinkedIn batch.

## Workflow

1. Read the user's outcome and available brand context once. Compile the ICP into `accountTarget` and `personTarget`, then infer a recipient-facing contact reason. Save that reason as `hypothesis`; it must be a natural standalone sentence (for example, "Creemos que podemos ayudar a simplificar vuestro outbound"), and must never be a copy of the search goal such as "encontrar founders". Partial or missing optional brand documents require a truthful fallback, not a question. Ask only for a critical missing business fact.
2. Do not run a separate provider preflight for a new LinkedIn campaign. `outbound.workflow.start` owns that check and fails before persistence when Apollo is unavailable. Do not run `health`, `providers`, `skills`, standalone Apollo scripts, direct `curl`, web research or the capability map on this known path.
3. For a new LinkedIn campaign, call `outbound.workflow.start` once. It performs provider preflight before persistence, creates or reuses one deterministic campaign, paginates sourcing to the requested target, enriches, qualifies usable contacts and prepares the message batch.
4. Never call `outbound.plan`, `outbound.source`, `outbound.enrich` or `outbound.workflow.prepare` for that new campaign. Those commands are compatibility surfaces for pre-existing campaigns and email/Partnerships flows.
5. If `outbound.workflow.start` completes synchronously, show `batch.itemCount`, three exact `batch.sample[].messageBody` values, blocked contacts and signal failures. If asynchronous, stop after reporting its returned IDs; the persisted workflow event will announce completion.
   Preparation is not capped by today's LinkedIn sending capacity. The full valid base is prepared; execution sends only the available daily amount and leaves the remainder pending for deterministic resume.
6. For a dry-run, call `outbound.workflow.approve` and then `outbound.workflow.execute` with `dryRun:true`. Never ask permission for a dry-run.
7. For a live send, ask once: "Tengo listo el lote de N contactos. ¿Confirmas el envío real por LinkedIn?" This question must refer to the real external send, never to approval, a test or a dry-run.
8. After confirmation, call `outbound.workflow.approve` and then `outbound.workflow.execute` with the same `runId`, `dryRun:false` and `confirmLinkedInSend:true`. Never substitute messages or lead IDs at execution time.
9. Approval is an internal integrity gate over the immutable content hash. Do not present it as a separate user step or decision.
10. Report campaign/run IDs and sent, failed, uncertain and pending counts. An `uncertain` result requires reconciliation; never retry it automatically.

When any unified command returns top-level `async: true`, stop issuing tools immediately and end the turn after saying that YALC is processing it. The callback updates the same thread without invoking an agent. On a later user request, fetch `outbound.workflow.status` with its `runId`; never start or prepare again. After live execution completes, report its persisted item states and do not retry failed or uncertain contacts automatically.

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

`outbound_campaign_v1` currently prepares and sends only the first LinkedIn connection message. YALC deliberately suppresses legacy webhook/tracker DM1 and DM2 sends for contacts created by this workflow. Never claim that follow-ups are active; they require deterministic follow-up artifacts, approval and scheduling in a later recipe version.

Do not use YALC's `outreach-campaign-builder` framework for email launch until it supports an email branch. The framework still ends in `linkedin-campaign-create` in the handoff branch. Use the explicit campaign lifecycle commands above for email outbound instead.
