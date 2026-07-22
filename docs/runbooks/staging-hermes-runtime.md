# Staging Hermes Runtime Runbook

This runbook brings up a parallel `staging-hermes` Sancho environment without replacing the current OpenClaw staging.

## Scope

- Target Linear issues: `SAN-53` (`staging-hermes`) and `SAN-55` (core flow validation).
- Runtime contract hardening: `SAN-50`, `SAN-123`, and `SAN-431`.
- Keep OpenClaw staging/prod untouched.
- Keep Discord/crons off until web chat is stable.
- Runtime switch is reversible by changing `SANCHO_RUNTIME`.

## Required `.env`

Start from `.env.example` and set the normal Mission Control values for the new hostname:

```env
BASE_URL=https://staging-hermes.sanchocmo.ai
NEXTAUTH_URL=https://staging-hermes.sanchocmo.ai
NEXT_PUBLIC_ENV_LABEL=STAGING-HERMES
SANCHO_RUNTIME=hermes
INSTALL_HERMES=1
HERMES_AGENT_REF=v2026.7.7.2
SANCHOCMO_MC_PORT=13000
SANCHOCMO_GATEWAY_PORT=18793
SANCHOCMO_LEGACY_PORT=18794

HERMES_BRIDGE_ENABLED=1
HERMES_BRIDGE_PORT=18795
HERMES_CHAT_SECRET=<openssl-rand-hex-32>
HERMES_CLI=hermes
HERMES_CLI_PROVIDER=anthropic
HERMES_CLI_MODEL=claude-sonnet-4-6
HERMES_CLI_TOOLSETS=web,vision

ANTHROPIC_API_KEY=<anthropic-key>
```

The bundled bridge does not use the project workspace as the Hermes working
directory. Every turn runs in an opaque tenant/thread directory beneath the
process temporary root. `HOME`, `HERMES_HOME`, the XDG config path and temp
variables all point into that isolated directory. This is process working-dir
and configuration isolation, not a separate filesystem namespace: the container
can still have `MC_WORKSPACE` mounted. With the required `web,vision` toolset,
Hermes has no file or terminal tool with which to browse that mount. Project
grounding must come from the bounded Sancho context pack rather than direct
workspace reads.

The child inherits only OS/proxy/certificate plumbing, the credential selected
for `HERMES_CLI_PROVIDER`, and bounded Sancho routing metadata. Application
secrets such as `DATABASE_URL`, `NEXTAUTH_SECRET`, and `MC_CHAT_SECRET` are not
inherited. To preserve an existing `hermes auth` login, only `auth.json` and
`.anthropic_oauth.json` are copied from `~/.hermes` into the isolated turn home
with mode `0600`; host rules, hooks, memories, sessions and plugins are never
copied. Set `HERMES_AUTH_SOURCE_DIR` only for a custom credential-store path.

`web,vision` is the default and expected staging toolset. It does not grant
filesystem, terminal, messaging, MCP, cron, or browser-control access. Unsafe
toolsets are rejected unless a primary turn has the explicit
`HERMES_UNSAFE_ALLOW_DANGEROUS_TOOLSETS=1` escape hatch; do not enable it in
normal staging. Enabling file or terminal tooling may expose the container
filesystem, including existing bind mounts, so it invalidates this staging
isolation claim. Read-only, control-depth and temporary turns remain pinned to
`web,vision` regardless.

## Run authority and callback delivery

For a normal turn, Mission Control sends the bridge both
`missionControlRunId` and a fresh 64-hex `runtimeToolCapability` in the inbound
JSON. The raw capability must stay in bridge memory and out of the Hermes
prompt, child environment, and logs. Mission Control persists only its digest.

Generic async `external-http` also receives
`runtimeContract:{schemaVersion:1,kind:"sancho.mc-chat-context",instructions}`
and must apply `instructions` as system/developer context above the human
message. It must never echo it or persist it as user-authored text. The bundled
Hermes bridge builds the same shared MC Chat contract locally inside its prompt;
that is an equivalent trusted path and does not expose the raw capability to the
model.

Every progress and terminal callback returns:

```text
X-MC-Secret: <the transport secret bound at admission>
X-Mission-Control-Run-Id: <missionControlRunId>
X-Sancho-Run-Capability: <runtimeToolCapability>
```

The effective inbound bridge secret is also the callback/context-pack secret.
Do not configure a divergent `HERMES_SANCHO_SECRET`; it is not a second trust
domain and cannot match the immutable transport digest stored on the parent run.

The callback body also carries `missionControlRunId`, `slug`, and `threadId`.
Mission Control requires the body run id to equal the header run id and requires
the body tenant/thread to equal the canonical values persisted on that exact
run. A runtime switch cannot redirect an old callback: transport auth is checked
against the secret digest captured at admission, not the runtime selected now.

Terminal callbacks are written atomically before their first network attempt to
`$SANCHO_HOME/.runtime-callback-outbox/hermes` (or the equivalent private root
beside, never inside, `$MC_WORKSPACE`). Their stable delivery identity is
derived from the Hermes runtime id plus `missionControlRunId`; enqueue replay
reuses the same record. Records are replayed after bridge restarts until Mission
Control returns 2xx. Progress callbacks remain best effort. Keep the outbox on a
persistent private volume; use `SANCHO_CALLBACK_OUTBOX_DIR` only to select
another persistent root outside every model-visible workspace.

## Cancellation

For a turn with durable child authority, the Mission Control Stop action first
installs the execution-origin tombstone, then terminalizes the exact parent
`AgentRun`, and finally sends `text: "/stop"` through `/sancho/inbound` with its
`threadId` and `missionControlRunId`. Origin failure is reported as pending but
does not suppress the runtime stop. The bridge also accepts the equivalent direct
`POST /sancho/cancel` body. A stale run id must return `cancelled:false` and must
not stop a newer execution in the same thread.

For a pending Hermes start, cancellation aborts credential staging, waits for
every in-flight filesystem operation to settle, removes the isolated workdir,
and only then responds `cancelled:true`. After that acknowledgement no delayed
`mkdir` or `spawn` can recreate the execution. For an existing child, the bridge
sends `SIGTERM` and schedules `SIGKILL` after one second. Any late terminal
callback is acknowledged but discarded by Mission Control's cancellation
tombstone.

If a completed root turn has admitted a durable Leads or Partnerships child,
Stop follows its persisted execution origin and requests cancellation there as
well. A child result that races the tombstone is retained in the ledger but is
not published to the chat.

## Runtime-neutral Leads and Partnerships

Hermes does not need an OpenClaw process-local tool to start either supported
durable operation. On an eligible turn it receives a closed text protocol and
may emit one final-response envelope:

```text
:::sancho-effect
{"name":"leads_search_start","arguments":{"criteria":{"query":"B2B founders in Madrid"},"limit":10}}
:::
```

or:

```text
:::sancho-effect
{"name":"partnerships_discovery_start","arguments":{"plan":{"title":"Running creators Spain","sectors":["running"],"networks":["instagram"],"tiers":["micro"],"audienceEsMinPct":60,"targetVolume":25}}}
:::
```

Mission Control exposes and accepts the envelope only when persisted root
authority is `userId=mc-admin`, `isAdmin=true`, `senderRole=admin`,
`readOnly=false`, `controlDepth=0`, and the turn is not temporary. The model may
supply only the bounded operation arguments. Tenant, parent run, credentials,
callback, idempotency, and execution mode are derived server-side.

Only one external operation can win per root turn across Leads and
Partnerships. The server strips the marker, admits or replays the durable child,
and appends its own authoritative ACK to the visible Hermes reply before
terminalizing the parent. The worker later publishes exactly one result into
the same chat; Hermes must not poll or claim admission itself. Malformed,
duplicate, cross-tool, or routing-plus-effect replies fail closed without a
second provider effect. See `docs/runtime-external-http-contract.md` for the
full schema and correlation rules.

The marker parser accepts either LF or CRLF output. A route, delegation, or
temporary intervention wins over an effect even when OpenClaw delivers the two
markers in different response parts; Mission Control never executes both intents
from one root turn.

Port `18791` is reserved by OpenClaw browser control inside the Sancho container; do not reuse it for Hermes.

Generate the shared secret on the VPS:

```bash
openssl rand -hex 32
```

If Hermes already exposes a compatible HTTP gateway, prefer the generic external
runtime path instead of the bundled bridge:

```env
SANCHO_RUNTIME=external-http
SANCHO_EXTERNAL_GATEWAY_URL=https://hermes.example.com
SANCHO_EXTERNAL_SECRET=<shared-secret>
```

If the target is the existing Mission Control bridge (`POST /chat`), set the
compatibility protocol instead of asking the bridge to implement Sancho's async
contract on day one:

```env
SANCHO_RUNTIME=external-http
SANCHO_EXTERNAL_PROTOCOL=mc-bridge
SANCHO_EXTERNAL_GATEWAY_URL=https://mission-control.example.com/bridge
SANCHO_EXTERNAL_CHAT_PATH=/chat
SANCHO_EXTERNAL_HEALTH_PATH=/health
SANCHO_EXTERNAL_AGENT=sancho-coordinator
SANCHO_EXTERNAL_SECRET=<bridge-token-if-required>
```

The legacy `HERMES_GATEWAY_URL` / `hermes` path still works for managed Hermes
validation, but `external-http` is the product-facing BYO contract for Hermes,
Codex CLI, Claude Code, or another compatible runtime.

## Deploy

```bash
cd ~/.openclaw-hermes
git fetch origin
git checkout <branch-with-runtime-decoupling>
git pull --ff-only

docker compose -f docker-compose.yml -f docker-compose.hermes.yml build sanchocmo
docker compose -f docker-compose.yml -f docker-compose.hermes.yml up -d sanchocmo
docker compose -f docker-compose.yml -f docker-compose.hermes.yml logs -f sanchocmo
```

Official Sancho images include the pinned Hermes CLI. Set `INSTALL_HERMES=0`
only when intentionally building a custom OpenClaw-only image from source.

The container healthcheck is runtime-aware:

- OpenClaw checks `http://localhost:18789/healthz`.
- Hermes checks `http://localhost:3000/api/health`.
- If `HERMES_BRIDGE_ENABLED=1`, Hermes also checks `http://localhost:18795/healthz`.

Verify:

```bash
docker inspect --format='{{.State.Health.Status}}' sanchocmo-hermes
curl -sf https://staging-hermes.sanchocmo.ai/api/health
docker compose -f docker-compose.yml -f docker-compose.hermes.yml exec sanchocmo curl -sf http://127.0.0.1:18795/healthz
```

## Smoke Test

> **Current canary preflight limitation:**
> `npm run staging:canary:preflight` is still OpenClaw-only. It rejects any
> other runtime with `runtime_not_openclaw`, checks the OpenClaw CLI version,
> and obtains model-limit evidence through OpenClaw control APIs. Do not bypass
> that guard and do not treat this runbook's Hermes smoke as an attestation for
> a live Leads or Partnerships canary. That requires a runtime-neutral
> attestation covering equivalent transport, model-limit, credential,
> singleton, migration, and deployment evidence.

Before touching a real Hermes gateway, validate the Sancho side of the contract
locally:

```bash
npm run build
npm run smoke:runtime:external-http
SMOKE_HERMES_PROVIDER=anthropic \
  SMOKE_HERMES_MODEL=claude-sonnet-4-6 \
  npm run smoke:runtime:hermes
```

The first smoke uses a fake runtime and writes the latest result to
`.context/external-http-smoke/latest.json`. The Hermes smoke uses the real CLI
and writes its result to `.context/cli-runtime-smoke/hermes/latest.json`; it
requires the matching provider credential in the environment or Hermes auth
store.

1. Log in to Mission Control on `https://staging-hermes.sanchocmo.ai`.
2. Go to `Ajustes -> Runtime`.
3. Confirm Hermes appears configured and active. If it is configured but inactive, select Hermes.
4. Open a test client chat and send:

```text
Responde exactamente: hermes-staging-ok
```

Success means:

- The UI shows the user message.
- Hermes replies `hermes-staging-ok`.
- `/api/chat/webhook` accepts the exact run/capability headers and matching body
  correlation, then stores one bot message.
- `docker compose logs sanchocmo` shows no bridge or webhook rejection.

Repeat with a deliberately slow turn and press Stop. Success means the bridge
reports `cancelled:true` only after pending preparation has drained, no late
Hermes process or workdir appears, and no late callback recreates a bot message. Restart the
bridge with one terminal callback intentionally unable to reach Mission Control;
after connectivity returns, the same outbox record must deliver exactly one
visible response.

## Core Flow Checklist

Use this to close the Hermes end-to-end validation tracked in `SAN-123`:

- Mission Control web chat: one real turn through Hermes.
- Context pack: the bridge requests `/api/chat/context-pack` without auth failure.
- Agent contract: the shared MC Chat instructions are applied as trusted
  system/developer context and never echoed or persisted as human text.
- Isolation: the Hermes child uses the hashed temporary workdir for cwd, home,
  config and temp; do not describe this as an OS filesystem sandbox.
- Project grounding: the bounded context pack supplies project knowledge; no
  test should require direct Foundation/project file access.
- Toolsets: the child receives `web,vision`; no filesystem, terminal, messaging,
  MCP, cron, or browser-control toolset appears. If file or terminal tooling is
  enabled, the workspace isolation check fails.
- Correlation: callback header run id/capability and body run/tenant/thread bind
  to exactly one persisted parent.
- Outbox: a terminal delivery survives bridge restart and appears only once.
- Cancellation: Stop targets the exact run; no delayed startup or late callback
  recreates it.
- Durable envelope: on an eligible isolated test, the marker is hidden, the
  ACK is server-authored, one child is admitted, and its single terminal result
  appears in the same chat. This verifies behavior, not canary attestation.
- Error handling: bad Hermes secret or timeout gives a visible chat error, not a stuck run.
- Runtime switch UI: OpenClaw and Hermes cards render with correct configured/active state.

## Rollback

To return the environment to OpenClaw:

```bash
cd ~/.openclaw-hermes
cp .env .env.before-hermes-rollback
sed -i 's/^SANCHO_RUNTIME=.*/SANCHO_RUNTIME=openclaw/' .env
docker compose -f docker-compose.yml -f docker-compose.hermes.yml up -d --force-recreate sanchocmo
docker compose -f docker-compose.yml -f docker-compose.hermes.yml logs -f sanchocmo
```

Then verify:

```bash
docker inspect --format='{{.State.Health.Status}}' sanchocmo-hermes
docker compose -f docker-compose.yml -f docker-compose.hermes.yml exec sanchocmo curl -sf http://127.0.0.1:18789/healthz
```

Do not delete Hermes variables during rollback; leaving them in `.env` makes it easy to switch back after the issue is fixed.

## Known Remaining Work

- `SAN-122`: finish the physical split of `plugins/mc-chat` into a neutral agent contract plus OpenClaw-specific glue.
- `SAN-431`: certify the runtime-neutral Partnerships flow only after an
  equivalent runtime-neutral canary attestation exists.
- Linear follow-up `Runtime-neutral canary attestation and deploy parity guard`:
  replace the OpenClaw-only staging preflight before certifying Hermes or
  another external runtime for live Leads/Partnerships canaries.
- `SAN-52`: run `hermes claw migrate --dry-run` against a sanitized staging bundle.
- `SAN-56`: port Discord bindings later, after web chat and core flows are stable.
