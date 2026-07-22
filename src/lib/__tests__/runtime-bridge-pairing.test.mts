import { test } from "node:test";
import assert from "node:assert/strict";
import cliRuntimeBridge from "@/lib/cli-runtime-bridge";

const {
  buildCliBridgeCommand,
  buildCliBridgeEnv,
  buildManagedCliBridgeProcessEnv,
  cliBridgeProvider,
  defaultGatewayUrl,
  externalRuntimeVarsForCliBridge,
  gatewayListenHost,
  gatewayPortOrDefault,
  managedBridgeBootVarsForCliBridge,
  resolveServerCliAvailability,
} = cliRuntimeBridge;

test("externalRuntimeVarsForCliBridge stores Sancho HTTP defaults for Hermes", () => {
  assert.deepEqual(
    externalRuntimeVarsForCliBridge("hermes", "http://127.0.0.1:18795/", "secret"),
    {
      SANCHO_EXTERNAL_RUNTIME_KIND: "hermes",
      SANCHO_EXTERNAL_PROTOCOL: "sancho",
      SANCHO_EXTERNAL_GATEWAY_URL: "http://127.0.0.1:18795",
      SANCHO_EXTERNAL_SECRET: "secret",
      SANCHO_EXTERNAL_INBOUND_PATH: "/sancho/inbound",
      SANCHO_EXTERNAL_HEALTH_PATH: "/healthz",
    },
  );
});

test("a verified managed Hermes bridge persists its restart contract", () => {
  assert.deepEqual(
    managedBridgeBootVarsForCliBridge(
      "hermes",
      "http://127.0.0.1:19998",
      "secret",
    ),
    {
      SANCHO_RUNTIME: "hermes",
      HERMES_BRIDGE_ENABLED: "1",
      HERMES_BRIDGE_PORT: "19998",
      HERMES_BRIDGE_SECRET: "secret",
      HERMES_SANCHO_SECRET: "secret",
    },
  );
  assert.deepEqual(
    managedBridgeBootVarsForCliBridge(
      "codex",
      "http://127.0.0.1:18793",
      "secret",
    ),
    {},
  );
});

test("CLI bridge metadata separates server runtimes from user-device runtimes", () => {
  assert.equal(cliBridgeProvider("hermes").runtimeLocation, "server");
  assert.equal(cliBridgeProvider("hermes").serverStartSupported, true);
  assert.equal(cliBridgeProvider("hermes").cliCommandEnv, "HERMES_CLI");
  assert.equal(cliBridgeProvider("hermes").defaultCliCommand, "hermes");
  assert.equal(defaultGatewayUrl("hermes"), "http://127.0.0.1:18795");
  assert.equal(cliBridgeProvider("claude-code").runtimeLocation, "user-device");
  assert.equal(cliBridgeProvider("claude-code").serverStartSupported, false);
  assert.equal(cliBridgeProvider("codex").runtimeLocation, "user-device");
  assert.equal(cliBridgeProvider("codex").serverStartSupported, false);
});

test("server CLI availability reports installed and missing Hermes executables", () => {
  const installed = resolveServerCliAvailability("hermes", {
    PATH: "",
    HERMES_CLI: process.execPath,
  });
  assert.equal(installed.available, true);
  assert.equal(installed.executablePath, process.execPath);

  const missing = resolveServerCliAvailability("hermes", {
    PATH: "",
    HERMES_CLI: "definitely-not-installed-hermes",
  });
  assert.equal(missing.available, false);
  assert.match(missing.reason ?? "", /no está incluido en este despliegue/);
});

test("buildCliBridgeCommand emits a single runnable Hermes command", () => {
  const command = buildCliBridgeCommand("hermes", {
    sanchoBaseUrl: "https://sancho.example.com/",
    secret: "shared secret",
  });

  assert.match(command, /SANCHO_BASE_URL=https:\/\/sancho\.example\.com/);
  assert.match(command, /SANCHO_WEBHOOK_URL=https:\/\/sancho\.example\.com\/api\/chat\/webhook/);
  assert.match(command, /HERMES_BRIDGE_PORT=18795/);
  assert.match(command, /HERMES_BRIDGE_SECRET='shared secret'/);
  assert.match(command, /HERMES_SANCHO_SECRET='shared secret'/);
  assert.match(command, /HERMES_RUN_TIMEOUT_MS=900000/);
  assert.match(command, /node docker\/runtimes\/hermes\/bridge\.mjs$/);
});

test("buildCliBridgeEnv exposes the env needed to start a bridge from Sancho", () => {
  assert.deepEqual(
    buildCliBridgeEnv("claude-code", {
      sanchoBaseUrl: "https://sancho.example.com/",
      secret: "secret",
      host: "127.0.0.1",
      port: 19999,
    }),
    {
      SANCHO_BASE_URL: "https://sancho.example.com",
      SANCHO_WEBHOOK_URL: "https://sancho.example.com/api/chat/webhook",
      SANCHO_CONTEXT_PACK_URL: "https://sancho.example.com/api/chat/context-pack",
      SANCHO_EXTERNAL_SECRET: "secret",
      MC_CHAT_SECRET: "secret",
      CLAUDE_CODE_BRIDGE_HOST: "127.0.0.1",
      CLAUDE_CODE_BRIDGE_PORT: "19999",
      CLAUDE_CODE_BRIDGE_SECRET: "secret",
      CLAUDE_CODE_RUNTIME_TIMEOUT_MS: "900000",
      CLAUDE_CODE_SANCHO_MCP_ENABLED: "0",
      CLAUDE_CODE_RUNTIME_MODEL: "haiku",
    },
  );
});

test("managed Hermes bridge restores API auth and removes subscription credentials", () => {
  const env = buildManagedCliBridgeProcessEnv(
    "hermes",
    { HERMES_BRIDGE_SECRET: "runtime-secret" },
    {
      HERMES_CLI_PROVIDER: "anthropic",
      CLAUDE_CODE_OAUTH_TOKEN: "stale-claude-oauth",
      ANTHROPIC_OAUTH_TOKEN: "stale-anthropic-oauth",
    },
    {
      HERMES_CLI_PROVIDER: "anthropic",
      HERMES_CLI_MODEL: "claude-sonnet-4-6",
      ANTHROPIC_API_KEY: "persisted-api-key",
      CLAUDE_CODE_OAUTH_TOKEN: "persisted-claude-oauth",
    },
  );

  assert.equal(env.HERMES_CLI_MODEL, "claude-sonnet-4-6");
  assert.equal(env.ANTHROPIC_API_KEY, "persisted-api-key");
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  assert.equal(env.ANTHROPIC_OAUTH_TOKEN, undefined);
  assert.equal(env.HERMES_BRIDGE_SECRET, "runtime-secret");
});

test("managed user-device bridge does not inherit persisted server credentials", () => {
  const env = buildManagedCliBridgeProcessEnv(
    "codex",
    { CODEX_BRIDGE_SECRET: "runtime-secret" },
    {},
    { ANTHROPIC_API_KEY: "persisted-api-key" },
  );

  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.CODEX_BRIDGE_SECRET, "runtime-secret");
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
  assert.equal(gatewayPortOrDefault("hermes", "http://127.0.0.1:19998"), 19998);
  assert.equal(gatewayPortOrDefault("codex", "https://codex-bridge.example.com"), 18793);
  assert.equal(gatewayListenHost("http://127.0.0.1:18792"), "127.0.0.1");
  assert.equal(gatewayListenHost("http://10.0.0.5:18792"), "0.0.0.0");
});
