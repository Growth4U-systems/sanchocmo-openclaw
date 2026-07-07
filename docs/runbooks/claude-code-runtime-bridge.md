# Claude Code Runtime Bridge

This is the first Claude Code runtime spike for Sancho's runtime-agnostic path.
It is not the same as a person opening Claude Code and connecting to Sancho MCP.
That MCP-only flow is an operator control plane. This bridge makes Claude Code
look like a Sancho runtime through the existing `external-http` adapter.

```text
Sancho
  -> SANCHO_RUNTIME=external-http
  -> docker/runtimes/claude-code/bridge.mjs
  -> claude -p
  -> /api/chat/webhook
```

The native bridge path does not require MCP. It mirrors the Hermes bridge shape:
Sancho dispatches a turn, the bridge fetches Sancho context directly, invokes the
runtime, and posts the final answer back to Sancho. MCP can be enabled as an
extra tool plane when Claude Code needs live Sancho operations during the turn.

## Sancho configuration

Point Sancho at the bridge:

```env
SANCHO_RUNTIME=external-http
SANCHO_EXTERNAL_PROTOCOL=sancho
SANCHO_EXTERNAL_GATEWAY_URL=http://127.0.0.1:18792
SANCHO_EXTERNAL_SECRET=<shared-runtime-secret>
SANCHO_EXTERNAL_INBOUND_PATH=/sancho/inbound
SANCHO_EXTERNAL_HEALTH_PATH=/healthz
```

## Bridge configuration

Run the bridge on the same host or any host reachable by Sancho:

```env
CLAUDE_CODE_BRIDGE_HOST=127.0.0.1
CLAUDE_CODE_BRIDGE_PORT=18792
CLAUDE_CODE_BRIDGE_SECRET=<shared-runtime-secret>

SANCHO_BASE_URL=http://127.0.0.1:3000
CLAUDE_CODE_CONTEXT_PACK_URL=http://127.0.0.1:3000/api/chat/context-pack

# Optional runtime controls
CLAUDE_CODE_RUNTIME_MODEL=sonnet
CLAUDE_CODE_RUNTIME_TIMEOUT_MS=900000
CLAUDE_CODE_RUNTIME_TOOLS=
```

Start it:

```bash
node docker/runtimes/claude-code/bridge.mjs
```

`CLAUDE_CODE_RUNTIME_TOOLS` defaults to an empty string, which disables Claude
Code built-in tools. Set it to `default` or a comma-separated tool list if this
runtime must use Claude Code built-ins.

## Claude Code auth

The bridge invokes:

```bash
claude -p "<prompt>" --output-format json --no-session-persistence
```

Use the normal Claude Code host authentication for the first spike, such as
`claude setup-token`, `CLAUDE_CODE_OAUTH_TOKEN`, or `ANTHROPIC_API_KEY`.

The bridge intentionally sticks to CLI flags supported by the local Claude Code
2.1.3 install used for this spike. Newer flags such as `--bare` or
`--max-turns` can be evaluated later after pinning the Claude Code version used
by the runtime host.

## Native context

By default the bridge calls:

```text
POST {SANCHO_BASE_URL}/api/chat/context-pack
X-MC-Secret: {CLAUDE_CODE_SANCHO_SECRET | CLAUDE_CODE_BRIDGE_SECRET | SANCHO_EXTERNAL_SECRET}
```

That gives Claude Code the same native Sancho grounding pattern as the Hermes
bridge. Disable it with:

```env
CLAUDE_CODE_CONTEXT_PACK_ENABLED=0
```

## Optional MCP behavior

MCP is optional. Enable it only when the Claude Code runtime needs live Sancho
tools during the turn:

```env
CLAUDE_CODE_SANCHO_MCP_ENABLED=1
CLAUDE_CODE_SANCHO_MCP_URL=http://127.0.0.1:3000/api/mcp/sancho
CLAUDE_CODE_SANCHO_MCP_TOKEN=<sancho-mcp-token>
```

When enabled, the bridge passes an inline MCP config to Claude Code:

```json
{
  "mcpServers": {
    "sancho": {
      "type": "http",
      "url": "http://127.0.0.1:3000/api/mcp/sancho",
      "headers": {
        "Authorization": "Bearer <sancho-mcp-token>"
      }
    }
  }
}
```

The bridge also passes:

```bash
--strict-mcp-config --allowedTools "mcp__sancho__*"
```

Set `CLAUDE_CODE_RUNTIME_STRICT_MCP=0` or
`CLAUDE_CODE_RUNTIME_ALLOWED_TOOLS=...` to override that during experiments.

## Limitations of this spike

- One active Claude Code process per Sancho thread.
- Cancellation is best-effort process termination.
- No durable queue or retry loop.
- No streaming token support yet; final output is posted to Sancho webhook.
- No session resume strategy yet.
- MCP scope design only matters if optional MCP tools are enabled.

Those are daemon concerns. The purpose of this spike is only to prove that
Claude Code can be one interchangeable runtime behind `external-http`.
