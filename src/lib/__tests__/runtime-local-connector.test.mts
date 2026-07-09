import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { InboundMessage } from "@/lib/runtime";

const {
  activateLocalConnectorSession,
  claimLocalConnectorJob,
  createLocalConnectorSession,
  enqueueLocalConnectorJob,
  finishLocalConnectorJob,
  getLocalConnectorSession,
  latestOnlineLocalConnector,
  localConnectorHealth,
  localConnectorInstallCommand,
  localConnectorRuntimeVars,
  registerLocalConnector,
} = await import("../runtime/local-connector");

let storeFile = "";
const previousStoreFile = process.env.SANCHO_LOCAL_CONNECTOR_STORE_FILE;

beforeEach(() => {
  storeFile = path.join(os.tmpdir(), `sancho-local-connector-${process.pid}-${Date.now()}.json`);
  process.env.SANCHO_LOCAL_CONNECTOR_STORE_FILE = storeFile;
});

afterEach(() => {
  if (previousStoreFile === undefined) delete process.env.SANCHO_LOCAL_CONNECTOR_STORE_FILE;
  else process.env.SANCHO_LOCAL_CONNECTOR_STORE_FILE = previousStoreFile;
  fs.rmSync(storeFile, { force: true });
});

function inboundMessage(): InboundMessage {
  return {
    slug: "acme",
    threadId: "acme:general",
    threadName: "General",
    text: "hola",
    userId: "admin",
    userName: "Admin",
    isAdmin: true,
  };
}

test("local connector pairing registers a user-device runtime", () => {
  const created = createLocalConnectorSession("claude-code");
  assert.equal(created.session.provider, "claude-code");
  assert.equal(created.session.status, "pending");
  assert.match(created.pairingToken, /^[A-Za-z0-9_-]+$/);
  assert.match(created.runtimeSecret, /^[A-Za-z0-9_-]+$/);

  const registered = registerLocalConnector(created.pairingToken, {
    deviceName: "Martin MacBook",
    runtime: { ok: true, command: "claude", version: "1.2.3" },
  });
  assert.ok(registered);
  assert.equal(registered.session.status, "connected");
  assert.equal(registered.session.online, true);
  assert.equal(registered.session.deviceName, "Martin MacBook");
  assert.equal(registered.runtimeSecret, created.runtimeSecret);

  const stored = getLocalConnectorSession(created.session.id);
  assert.equal(stored?.online, true);
  assert.equal(latestOnlineLocalConnector("claude-code")?.id, created.session.id);
  assert.equal(localConnectorHealth("claude-code").ok, true);
});

test("local connector queue only accepts jobs when a connector is online", () => {
  const created = createLocalConnectorSession("codex");
  assert.equal(enqueueLocalConnectorJob("codex", inboundMessage()), null);

  registerLocalConnector(created.pairingToken, {
    deviceName: "Local Mac",
    runtime: { ok: true, command: "codex", version: "codex-cli 0.142.5" },
  });
  const job = enqueueLocalConnectorJob("codex", inboundMessage());
  assert.ok(job);
  assert.equal(job.provider, "codex");
  assert.equal(job.status, "pending");

  const claimed = claimLocalConnectorJob(created.pairingToken);
  assert.equal(claimed?.id, job.id);
  assert.equal(claimed?.status, "claimed");

  const finished = finishLocalConnectorJob(created.pairingToken, job.id, "dispatched");
  assert.equal(finished?.status, "dispatched");
  assert.equal(claimLocalConnectorJob(created.pairingToken), null);
});

test("local connector with missing CLI is not treated as online", () => {
  const created = createLocalConnectorSession("claude-code");
  const registered = registerLocalConnector(created.pairingToken, {
    deviceName: "Local Mac",
    runtime: { ok: false, command: "claude", error: "spawn claude ENOENT" },
  });
  assert.ok(registered);
  assert.equal(registered.session.status, "connected");
  assert.equal(registered.session.online, false);
  assert.equal(latestOnlineLocalConnector("claude-code"), null);
  assert.equal(localConnectorHealth("claude-code").ok, false);
  assert.equal(enqueueLocalConnectorJob("claude-code", inboundMessage()), null);
});

test("activation and install helpers use the Sancho self-queue contract", () => {
  const created = createLocalConnectorSession("claude-code");
  registerLocalConnector(created.pairingToken, {
    deviceName: "Local Mac",
    runtime: { ok: true, command: "claude" },
  });
  const activated = activateLocalConnectorSession(created.session.id);
  assert.equal(activated?.activatedAt !== undefined, true);

  assert.deepEqual(localConnectorRuntimeVars("claude-code", "https://sancho.example.com/", "secret"), {
    SANCHO_EXTERNAL_RUNTIME_KIND: "claude-code",
    SANCHO_EXTERNAL_PROTOCOL: "sancho",
    SANCHO_EXTERNAL_GATEWAY_URL: "https://sancho.example.com",
    SANCHO_EXTERNAL_SECRET: "secret",
    SANCHO_EXTERNAL_INBOUND_PATH: "/api/runtime/local-connector/inbound",
    SANCHO_EXTERNAL_HEALTH_PATH: "/api/runtime/local-connector/health",
  });
  assert.match(
    localConnectorInstallCommand("https://sancho.example.com/", "pairing-token"),
    /^curl -fsSL 'https:\/\/sancho\.example\.com\/api\/runtime\/local-connector\/install\?token=pairing-token' \| bash$/,
  );
});
