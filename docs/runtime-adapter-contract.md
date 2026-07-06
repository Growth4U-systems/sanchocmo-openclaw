# Runtime Adapter Contract

Sancho must talk to runtimes through `src/lib/runtime`, not by importing
OpenClaw, Hermes, a CLI, or a gateway from product/API code.

The contract is intentionally small:

- `messaging.sendInbound(message, opts)` dispatches one chat turn.
- `messaging.cancel(threadId, opts)` asks the active runtime to stop a turn.
- `state.*` resolves runtime-owned files without leaking runtime-specific paths.
- `control.*` exposes runtime configuration/control when the runtime supports it.
- `lifecycle.healthcheck()` reports whether that runtime is reachable.
- `lifecycle.restart()` restarts or returns a clear unsupported error/result.

## Current runtime ids

- `openclaw`: current full runtime and fallback.
- `hermes`: managed Hermes runtime.
- `external-http`: generic BYO runtime over HTTP.
- `fake`: test-only runtime, accepted only when `NODE_ENV=test`.

`fake` exists to prove Sancho can dispatch through the runtime boundary without
OpenClaw, Hermes, or any external HTTP server.

## Adding a Runtime

1. Add an adapter under `src/lib/runtime/adapters/<id>/`.
2. Implement the full `RuntimeAdapter` interface from `src/lib/runtime/types.ts`.
3. Add the id to `src/lib/runtime/config.ts` and metadata to `RUNTIME_OPTIONS`
   if it should appear in the admin runtime selector.
4. Add a case in `createRuntimeAdapter()` in `src/lib/runtime/index.ts`.
5. Add the adapter to `src/lib/__tests__/runtime-conformance.test.mts`.
6. Run:

```bash
npm run test:runtime
npm run typecheck
```

For HTTP-compatible runtimes, prefer `external-http` first. A new product adapter
is only needed when Sancho must understand runtime-specific state, lifecycle, or
control APIs.

## Boundary Rule

Chat APIs that dispatch or cancel runtime work should use `getRuntime()`.

Allowed:

```ts
const runtime = getRuntime();
await runtime.messaging.sendInbound(message);
await runtime.messaging.cancel(threadId, { slug, agent });
```

Not allowed in runtime-routed chat APIs:

```ts
getGatewayUrl();
getChatSecret();
fetch(`${gateway}/mc-chat/inbound`, ...);
```

The boundary is enforced for `src/pages/api/chat/send.ts` and
`src/pages/api/chat/cancel.ts` by `runtime-boundaries.test.mts`.

## Definition of Ready

A runtime is ready to plug into Sancho when:

- it can be selected through `SANCHO_RUNTIME` or the admin runtime selector,
- it passes the conformance suite,
- it returns clear unsupported errors for capabilities it does not implement,
- it does not require Sancho chat APIs to import runtime-specific modules,
- and it documents any required env vars or HTTP endpoints.
