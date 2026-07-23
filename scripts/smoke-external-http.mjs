#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const protocolArg = process.argv.find((arg) => arg.startsWith("--protocol="));
const protocol = protocolArg?.split("=", 2)[1] || process.env.SMOKE_EXTERNAL_PROTOCOL || "sancho";
const bridgeMode = protocol === "mc-bridge";
const artifactDir = path.join(root, ".context", bridgeMode ? "external-http-bridge-smoke" : "external-http-smoke");
const workspace = path.join(artifactDir, "workspace");
const summaryFile = path.join(artifactDir, "latest.json");
const secret =
  process.env.SMOKE_EXTERNAL_SECRET || randomBytes(32).toString("hex");
const adminToken =
  process.env.SMOKE_EXTERNAL_ADMIN_TOKEN || randomBytes(32).toString("hex");
const terminalGrantSecret =
  process.env.SMOKE_EXTERNAL_TERMINAL_GRANT_SECRET ||
  randomBytes(32).toString("hex");
const encryptionKey =
  process.env.SMOKE_EXTERNAL_ENCRYPTION_KEY || randomBytes(32).toString("hex");
const internalApiToken =
  process.env.SMOKE_EXTERNAL_INTERNAL_API_TOKEN ||
  randomBytes(32).toString("hex");
for (const [name, value] of [
  ["SMOKE_EXTERNAL_SECRET", secret],
  ["SMOKE_EXTERNAL_ADMIN_TOKEN", adminToken],
  ["SMOKE_EXTERNAL_TERMINAL_GRANT_SECRET", terminalGrantSecret],
  ["SMOKE_EXTERNAL_ENCRYPTION_KEY", encryptionKey],
  ["SMOKE_EXTERNAL_INTERNAL_API_TOKEN", internalApiToken],
]) {
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(`${name} must be at least 32 bytes`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function waitFor(url, label, timeoutMs = 30000) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(300);
  }
  throw new Error(`${label} did not become ready: ${lastError}`);
}

async function waitForThread(threadFile, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(threadFile)) {
      const data = JSON.parse(fs.readFileSync(threadFile, "utf8"));
      const roles = Array.isArray(data.messages) ? data.messages.map((m) => m.role) : [];
      if (roles.includes("user") && roles.includes("bot")) return data;
    }
    await sleep(200);
  }
  throw new Error(`thread did not receive user+bot messages: ${threadFile}`);
}

async function waitForCompletedRun(runsFile, threadId, timeoutMs = 10000) {
  const started = Date.now();
  let latestRun = null;
  let runs = null;
  while (Date.now() - started < timeoutMs) {
    runs = fs.existsSync(runsFile)
      ? JSON.parse(fs.readFileSync(runsFile, "utf8"))
      : null;
    latestRun = Array.isArray(runs?.runs)
      ? runs.runs.filter((run) => run.threadId === threadId).at(-1)
      : null;
    const hasTerminalEvent = Array.isArray(runs?.events)
      && runs.events.some(
        (event) => event.runId === latestRun?.id && event.type === "bot_reply",
      );
    if (
      latestRun?.runtime === "external-http"
      && latestRun.status === "completed"
      && typeof latestRun.finishedAt === "string"
      && hasTerminalEvent
    ) {
      return { runs, latestRun };
    }
    await sleep(200);
  }
  throw new Error(
    `agent run did not close with a terminal callback: ${JSON.stringify(latestRun)}`,
  );
}

function startFakeRuntime(port, sanchoPort) {
  const received = [];
  const callbacks = [];
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === (bridgeMode ? "/health" : "/healthz")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, runtime: bridgeMode ? "fake-mc-bridge" : "fake-external-http" }));
        return;
      }

      if (bridgeMode && req.method === "POST" && req.url === "/chat") {
        const payload = await readJsonBody(req);
        received.push({
          headers: {
            authorization: req.headers.authorization,
            "x-mc-secret": req.headers["x-mc-secret"],
            "content-type": req.headers["content-type"],
          },
          payload,
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          response: `Smoke OK desde mc-bridge para ${payload.agent}`,
          sessionId: payload.sessionKey || "fake_bridge_session_1",
        }));
        return;
      }

      if (req.method === "POST" && req.url === "/sancho/inbound") {
        const payload = await readJsonBody(req);
        const terminalCallbackGrant =
          typeof payload.runtimeTerminalCallbackGrant === "string"
            ? payload.runtimeTerminalCallbackGrant.trim()
            : "";
        const terminalCallbackGrantExpiresAt = Date.parse(
          payload.runtimeTerminalCallbackGrantExpiresAt,
        );
        if (
          !terminalCallbackGrant ||
          !Number.isFinite(terminalCallbackGrantExpiresAt) ||
          terminalCallbackGrantExpiresAt <= Date.now()
        ) {
          throw new Error("async runtime admission is missing valid terminal callback authority");
        }
        received.push({
          headers: {
            "x-mc-secret": req.headers["x-mc-secret"],
            "content-type": req.headers["content-type"],
          },
          payload,
        });
        res.writeHead(202, { "content-type": "application/json" });
        res.end(JSON.stringify({ runId: "fake_external_run_1" }));

        setTimeout(async () => {
          const missionControlRunId =
            typeof payload.missionControlRunId === "string"
              ? payload.missionControlRunId.trim()
              : "";
          if (!missionControlRunId) {
            throw new Error("async runtime callback is missing missionControlRunId");
          }
          const webhookPayload = {
            slug: payload.slug,
            threadId: payload.threadId,
            missionControlRunId,
            agent: payload.agent || payload.agentId || "sancho",
            text: `Smoke OK desde runtime externo para: ${payload.text}`,
          };
          const callbackHeaders = {
            "content-type": "application/json",
            "x-mc-secret": secret,
            "x-mission-control-run-id": missionControlRunId,
            "x-sancho-run-capability": payload.runtimeToolCapability,
            "x-sancho-terminal-callback-grant": terminalCallbackGrant,
          };
          const callback = {
            bodyMissionControlRunId: webhookPayload.missionControlRunId,
            headerMissionControlRunId: missionControlRunId,
            terminalGrantForwarded:
              callbackHeaders["x-sancho-terminal-callback-grant"] ===
              payload.runtimeTerminalCallbackGrant,
            status: null,
          };
          callbacks.push(callback);
          const callbackResponse = await fetch(
            `http://127.0.0.1:${sanchoPort}/api/chat/webhook`,
            {
              method: "POST",
              headers: callbackHeaders,
              body: JSON.stringify(webhookPayload),
            },
          );
          callback.status = callbackResponse.status;
        }, 100);
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({ server, received, callbacks }));
  });
}

function startSancho(port, runtimePort) {
  const child = spawn(path.join(root, "node_modules", ".bin", "next"), ["start", "-p", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      MC_WORKSPACE: workspace,
      MC_ADMIN_TOKEN: adminToken,
      // The smoke intentionally uses its isolated disposable JSON ledger.
      // Production itself remains fail-closed without Postgres.
      SANCHO_AGENT_RUNS_BACKEND: "json",
      SANCHO_AGENT_RUNS_ALLOW_NON_DURABLE: "true",
      SANCHO_RUNTIME: "external-http",
      SANCHO_EXTERNAL_GATEWAY_URL: `http://127.0.0.1:${runtimePort}`,
      SANCHO_EXTERNAL_SECRET: secret,
      SANCHO_EXTERNAL_PROTOCOL: bridgeMode ? "mc-bridge" : "sancho",
      ...(bridgeMode
        ? {
            SANCHO_EXTERNAL_CHAT_PATH: "/chat",
            SANCHO_EXTERNAL_HEALTH_PATH: "/health",
            SANCHO_EXTERNAL_AGENT: "sancho-coordinator",
          }
        : {}),
      SANCHO_RUNTIME_TERMINAL_GRANT_SECRET: terminalGrantSecret,
      NEXTAUTH_SECRET: terminalGrantSecret,
      ENCRYPTION_KEY: encryptionKey,
      SANCHO_INTERNAL_API_TOKEN: internalApiToken,
      LOCAL_DASHBOARD_BYPASS: "0",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString("utf8")));
  return { child, logs };
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(3000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

async function main() {
  fs.rmSync(artifactDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "brand", "smoke", "chat"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "_system"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "clients.json"),
    `${JSON.stringify(
      {
        adminToken,
        clients: [
          {
            slug: "smoke",
            name: "External runtime smoke",
            active: true,
            workspace,
            phase: 0,
            paths: { brand: "brand/smoke" },
            metrics: { apis: [] },
            enabledFeatures: [],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const sanchoPort = await freePort();
  const runtimePort = await freePort();
  const fakeRuntime = await startFakeRuntime(runtimePort, sanchoPort);
  const sancho = startSancho(sanchoPort, runtimePort);

  try {
    await waitFor(`http://127.0.0.1:${sanchoPort}/api/health`, "Sancho");
    await waitFor(`http://127.0.0.1:${runtimePort}${bridgeMode ? "/health" : "/healthz"}`, "fake runtime");

    const sendBody = {
      slug: "smoke",
      threadId: "smoke:general",
      threadName: "Smoke external-http",
      text: "Busca leads para probar external-http end-to-end",
      userName: "Smoke",
      userId: "smoke-user",
    };
    const unauthenticated = await fetch(
      `http://127.0.0.1:${sanchoPort}/api/chat/send`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sendBody),
      },
    );
    await unauthenticated.text();
    if (unauthenticated.status !== 403) {
      throw new Error(
        `unauthenticated /api/chat/send must fail closed, got HTTP ${unauthenticated.status}`,
      );
    }

    const sendRes = await fetch(`http://127.0.0.1:${sanchoPort}/api/chat/send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(sendBody),
    });
    const sendText = await sendRes.text();
    if (!sendRes.ok) {
      console.error(sancho.logs.join("").split("\n").slice(-80).join("\n"));
      throw new Error(`/api/chat/send failed HTTP ${sendRes.status}: ${sendText}`);
    }
    const sendResponse = JSON.parse(sendText);

    const threadFile = path.join(workspace, "brand", "smoke", "chat", "general.json");
    const thread = await waitForThread(threadFile);
    const runsFile = path.join(workspace, "_system", "agent-runs.json");
    const { runs, latestRun } = await waitForCompletedRun(
      runsFile,
      "smoke:general",
    );
    if (!bridgeMode) {
      const inboundPayload = fakeRuntime.received.at(-1)?.payload;
      const inboundMissionControlRunId = inboundPayload?.missionControlRunId;
      const callback = fakeRuntime.callbacks.at(-1);
      const correlatedRunIds = [
        sendResponse.runId,
        inboundMissionControlRunId,
        callback?.bodyMissionControlRunId,
        callback?.headerMissionControlRunId,
      ];
      if (correlatedRunIds.some((runId) => runId !== latestRun.id)) {
        throw new Error(
          `async callback did not preserve the Mission Control run id: ${JSON.stringify({
            expected: latestRun.id,
            observed: correlatedRunIds,
          })}`,
        );
      }
      if (
        callback?.terminalGrantForwarded !== true ||
        !Number.isInteger(callback?.status) ||
        callback.status < 200 ||
        callback.status >= 300
      ) {
        throw new Error(
          `async terminal callback did not forward valid terminal authority: ${JSON.stringify(callback)}`,
        );
      }
      const runtimeContract = inboundPayload?.runtimeContract;
      if (
        runtimeContract?.schemaVersion !== 1 ||
        runtimeContract?.kind !== "sancho.mc-chat-context" ||
        typeof runtimeContract?.instructions !== "string" ||
        !runtimeContract.instructions.includes(":::sancho-effect") ||
        runtimeContract.instructions.includes("runtimeToolCapability")
      ) {
        throw new Error("async runtime did not receive the closed portable agent contract");
      }
    }

    const summary = {
      ok: true,
      protocol,
      sanchoPort,
      runtimePort,
      workspace,
      unauthenticatedStatus: unauthenticated.status,
      sendResponse,
      latestRun: {
        id: latestRun.id,
        runtime: latestRun.runtime,
        status: latestRun.status,
        agent: latestRun.agent,
        startedAt: latestRun.startedAt,
        finishedAt: latestRun.finishedAt,
      },
      runtimeReceived: fakeRuntime.received.map((entry) => bridgeMode
        ? {
            headers: entry.headers,
            payload: {
              agent: entry.payload.agent,
              sessionKey: entry.payload.sessionKey,
              messagePreview: String(entry.payload.message || "").slice(0, 300),
            },
          }
        : {
            headers: entry.headers,
            payload: {
              slug: entry.payload.slug,
              threadId: entry.payload.threadId,
              missionControlRunId: entry.payload.missionControlRunId,
              text: entry.payload.text,
              userId: entry.payload.userId,
              userName: entry.payload.userName,
              runtimeFields: {
                agent: entry.payload.agent,
                agentId: entry.payload.agentId,
                skills: entry.payload.skills,
                scope: entry.payload.scope,
              },
              runtimeContract: {
                schemaVersion: entry.payload.runtimeContract?.schemaVersion,
                kind: entry.payload.runtimeContract?.kind,
                hasEffectRail: String(
                  entry.payload.runtimeContract?.instructions || "",
                ).includes(":::sancho-effect"),
              },
            },
          }),
      asyncCallback: bridgeMode ? null : fakeRuntime.callbacks.at(-1) || null,
      threadMessages: thread.messages.map((m) => ({
        role: m.role,
        agent: m.agent,
        text: m.text,
      })),
      agentRuns: runs
        ? {
            runs: runs.runs.map((run) => ({
              id: run.id,
              runtime: run.runtime,
              status: run.status,
              agent: run.agent,
              startedAt: run.startedAt,
              finishedAt: run.finishedAt,
            })),
            events: runs.events.map((event) => ({
              type: event.type,
              threadId: event.threadId,
            })),
          }
        : null,
      sanchoLogTail: sancho.logs.join("").split("\n").slice(-20),
    };
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await stopChild(sancho.child);
    await new Promise((resolve) => fakeRuntime.server.close(resolve));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
