# External HTTP Runtime Contract

`external-http` is Sancho's generic adapter for a BYO runtime. Sancho owns the
product state and authority: brands, tasks, docs, chat threads, the parent
`AgentRun`, durable execution origins, and terminal projection. The external
runtime accepts one bounded chat turn and either returns or posts its final
answer.

There are two supported protocols:

- `SANCHO_EXTERNAL_PROTOCOL=sancho` (default) is the asynchronous contract. The
  runtime receives `/sancho/inbound`, then posts progress and one terminal reply
  to `/api/chat/webhook`.
- `SANCHO_EXTERNAL_PROTOCOL=mc-bridge` is a synchronous compatibility contract.
  Sancho calls `/chat`, waits for a response, and completes the parent run itself.

The callback authority described below applies to the asynchronous `sancho`
protocol. `mc-bridge` has no callback boundary or runtime callback outbox.

## Protocol `sancho`: Sancho to runtime

Sancho sends each new chat turn to:

```text
POST {SANCHO_EXTERNAL_GATEWAY_URL}{SANCHO_EXTERNAL_INBOUND_PATH:-/sancho/inbound}
X-MC-Secret: {SANCHO_EXTERNAL_SECRET}
Content-Type: application/json
```

The normal turn payload includes the exact Mission Control run and a fresh
one-turn capability:

```json
{
  "slug": "client-slug",
  "threadId": "client-slug:general",
  "threadName": "client-slug:general",
  "missionControlRunId": "run_mc_123",
  "runtimeToolCapability": "64-lowercase-hex-characters",
  "runtimeTerminalCallbackGrant": "opaque-payload.signature",
  "runtimeTerminalCallbackGrantExpiresAt": "2026-07-23T12:00:00.000Z",
  "runtimeEffectIntent": ["leads_search_start"],
  "runtimeContract": {
    "schemaVersion": 1,
    "kind": "sancho.mc-chat-context",
    "instructions": "[MC Chat Context]\n...\n[/MC Chat Context]"
  },
  "text": "user message",
  "userId": "mc-admin",
  "userName": "Admin",
  "isAdmin": true,
  "senderRole": "admin",
  "controlDepth": 0,
  "readOnly": false
}
```

`missionControlRunId` identifies the persisted parent `AgentRun`.
`runtimeToolCapability` is an opaque bearer for that run, not a general API
token. Mission Control stores only its SHA-256 digest. The runtime must keep the
raw value out of model prompts, child-process environments, application logs,
and callback bodies; it is returned only in the callback header described
below. A durable callback outbox necessarily stores that header and must
therefore be private and encrypted or volume-protected at rest.

`runtimeTerminalCallbackGrant` is a second, webhook-only bearer bound to the
exact parent run, runtime, transport secret and capability. It is valid for at
most 25 hours and its authoritative expiry is
`runtimeTerminalCallbackGrantExpiresAt`. The runtime must never place it in a
model prompt, child-process environment, progress request, callback body or
log. It may exist only in bridge-private memory and in the private terminal
callback outbox. A normal async turn without this unexpired authority must be
rejected before starting model work, because its result could not be delivered
durably.

`runtimeEffectIntent`, when present, is the closed set of spend-bearing effects
the current authenticated human message authorized. The runtime contract only
describes effect markers from this set; an absent or empty set grants no effect.

`runtimeContract` is the server-authored portable agent contract for this turn.
An external runtime must validate `schemaVersion:1` and
`kind:"sancho.mc-chat-context"`, then apply `instructions` as system/developer
context above the human `text`. It must not concatenate the contract into the
user message, quote or echo it in the answer, label it as user-authored, or
persist it as human chat history. Sancho generates it from trusted routing and
authority fields; the runtime must not accept a user-supplied replacement.
Bundled bridges may construct the same shared contract locally instead of
receiving this portable object.

Optional routing and context fields include:

```json
{
  "agent": "dulcinea",
  "agentId": "dulcinea",
  "skill": "content-writer",
  "skills": ["content-writer", "seo-review"],
  "scope": "agent",
  "skillMode": "auto",
  "temporaryAgent": false,
  "linkedTo": "brand/acme/...",
  "docPath": "brand/acme/...",
  "docKind": "task",
  "attachments": [],
  "threadState": {}
}
```

The runtime acknowledges admission with a 2xx response and one runtime-local
identifier:

```json
{ "runId": "runtime-run-id" }
```

`chatId` or `id` are also accepted. This identifier is diagnostic only; it does
not replace `missionControlRunId` as callback authority. A non-2xx response
rejects dispatch and Mission Control marks the parent run failed.

## Cancellation

For a non-durable async turn, Mission Control sends cancellation through the
same inbound endpoint with the exact parent run id:

```json
{
  "slug": "client-slug",
  "threadId": "client-slug:general",
  "missionControlRunId": "run_mc_123",
  "text": "/stop",
  "userId": "mc-admin",
  "userName": "Admin",
  "isAdmin": true
}
```

The runtime must match both `threadId` and `missionControlRunId`; a stale stop
must not kill a newer run in the same thread. Its acknowledgement is:

```json
{ "ok": true, "cancelled": true }
```

Both fields are mandatory authority, not lookup hints. A missing or blank
`missionControlRunId` is rejected with HTTP 400. A nonempty stale id is
acknowledged with HTTP 200 and `cancelled:false`; only the exact id of the
currently active run may return `cancelled:true`. The same missing/stale/current
rules apply to both `/stop` through `/sancho/inbound` and the bundled bridges'
`POST /sancho/cancel` endpoint.

The bundled bridges also expose `POST /sancho/cancel` with `threadId` and
`missionControlRunId`, but generic `external-http` dispatches the `/stop`
message above. For tracked durable work, Mission Control installs the
execution-origin tombstone first, then terminalizes the parent `AgentRun`, and
still asks the runtime to stop if origin cancellation is temporarily
unavailable. A late callback for that parent is acknowledged with 2xx and
`cancelled:true`, but it cannot recreate a visible message.

If the parent admitted Leads or Partnerships work, Stop also requests
cancellation for the durable child execution through its registered execution
origin. A terminal child that races cancellation remains inspectable in the
ledger but is not projected back into the chat.

## Protocol `sancho`: runtime to Sancho

Every progress or terminal callback uses these three base authority headers:

```text
POST {SANCHO_BASE_URL}/api/chat/webhook
X-MC-Secret: {the same transport secret used for inbound admission}
X-Mission-Control-Run-Id: {missionControlRunId from inbound}
X-Sancho-Run-Capability: {runtimeToolCapability from inbound}
Content-Type: application/json
```

A terminal callback adds the inbound turn's terminal-only grant:

```text
X-Sancho-Terminal-Callback-Grant: {runtimeTerminalCallbackGrant from inbound}
```

Do not attach this fourth header to progress, context-pack or tool requests.
Mission Control requires it only for terminal delivery and rejects a missing,
expired or differently scoped grant.

The transport secret is checked against the digest captured when the run was
admitted, not against whichever runtime happens to be selected later. A runtime
switch or secret rotation therefore cannot authorize an unrelated run.

Final bot reply:

```json
{
  "slug": "client-slug",
  "threadId": "client-slug:general",
  "missionControlRunId": "run_mc_123",
  "agent": "sancho",
  "text": "final response"
}
```

Progress event:

```json
{
  "slug": "client-slug",
  "threadId": "client-slug:general",
  "missionControlRunId": "run_mc_123",
  "agent": "sancho",
  "role": "progress",
  "event": {
    "kind": "thinking",
    "label": "Leyendo contexto"
  }
}
```

Supported progress kinds are `thinking`, `tool_call`, `file_write`,
`agent_handoff`, `search`, and `read`.

Handoff event:

```json
{
  "slug": "client-slug",
  "threadId": "client-slug:general",
  "missionControlRunId": "run_mc_123",
  "role": "handoff",
  "agent": "sancho",
  "from_agent": "sancho",
  "to_agent": "dulcinea",
  "text": "Delegando contenido"
}
```

Mission Control first resolves the header run id and capability to one persisted
run. It then requires all of the following to match exactly:

- Body `missionControlRunId` equals `X-Mission-Control-Run-Id`.
- Body `slug` and `threadId` equal the canonical values persisted on that run.
- The capability matches the persisted digest and is valid for that run.
- `X-MC-Secret` matches the immutable transport binding captured at admission.
- For a terminal reply, `X-Sancho-Terminal-Callback-Grant` is unexpired and
  matches that same parent run, runtime, capability and transport binding.

Missing or invalid authority fails before chat mutation. A cross-run,
cross-thread, or cross-tenant body fails correlation. One parent accepts one
terminal callback: exact transport replay is idempotent and a later different
terminal result cannot create another chat message.

## Durable terminal callback outbox

An async runtime must persist the terminal callback before its first network
attempt. The bundled runtime outbox uses a stable callback id derived from the
runtime id and `missionControlRunId`, writes and fsyncs a private record through
an atomic rename, and replays it after bridge restarts until Mission Control
returns 2xx. Enqueueing the same terminal delivery reuses the existing record.

Terminal delivery is durable; progress delivery is best effort. The outbox must
live on a persistent volume, use a mode-`0700` directory and mode-`0600`
records, and never be copied into model-visible storage. Mission Control leases
one persisted terminal fingerprint per parent. A concurrent exact retry receives
retryable non-2xx so the runtime outbox retains its durable copy; an abandoned
lease can be reclaimed only by the same fingerprint. The winning terminal output
is persisted before chat projection, and an exact retry repairs a missing
projection idempotently after a crash.

The bundled outbox retains a terminal record for at most 24 hours. The server
grant lasts at most 25 hours from admission, reserving one hour for runtime
execution, startup/replay jitter and clock skew before the full outbox replay
window. Runtime watchdogs must stay within that budget. Every network error and
non-2xx response keeps the record for retry; when Mission Control returns
`Retry-After` (including a retryable terminal-claim lease response), the outbox
never schedules sooner than either that delay or its exponential backoff.

The storage path is bridge-private and stable across restarts. With
`SANCHO_CALLBACK_OUTBOX_DIR=/private/state/callbacks`, a bridge writes beneath
`/private/state/callbacks/<runtimeId>`. Without that setting, bundled bridges
derive `.runtime-callback-outbox/<runtimeId>` beside `MC_WORKSPACE` (or beneath
the configured private Sancho/OpenClaw home when no workspace is supplied),
never inside the model-visible workspace. The local connector anchors its
default at its installation state directory under
`callback-outbox/<runtimeId>`. Mount that exact private parent directory on a
persistent, access-controlled volume; do not use a temporary container layer.

## Runtime-neutral durable effects

OpenClaw can expose native tools, but any runtime that returns final text can
request the same bounded Leads or Partnerships operation with a closed envelope.
The marker is part of the final response and is never shown verbatim to the
user. For `external-http`, its instructions and eligibility rules arrive inside
the trusted `runtimeContract`, not inside the human message.

Leads:

```text
:::sancho-effect
{"name":"leads_search_start","arguments":{"criteria":{"query":"B2B SaaS founders in Madrid","titles":["Founder"],"seniorities":["founder"],"personLocations":["Madrid, Spain"]},"limit":10}}
:::
```

Partnerships:

```text
:::sancho-effect
{"name":"partnerships_discovery_start","arguments":{"plan":{"title":"Microcreadores de running en España","sectors":["running"],"networks":["instagram"],"hashtags":["#running"],"tiers":["micro"],"audienceEsMinPct":60,"targetVolume":25}}}
:::
```

The envelope has exactly two top-level fields, `name` and `arguments`. It must
not contain a tenant, run id, idempotency key, callback URL, credential, or
execution mode. The runtime must emit it only after the administrator explicitly
requested or confirmed that exact operation; it must not infer an external
effect from a generic approval, poll for completion, or claim that admission
succeeded.

Both LF and CRLF line endings are accepted. A route, delegation, or temporary
intervention wins over an effect across the entire root turn, including
multipart OpenClaw delivery; the losing effect is stripped and never admitted.

Mission Control exposes and accepts this protocol only for a root turn whose
persisted authority is exactly:

- `userId=mc-admin`, `isAdmin=true`, and `senderRole=admin`;
- `readOnly=false`;
- `controlDepth=0`;
- not a temporary-agent turn.

The server strips and parses the marker, derives tenant, thread, parent origin,
and credentials from the authenticated parent run, and admits the effect before
terminalizing that parent. Malformed, duplicate, or incompatible markers fail
closed. A routing/delegation/intervention marker takes precedence over an
external effect in the same reply.

There is at most one external operation per root `AgentRun`, across both
operation names. The PostgreSQL execution-origin claim is the final first-writer
authority: an exact replay returns the existing receipt, while changed arguments
or a cross-tool replay cannot create a second child or provider effect.

After admission, the server appends an authoritative success or replay ACK to
the visible bot response. The model does not see or invent that receipt. The
durable worker later projects exactly one terminal Leads or Partnerships result
into the same chat through the trusted parent origin; neither the runtime nor
the user has to poll.

## Protocol `mc-bridge`

Sancho sends:

```text
POST {SANCHO_EXTERNAL_GATEWAY_URL}{SANCHO_EXTERNAL_CHAT_PATH:-/chat}
Authorization: Bearer {SANCHO_EXTERNAL_SECRET}
X-MC-Secret: {SANCHO_EXTERNAL_SECRET}
Content-Type: application/json
```

```json
{
  "agent": "sancho-coordinator",
  "sessionKey": "sancho:client-slug:general",
  "message": "[MC Chat Context]...\n\nMensaje:\nuser message"
}
```

Expected response:

```json
{
  "response": "final assistant text",
  "sessionId": "bridge-session-id"
}
```

This compatibility request intentionally does not send the raw run capability
or expose the parent id to the model. Sancho retains both locally, parses any
eligible `:::sancho-effect` block from `response`, admits it while the parent is
active, stores the server-authored ACK, and then completes the parent run. The
`message` already contains the same server-authored MC Chat contract that the
async protocol carries structurally as `runtimeContract`; the bridge must treat
that section as system/developer instructions rather than human text. It must
not also post an asynchronous callback for this response.

Configure the bridge profile with:

```env
SANCHO_EXTERNAL_AGENT=sancho-coordinator
```

By default Sancho does not forward internal Sancho agent ids such as `dulcinea`
to a compatibility bridge. To forward the requested agent anyway:

```env
SANCHO_EXTERNAL_FORWARD_AGENT=1
```

## Health

Sancho checks:

```text
GET {SANCHO_EXTERNAL_GATEWAY_URL}{SANCHO_EXTERNAL_HEALTH_PATH:-/healthz}
```

For `mc-bridge`, the default health path is `/health`. Any 2xx status is healthy.

## Local smoke

Run the contract smokes after `npm run build`:

```bash
npm run smoke:runtime:external-http
npm run smoke:runtime:external-http:bridge
```

The default smoke starts a fake async runtime, sends one chat message through
`/api/chat/send`, posts the correlated bot reply through `/api/chat/webhook`,
and verifies the thread plus run ledger. The bridge smoke verifies the
synchronous `/chat` path. Their latest artifacts are written to:

```text
.context/external-http-smoke/latest.json
.context/external-http-bridge-smoke/latest.json
```

## Staging canary limitation

The existing `npm run staging:canary:preflight` is deliberately OpenClaw-only:
it requires `runtimeId=openclaw`, checks the OpenClaw version, and reads model
limits through OpenClaw control APIs. It is not a runtime-neutral attestation for
Hermes or another external runtime. Do not bypass `runtime_not_openclaw` or use
the current preflight as evidence that a Hermes Leads/Partnerships canary is
certified. A runtime-neutral replacement must attest the equivalent transport,
model-limit, credential, singleton, and deployment evidence first.

## Runtime mapping

Hermes, Codex CLI, Claude Code, or another harness can implement this same HTTP
shape. Runtime choice must not change callback authority, effect admission,
exact-once execution origins, or terminal projection semantics.

References: `SAN-50`, `SAN-123`, `SAN-431`.
