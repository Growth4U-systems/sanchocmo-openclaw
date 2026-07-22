import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer as createHermesServer } from "./hermes/bridge.mjs";
import { createServer as createCodexServer } from "./codex/bridge.mjs";
import { createServer as createClaudeServer } from "./claude-code/bridge.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function post(baseUrl, pathName, secret, body) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MC-Secret": secret,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("CLI bridges reject a stale run cancellation on the same thread", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-exact-cancel-"));
  const sleeper = path.join(tempRoot, "runtime-sleeper.sh");
  fs.writeFileSync(sleeper, "#!/bin/sh\nsleep 30\n", { mode: 0o700 });

  const descriptors = [
    {
      id: "hermes",
      createServer: createHermesServer,
      secretEnv: "HERMES_BRIDGE_SECRET",
      cliEnv: "HERMES_CLI",
      contextEnv: "HERMES_CONTEXT_PACK_ENABLED",
    },
    {
      id: "codex",
      createServer: createCodexServer,
      secretEnv: "CODEX_BRIDGE_SECRET",
      cliEnv: "CODEX_CLI",
      contextEnv: "CODEX_CONTEXT_PACK_ENABLED",
    },
    {
      id: "claude-code",
      createServer: createClaudeServer,
      secretEnv: "CLAUDE_CODE_BRIDGE_SECRET",
      cliEnv: "CLAUDE_CODE_CLI",
      contextEnv: "CLAUDE_CODE_CONTEXT_PACK_ENABLED",
    },
  ];

  try {
    for (const descriptor of descriptors) {
      const secret = `${descriptor.id}-cancel-secret`;
      const previous = {
        secret: process.env[descriptor.secretEnv],
        cli: process.env[descriptor.cliEnv],
        context: process.env[descriptor.contextEnv],
        outbox: process.env.SANCHO_CALLBACK_OUTBOX_DIR,
      };
      process.env[descriptor.secretEnv] = secret;
      process.env[descriptor.cliEnv] = sleeper;
      process.env[descriptor.contextEnv] = "0";
      process.env.SANCHO_CALLBACK_OUTBOX_DIR = path.join(
        tempRoot,
        `${descriptor.id}-outbox`,
      );
      const server = descriptor.createServer();
      const address = await listen(server);
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const threadId = `acme:cancel-${descriptor.id}`;
      const runId = `run_mc_cancel_${descriptor.id.replace(/-/g, "_")}`;

      try {
        const admitted = await post(baseUrl, "/sancho/inbound", secret, {
          slug: "acme",
          threadId,
          missionControlRunId: runId,
          text: "keep running until exact cancellation",
          userId: "mc-admin",
          userName: "Admin",
        });
        assert.equal(admitted.status, 202, descriptor.id);

        const stale = await post(baseUrl, "/sancho/cancel", secret, {
          threadId,
          missionControlRunId: `${runId}_stale`,
        });
        assert.equal(stale.status, 200, descriptor.id);
        assert.equal(stale.body.cancelled, false, descriptor.id);
        const stillActive = await fetch(`${baseUrl}/healthz`).then((res) =>
          res.json(),
        );
        assert.equal(stillActive.activeRuns, 1, descriptor.id);

        const exact = await post(baseUrl, "/sancho/cancel", secret, {
          threadId,
          missionControlRunId: runId,
        });
        assert.equal(exact.body.cancelled, true, descriptor.id);
        const stopped = await fetch(`${baseUrl}/healthz`).then((res) =>
          res.json(),
        );
        assert.equal(stopped.activeRuns, 0, descriptor.id);
        // Cancellation may arrive while a bridge is still assembling context
        // and before the CLI child exists. The cancelled admission must not
        // respawn after that asynchronous preparation finishes.
        await new Promise((resolve) => setTimeout(resolve, 25));
        const stayedStopped = await fetch(`${baseUrl}/healthz`).then((res) =>
          res.json(),
        );
        assert.equal(stayedStopped.activeRuns, 0, descriptor.id);
      } finally {
        await close(server);
        if (previous.secret === undefined) delete process.env[descriptor.secretEnv];
        else process.env[descriptor.secretEnv] = previous.secret;
        if (previous.cli === undefined) delete process.env[descriptor.cliEnv];
        else process.env[descriptor.cliEnv] = previous.cli;
        if (previous.context === undefined) delete process.env[descriptor.contextEnv];
        else process.env[descriptor.contextEnv] = previous.context;
        if (previous.outbox === undefined) delete process.env.SANCHO_CALLBACK_OUTBOX_DIR;
        else process.env.SANCHO_CALLBACK_OUTBOX_DIR = previous.outbox;
      }
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
