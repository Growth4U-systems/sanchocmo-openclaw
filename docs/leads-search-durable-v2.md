# Native Leads Search durable canary

`leads.search` is the first deliberately small, user-triggered vertical used to
prove that Sancho can execute an external tool reliably without making the
conversational model responsible for provider I/O, retries or completion. A
trusted Mission Control chat turn may admit the command, but Apollo is invoked
only by the durable worker; Yalc, campaigns and another scheduler are not in
this execution path.

It is off by default and must remain canary-only until the Postgres acceptance
test and a real authenticated staging request both pass.

## Product boundary

- Provider: Apollo People API Search.
- Effect: one read-only `apollo.people.search` request.
- Scope: exact `(tenant slug, leads.search, canary)`.
- Result: page 1 only, at most 10 compact people rows, at most 16 KiB.
- Completion boundary: `search_completed` means Apollo returned a validated,
  bounded receipt and the Ledger committed the terminal run. It does not mean
  that a campaign, enrichment or outreach workflow was created.
- The search response deliberately contains no email address, phone number,
  raw Apollo response or credential. Apollo People Search itself does not
  return emails or phone numbers.

This bounded boundary is intentional. Pagination, enrichment, campaign
creation and outreach are separate durable operations; hiding them inside this
handler would recreate the opaque, failure-prone workflow being replaced.

## API

All routes use the existing slug authorization boundary and return
`Cache-Control: private, no-store`.

### Admit a search

`POST /api/leads/searches?slug=<tenant>`

Supply exactly one caller identity: either the `Idempotency-Key` header or a
`requestId` body field. The raw value is hashed with the tenant and operation
before the first Ledger write.

```json
{
  "slug": "hospital-capilar",
  "requestId": "manual-canary-001",
  "criteria": {
    "titles": ["Marketing Director"],
    "organizationLocations": ["Spain"],
    "employeeRanges": ["11,200"]
  },
  "limit": 5
}
```

The initial response is normally `202` with a `runId` and tenant-scoped
`statusUrl`. Repeating the exact command returns the same run. Reusing the same
identity with different criteria returns `409` and performs no provider call.

### Observe, list and cancel

- `GET /api/leads/searches/<runId>?slug=<tenant>` returns the exact-scope Ledger
  status and, after terminal delivery, the immutable product projection.
- `GET /api/leads/searches?slug=<tenant>` lists terminal product projections
  with bounded keyset pagination.
- `DELETE /api/leads/searches/<runId>?slug=<tenant>` requests cooperative
  cancellation and also requires exactly one request identity.

Another tenant's run ID is indistinguishable from a missing run. Public
responses never expose command payloads, fingerprints, credentials or raw
provider errors.

## Mission Control chat boundary

OpenClaw 2026.5.18 registers one contextual tool for an authenticated admin
turn in the `mc-chat` channel:

- `leads_search_start` admits one bounded search, immediately returns its
  Ledger receipt and tells the user that the result will arrive automatically
  in the same thread.

There is deliberately no model-facing status tool. The model calls
`leads_search_start` once and finishes its turn; it does not wait, sleep or
poll. After the external effect reaches a terminal state, the durable terminal
projection publishes the bounded result directly into the originating chat
without another model turn.

This tool is part of the Mission Control execution surface, not a special
Growie capability. Growie remains the technical-support surface; the active
product agent may request this operation only when OpenClaw supplies the
trusted admin/chat context.

The model cannot choose a tenant, idempotency key or credential. The plugin
derives the tenant from the canonical delivery target, verifies it against the
server-owned client registry, and binds the request to the active Mission
Control run. The internal `POST /api/runtime/leads-search` boundary accepts
`X-MC-Secret` only as transport authentication. Authority comes from the exact
`X-Mission-Control-Run-Id` plus `X-Sancho-Run-Capability` pair: the control
plane loads the persisted run, validates the capability digest and lifetime,
and rechecks its tenant, thread, agent, request text, principal, admin state and
read-only policy before delegating to `admitLeadsSearch`. That runtime bridge
has no GET method, rejects query parameters, and omits both `statusUrl` and
provider results from its POST response. Scoped backend/UI observation uses
the separate authenticated `/api/leads/searches` surface, which is not exposed
as an OpenClaw tool. Possession of `X-MC-Secret` alone grants no run, tenant or
tool authority. The plugin never calls Apollo. Repeating the same command
inside one active chat run replays one receipt; changing the command under that
run returns `409` before provider I/O. A later user turn is a new parent run and
therefore a new idempotency identity unless the product supplies an explicit
cross-turn identity.

The model-facing bridge returns only the bounded admission receipt and the
same-thread delivery promise; it returns neither a polling URL nor provider
rows, including when an idempotent replay finds an already-terminal run. The
terminal projector formats at most ten candidates and 16 KiB for the same-thread
workflow message, with no email, phone, raw provider payload, secret or raw
error. Unknown clients, missing/ambiguous active runs,
non-admin/read-only turns, malformed responses and disabled rollout all fail
closed.

### Chat capability and canary constraints

Every Mission Control turn receives a random 256-bit capability. Only its
SHA-256 digest is persisted; the raw value crosses the OpenClaw transport once
and may return only in exact-run HTTP headers for context, callbacks and the
bounded Leads Search bridge. It is never placed in prompts, callback bodies,
logs, session history or Ledger records. The global `MC_CHAT_SECRET`
authenticates transport only and cannot select a tenant, principal or run.

Before OpenClaw reads chat logs or context, creates or resumes a session,
honors stop/control state, or exposes/executes a runtime tool, it performs a
control-plane preflight with the exact run and capability. Context-pack reads,
tool calls and terminal callbacks carry that same pair and are accepted only
for that persisted active run. Callback bodies cannot choose or override their
authority. Missing, expired, mismatched or terminal-run authority fails closed.

The capability has an absolute 35-minute lifetime: the current turn watchdog
is 30 minutes and the extra five minutes allow a bounded late tool/callback.
This does **not** cover an arbitrary serialized chat backlog because the run is
currently created before it reaches the OpenClaw session queue. Therefore the
staging canary must begin with the target session and queue empty, admit only
one observed turn at a time, and stop if a second turn queues behind it. Broad
rollout is blocked until capability activation is moved to dequeue (or backlog
is rejected authoritatively). The intended follow-up is a 15-minute watchdog
and a 20-minute capability after that lifecycle change.

Inbound single-flight and the different-terminal-callback guard are
process-local protections for the singleton staging gateway. The accepted-run
replay cache is process-local as well. PostgreSQL owns Leads Search effect
idempotency and its existing terminal-projection outbox owns the final result
obligation with claim, lease/fencing, acknowledgement and replay. The
projector first upserts the product projection, then atomically publishes an
insert-only chat sidecar under an immutable delivery key, and only then
acknowledges the terminal obligation. A crash after sidecar publication but
before acknowledgement therefore replays the projection without repeating
Apollo or duplicating the workflow message.

The sidecar is authoritative for its delivery key when the thread is read.
Its first writer owns the display timestamp; a retry with the same logical
message preserves that timestamp even if its proposed timestamp differs. A
different logical payload under the same key fails closed. Horizontal rollout
still requires durable cross-instance chat admission and a shared or otherwise
cross-instance-equivalent delivery store; the successful singleton canary is
not evidence for those guarantees.

Discord ingress/thread creation, shared-secret runtime thread reads, live MCP
`sancho_delegate`, cross-thread agent handoff and asynchronous non-OpenClaw
control are intentionally fail-closed in this slice. They require their own
scoped authority and tool allowlist; none may fall back to `MC_CHAT_SECRET` as
authority. Docs assistant fallback uses a non-serializable same-process,
Growth4U-only, client/read-only authority and cannot enter YALC fast paths or
runtime tools.

Gateway delivery is bounded to 20 seconds. Control-plane callback attempts are
bounded to 8 seconds, and context-pack lookup to 5 seconds with a 64 KiB
response limit. Redirects are rejected on every capability/secret-bearing
request.

## UTC storage and pre-existing obligations

Leads Search uses the generic Ledger's UTC wall-clock contract for claims,
leases, retry deadlines, events and terminal delivery. Its product projection
also writes `projected_at` through an explicit UTC conversion and returns a
`Z`-suffixed instant. Ledger run cursors retain all six PostgreSQL microsecond
digits, so adjacent rows inside one millisecond are neither repeated nor
skipped.

Migration `0030_execution_utc_timestamps.sql` converges the catalog defaults to
`clock_timestamp() AT TIME ZONE 'UTC'` without rewriting existing rows. Before
enabling the Leads Search worker in an existing environment, keep every durable
boot flag at `0`, record `SHOW TimeZone;`, and audit all pre-existing
non-terminal runs/effects and undelivered terminal projections. A wall-clock
value written before `0030` cannot be assigned an offset safely from the value
alone; ambiguous obligations require an explicit operator disposition and must
not be bulk-shifted. Follow the complete
[pre-rollout gate](./execution-control-migrations.md#utc-timestamp-convention-and-pre-rollout-gate).

The final isolated PostgreSQL matrix passed 68/68 with Node in
`America/New_York` and database sessions in `Europe/Madrid`; it includes 13/13
lease cases, 11/11 projection/outbox cases including SIGKILL recovery, and
11/11 tracked-migration cases. This validates the current runtime and fresh
data. It does not certify historical timestamps or replace the real staging
Apollo gate.

## Rollout configuration

```text
LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED=1
LEADS_SEARCH_EXECUTION_V2=canary
LEADS_SEARCH_V2_SLUGS=hospital-capilar
LEADS_SEARCH_WORKER_LEASE_MS=60000
LEADS_SEARCH_WORKER_POLL_MS=5000
LEADS_SEARCH_SCOPE_RESCAN_MS=30000
APOLLO_API_KEY=<master key, secret store only>
SANCHO_BASE_URL=https://staging.sanchocmo.ai
```

`SANCHO_BASE_URL` must be configured to Sancho's canonical trusted origin in
every deployed environment. Do not depend on request `Host` or forwarded
headers for capability-bearing callbacks. The plugin's `MC_SERVER_URL` and
`MC_CONTEXT_PACK_URL` must resolve to that same trusted control plane;
redirects are rejected rather than followed.

The allowlist accepts exact slugs only and rejects wildcards. Invalid rollout
configuration fails before admission. Worker boot is a separate, mandatory
execution authority: only the exact value `1` permits the default adapter to
start, wake or perform an external effect. A new identity therefore requires
both canary rollout authority and boot authority before the Ledger is mutated.
Booting while `LEADS_SEARCH_EXECUTION_V2=off` remains supported and is required
to drain sticky Ledger receipts without accepting a new command. Setting boot
back to `0` pauses sticky receipts in the Ledger without rerouting them or
performing provider I/O. Handler version 1 freezes the Apollo
timeout at 30 seconds because changing an effect policy in place would strand
pending runs behind a policy-fingerprint mismatch. A future timeout change
must ship as a new handler/effect version while the old version remains
registered to drain. Removing the rollout flag blocks new commands but does
not strand an already admitted run while boot remains `1`: persisted Ledger
scopes remain sticky and continue to drain.

### Model and provider canaries

The GLM 5.2 structured-tool probe passed with a 1,024-token output budget: it
returned arguments that satisfied the closed Leads Search schema and
`canonicalStartInput` accepted them without provider or Ledger I/O. The same
probe with a 160-token budget returned `{}`, which the boundary correctly
rejected. Keep at least the validated output budget for this canary and never
treat model-side schema mode as a substitute for server validation.

The local browser canary may replace only the exact Apollo People Search call
with a bounded synthetic fixture. That proves the user UI, GLM tool selection,
capability preflight, runtime bridge, PostgreSQL Ledger, worker and projection
path; it does **not** prove Apollo credentials or live provider behavior. The
staging acceptance below is a separate gate and must use the real Apollo master
key from the staging secret store, observe the real provider effect and retain
only the bounded projection.

### Local chat canary evidence — 2026-07-16

The pre-fix canary established the failure mode rather than a successful UX.
In thread `growth4u:san480-ledger-canary-timeout-20260716e`, parent run
`run_mrnh618p_34553c9a` admitted child run
`xrun_mrnh6dd7_58f0c03d`. GLM 5.2 repeatedly selected the status tool until
the fourth tool call hit the cost guard. Apollo still ran exactly once and the
Ledger run and product projection completed, but no result reached the chat.
This proved that effect durability alone was insufficient while completion
depended on model polling.

The post-delivery-fix user-like canary used the exact OpenClaw 2026.5.18 release
with GLM 5.2 and a synthetic Apollo boundary delayed by 25 seconds. In thread
`growth4u:san480-ledger-canary-outbox-20260716d`, parent run
`run_mrni4li6_9a16f33f` selected `leads_search_start` exactly once and admitted
child run `xrun_mrni4qmj_0c764ed4`. No status tool was exposed or invoked, and
the Apollo stub logged exactly one call.

PostgreSQL and the persisted chat contained exactly:

- one completed `leads.search` run with `claim_count=1` and
  `handler_attempt=1`;
- one succeeded external effect with `attempt_count=1` and
  `reconcile_count=0`;
- one completed product projection with `candidate_count=1`;
- one succeeded terminal projection and one automatic durable workflow result
  in the originating thread;
- message order `user -> bot acknowledgement -> workflow result`, with the
  workflow timestamp assigned by the first sidecar writer rather than copied
  from a timezone-ambiguous database timestamp;
- no model polling and no Yalc or Leads Discovery execution.

A forced crash/replay exercise re-opened the terminal obligation after the
sidecar had been published but before its acknowledgement. The terminal
projection finished with `claim_count=2`; Apollo was not called again,
`workflowCount` remained `1`, and the sidecar SHA-256
`1411a234ffb371c5802b2c0d207adbbf5671ef03430faaddb0aeae14d3f8b34c`
and mtime `2026-07-16T14:45:34+0200` were identical before and after replay.
This closes the observed result-loss failure for the tested singleton path.

The authenticated chat endpoint and persisted thread payload proved the data
that the UI consumes. No Conductor browser backend was available in that
session, so this is not visual click/screenshot evidence. It proves the
user-message, GLM, capability, bridge, worker, Ledger, durable final-chat and
crash-replay path with a synthetic provider; the live Apollo
credential/provider gate remains open. No staging or production deployment
was performed by this canary.

This canary ran before the final UTC runtime hardening and migration `0030`.
Its one-call, automatic-delivery and crash/replay evidence remains valid for
that tested build, but it is not a post-`0030` release canary. Rerun the same
authenticated OpenClaw/GLM flow on the final migration set before staging
promotion.

A final local control-plane canary then exercised all 14 tracked migrations,
`0019`–`0032`, with Node in `America/New_York`, PostgreSQL in
`Europe/Madrid`, dedicated local PostgreSQL and loopback HTTP. Thread
`hospital-capilar:san480-postutc-20260716c`, parent
`run_san480_postutc_20260716c` and child `xrun_mrnu0x3w_f44d54a3` produced a
`202` acknowledgement in 45 ms before provider I/O, one synthetic Apollo call,
zero status polling and one automatic workflow result. No status URL or
provider rows crossed the chat boundary.

A forced `SIGKILL` after sidecar publication but before outbox acknowledgement
recovered from `claim_count=1` to `claim_count=2` without repeating Apollo or
the visible message. The sidecar remained byte-for-byte identical with the
same mtime and SHA-256
`f7c9d7006d7171cfec882e0a62442c5dcf769b5aec3d1fb1b7a3ee02c23435d7`.
Identical command replay returned the same run and changed command reuse
returned `409`. This closes the current local migration/runtime/replay gate,
but deliberately substitutes both the model turn and Apollo transport; it is
not browser, live-provider or staging evidence. The authenticated GLM 5.2 plus
live Apollo staging gate remains open.

## Staging acceptance sequence

This acceptance sequence is permitted before the production blockers below
are closed only as a low-volume, exact-tenant canary with a named operator
watching every run. It is not approval for a broad staging rollout.

1. Keep `LEADS_SEARCH_EXECUTION_V2=off` and all three independent boot flags
   set to `0`: `PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED`,
   `LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED` and
   `LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED`. Confirm no durable supervisor was
   started by `instrumentation.ts`. Record `SHOW TimeZone;` and complete the
   documented audit/disposition of pre-existing obligations. Then apply the
   tracked execution-control migration set through `0033` using the one-shot
   procedure in
   [`execution-control-migrations.md`](./execution-control-migrations.md). An
   existing environment must complete its one-time verified adoption before
   this deploy; the workflow never auto-baselines. Verify all UTC defaults
   plus the `0032` origin-authority and `0033` one-command-claim catalog
   contracts, then run
   `npm run execution:origin-cutover:check -- --require` and require zero
   unregistered non-terminal origins before enabling worker boot.
2. With an authenticated NextAuth admin session, call
   `GET /api/admin/leads-search-readiness`. Verify an unauthenticated request is
   rejected with `401`, a non-admin session is rejected with `403`, and the
   successful response is `Cache-Control: private, no-store`. The response must
   contain only redacted readiness state: never credentials, commands, raw
   provider errors, provider URLs or tenant search criteria.
3. Configure `APOLLO_API_KEY` from the secret store, set the exact staging
   tenant allowlist, set `LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED=1` and enable
   `canary` for that tenant only. Explicitly confirm
   `PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED=0` and
   `LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED=0`; this acceptance must start
   only the Leads Search supervisor. Do not use a wildcard or add a second
   tenant during acceptance. Use only synthetic test data or data that is
   explicitly authorized for this staging exercise. Before sending a request,
   confirm that the reverse proxy, APM and HTTP instrumentation do not record
   Apollo query URLs, because those URLs contain the search criteria.
4. Poll the admin readiness endpoint until it reports
   `credentialBindingReady: true`, `startup.state: ready`, one successful
   authoritative supervisor scan and `acceptsNewAdmissions: true`. Stop the
   canary if startup fails, the supervisor is degraded or a successful scan is
   missing.
5. Submit one authenticated API request with a new request identity.
6. From the authenticated API test harness—not from the model—poll its returned
   `statusUrl` until `completed`; verify one compact product projection and one
   succeeded Apollo effect. The runtime chat bridge must return no `statusUrl`.
7. Replay the same request and verify the same `runId`, zero new Apollo calls
   and zero new projections.
8. Reuse the identity with changed criteria and verify `409` with zero provider
   I/O.
9. From the normal authenticated Mission Control chat UI, request the same
   bounded search as a user. Verify OpenClaw exposes only
   `leads_search_start`, creates one Ledger run, acknowledges it immediately
   and later publishes the same compact projection automatically into the
   originating thread. Verify the model does not poll or invoke another tool.
   If the start boundary is replayed inside that active turn, verify it returns
   the same run without provider rows and without calling Apollo again. Do not
   use a new user turn as this replay assertion: a new turn has a new parent run
   and may legitimately admit a new search. A
   non-admin/read-only turn and a spoofed tenant must expose no tool or perform
   zero database/provider I/O.
   Start only after verifying the OpenClaw session/queue is empty; do not send
   another turn while this one is queued or active. Verify the raw run
   capability is absent from the agent-run snapshot, callbacks, logs and HTTP
   responses.
10. Run a second API command, cancel it, and verify tenant-scoped terminal
    evidence.
11. Leave `LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED=1`, turn only the canary
    rollout flag off and verify new identities are rejected while an already
    admitted run still drains. Confirm the transition through the admin
    readiness endpoint as well as through the public API. Then set the search
    boot flag back to `0` after all sticky work is terminal.

## Production blockers

The following gaps do not block the restricted staging canary described above
when it uses an exact allowlist, low request volume and continuous manual
supervision. They **must** be implemented, exercised and reviewed before
`leads.search` accepts any production admission:

- Enforce an authoritative quota and rate limit for both tenant and actor, plus
  a hard limit on queued/non-terminal backlog. Admission above any limit must
  fail before a Ledger write or Apollo call with `429 Too Many Requests` and a
  meaningful `Retry-After` header. The limit must hold across processes and
  instances; the process-local worker-capacity limiter is not an admission
  quota.
- Approve and implement a retention, access and deletion policy for the PII
  copied into the effect receipt, terminal run output and immutable product
  projection. The policy must define retention periods, DSAR lookup/export,
  the referentially safe purge order, audit evidence, backup/log treatment and
  who may authorize a purge. Exercise that purge against a representative run
  before production.

The tracked PostgreSQL runner closes the former migration-replay gate:
canonical name plus SHA-256 tracking, catalog-verified explicit adoption,
advisory-lock serialization and per-file transactions prevent replay or
partial recording. Its real-PostgreSQL suite covers clean apply, zero-DDL
skip, final and prefix adoption, partial-schema refusal, checksum drift,
concurrency, rollback, UTC-default convergence and origin-authority catalog
verification through `0033`. The required
one-time staging/production adoption remains an operational prerequisite, not
an automatic deploy action; see
[`execution-control-migrations.md`](./execution-control-migrations.md).

The vertical PostgreSQL suite now closes the Apollo `429` and concurrent
cancellation gates. It proves bounded retries preserve one run and `effectKey`
through two `429` responses and one success, with one terminal projection. It
also requests cancellation while Apollo I/O is in flight, persists the one
accepted bounded receipt, terminates at the `before_finish` safe point and
proves replay performs no second provider invocation.

Do not enable production from this branch. Promotion requires reviewing the
real staging evidence, closing every blocker above and explicitly approving the
deployment.

## What this proves—and what it does not

The canary proves the generic Ledger can host a second independent product
adapter with admission idempotency, database-clock leases, bounded external
effects, cancellation, crash-recoverable terminal delivery and tenant-scoped
read models. It also proves Yalc is not required for this operation.

It does not yet prove arbitrary multi-step workflows. Partnerships now proves a
bounded setup-to-child path, but the current kernel still needs explicit
designs for dynamic fan-out, durable waits/callbacks, multi-level child graphs,
shared artifact storage and large artifacts. Those are extensions to the
Ledger, not reasons to move external execution back into the conversational
model.
