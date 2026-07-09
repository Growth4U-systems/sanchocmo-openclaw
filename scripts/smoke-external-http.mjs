#!/usr/bin/env node
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
const secret = process.env.SMOKE_EXTERNAL_SECRET || "external-http-smoke-secret";

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

function startFakeRuntime(port, sanchoPort) {
  const received = [];
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
          const webhookPayload = {
            slug: payload.slug,
            threadId: payload.threadId,
            agent: payload.agent || payload.agentId || "sancho",
            text: `Smoke OK desde runtime externo para: ${payload.text}`,
          };
          await fetch(`http://127.0.0.1:${sanchoPort}/api/chat/webhook`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-mc-secret": secret,
            },
            body: JSON.stringify(webhookPayload),
          });
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
    server.listen(port, "127.0.0.1", () => resolve({ server, received }));
  });
}

function startSancho(port, runtimePort) {
  const child = spawn(path.join(root, "node_modules", ".bin", "next"), ["start", "-p", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      MC_WORKSPACE: workspace,
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
      NEXTAUTH_SECRET: "external-http-smoke-nextauth",
      ENCRYPTION_KEY: "external-http-smoke-encryption",
      SANCHO_INTERNAL_API_TOKEN: "external-http-smoke-token",
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

  const sanchoPort = await freePort();
  const runtimePort = await freePort();
  const fakeRuntime = await startFakeRuntime(runtimePort, sanchoPort);
  const sancho = startSancho(sanchoPort, runtimePort);

  try {
    await waitFor(`http://127.0.0.1:${sanchoPort}/api/health`, "Sancho");
    await waitFor(`http://127.0.0.1:${runtimePort}${bridgeMode ? "/health" : "/healthz"}`, "fake runtime");

    const sendRes = await fetch(`http://127.0.0.1:${sanchoPort}/api/chat/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "smoke",
        threadId: "smoke:general",
        threadName: "Smoke external-http",
        text: "probando external-http end-to-end",
        userName: "Smoke",
        userId: "smoke-user",
      }),
    });
    const sendText = await sendRes.text();
    if (!sendRes.ok) {
      throw new Error(`/api/chat/send failed HTTP ${sendRes.status}: ${sendText}`);
    }

    const threadFile = path.join(workspace, "brand", "smoke", "chat", "general.json");
    const thread = await waitForThread(threadFile);
    const runsFile = path.join(workspace, "_system", "agent-runs.json");
    const runs = fs.existsSync(runsFile) ? JSON.parse(fs.readFileSync(runsFile, "utf8")) : null;

    const summary = {
      ok: true,
      protocol,
      sanchoPort,
      runtimePort,
      workspace,
      sendResponse: JSON.parse(sendText),
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
              text: entry.payload.text,
              userId: entry.payload.userId,
              userName: entry.payload.userName,
              runtimeFields: {
                agent: entry.payload.agent,
                agentId: entry.payload.agentId,
                skills: entry.payload.skills,
                scope: entry.payload.scope,
              },
            },
          }),
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
