import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  createCallbackOutbox,
  postJsonCallback,
  resolveCallbackOutboxDir,
} from "./callback-outbox.mjs";

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

function waitFor(predicate, timeoutMs = 3_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("timed out"));
      setTimeout(tick, 5);
    };
    tick();
  });
}

function tempOutbox(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, directory: path.join(root, "runtime") };
}

function terminalInput(url, suffix = "one") {
  return {
    deliveryId: `run_mc_${suffix}`,
    url,
    headers: {
      "Content-Type": "application/json",
      "X-Mission-Control-Run-Id": `run_mc_${suffix}`,
      "X-Sancho-Run-Capability": "a".repeat(64),
      "X-MC-Secret": "transport-secret",
    },
    payload: {
      slug: "acme",
      threadId: "acme:general",
      missionControlRunId: `run_mc_${suffix}`,
      text: "terminal answer",
      agent: "hermes",
    },
  };
}

test("terminal callback is fsynced before POST and retries 500 until one visible 2xx", async () => {
  const { root, directory } = tempOutbox("sancho-callback-500-");
  const requests = [];
  let visibleCallbacks = 0;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      requests.push({ body: raw, headers: req.headers });
      if (requests.length === 1) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("x".repeat(64 * 1024));
        return;
      }
      visibleCallbacks += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  const address = await listen(server);
  const events = [];
  const outbox = createCallbackOutbox({
    runtimeId: "hermes",
    directory,
    retryBaseMs: 5,
    retryMaxMs: 10,
    jitterRatio: 0,
    timeoutMs: 100,
    responseMaxBytes: 32,
    logger: (event) => events.push(event),
  });
  outbox.start();

  try {
    const input = terminalInput(`http://127.0.0.1:${address.port}/webhook`);
    const queued = outbox.enqueueTerminal(input);

    assert.equal(requests.length, 0, "the record must exist before the first timer can POST");
    assert.equal(fs.statSync(queued.file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);

    await waitFor(() => requests.length === 2 && outbox.pendingCount() === 0);
    assert.equal(visibleCallbacks, 1);
    assert.equal(requests[0].body, requests[1].body);
    assert.deepEqual(JSON.parse(requests[1].body), input.payload);
    assert.equal(requests[1].headers["x-sancho-run-capability"], "a".repeat(64));
    assert.equal(events.some((event) => event.event === "retry_scheduled"), true);
    assert.equal(JSON.stringify(events).includes("a".repeat(64)), false);
    assert.equal(fs.existsSync(queued.file), false);
  } finally {
    outbox.stop();
    await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("network exception and timeout are retried without exposing capability logs", async () => {
  const { root, directory } = tempOutbox("sancho-callback-timeout-");
  const capability = "b".repeat(64);
  const events = [];
  let attempts = 0;
  const fetchImpl = async (_url, init) => {
    attempts += 1;
    assert.equal(init.redirect, "error");
    if (attempts === 1) throw new Error(`network failed ${capability}`);
    if (attempts === 2) {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(new Error(`timeout ${capability}`)),
          { once: true },
        );
      });
    }
    return new Response("ok", { status: 200 });
  };
  const outbox = createCallbackOutbox({
    runtimeId: "codex",
    directory,
    fetchImpl,
    retryBaseMs: 5,
    retryMaxMs: 5,
    jitterRatio: 0,
    timeoutMs: 15,
    logger: (event) => events.push(event),
  });
  outbox.start();

  try {
    const input = terminalInput("http://127.0.0.1:3000/webhook", "timeout");
    input.headers["X-Sancho-Run-Capability"] = capability;
    outbox.enqueueTerminal(input);
    await waitFor(() => attempts === 3 && outbox.pendingCount() === 0);

    assert.equal(events.filter((event) => event.event === "retry_scheduled").length, 2);
    assert.equal(JSON.stringify(events).includes(capability), false);
  } finally {
    outbox.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a new outbox instance replays a pending callback exactly once", async () => {
  const { root, directory } = tempOutbox("sancho-callback-replay-");
  const first = createCallbackOutbox({ runtimeId: "claude-code", directory });
  const input = terminalInput("http://127.0.0.1:3000/webhook", "replay");
  const queued = first.enqueueTerminal(input);
  const duplicate = first.enqueueTerminal({
    ...input,
    payload: { ...input.payload, text: "must not replace the durable payload" },
  });
  first.stop();

  const bodies = [];
  const second = createCallbackOutbox({
    runtimeId: "claude-code",
    directory,
    fetchImpl: async (_url, init) => {
      bodies.push(init.body);
      return new Response(null, { status: 204 });
    },
    retryBaseMs: 5,
    jitterRatio: 0,
  });

  try {
    assert.equal(queued.existing, false);
    assert.equal(duplicate.existing, true);
    assert.equal(first.pendingCount(), 1);
    second.start();
    await waitFor(() => bodies.length === 1 && second.pendingCount() === 0);
    assert.deepEqual(JSON.parse(bodies[0]), input.payload);
  } finally {
    second.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("4xx callback responses remain pending and are retried as temporary", async () => {
  const { root, directory } = tempOutbox("sancho-callback-4xx-");
  const statuses = [403, 202];
  const events = [];
  let attempts = 0;
  const outbox = createCallbackOutbox({
    runtimeId: "hermes",
    directory,
    fetchImpl: async () => {
      const status = statuses[Math.min(attempts, statuses.length - 1)];
      attempts += 1;
      return new Response("bounded response", { status });
    },
    retryBaseMs: 5,
    retryMaxMs: 5,
    jitterRatio: 0,
    logger: (event) => events.push(event),
  });
  outbox.start();

  try {
    outbox.enqueueTerminal(terminalInput("http://127.0.0.1:3000/webhook", "fourxx"));
    await waitFor(() => attempts === 2 && outbox.pendingCount() === 0);
    assert.equal(
      events.some((event) => event.event === "retry_scheduled" && event.status === 403),
      true,
    );
  } finally {
    outbox.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("outbox repairs permissions and prunes invalid, temporary and max-age records", () => {
  const { root, directory } = tempOutbox("sancho-callback-prune-");
  let currentTime = Date.now();
  const outbox = createCallbackOutbox({
    runtimeId: "codex",
    directory,
    now: () => currentTime,
    maxAgeMs: 100,
  });
  const queued = outbox.enqueueTerminal(
    terminalInput("http://127.0.0.1:3000/webhook", "expired"),
  );
  fs.chmodSync(queued.file, 0o644);
  assert.equal(outbox.prune(), 0);
  assert.equal(fs.statSync(queued.file).mode & 0o777, 0o600);

  const invalid = path.join(directory, `callback-${"f".repeat(64)}.json`);
  fs.writeFileSync(invalid, "not-json", { mode: 0o644 });
  const temporary = path.join(directory, ".tmp-orphan");
  fs.writeFileSync(temporary, "partial", { mode: 0o600 });
  fs.utimesSync(
    temporary,
    new Date(currentTime - 10 * 60 * 1000),
    new Date(currentTime - 10 * 60 * 1000),
  );
  currentTime += 101;

  try {
    assert.equal(outbox.prune(), 3);
    assert.equal(outbox.pendingCount(), 0);
    assert.equal(fs.existsSync(queued.file), false);
    assert.equal(fs.existsSync(invalid), false);
    assert.equal(fs.existsSync(temporary), false);
  } finally {
    outbox.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("callback transport rejects redirects and resolves the documented outbox roots", async () => {
  let observed;
  await postJsonCallback({
    url: "https://sancho.example/api/chat/webhook",
    headers: { "X-MC-Secret": "secret" },
    body: "{}",
    fetchImpl: async (url, init) => {
      observed = { url, init };
      return new Response("ok", { status: 200 });
    },
    timeoutMs: 50,
    responseMaxBytes: 4,
  });

  assert.equal(observed.init.redirect, "error");
  assert.ok(observed.init.signal instanceof AbortSignal);
  assert.equal(
    resolveCallbackOutboxDir("hermes", { SANCHO_HOME: "/srv/sancho" }),
    path.join(
      "/srv/sancho",
      "workspace-sancho",
      "_system",
      "runtime-callback-outbox",
      "hermes",
    ),
  );
  assert.equal(
    resolveCallbackOutboxDir("codex", { SANCHO_CALLBACK_OUTBOX_DIR: "/private/outbox" }),
    path.join("/private/outbox", "codex"),
  );
  assert.equal(
    resolveCallbackOutboxDir("claude-code", {
      MC_WORKSPACE: "/srv/persistent/workspace-sancho",
      SANCHO_HOME: "/nonpersistent",
    }),
    path.join(
      "/srv/persistent/workspace-sancho",
      "_system",
      "runtime-callback-outbox",
      "claude-code",
    ),
  );

  const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");
  assert.match(
    dockerfile,
    /COPY docker\/runtimes\/callback-outbox\.mjs \.\/docker\/runtimes\/callback-outbox\.mjs/,
  );
});
