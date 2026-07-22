# Staging Hermes Runtime Runbook

This runbook brings up a parallel `staging-hermes` Sancho environment without replacing the current OpenClaw staging.

## Scope

- Target Linear issues: `SAN-53` (`staging-hermes`) and `SAN-55` (core flow validation).
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

The bundled bridge ignores host project workdirs and starts each turn in an
opaque tenant/thread directory beneath the OS temporary directory. It passes
only OS/proxy/certificate variables, the credential for `HERMES_CLI_PROVIDER`,
and bounded Sancho routing metadata to the Hermes child process. Application
secrets such as `DATABASE_URL`, `NEXTAUTH_SECRET`, and `MC_CHAT_SECRET` are not
inherited. To preserve an existing `hermes auth` login, only `auth.json` and
`.anthropic_oauth.json` are copied from `~/.hermes` into the isolated turn home
with mode `0600`; host rules, hooks, memories, sessions and plugins are never
copied. Set `HERMES_AUTH_SOURCE_DIR` only for a custom credential-store path.

`web,vision` is the default toolset allowlist. Unsafe toolsets are rejected by
default; `HERMES_UNSAFE_ALLOW_DANGEROUS_TOOLSETS=1` is an explicit escape hatch
for primary turns only and must not be enabled in normal deployments. Read-only,
control-depth and temporary turns remain pinned to `web,vision` regardless.

Terminal callbacks are written atomically to
`$SANCHO_HOME/workspace-sancho/_system/runtime-callback-outbox/hermes` before
delivery and replayed after bridge restarts until Mission Control returns 2xx.
Use `SANCHO_CALLBACK_OUTBOX_DIR` only when the default Sancho home is not on a
persistent volume.

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
- `/api/chat/webhook` stores the bot message.
- `docker compose logs sanchocmo` shows no bridge or webhook rejection.

## Core Flow Checklist

Use this to close `SAN-55`:

- Mission Control web chat: one real turn through Hermes.
- Context pack: the bridge requests `/api/chat/context-pack` without auth failure.
- Workspace read/write: the agent can read and write under `workspace-sancho`.
- Foundation/project file access: existing project context is visible.
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
- `SAN-52`: run `hermes claw migrate --dry-run` against a sanitized staging bundle.
- `SAN-56`: port Discord bindings later, after web chat and core flows are stable.
