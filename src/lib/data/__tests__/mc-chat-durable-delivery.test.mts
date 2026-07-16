import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "sancho-durable-chat-delivery-"),
);
process.env.MC_WORKSPACE = workspace;

const deliveryModule = await import("../mc-chat-durable-delivery");
const delivery =
  (deliveryModule as unknown as { default?: typeof deliveryModule }).default ??
  deliveryModule;
const chatModule = await import("../mc-chat");
const chat =
  (chatModule as unknown as { default?: typeof chatModule }).default ??
  chatModule;

const threadId = "growth4u:durable-delivery";
const deliveryKey = "execution-terminal:leads.search:v1:xrun-1";
const message = {
  role: "bot" as const,
  text: "Búsqueda completada: Ada Lovelace",
  ts: 1_784_204_000_000,
  agent: "sancho",
};

function deliveryDirectory(shortId: string): string {
  return path.join(
    workspace,
    "brand",
    "growth4u",
    "chat",
    "_deliveries",
    shortId,
  );
}

function finalSidecars(directory: string): string[] {
  return fs
    .readdirSync(directory)
    .filter((file) => /^[a-f0-9]{64}\.json$/.test(file));
}

function captureDirectoryFsyncs<T>(run: () => T): {
  result: T;
  syncedDirectories: string[];
} {
  const openedDirectories = new Map<number, string>();
  const syncedDirectories: string[] = [];
  const mutableFs = fs as unknown as {
    openSync: (...args: unknown[]) => number;
    fsyncSync: (descriptor: number) => void;
    closeSync: (descriptor: number) => void;
  };
  const originalOpenSync = mutableFs.openSync;
  const originalFsyncSync = mutableFs.fsyncSync;
  const originalCloseSync = mutableFs.closeSync;

  mutableFs.openSync = (...args: unknown[]): number => {
    const descriptor = Reflect.apply(originalOpenSync, fs, args) as number;
    const flags = args[1];
    if (
      typeof flags === "number" &&
      (flags & fs.constants.O_DIRECTORY) === fs.constants.O_DIRECTORY
    ) {
      openedDirectories.set(descriptor, path.resolve(String(args[0])));
    }
    return descriptor;
  };
  mutableFs.fsyncSync = (descriptor: number): void => {
    const directory = openedDirectories.get(descriptor);
    if (directory) syncedDirectories.push(directory);
    Reflect.apply(originalFsyncSync, fs, [descriptor]);
  };
  mutableFs.closeSync = (descriptor: number): void => {
    try {
      Reflect.apply(originalCloseSync, fs, [descriptor]);
    } finally {
      openedDirectories.delete(descriptor);
    }
  };

  try {
    return { result: run(), syncedDirectories };
  } finally {
    mutableFs.openSync = originalOpenSync;
    mutableFs.fsyncSync = originalFsyncSync;
    mutableFs.closeSync = originalCloseSync;
  }
}

interface ChildWriter {
  child: ChildProcess;
  readyFile: string;
  completed: Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }>;
}

function spawnChildWriter(input: {
  readyFile: string;
  gateFile: string;
  threadId: string;
  deliveryKey: string;
  message: typeof message;
}): ChildWriter {
  const deliveryModuleUrl = pathToFileURL(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../mc-chat-durable-delivery.ts",
    ),
  ).href;
  const script = `
    import fs from "node:fs";
    const imported = await import(${JSON.stringify(deliveryModuleUrl)});
    const delivery = imported.default ?? imported;
    const input = JSON.parse(process.env.DURABLE_DELIVERY_INPUT);
    fs.writeFileSync(process.env.DURABLE_DELIVERY_READY, "ready");
    while (!fs.existsSync(process.env.DURABLE_DELIVERY_GATE)) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const result = delivery.appendDurableChatDelivery(input);
    process.stdout.write(JSON.stringify(result));
  `;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MC_WORKSPACE: workspace,
        DURABLE_DELIVERY_INPUT: JSON.stringify({
          threadId: input.threadId,
          deliveryKey: input.deliveryKey,
          message: input.message,
        }),
        DURABLE_DELIVERY_READY: input.readyFile,
        DURABLE_DELIVERY_GATE: input.gateFile,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const completed = new Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }>((resolve) => {
    child.on("error", (error) => {
      stderr += error.stack ?? error.message;
      resolve({ exitCode: child.exitCode, stdout, stderr });
    });
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
  return { child, readyFile: input.readyFile, completed };
}

async function waitForFiles(
  files: string[],
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (files.some((file) => !fs.existsSync(file))) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for concurrent delivery writers");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("first delivery durably publishes every new directory entry and replay is stable", () => {
  const firstThreadId = "durability1:first-create";
  const firstDeliveryKey =
    "execution-terminal:leads.search:v1:xrun-first-create";
  const brandRoot = path.join(workspace, "brand");
  const tenantRoot = path.join(brandRoot, "durability1");
  const chatRoot = path.join(tenantRoot, "chat");
  const deliveriesRoot = path.join(chatRoot, "_deliveries");
  const leaf = path.join(deliveriesRoot, "first-create");
  const durableChain = [
    workspace,
    brandRoot,
    tenantRoot,
    chatRoot,
    deliveriesRoot,
    leaf,
  ];

  const first = captureDirectoryFsyncs(() =>
    delivery.appendDurableChatDelivery({
      threadId: firstThreadId,
      deliveryKey: firstDeliveryKey,
      message: { ...message, text: "First durable result" },
    }),
  );
  assert.equal(first.result.created, true);
  assert.deepEqual(first.syncedDirectories.slice(0, 10), [
    brandRoot,
    workspace,
    tenantRoot,
    brandRoot,
    chatRoot,
    tenantRoot,
    deliveriesRoot,
    chatRoot,
    leaf,
    deliveriesRoot,
  ]);
  assert.ok(
    durableChain.every((directory) =>
      first.syncedDirectories.includes(directory),
    ),
  );

  const identities = new Map(
    durableChain.map((directory) => {
      const stat = fs.lstatSync(directory);
      return [directory, `${stat.dev}:${stat.ino}`] as const;
    }),
  );
  const replay = captureDirectoryFsyncs(() =>
    delivery.appendDurableChatDelivery({
      threadId: firstThreadId,
      deliveryKey: firstDeliveryKey,
      message: {
        ...message,
        text: "First durable result",
        ts: message.ts + 60_000,
      },
    }),
  );
  assert.equal(replay.result.created, false);
  assert.equal(replay.result.fingerprint, first.result.fingerprint);
  assert.ok(
    durableChain.every((directory) =>
      replay.syncedDirectories.includes(directory),
    ),
  );
  assert.deepEqual(
    new Map(
      durableChain.map((directory) => {
        const stat = fs.lstatSync(directory);
        return [directory, `${stat.dev}:${stat.ino}`] as const;
      }),
    ),
    identities,
  );
  assert.equal(finalSidecars(leaf).length, 1);
  assert.equal(
    fs.readdirSync(leaf).filter((file) => file.endsWith(".tmp")).length,
    0,
  );
});

test("durable delivery refuses symlinks in a destination directory chain", () => {
  const outside = path.join(workspace, "outside-symlink-target");
  const linkedTenant = path.join(workspace, "brand", "linkedtenant");
  fs.mkdirSync(outside, { recursive: true });
  fs.symlinkSync(outside, linkedTenant, "dir");

  assert.throws(
    () =>
      delivery.appendDurableChatDelivery({
        threadId: "linkedtenant:must-not-follow",
        deliveryKey: "execution-terminal:leads.search:v1:xrun-symlink",
        message: { ...message, text: "Must stay inside the workspace" },
      }),
    (error: unknown) =>
      error instanceof delivery.DurableChatDeliveryCorruptError,
  );
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("durable delivery fails closed when a parent directory fsync fails", () => {
  const mutableFs = fs as unknown as {
    fsyncSync: (descriptor: number) => void;
  };
  const originalFsyncSync = mutableFs.fsyncSync;
  let fsyncCalls = 0;
  mutableFs.fsyncSync = (descriptor: number): void => {
    fsyncCalls += 1;
    if (fsyncCalls === 2) {
      const error = new Error("synthetic parent fsync failure") as Error & {
        code: string;
      };
      error.code = "EIO";
      throw error;
    }
    Reflect.apply(originalFsyncSync, fs, [descriptor]);
  };

  try {
    assert.throws(
      () =>
        delivery.appendDurableChatDelivery({
          threadId: "durability2:fsync-failure",
          deliveryKey: "execution-terminal:leads.search:v1:xrun-fsync-failure",
          message: { ...message, text: "Must not report success" },
        }),
      (error: unknown) => (error as NodeJS.ErrnoException)?.code === "EIO",
    );
  } finally {
    mutableFs.fsyncSync = originalFsyncSync;
  }

  assert.equal(
    fs.existsSync(
      path.join(
        workspace,
        "brand",
        "durability2",
        "chat",
        "_deliveries",
        "fsync-failure",
      ),
    ),
    false,
  );
});

test("durable chat delivery is insert-only, retry-safe and visible in the thread", () => {
  const first = delivery.appendDurableChatDelivery({
    threadId,
    deliveryKey,
    message,
  });
  const replay = delivery.appendDurableChatDelivery({
    threadId,
    deliveryKey,
    message,
  });

  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal(replay.fingerprint, first.fingerprint);
  assert.equal(finalSidecars(deliveryDirectory("durable-delivery")).length, 1);
  assert.deepEqual(chat.getThread(threadId).messages, [
    { ...message, deliveryKey },
  ]);

  assert.throws(
    () =>
      delivery.appendDurableChatDelivery({
        threadId,
        deliveryKey,
        message: { ...message, text: "payload drift" },
      }),
    (error: unknown) =>
      error instanceof delivery.DurableChatDeliveryConflictError,
  );
  assert.equal(finalSidecars(deliveryDirectory("durable-delivery")).length, 1);
  assert.deepEqual(delivery.listDurableChatDeliveries(threadId), [
    { ...message, deliveryKey },
  ]);

  const timestampReplay = delivery.appendDurableChatDelivery({
    threadId,
    deliveryKey,
    message: { ...message, ts: message.ts + 60_000 },
  });
  assert.equal(timestampReplay.created, false);
  assert.equal(timestampReplay.fingerprint, first.fingerprint);
  assert.deepEqual(delivery.listDurableChatDeliveries(threadId), [
    { ...message, deliveryKey },
  ]);
});

test("concurrent processes publish exactly one immutable sidecar", async () => {
  const concurrentThreadId = "growth4u:durable-concurrent-race";
  const concurrentDeliveryKey =
    "execution-terminal:leads.search:v1:xrun-concurrent";
  const raceDirectory = path.join(workspace, "concurrent-race");
  const gateFile = path.join(raceDirectory, "go");
  fs.mkdirSync(raceDirectory, { recursive: true });

  const writers = Array.from({ length: 8 }, (_, index) =>
    spawnChildWriter({
      readyFile: path.join(raceDirectory, `ready-${index}`),
      gateFile,
      threadId: concurrentThreadId,
      deliveryKey: concurrentDeliveryKey,
      message: { ...message, text: "One result from concurrent workers" },
    }),
  );

  try {
    await waitForFiles(writers.map((writer) => writer.readyFile));
    fs.writeFileSync(gateFile, "go", "utf8");
    const outcomes = await Promise.all(
      writers.map((writer) => writer.completed),
    );
    assert.deepEqual(
      outcomes.map((outcome) => outcome.exitCode),
      Array(8).fill(0),
      outcomes.map((outcome) => outcome.stderr).join("\n"),
    );

    const results = outcomes.map(
      (outcome) =>
        JSON.parse(outcome.stdout) as { created: boolean; fingerprint: string },
    );
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(new Set(results.map((result) => result.fingerprint)).size, 1);

    const sidecarDirectory = deliveryDirectory("durable-concurrent-race");
    assert.equal(finalSidecars(sidecarDirectory).length, 1);
    assert.equal(
      fs.readdirSync(sidecarDirectory).filter((file) => file.endsWith(".tmp"))
        .length,
      0,
    );
    assert.deepEqual(delivery.listDurableChatDeliveries(concurrentThreadId), [
      {
        ...message,
        text: "One result from concurrent workers",
        deliveryKey: concurrentDeliveryKey,
      },
    ]);
  } finally {
    if (!fs.existsSync(gateFile)) fs.writeFileSync(gateFile, "go", "utf8");
    for (const writer of writers) {
      if (writer.child.exitCode === null) writer.child.kill();
    }
    await Promise.allSettled(writers.map((writer) => writer.completed));
  }
});

test("legacy thread overwrites cannot erase an insert-only delivery", () => {
  const threadFile = path.join(
    workspace,
    "brand",
    "growth4u",
    "chat",
    "durable-delivery.json",
  );
  fs.mkdirSync(path.dirname(threadFile), { recursive: true });
  fs.writeFileSync(
    threadFile,
    JSON.stringify({
      messages: [{ role: "user", text: "Busca un lead", ts: message.ts - 1 }],
    }),
    "utf8",
  );

  const messages = chat.getThread(threadId).messages;
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "user");
  assert.equal(messages[1].deliveryKey, deliveryKey);

  // Simulate a stale writer replacing the legacy JSON after the sidecar was
  // published. The next read must still merge the terminal result exactly once.
  fs.writeFileSync(threadFile, JSON.stringify({ messages: [] }), "utf8");
  assert.deepEqual(chat.getThread(threadId).messages, [
    { ...message, deliveryKey },
  ]);
});

test("durable sidecar collapses duplicate legacy copies of its delivery key", () => {
  const duplicateThreadId = "growth4u:durable-legacy-duplicates";
  const duplicateDeliveryKey =
    "execution-terminal:leads.search:v1:xrun-legacy-duplicates";
  const canonicalMessage = {
    ...message,
    text: "Canonical durable result",
    ts: message.ts + 1,
  };
  delivery.appendDurableChatDelivery({
    threadId: duplicateThreadId,
    deliveryKey: duplicateDeliveryKey,
    message: canonicalMessage,
  });
  chat.saveThread(duplicateThreadId, {
    messages: [
      {
        ...canonicalMessage,
        text: "stale legacy copy one",
        deliveryKey: duplicateDeliveryKey,
      },
      {
        ...canonicalMessage,
        text: "stale legacy copy two",
        deliveryKey: duplicateDeliveryKey,
      },
    ],
  });

  assert.deepEqual(chat.getThread(duplicateThreadId).messages, [
    { ...canonicalMessage, deliveryKey: duplicateDeliveryKey },
  ]);
});

test("durable delivery rejects non-canonical destinations before filesystem I/O", () => {
  assert.throws(
    () =>
      delivery.appendDurableChatDelivery({
        threadId: "growth4u:../other",
        deliveryKey,
        message,
      }),
    (error: unknown) =>
      error instanceof delivery.DurableChatDeliveryCorruptError,
  );
});

test.after(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
});
