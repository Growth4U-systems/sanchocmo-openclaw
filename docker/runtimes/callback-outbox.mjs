import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const RECORD_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RESPONSE_MAX_BYTES = 8 * 1024;
const DEFAULT_RECORD_MAX_BYTES = 2 * 1024 * 1024;
// Must not exceed the server-issued terminal callback grant lifetime.
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETRY_BASE_MS = 1_000;
const DEFAULT_RETRY_MAX_MS = 60_000;
const DEFAULT_JITTER_RATIO = 0.2;
const DEFAULT_MAX_PENDING = 10_000;
const TEMP_FILE_MAX_AGE_MS = 5 * 60 * 1000;
const RUNTIME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function positiveNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function boundedRatio(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
  return parsed;
}

function assertRuntimeId(runtimeId) {
  if (typeof runtimeId !== "string" || !RUNTIME_ID_PATTERN.test(runtimeId)) {
    throw new Error("Invalid callback outbox runtime id");
  }
  return runtimeId;
}

function normalizeCallbackUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw new Error("Invalid callback URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Callback URL must use http or https");
  }
  return parsed.toString();
}

function normalizeHeaders(headers) {
  const normalized = {};
  for (const [name, value] of Object.entries(headers || {})) {
    if (!HEADER_NAME_PATTERN.test(name)) continue;
    if (typeof value !== "string" || value.length > 16 * 1024) continue;
    normalized[name] = value;
  }
  return normalized;
}

function callbackId(runtimeId, deliveryId) {
  const boundedDeliveryId = String(deliveryId || "");
  if (!boundedDeliveryId || boundedDeliveryId.length > 512) {
    throw new Error("Invalid terminal callback delivery id");
  }
  return createHash("sha256")
    .update(runtimeId, "utf8")
    .update("\0", "utf8")
    .update(boundedDeliveryId, "utf8")
    .digest("hex");
}

function safeUnlink(file) {
  try {
    fs.unlinkSync(file);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function recordIdentityFromFile(file) {
  const match = /^callback-([a-f0-9]{64})\.json$/.exec(path.basename(file));
  return match ? { callbackId: match[1] } : null;
}

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Callback outbox path is not a private directory");
  }
  fs.chmodSync(directory, 0o700);
}

function syncDirectory(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, "r");
    fs.fsyncSync(descriptor);
  } catch {
    // Some filesystems do not support fsync on directories. The record itself
    // is still fsynced and atomically renamed before any delivery begins.
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function atomicWriteRecord(file, record, maxRecordBytes) {
  const directory = path.dirname(file);
  ensurePrivateDirectory(directory);
  const serialized = JSON.stringify(record);
  if (Buffer.byteLength(serialized) > maxRecordBytes) {
    throw new Error("Terminal callback record exceeds the durable outbox limit");
  }

  const temp = path.join(
    directory,
    `.tmp-${path.basename(file)}-${process.pid}-${randomUUID()}`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(descriptor, serialized, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temp, file);
    fs.chmodSync(file, 0o600);
    syncDirectory(directory);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    safeUnlink(temp);
    throw error;
  }
}

function isValidRecord(record, runtimeId) {
  return Boolean(
    record &&
    record.version === RECORD_VERSION &&
    record.runtimeId === runtimeId &&
    typeof record.callbackId === "string" &&
    /^[a-f0-9]{64}$/.test(record.callbackId) &&
    typeof record.url === "string" &&
    typeof record.body === "string" &&
    record.headers &&
    typeof record.headers === "object" &&
    Number.isFinite(record.createdAt) &&
    Number.isFinite(record.nextAttemptAt) &&
    Number.isInteger(record.attempts) &&
    record.attempts >= 0,
  );
}

function readRecord(file, runtimeId, maxRecordBytes) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxRecordBytes) {
    throw new Error("Invalid callback outbox record");
  }
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!isValidRecord(record, runtimeId)) {
    throw new Error("Invalid callback outbox record");
  }
  // Repair permissions left by an older version before loading credentials.
  fs.chmodSync(file, 0o600);
  return record;
}

async function readResponseBodyLimited(response, maxBytes) {
  if (!response?.body || typeof response.body.getReader !== "function") return;
  const reader = response.body.getReader();
  let consumed = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      consumed += value?.byteLength || 0;
      if (consumed > maxBytes) {
        await reader.cancel().catch(() => {});
        return;
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

function parseRetryAfterMs(value, nowMs = Date.now()) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    return Number.isSafeInteger(seconds) ? seconds * 1_000 : undefined;
  }
  const retryAt = Date.parse(normalized);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(0, retryAt - nowMs);
}

/**
 * Perform one bounded callback attempt. Errors intentionally contain no URL,
 * headers, response body, payload or run capability.
 */
export async function postJsonCallback({
  url,
  headers,
  body,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  responseMaxBytes = DEFAULT_RESPONSE_MAX_BYTES,
}) {
  if (typeof fetchImpl !== "function") throw new Error("Callback fetch is unavailable");
  const callbackUrl = normalizeCallbackUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  let response;
  try {
    response = await fetchImpl(callbackUrl, {
      method: "POST",
      headers: normalizeHeaders(headers),
      body,
      redirect: "error",
      signal: controller.signal,
    });
    await readResponseBodyLimited(response, responseMaxBytes);
  } catch (error) {
    const callbackError = new Error(
      controller.signal.aborted ? "Callback request timed out" : "Callback request failed",
    );
    callbackError.kind = controller.signal.aborted ? "timeout" : "network";
    callbackError.cause = error;
    throw callbackError;
  } finally {
    clearTimeout(timeout);
  }

  if (!response || !Number.isInteger(response.status)) {
    const error = new Error("Callback returned an invalid response");
    error.kind = "invalid_response";
    throw error;
  }
  if (response.status < 200 || response.status >= 300) {
    const error = new Error(`Callback returned HTTP ${response.status}`);
    error.kind = "http";
    error.status = response.status;
    error.retryAfterMs = parseRetryAfterMs(response.headers?.get?.("retry-after"));
    throw error;
  }
  return { status: response.status };
}

export function resolveCallbackOutboxDir(runtimeId, env = process.env) {
  const safeRuntimeId = assertRuntimeId(runtimeId);
  const configuredRoot = env.SANCHO_CALLBACK_OUTBOX_DIR?.trim();
  const workspace = env.MC_WORKSPACE?.trim();
  const privateHome = workspace
    ? path.dirname(path.resolve(workspace))
    : env.SANCHO_HOME?.trim() ||
      env.OPENCLAW_HOME?.trim() ||
      process.cwd();
  const root = configuredRoot
    ? path.resolve(configuredRoot)
    : path.resolve(privateHome, ".runtime-callback-outbox");
  return path.join(root, safeRuntimeId);
}

export function createCallbackOutbox(options) {
  const runtimeId = assertRuntimeId(options?.runtimeId);
  const env = options?.env || process.env;
  const directory = path.resolve(
    options?.directory || resolveCallbackOutboxDir(runtimeId, env),
  );
  const fetchImpl = options?.fetchImpl || globalThis.fetch;
  const now = options?.now || Date.now;
  const random = options?.random || Math.random;
  const logger = typeof options?.logger === "function" ? options.logger : () => {};
  const timeoutMs = positiveNumber(
    options?.timeoutMs,
    env.SANCHO_CALLBACK_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const responseMaxBytes = positiveNumber(
    options?.responseMaxBytes,
    env.SANCHO_CALLBACK_RESPONSE_MAX_BYTES,
    DEFAULT_RESPONSE_MAX_BYTES,
  );
  const maxRecordBytes = positiveNumber(
    options?.maxRecordBytes,
    env.SANCHO_CALLBACK_RECORD_MAX_BYTES,
    DEFAULT_RECORD_MAX_BYTES,
  );
  const maxAgeMs = positiveNumber(
    options?.maxAgeMs,
    env.SANCHO_CALLBACK_OUTBOX_MAX_AGE_MS,
    DEFAULT_MAX_AGE_MS,
  );
  const retryBaseMs = positiveNumber(
    options?.retryBaseMs,
    env.SANCHO_CALLBACK_RETRY_BASE_MS,
    DEFAULT_RETRY_BASE_MS,
  );
  const retryMaxMs = positiveNumber(
    options?.retryMaxMs,
    env.SANCHO_CALLBACK_RETRY_MAX_MS,
    DEFAULT_RETRY_MAX_MS,
  );
  const jitterRatio = boundedRatio(
    options?.jitterRatio ?? env.SANCHO_CALLBACK_RETRY_JITTER,
    DEFAULT_JITTER_RATIO,
  );
  const maxPending = positiveNumber(
    options?.maxPending,
    env.SANCHO_CALLBACK_OUTBOX_MAX_PENDING,
    DEFAULT_MAX_PENDING,
  );

  const timers = new Map();
  const inFlight = new Set();
  let started = false;

  function emit(event, record, extra = {}) {
    try {
      logger({
        event,
        runtimeId,
        callbackId: record?.callbackId,
        attempts: record?.attempts,
        ...extra,
      });
    } catch {
      // Logging must never affect delivery and never receives credentials.
    }
  }

  function recordFiles() {
    ensurePrivateDirectory(directory);
    return fs.readdirSync(directory)
      .filter((name) => /^callback-[a-f0-9]{64}\.json$/.test(name))
      .map((name) => path.join(directory, name));
  }

  function prune() {
    ensurePrivateDirectory(directory);
    let removed = 0;
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name);
      if (name.startsWith(".tmp-")) {
        try {
          if (now() - fs.lstatSync(file).mtimeMs > TEMP_FILE_MAX_AGE_MS) {
            safeUnlink(file);
            removed += 1;
          }
        } catch {
          safeUnlink(file);
          removed += 1;
        }
        continue;
      }
      if (!/^callback-[a-f0-9]{64}\.json$/.test(name)) continue;
      try {
        const record = readRecord(file, runtimeId, maxRecordBytes);
        if (now() - record.createdAt > maxAgeMs) {
          safeUnlink(file);
          removed += 1;
          emit("expired", record);
        }
      } catch {
        safeUnlink(file);
        removed += 1;
        emit("pruned_invalid", recordIdentityFromFile(file));
      }
    }
    if (removed > 0) syncDirectory(directory);
    return removed;
  }

  function retryDelay(attempts) {
    const exponential = Math.min(
      retryMaxMs,
      retryBaseMs * (2 ** Math.max(0, Math.min(attempts - 1, 30))),
    );
    const jitter = exponential * jitterRatio;
    return Math.max(1, Math.round(exponential - jitter + (2 * jitter * random())));
  }

  function schedule(file, delayMs) {
    if (!started) return;
    const existing = timers.get(file);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      timers.delete(file);
      void deliver(file);
    }, Math.max(0, delayMs));
    timer.unref?.();
    timers.set(file, timer);
  }

  async function deliver(file) {
    if (!started || inFlight.has(file)) return;
    let record;
    try {
      record = readRecord(file, runtimeId, maxRecordBytes);
    } catch {
      safeUnlink(file);
      syncDirectory(directory);
      emit("pruned_invalid", recordIdentityFromFile(file));
      return;
    }
    if (now() - record.createdAt > maxAgeMs) {
      safeUnlink(file);
      emit("expired", record);
      return;
    }
    if (record.nextAttemptAt > now()) {
      schedule(file, record.nextAttemptAt - now());
      return;
    }

    inFlight.add(file);
    try {
      const result = await postJsonCallback({
        url: record.url,
        headers: record.headers,
        body: record.body,
        fetchImpl,
        timeoutMs,
        responseMaxBytes,
      });
      safeUnlink(file);
      syncDirectory(directory);
      emit("delivered", record, { status: result.status });
    } catch (error) {
      record.attempts += 1;
      record.lastAttemptAt = now();
      record.lastFailure = {
        kind: typeof error?.kind === "string" ? error.kind : "unknown",
        status: Number.isInteger(error?.status) ? error.status : undefined,
      };
      const exponentialDelayMs = retryDelay(record.attempts);
      const requestedDelayMs = Number.isFinite(error?.retryAfterMs)
        ? Math.max(0, error.retryAfterMs)
        : 0;
      const remainingAgeMs = Math.max(1, maxAgeMs - (now() - record.createdAt));
      const delayMs = Math.min(
        remainingAgeMs,
        Math.max(exponentialDelayMs, requestedDelayMs),
      );
      record.nextAttemptAt = now() + delayMs;
      try {
        atomicWriteRecord(file, record, maxRecordBytes);
        emit("retry_scheduled", record, {
          status: record.lastFailure.status,
          delayMs,
        });
      } catch {
        // The previous durable record remains authoritative. Keep retrying it
        // in memory; a restart will replay that record even if this metadata
        // update could not be persisted.
        emit("retry_state_persist_failed", record, { delayMs });
      }
      schedule(file, delayMs);
    } finally {
      inFlight.delete(file);
    }
  }

  function replayPending() {
    prune();
    for (const file of recordFiles()) {
      try {
        const record = readRecord(file, runtimeId, maxRecordBytes);
        schedule(file, Math.max(0, record.nextAttemptAt - now()));
      } catch {
        safeUnlink(file);
        syncDirectory(directory);
        emit("pruned_invalid", recordIdentityFromFile(file));
      }
    }
  }

  function start() {
    if (started) return;
    started = true;
    replayPending();
  }

  function stop() {
    started = false;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  }

  function enqueueTerminal({ deliveryId, url, headers, payload }) {
    ensurePrivateDirectory(directory);
    prune();
    const id = callbackId(runtimeId, deliveryId);
    const file = path.join(directory, `callback-${id}.json`);
    if (fs.existsSync(file)) {
      if (started) schedule(file, 0);
      return { callbackId: id, file, existing: true };
    }
    if (recordFiles().length >= maxPending) {
      throw new Error("Terminal callback outbox is full");
    }
    const body = JSON.stringify(payload);
    const createdAt = now();
    const record = {
      version: RECORD_VERSION,
      runtimeId,
      callbackId: id,
      url: normalizeCallbackUrl(url),
      headers: normalizeHeaders(headers),
      body,
      createdAt,
      attempts: 0,
      lastAttemptAt: null,
      nextAttemptAt: createdAt,
    };
    // This synchronous atomic write and fsync is deliberately completed before
    // schedule() can perform the first network request.
    atomicWriteRecord(file, record, maxRecordBytes);
    emit("persisted", record);
    if (started) schedule(file, 0);
    return { callbackId: id, file, existing: false };
  }

  function pendingCount() {
    return recordFiles().length;
  }

  async function postBestEffort({ url, headers, payload }) {
    const body = JSON.stringify(payload);
    if (Buffer.byteLength(body) > maxRecordBytes) {
      throw new Error("Callback payload exceeds the transport limit");
    }
    return postJsonCallback({
      url,
      headers,
      body,
      fetchImpl,
      timeoutMs,
      responseMaxBytes,
    });
  }

  return {
    directory,
    enqueueTerminal,
    pendingCount,
    postBestEffort,
    prune,
    replayPending,
    start,
    stop,
  };
}
