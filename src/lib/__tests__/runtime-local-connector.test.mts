import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { InboundMessage } from "@/lib/runtime";

const {
  activateLocalConnectorSession,
  authenticateLocalConnectorSessionCredential,
  authenticateLocalConnectorToken,
  claimLocalConnectorAgentRunRecovery,
  claimLocalConnectorJob,
  createLocalConnectorSession,
  enqueueLocalConnectorJob,
  finishLocalConnectorAgentRunRecovery,
  finishLocalConnectorJob,
  getLocalConnectorSession,
  heartbeatLocalConnector,
  latestOnlineLocalConnector,
  localConnectorHealth,
  localConnectorInstallCommand,
  localConnectorInstallerScript,
  localConnectorRuntimeVars,
  nextLocalConnectorRecoveryAt,
  registerLocalConnector,
} = await import("../runtime/local-connector");

let storeFile = "";
const previousStoreFile = process.env.SANCHO_LOCAL_CONNECTOR_STORE_FILE;
const previousRetentionMs = process.env.SANCHO_LOCAL_CONNECTOR_JOB_RETENTION_MS;
const previousPendingOrphanMs = process.env.SANCHO_LOCAL_CONNECTOR_PENDING_ORPHAN_MS;
const previousFailedCallbackGraceMs = process.env.SANCHO_LOCAL_CONNECTOR_FAILED_CALLBACK_GRACE_MS;
const previousLockTimeoutMs = process.env.SANCHO_LOCAL_CONNECTOR_LOCK_TIMEOUT_MS;
const previousLockStaleMs = process.env.SANCHO_LOCAL_CONNECTOR_LOCK_STALE_MS;

beforeEach(() => {
  storeFile = path.join(os.tmpdir(), `sancho-local-connector-${process.pid}-${Date.now()}.json`);
  process.env.SANCHO_LOCAL_CONNECTOR_STORE_FILE = storeFile;
});

afterEach(() => {
  if (previousStoreFile === undefined) delete process.env.SANCHO_LOCAL_CONNECTOR_STORE_FILE;
  else process.env.SANCHO_LOCAL_CONNECTOR_STORE_FILE = previousStoreFile;
  if (previousRetentionMs === undefined) delete process.env.SANCHO_LOCAL_CONNECTOR_JOB_RETENTION_MS;
  else process.env.SANCHO_LOCAL_CONNECTOR_JOB_RETENTION_MS = previousRetentionMs;
  if (previousPendingOrphanMs === undefined) delete process.env.SANCHO_LOCAL_CONNECTOR_PENDING_ORPHAN_MS;
  else process.env.SANCHO_LOCAL_CONNECTOR_PENDING_ORPHAN_MS = previousPendingOrphanMs;
  if (previousFailedCallbackGraceMs === undefined) delete process.env.SANCHO_LOCAL_CONNECTOR_FAILED_CALLBACK_GRACE_MS;
  else process.env.SANCHO_LOCAL_CONNECTOR_FAILED_CALLBACK_GRACE_MS = previousFailedCallbackGraceMs;
  if (previousLockTimeoutMs === undefined) delete process.env.SANCHO_LOCAL_CONNECTOR_LOCK_TIMEOUT_MS;
  else process.env.SANCHO_LOCAL_CONNECTOR_LOCK_TIMEOUT_MS = previousLockTimeoutMs;
  if (previousLockStaleMs === undefined) delete process.env.SANCHO_LOCAL_CONNECTOR_LOCK_STALE_MS;
  else process.env.SANCHO_LOCAL_CONNECTOR_LOCK_STALE_MS = previousLockStaleMs;
  fs.rmSync(storeFile, { force: true });
  fs.rmSync(`${storeFile}.lock`, { force: true });
});

function inboundMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    slug: "acme",
    threadId: "acme:general",
    threadName: "General",
    text: "hola",
    userId: "admin",
    userName: "Admin",
    isAdmin: true,
    ...overrides,
  };
}

function persistedStore() {
  return JSON.parse(fs.readFileSync(storeFile, "utf8")) as {
    version: number;
    sessions: Record<string, Record<string, unknown>>;
    jobs: Record<string, Record<string, unknown>>;
  };
}

function runTsxChild(source: string, env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", source],
      {
        cwd: process.cwd(),
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`child exited ${code}: ${stderr.slice(0, 2000)}`));
    });
  });
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
  assert.match(registered.sessionCredential, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(registered.sessionCredential, created.pairingToken);
  assert.equal(authenticateLocalConnectorToken(created.pairingToken), null);
  assert.equal(authenticateLocalConnectorSessionCredential(created.pairingToken), null);
  assert.equal(
    authenticateLocalConnectorSessionCredential(registered.sessionCredential)?.id,
    created.session.id,
  );

  const stored = getLocalConnectorSession(created.session.id);
  assert.equal(stored?.online, true);
  assert.equal(latestOnlineLocalConnector("claude-code")?.id, created.session.id);
  assert.equal(localConnectorHealth("claude-code").ok, true);
});

test("pairing is one-shot while the registered credential renews beyond fifteen minutes", () => {
  const startedAt = Date.UTC(2026, 6, 22, 10, 0, 0);
  const created = createLocalConnectorSession("claude-code", startedAt);
  const registered = registerLocalConnector(
    created.pairingToken,
    {
      deviceName: "Durable connector",
      runtime: { ok: true, command: "claude" },
    },
    startedAt + 1_000,
  );
  assert.ok(registered);

  assert.equal(
    registerLocalConnector(created.pairingToken, {}, startedAt + 2_000),
    null,
  );
  assert.equal(
    authenticateLocalConnectorSessionCredential(
      registered.sessionCredential,
      startedAt + 16 * 60 * 1_000,
    )?.id,
    created.session.id,
  );

  const heartbeatAt = startedAt + 16 * 60 * 1_000;
  const heartbeat = heartbeatLocalConnector(
    registered.sessionCredential,
    { runtime: { ok: true, command: "claude", version: "2.0.0" } },
    heartbeatAt,
  );
  assert.equal(heartbeat?.status, "connected");
  assert.equal(heartbeat?.online, true);
  assert.ok(new Date(heartbeat?.leaseExpiresAt || 0).getTime() > heartbeatAt);

  const reconnected = registerLocalConnector(
    registered.sessionCredential,
    { runtime: { ok: true, command: "claude", version: "2.0.1" } },
    heartbeatAt + 1_000,
  );
  assert.equal(reconnected?.sessionCredential, registered.sessionCredential);
  assert.equal(reconnected?.session.status, "connected");
});

test("local connector queue only accepts jobs when a connector is online", () => {
  const created = createLocalConnectorSession("codex");
  assert.equal(enqueueLocalConnectorJob("codex", inboundMessage()), null);

  const registered = registerLocalConnector(created.pairingToken, {
    deviceName: "Local Mac",
    runtime: { ok: true, command: "codex", version: "codex-cli 0.142.5" },
  });
  assert.ok(registered);
  const job = enqueueLocalConnectorJob("codex", inboundMessage());
  assert.ok(job);
  assert.equal(job.provider, "codex");
  assert.equal(job.status, "pending");

  const claimed = claimLocalConnectorJob(registered.sessionCredential);
  assert.equal(claimed?.id, job.id);
  assert.equal(claimed?.status, "claimed");

  const finished = finishLocalConnectorJob(registered.sessionCredential, job.id, "dispatched");
  assert.equal(finished?.status, "dispatched");
  assert.equal(finished?.message, undefined);
  assert.equal(claimLocalConnectorJob(registered.sessionCredential), null);
});

test("jobs stay bound to one session and terminal completion is replay-safe and redacted", () => {
  const startedAt = Date.UTC(2026, 6, 22, 11, 0, 0);
  const first = createLocalConnectorSession("codex", startedAt);
  const firstRegistered = registerLocalConnector(
    first.pairingToken,
    { runtime: { ok: true, command: "codex" } },
    startedAt + 1_000,
  );
  const second = createLocalConnectorSession("codex", startedAt + 2_000);
  const secondRegistered = registerLocalConnector(
    second.pairingToken,
    { runtime: { ok: true, command: "codex" } },
    startedAt + 3_000,
  );
  assert.ok(firstRegistered);
  assert.ok(secondRegistered);

  const capability = "a".repeat(64);
  const job = enqueueLocalConnectorJob(
    "codex",
    inboundMessage({
      missionControlRunId: "run_local_connector_1",
      runtimeToolCapability: capability,
    }),
    startedAt + 4_000,
  );
  assert.ok(job);
  assert.equal(job.connectorSessionId, second.session.id);

  assert.equal(claimLocalConnectorJob(firstRegistered.sessionCredential, startedAt + 5_000), null);
  const claimed = claimLocalConnectorJob(secondRegistered.sessionCredential, startedAt + 5_000);
  assert.equal(claimed?.id, job.id);
  assert.equal(
    finishLocalConnectorJob(
      firstRegistered.sessionCredential,
      job.id,
      "failed",
      "not owner",
      startedAt + 6_000,
    ),
    null,
  );

  const finished = finishLocalConnectorJob(
    secondRegistered.sessionCredential,
    job.id,
    "failed",
    `bridge echoed ${capability}`,
    startedAt + 6_000,
  );
  assert.equal(finished?.status, "failed");
  assert.equal(finished?.message, undefined);
  assert.deepEqual(finished?.messageSummary, {
    slug: "acme",
    threadId: "acme:general",
    missionControlRunId: "run_local_connector_1",
  });
  assert.equal(finished?.error, "bridge echoed [redacted]");

  assert.equal(
    finishLocalConnectorJob(
      secondRegistered.sessionCredential,
      job.id,
      "failed",
      undefined,
      startedAt + 7_000,
    )?.id,
    job.id,
  );
  assert.equal(
    finishLocalConnectorJob(
      secondRegistered.sessionCredential,
      job.id,
      "dispatched",
      undefined,
      startedAt + 7_000,
    ),
    null,
  );

  const stored = persistedStore();
  assert.equal(stored.version, 2);
  assert.equal(JSON.stringify(stored).includes(capability), false);
  assert.equal(stored.jobs[job.id]?.message, undefined);
  assert.equal(fs.statSync(storeFile).mode & 0o777, 0o600);

  const recovery = claimLocalConnectorAgentRunRecovery(startedAt + 37_000);
  assert.equal(recovery?.jobId, job.id);
  assert.equal(recovery?.reason, "connector_failed");
  assert.equal(
    finishLocalConnectorAgentRunRecovery(
      recovery!.jobId,
      recovery!.claimId,
      true,
      startedAt + 37_001,
    ),
    true,
  );
  process.env.SANCHO_LOCAL_CONNECTOR_JOB_RETENTION_MS = "1000";
  getLocalConnectorSession(second.session.id, startedAt + 38_000);
  assert.equal(persistedStore().jobs[job.id], undefined);
});

test("an unclaimed job is safely reassigned after its owner goes offline", () => {
  const startedAt = Date.UTC(2026, 6, 22, 11, 30, 0);
  const fallback = createLocalConnectorSession("codex", startedAt);
  const fallbackRegistered = registerLocalConnector(
    fallback.pairingToken,
    { runtime: { ok: true, command: "codex" } },
    startedAt + 1_000,
  );
  const owner = createLocalConnectorSession("codex", startedAt + 2_000);
  const ownerRegistered = registerLocalConnector(
    owner.pairingToken,
    { runtime: { ok: true, command: "codex" } },
    startedAt + 3_000,
  );
  assert.ok(fallbackRegistered);
  assert.ok(ownerRegistered);

  const job = enqueueLocalConnectorJob(
    "codex",
    inboundMessage({ missionControlRunId: "run_reassign_1" }),
    startedAt + 4_000,
  );
  assert.equal(job?.connectorSessionId, owner.session.id);

  const recoveredAt = startedAt + 60_000;
  assert.ok(heartbeatLocalConnector(fallbackRegistered.sessionCredential, {}, recoveredAt));
  const claimed = claimLocalConnectorJob(
    fallbackRegistered.sessionCredential,
    recoveredAt + 1,
  );
  assert.equal(claimed?.id, job?.id);
  assert.equal(claimed?.connectorSessionId, fallback.session.id);
  assert.equal(claimed?.assignmentGeneration, 2);
  assert.equal(
    finishLocalConnectorJob(
      ownerRegistered.sessionCredential,
      job!.id,
      "dispatched",
      undefined,
      recoveredAt + 2,
    ),
    null,
  );
});

test("orphaned and callback-timeout jobs durably terminalize their AgentRun recovery", () => {
  const startedAt = Date.UTC(2026, 6, 22, 12, 0, 0);
  const capability = "c".repeat(64);
  const created = createLocalConnectorSession("claude-code", startedAt);
  const registered = registerLocalConnector(
    created.pairingToken,
    { runtime: { ok: true, command: "claude" } },
    startedAt + 1_000,
  );
  assert.ok(registered);

  const abandoned = enqueueLocalConnectorJob(
    "claude-code",
    inboundMessage({
      missionControlRunId: "run_abandoned_pending",
      runtimeToolCapability: capability,
    }),
    startedAt + 2_000,
  );
  assert.ok(abandoned);
  assert.ok((nextLocalConnectorRecoveryAt(startedAt + 2_000) || 0) > startedAt + 2_000);
  const pendingRecovery = claimLocalConnectorAgentRunRecovery(startedAt + 123_000);
  assert.equal(pendingRecovery?.jobId, abandoned.id);
  assert.equal(pendingRecovery?.reason, "orphaned_before_claim");
  assert.equal(pendingRecovery?.missionControlRunId, "run_abandoned_pending");
  assert.equal(JSON.stringify(persistedStore()).includes(capability), false);
  assert.equal(
    finishLocalConnectorAgentRunRecovery(
      pendingRecovery!.jobId,
      pendingRecovery!.claimId,
      true,
      startedAt + 123_001,
    ),
    true,
  );

  const resumedAt = startedAt + 124_000;
  assert.ok(heartbeatLocalConnector(registered.sessionCredential, {}, resumedAt));
  const dispatched = enqueueLocalConnectorJob(
    "claude-code",
    inboundMessage({ missionControlRunId: "run_callback_timeout" }),
    resumedAt + 1,
  );
  assert.ok(dispatched);
  assert.equal(
    claimLocalConnectorJob(registered.sessionCredential, resumedAt + 2)?.id,
    dispatched.id,
  );
  assert.equal(
    finishLocalConnectorJob(
      registered.sessionCredential,
      dispatched.id,
      "dispatched",
      undefined,
      resumedAt + 3,
    )?.status,
    "dispatched",
  );
  assert.equal(claimLocalConnectorAgentRunRecovery(startedAt + 34 * 60 * 1_000), null);
  const callbackRecovery = claimLocalConnectorAgentRunRecovery(
    startedAt + 38 * 60 * 1_000,
  );
  assert.equal(callbackRecovery?.jobId, dispatched.id);
  assert.equal(callbackRecovery?.reason, "callback_timeout");
  assert.equal(callbackRecovery?.missionControlRunId, "run_callback_timeout");
});

test("a claimed job is never stolen and fails closed only after callback authority expires", () => {
  const startedAt = Date.UTC(2026, 6, 22, 13, 0, 0);
  const owner = createLocalConnectorSession("codex", startedAt);
  const ownerRegistered = registerLocalConnector(
    owner.pairingToken,
    { runtime: { ok: true, command: "codex" } },
    startedAt + 1_000,
  );
  assert.ok(ownerRegistered);
  const job = enqueueLocalConnectorJob(
    "codex",
    inboundMessage({ missionControlRunId: "run_claimed_orphan" }),
    startedAt + 2_000,
  );
  assert.equal(
    claimLocalConnectorJob(ownerRegistered.sessionCredential, startedAt + 3_000)?.id,
    job?.id,
  );

  const replacement = createLocalConnectorSession("codex", startedAt + 4_000);
  const replacementRegistered = registerLocalConnector(
    replacement.pairingToken,
    { runtime: { ok: true, command: "codex" } },
    startedAt + 5_000,
  );
  assert.ok(replacementRegistered);
  assert.equal(
    claimLocalConnectorJob(replacementRegistered.sessionCredential, startedAt + 4 * 60 * 1_000),
    null,
  );
  assert.equal(claimLocalConnectorAgentRunRecovery(startedAt + 34 * 60 * 1_000), null);

  const recovery = claimLocalConnectorAgentRunRecovery(startedAt + 36 * 60 * 1_000);
  assert.equal(recovery?.jobId, job?.id);
  assert.equal(recovery?.reason, "orphaned_after_claim");
  assert.equal(
    finishLocalConnectorJob(
      replacementRegistered.sessionCredential,
      job!.id,
      "dispatched",
      undefined,
      startedAt + 36 * 60 * 1_000 + 1,
    ),
    null,
  );
});

test("a recent version-one connector credential is migrated without reviving stale sessions", () => {
  const now = Date.UTC(2026, 6, 22, 12, 0, 0);
  const legacyToken = "legacy-connected-token";
  const staleToken = "stale-connected-token";
  fs.writeFileSync(
    storeFile,
    `${JSON.stringify({
      version: 1,
      sessions: {
        legacy: {
          id: "legacy",
          provider: "claude-code",
          pairingCode: "LEGACY",
          pairingTokenHash: crypto.createHash("sha256").update(legacyToken).digest("hex"),
          runtimeSecret: "legacy-runtime-secret",
          status: "connected",
          createdAt: new Date(now - 20_000).toISOString(),
          expiresAt: new Date(now - 10_000).toISOString(),
          connectedAt: new Date(now - 10_000).toISOString(),
          lastSeenAt: new Date(now - 1_000).toISOString(),
          runtime: { ok: true, command: "claude" },
        },
        stale: {
          id: "stale",
          provider: "claude-code",
          pairingCode: "STALE",
          pairingTokenHash: crypto.createHash("sha256").update(staleToken).digest("hex"),
          runtimeSecret: "stale-runtime-secret",
          status: "connected",
          createdAt: new Date(now - 26 * 60 * 60 * 1_000).toISOString(),
          expiresAt: new Date(now - 25 * 60 * 60 * 1_000).toISOString(),
          connectedAt: new Date(now - 26 * 60 * 60 * 1_000).toISOString(),
          lastSeenAt: new Date(now - 25 * 60 * 60 * 1_000).toISOString(),
          runtime: { ok: true, command: "claude" },
        },
      },
      jobs: {},
    })}\n`,
    { mode: 0o644 },
  );

  const migrated = authenticateLocalConnectorSessionCredential(legacyToken, now);
  assert.equal(migrated?.id, "legacy");
  assert.ok(migrated?.leaseExpiresAt);
  assert.equal(authenticateLocalConnectorSessionCredential(staleToken, now), null);
  assert.equal(fs.statSync(storeFile).mode & 0o777, 0o600);
  const stored = persistedStore();
  assert.equal(stored.sessions.legacy.pairingTokenHash, undefined);
  assert.equal(typeof stored.sessions.legacy.sessionTokenHash, "string");
  assert.equal(stored.sessions.stale.status, "expired");
  assert.equal(stored.sessions.stale.sessionTokenHash, undefined);
});

test("file locking preserves heartbeat/enqueue updates and recovers bounded stale locks", async () => {
  const created = createLocalConnectorSession("codex");
  const registered = registerLocalConnector(created.pairingToken, {
    runtime: { ok: true, command: "codex" },
  });
  assert.ok(registered);
  const iterations = 24;
  const modulePath = "./src/lib/runtime/local-connector.ts";
  await Promise.all([
    runTsxChild(
      `import connector from ${JSON.stringify(modulePath)};
const { heartbeatLocalConnector } = connector;
for (let i = 0; i < ${iterations}; i += 1) {
  if (!heartbeatLocalConnector(process.env.TEST_CONNECTOR_TOKEN, { runtime: { ok: true, command: "codex" } })) process.exit(2);
}`,
      {
        SANCHO_LOCAL_CONNECTOR_STORE_FILE: storeFile,
        TEST_CONNECTOR_TOKEN: registered.sessionCredential,
      },
    ),
    runTsxChild(
      `import connector from ${JSON.stringify(modulePath)};
const { enqueueLocalConnectorJob } = connector;
for (let i = 0; i < ${iterations}; i += 1) {
  const job = enqueueLocalConnectorJob("codex", { slug: "acme", threadId: "acme:lock", text: "job-" + i, userId: "admin", userName: "Admin" });
  if (!job) process.exit(3);
}`,
      { SANCHO_LOCAL_CONNECTOR_STORE_FILE: storeFile },
    ),
  ]);

  assert.equal(Object.keys(persistedStore().jobs).length, iterations);
  assert.equal(fs.existsSync(`${storeFile}.lock`), false);

  process.env.SANCHO_LOCAL_CONNECTOR_LOCK_TIMEOUT_MS = "25";
  process.env.SANCHO_LOCAL_CONNECTOR_LOCK_STALE_MS = "1000";
  fs.writeFileSync(`${storeFile}.lock`, "occupied\n", { mode: 0o600 });
  assert.throws(
    () => getLocalConnectorSession(created.session.id),
    /store is busy/,
  );

  const staleAt = new Date(Date.now() - 5_000);
  fs.utimesSync(`${storeFile}.lock`, staleAt, staleAt);
  process.env.SANCHO_LOCAL_CONNECTOR_LOCK_STALE_MS = "50";
  assert.equal(getLocalConnectorSession(created.session.id)?.id, created.session.id);
  assert.equal(fs.existsSync(`${storeFile}.lock`), false);
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
  const installCommand = localConnectorInstallCommand("https://sancho.example.com/", "pairing-token");
  assert.match(installCommand, /^SANCHO_CONNECTOR_INSTALLER="\$\(mktemp "\$\{TMPDIR:-\/tmp\}\/sancho-connector\.XXXXXX"\)"/);
  assert.match(
    installCommand,
    /curl -fsSL -H 'Authorization: Bearer pairing-token' 'https:\/\/sancho\.example\.com\/api\/runtime\/local-connector\/install' -o "\$SANCHO_CONNECTOR_INSTALLER"/,
  );
  assert.match(installCommand, /trap 'rm -f "\$SANCHO_CONNECTOR_INSTALLER"' EXIT/);
  assert.match(installCommand, /bash "\$SANCHO_CONNECTOR_INSTALLER"$/);
  assert.doesNotMatch(installCommand, /\|\s*bash/);
});

test("install command and installer quote shell metacharacters without expansion", () => {
  const markerA = path.join(os.tmpdir(), `sancho-shell-a-${process.pid}-${Date.now()}`);
  const markerB = path.join(os.tmpdir(), `sancho-shell-b-${process.pid}-${Date.now()}`);
  const maliciousToken = `pair'$(touch ${markerA})\`touch ${markerB}\``;
  const maliciousBase = `https://sancho.example.com/$(touch\${IFS}${markerA})/\`touch\${IFS}${markerB}\`/'quoted`;
  try {
    const command = localConnectorInstallCommand(maliciousBase, maliciousToken);
    const commandCheck = spawnSync(
      "bash",
      [
        "-c",
        ["curl() { return 0; }", "bash() { return 0; }", command].join("\n"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(commandCheck.status, 0, commandCheck.stderr);
    assert.equal(fs.existsSync(markerA), false);
    assert.equal(fs.existsSync(markerB), false);

    const installer = localConnectorInstallerScript(
      maliciousBase,
      maliciousToken,
      "codex",
    );
    const syntax = spawnSync("bash", ["-n"], {
      input: installer,
      encoding: "utf8",
    });
    assert.equal(syntax.status, 0, syntax.stderr);
    const assignments = installer
      .split("\n")
      .filter((line) => /^SANCHO_(BASE_URL|CONNECTOR_TOKEN|CONNECTOR_PROVIDER)=/.test(line));
    const evaluated = spawnSync(
      "bash",
      [
        "-c",
        `${assignments.join("\n")}\nprintf '%s\\0%s\\0%s\\0' "$SANCHO_BASE_URL" "$SANCHO_CONNECTOR_TOKEN" "$SANCHO_CONNECTOR_PROVIDER"`,
      ],
      { encoding: "utf8" },
    );
    assert.equal(evaluated.status, 0, evaluated.stderr);
    assert.deepEqual(evaluated.stdout.split("\0").slice(0, 3), [
      maliciousBase,
      maliciousToken,
      "codex",
    ]);
    assert.equal(fs.existsSync(markerA), false);
    assert.equal(fs.existsSync(markerB), false);
  } finally {
    fs.rmSync(markerA, { force: true });
    fs.rmSync(markerB, { force: true });
  }
});

test("local connector installer preserves the bridge shared-module layout", () => {
  const installer = localConnectorInstallerScript(
    "https://sancho.example.com/",
    "pairing-token",
    "codex",
  );

  assert.match(installer, /SANCHO_CONNECTOR_PROVIDER='codex'/);
  assert.match(installer, /SANCHO_CONNECTOR_SCRIPT_DIR="\$SANCHO_CONNECTOR_DIR\/scripts"/);
  assert.match(
    installer,
    /SANCHO_CONNECTOR_RUNTIMES_DIR="\$SANCHO_CONNECTOR_DIR\/docker\/runtimes"/,
  );
  assert.match(
    installer,
    /SANCHO_CONNECTOR_BRIDGE_DIR="\$SANCHO_CONNECTOR_RUNTIMES_DIR\/\$SANCHO_CONNECTOR_PROVIDER"/,
  );
  assert.match(
    installer,
    /connector_curl "\$SANCHO_BASE_URL\/api\/runtime\/local-connector\/bridge\/callback-authority"/,
  );
  assert.match(
    installer,
    /connector_curl "\$SANCHO_BASE_URL\/api\/runtime\/local-connector\/bridge\/callback-outbox" "\$SANCHO_CONNECTOR_RUNTIMES_DIR\/callback-outbox\.mjs"/,
  );
  assert.match(installer, /src\/lib\/runtime\/agent-contract/);
  assert.match(installer, /connector_curl "\$SANCHO_BASE_URL\/api\/runtime\/local-connector\/contract"/);
  assert.match(installer, /local-connector\/contract\/error-rewriter"/);
  assert.match(installer, /local-connector\/contract\/runtime-cli-failure"/);
  assert.doesNotMatch(installer, /\?token=/);
  assert.match(installer, /SANCHO_CONNECTOR_BRIDGE_PATH="\$SANCHO_CONNECTOR_BRIDGE_DIR\/bridge\.mjs"/);
  assert.match(installer, /SANCHO_CONNECTOR_SESSION_FILE="\$SANCHO_CONNECTOR_DIR\/session-credential\.json"/);
  assert.match(installer, /node "\$SANCHO_CONNECTOR_SCRIPT_DIR\/sancho-local-connector\.mjs"/);

  const bridgePath = path.join("runtime-connector", "docker", "runtimes", "codex", "bridge.mjs");
  const importedAuthority = path.resolve(
    path.dirname(bridgePath),
    "../callback-authority.mjs",
  );
  const installedAuthority = path.resolve(
    "runtime-connector",
    "docker",
    "runtimes",
    "callback-authority.mjs",
  );
  assert.equal(importedAuthority, installedAuthority);
  const connectorPath = path.join(
    "runtime-connector",
    "scripts",
    "sancho-local-connector.mjs",
  );
  const connectorImportedAuthority = path.resolve(
    path.dirname(connectorPath),
    "../docker/runtimes/callback-authority.mjs",
  );
  assert.equal(connectorImportedAuthority, installedAuthority);
  const importedOutbox = path.resolve(
    path.dirname(bridgePath),
    "../callback-outbox.mjs",
  );
  const installedOutbox = path.resolve(
    "runtime-connector",
    "docker",
    "runtimes",
    "callback-outbox.mjs",
  );
  assert.equal(importedOutbox, installedOutbox);
  const importedContract = path.resolve(path.dirname(bridgePath), "../../../src/lib/runtime/agent-contract/mc-chat-context.mjs");
  const installedContract = path.resolve(
    "runtime-connector",
    "src",
    "lib",
    "runtime",
    "agent-contract",
    "mc-chat-context.mjs",
  );
  assert.equal(importedContract, installedContract);

  const localConnectorRoute = fs.readFileSync(
    path.join(
      process.cwd(),
      "src",
      "pages",
      "api",
      "runtime",
      "local-connector",
      "[[...route]].ts",
    ),
    "utf8",
  );
  assert.match(localConnectorRoute, /"callback-outbox": "callback-outbox\.mjs"/);
  const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");
  assert.match(
    dockerfile,
    /COPY docker\/runtimes\/callback-authority\.mjs \.\/docker\/runtimes\/callback-authority\.mjs/,
  );
  assert.match(
    dockerfile,
    /COPY docker\/runtimes\/callback-outbox\.mjs \.\/docker\/runtimes\/callback-outbox\.mjs/,
  );
});
