# Codex Runtime Bridge

This is the first Codex CLI runtime spike for Sancho's runtime-agnostic path.
It mirrors the Claude Code and Hermes bridge shape: Sancho dispatches a turn,
the bridge fetches Sancho context directly, runs the CLI runtime, and posts the
final answer back to Sancho.

```text
Sancho
  -> SANCHO_RUNTIME=external-http
  -> docker/runtimes/codex/bridge.mjs
  -> /api/chat/context-pack
  -> codex exec
  -> /api/chat/webhook
```

## Sancho configuration

Point Sancho at the bridge:

```env
SANCHO_RUNTIME=external-http
SANCHO_EXTERNAL_PROTOCOL=sancho
SANCHO_EXTERNAL_GATEWAY_URL=http://127.0.0.1:18793
SANCHO_EXTERNAL_SECRET=<shared-runtime-secret>
SANCHO_EXTERNAL_INBOUND_PATH=/sancho/inbound
SANCHO_EXTERNAL_HEALTH_PATH=/healthz
```

## Bridge configuration

Run the bridge on the same host or any host reachable by Sancho:

```env
CODEX_BRIDGE_HOST=127.0.0.1
CODEX_BRIDGE_PORT=18793
CODEX_BRIDGE_SECRET=<shared-runtime-secret>

SANCHO_BASE_URL=http://127.0.0.1:3000
CODEX_CONTEXT_PACK_URL=http://127.0.0.1:3000/api/chat/context-pack

# Optional runtime controls
CODEX_RUNTIME_MODEL=gpt-5.1-codex
CODEX_RUNTIME_TIMEOUT_MS=900000
CODEX_RUNTIME_SANDBOX=read-only
```

Start it:

```bash
node docker/runtimes/codex/bridge.mjs
```

The bridge invokes:

```bash
codex exec -s read-only --ephemeral --skip-git-repo-check --ignore-user-config
```

The local CLI version used for this spike is `codex-cli 0.142.5`.
The bridge ignores user config by default so runtime calls do not inherit local
MCP servers or project settings. Set `CODEX_RUNTIME_IGNORE_USER_CONFIG=0` only
when the runtime host intentionally needs its Codex user config.

## Smoke test

After `npm run build`, validate the full Sancho -> external-http -> Codex bridge
-> Sancho webhook path with:

```bash
npm run smoke:runtime:codex
```

The smoke writes only under `.context/cli-runtime-smoke/codex/` and checks that
Sancho stores a bot reply plus an `external-http` completed run.

## Native context

By default the bridge calls:

```text
POST {SANCHO_BASE_URL}/api/chat/context-pack
X-MC-Secret: {CODEX_SANCHO_SECRET | CODEX_BRIDGE_SECRET | SANCHO_EXTERNAL_SECRET}
```

Disable it with:

```env
CODEX_CONTEXT_PACK_ENABLED=0
```

## Limitations of this spike

- One active Codex process per Sancho thread.
- Cancellation is best-effort process termination.
- No durable queue or retry loop.
- No streaming token support yet; final output is posted to Sancho webhook.
- No session resume strategy yet.
- Tool/API access for Codex should be handled by the later unified API/MCP plan,
  not by hardcoding Sancho product calls into this bridge.
