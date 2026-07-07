# External HTTP Runtime Contract

`external-http` is Sancho's generic adapter for a BYO runtime. Sancho keeps the
product state: brands, tasks, docs, chat threads, context packs, and run ledger.
The external runtime only has to accept a chat turn and return or post the final
answer.

For the higher-level adapter interface and conformance tests every runtime must
pass, see [Runtime Adapter Contract](./runtime-adapter-contract.md).

There are two supported protocols:

- `SANCHO_EXTERNAL_PROTOCOL=sancho` (default): async Sancho contract. The runtime
  receives `/sancho/inbound` and posts progress/final messages back to Sancho.
- `SANCHO_EXTERNAL_PROTOCOL=mc-bridge`: compatibility mode for the current
  Mission Control / Hermes bridge. Sancho calls `/chat`, waits for the response,
  and persists that response in the thread.

## Protocol `sancho`: Sancho -> Runtime

Sancho sends new chat turns to:

```text
POST {SANCHO_EXTERNAL_GATEWAY_URL}{SANCHO_EXTERNAL_INBOUND_PATH:-/sancho/inbound}
X-MC-Secret: {SANCHO_EXTERNAL_SECRET}
Content-Type: application/json
```

Minimum payload:

```json
{
  "slug": "client-slug",
  "threadId": "client-slug:general",
  "threadName": "client-slug:general",
  "text": "user message",
  "userId": "mc-admin",
  "userName": "Admin",
  "isAdmin": true,
  "senderRole": "admin"
}
```

Optional routing/context fields:

```json
{
  "agent": "dulcinea",
  "agentId": "dulcinea",
  "skill": "content-writer",
  "skills": ["content-writer", "seo-review"],
  "scope": "agent",
  "linkedTo": "brand/acme/...",
  "docPath": "brand/acme/...",
  "docKind": "task",
  "attachments": [],
  "threadState": {}
}
```

Expected runtime response:

```json
{ "runId": "runtime-run-id" }
```

`chatId` or `id` are also accepted. Sancho marks the run as dispatched when the
runtime responds with any 2xx status.

## Protocol `sancho`: Runtime -> Sancho

Final bot reply:

```text
POST {SANCHO_BASE_URL}/api/chat/webhook
X-MC-Secret: {SANCHO_EXTERNAL_SECRET}
Content-Type: application/json
```

```json
{
  "slug": "client-slug",
  "threadId": "client-slug:general",
  "agent": "sancho",
  "text": "final response"
}
```

Progress event:

```json
{
  "slug": "client-slug",
  "threadId": "client-slug:general",
  "agent": "sancho",
  "role": "progress",
  "event": {
    "kind": "thinking",
    "label": "Leyendo contexto"
  }
}
```

Supported progress kinds: `thinking`, `tool_call`, `file_write`, `agent_handoff`,
`search`, `read`.

Handoff event:

```json
{
  "slug": "client-slug",
  "threadId": "client-slug:general",
  "role": "handoff",
  "agent": "sancho",
  "from_agent": "sancho",
  "to_agent": "dulcinea",
  "text": "Delegando contenido"
}
```

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
  "message": "Contexto Sancho:\n- Cliente: client-slug\n...\n\nMensaje:\nuser message"
}
```

Expected response:

```json
{
  "response": "final assistant text",
  "sessionId": "bridge-session-id"
}
```

Sancho then stores `response` as the bot reply and completes the run ledger
entry. Configure the bridge profile with:

```env
SANCHO_EXTERNAL_AGENT=sancho-coordinator
```

By default Sancho does not forward internal Sancho agent ids such as `dulcinea`
to the bridge, because an existing bridge may not have matching profiles. To
forward the requested Sancho agent anyway:

```env
SANCHO_EXTERNAL_FORWARD_AGENT=1
```

## Health

Sancho checks:

```text
GET {SANCHO_EXTERNAL_GATEWAY_URL}{SANCHO_EXTERNAL_HEALTH_PATH:-/healthz}
```

For `mc-bridge`, the default health path is `/health`.

Any 2xx status is considered healthy.

## Local Smoke

Run the contract smoke after `npm run build`:

```bash
npm run smoke:runtime:external-http
npm run smoke:runtime:external-http:bridge
```

The default smoke starts a fake external runtime, starts Sancho with
`SANCHO_RUNTIME=external-http`, sends one chat message through `/api/chat/send`,
posts a bot reply through `/api/chat/webhook`, and verifies the thread plus run
ledger were persisted. The bridge smoke uses a fake `/chat` endpoint and verifies
the synchronous reply path. They write their latest artifacts to:

```text
.context/external-http-smoke/latest.json
.context/external-http-bridge-smoke/latest.json
```

## Runtime Mapping

Runtime engines such as Hermes, Codex CLI, Claude Code, or another harness should
be exposed to Sancho through this same HTTP shape. Sancho should not need a
separate product build per runtime.

For native bridge spikes that implement this contract with CLI runtimes, see:

- [Claude Code Runtime Bridge](./runbooks/claude-code-runtime-bridge.md)
- [Codex Runtime Bridge](./runbooks/codex-runtime-bridge.md)
