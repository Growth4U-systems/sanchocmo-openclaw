import { test } from "node:test";
import assert from "node:assert/strict";
import cliRuntimeBridge from "@/lib/cli-runtime-bridge";

const {
  buildCliBridgeCommand,
  defaultGatewayUrl,
  externalRuntimeVarsForCliBridge,
  gatewayListenHost,
  gatewayPortOrDefault,
} = cliRuntimeBridge;

test("externalRuntimeVarsForCliBridge stores Sancho HTTP defaults for Claude Code", () => {
  assert.deepEqual(
    externalRuntimeVarsForCliBridge("claude-code", "http://127.0.0.1:18792/", "secret"),
    {
      SANCHO_EXTERNAL_RUNTIME_KIND: "claude-code",
      SANCHO_EXTERNAL_PROTOCOL: "sancho",
      SANCHO_EXTERNAL_GATEWAY_URL: "http://127.0.0.1:18792",
      SANCHO_EXTERNAL_SECRET: "secret",
      SANCHO_EXTERNAL_INBOUND_PATH: "/sancho/inbound",
      SANCHO_EXTERNAL_HEALTH_PATH: "/healthz",
    },
  );
});

test("buildCliBridgeCommand emits a single runnable Claude Code command", () => {
  const command = buildCliBridgeCommand("claude-code", {
    sanchoBaseUrl: "https://sancho.example.com/",
    secret: "shared secret",
  });

  assert.match(command, /SANCHO_BASE_URL=https:\/\/sancho\.example\.com/);
  assert.match(command, /SANCHO_WEBHOOK_URL=https:\/\/sancho\.example\.com\/api\/chat\/webhook/);
  assert.match(command, /CLAUDE_CODE_BRIDGE_PORT=18792/);
  assert.match(command, /CLAUDE_CODE_BRIDGE_SECRET='shared secret'/);
  assert.match(command, /CLAUDE_CODE_RUNTIME_MODEL=haiku/);
  assert.match(command, /CLAUDE_CODE_SANCHO_MCP_ENABLED=0/);
  assert.match(command, /node docker\/runtimes\/claude-code\/bridge\.mjs$/);
});

test("buildCliBridgeCommand emits Codex bridge command without MCP flags", () => {
  const command = buildCliBridgeCommand("codex", {
    sanchoBaseUrl: "http://localhost:3000",
    secret: "secret",
  });

  assert.equal(defaultGatewayUrl("codex"), "http://127.0.0.1:18793");
  assert.match(command, /CODEX_BRIDGE_PORT=18793/);
  assert.match(command, /CODEX_BRIDGE_SECRET=secret/);
  assert.doesNotMatch(command, /MCP_ENABLED/);
  assert.match(command, /node docker\/runtimes\/codex\/bridge\.mjs$/);
});

test("gateway helpers derive listen settings from the saved bridge URL", () => {
  assert.equal(gatewayPortOrDefault("claude-code", "http://127.0.0.1:19999"), 19999);
  assert.equal(gatewayPortOrDefault("codex", "https://codex-bridge.example.com"), 18793);
  assert.equal(gatewayListenHost("http://127.0.0.1:18792"), "127.0.0.1");
  assert.equal(gatewayListenHost("http://10.0.0.5:18792"), "0.0.0.0");
});
