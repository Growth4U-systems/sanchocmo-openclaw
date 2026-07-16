import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BASE } from "./paths";
import {
  canonicalThreadId,
  parseThreadId,
  sanitizeShortId,
} from "../thread-id";

const DELIVERY_SCHEMA_VERSION = 1 as const;
const DELIVERY_KEY_MAX_BYTES = 512;
const DELIVERY_TEXT_MAX_BYTES = 16 * 1024;
const DELIVERY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/;
const AGENT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const DIRECTORY_OPEN_FLAGS =
  fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const READ_FILE_OPEN_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const CREATE_FILE_OPEN_FLAGS =
  fs.constants.O_WRONLY |
  fs.constants.O_CREAT |
  fs.constants.O_EXCL |
  fs.constants.O_NOFOLLOW;

export interface DurableChatDeliveryMessage {
  role: "bot" | "workflow" | "system";
  text: string;
  ts: number;
  agent?: string;
  deliveryKey: string;
}

interface DurableChatDeliveryRecord {
  schemaVersion: typeof DELIVERY_SCHEMA_VERSION;
  threadId: string;
  deliveryKey: string;
  message: DurableChatDeliveryMessage;
  fingerprint: string;
}

export class DurableChatDeliveryConflictError extends Error {
  readonly code = "durable_chat_delivery_conflict" as const;

  constructor() {
    super("A durable chat delivery key is already bound to another message");
    this.name = "DurableChatDeliveryConflictError";
  }
}

export class DurableChatDeliveryCorruptError extends Error {
  readonly code = "durable_chat_delivery_corrupt" as const;

  constructor() {
    super("A durable chat delivery record is corrupt");
    this.name = "DurableChatDeliveryCorruptError";
  }
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new DurableChatDeliveryCorruptError();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalThread(value: unknown): {
  threadId: string;
  slug: string;
  shortId: string;
} {
  if (typeof value !== "string") throw new DurableChatDeliveryCorruptError();
  const parsed = parseThreadId(value);
  if (
    !parsed ||
    parsed.slug !== parsed.slug.toLowerCase() ||
    canonicalThreadId(value) !== value
  ) {
    throw new DurableChatDeliveryCorruptError();
  }
  return {
    threadId: value,
    slug: parsed.slug,
    shortId: sanitizeShortId(parsed.shortId),
  };
}

function canonicalDeliveryKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    utf8Bytes(value) > DELIVERY_KEY_MAX_BYTES ||
    !DELIVERY_KEY_PATTERN.test(value)
  ) {
    throw new DurableChatDeliveryCorruptError();
  }
  return value;
}

function canonicalMessage(
  value: unknown,
  deliveryKey: string,
): DurableChatDeliveryMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DurableChatDeliveryCorruptError();
  }
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      (key) => !["role", "text", "ts", "agent", "deliveryKey"].includes(key),
    ) ||
    (raw.role !== "bot" && raw.role !== "workflow" && raw.role !== "system") ||
    typeof raw.text !== "string" ||
    !raw.text.trim() ||
    utf8Bytes(raw.text) > DELIVERY_TEXT_MAX_BYTES ||
    raw.text.includes("\0") ||
    typeof raw.ts !== "number" ||
    !Number.isSafeInteger(raw.ts) ||
    raw.ts < 0 ||
    raw.deliveryKey !== deliveryKey ||
    (raw.agent !== undefined &&
      (typeof raw.agent !== "string" || !AGENT_PATTERN.test(raw.agent)))
  ) {
    throw new DurableChatDeliveryCorruptError();
  }
  return {
    role: raw.role,
    text: raw.text,
    ts: raw.ts,
    ...(typeof raw.agent === "string" ? { agent: raw.agent } : {}),
    deliveryKey,
  };
}

function recordFingerprint(input: {
  schemaVersion: typeof DELIVERY_SCHEMA_VERSION;
  threadId: string;
  deliveryKey: string;
  message: DurableChatDeliveryMessage;
}): string {
  return sha256(canonicalJson(input));
}

function logicalDeliveryFingerprint(input: {
  schemaVersion: typeof DELIVERY_SCHEMA_VERSION;
  threadId: string;
  deliveryKey: string;
  message: DurableChatDeliveryMessage;
}): string {
  const { ts: _firstWriterTimestamp, ...logicalMessage } = input.message;
  return sha256(
    canonicalJson({
      schemaVersion: input.schemaVersion,
      threadId: input.threadId,
      deliveryKey: input.deliveryKey,
      message: logicalMessage,
    }),
  );
}

function deliveryDirectory(threadId: string): string {
  const thread = canonicalThread(threadId);
  const chatDirectory = path.resolve(BASE, "brand", thread.slug, "chat");
  const directory = path.resolve(chatDirectory, "_deliveries", thread.shortId);
  if (!directory.startsWith(`${chatDirectory}${path.sep}`)) {
    throw new DurableChatDeliveryCorruptError();
  }
  return directory;
}

function deliveryFile(threadId: string, deliveryKey: string): string {
  return path.join(deliveryDirectory(threadId), `${sha256(deliveryKey)}.json`);
}

function normalizeRecord(value: unknown): DurableChatDeliveryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DurableChatDeliveryCorruptError();
  }
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      (key) =>
        ![
          "schemaVersion",
          "threadId",
          "deliveryKey",
          "message",
          "fingerprint",
        ].includes(key),
    ) ||
    raw.schemaVersion !== DELIVERY_SCHEMA_VERSION ||
    typeof raw.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.fingerprint)
  ) {
    throw new DurableChatDeliveryCorruptError();
  }
  const thread = canonicalThread(raw.threadId);
  const deliveryKey = canonicalDeliveryKey(raw.deliveryKey);
  const message = canonicalMessage(raw.message, deliveryKey);
  const fingerprint = recordFingerprint({
    schemaVersion: DELIVERY_SCHEMA_VERSION,
    threadId: thread.threadId,
    deliveryKey,
    message,
  });
  if (fingerprint !== raw.fingerprint) {
    throw new DurableChatDeliveryCorruptError();
  }
  return {
    schemaVersion: DELIVERY_SCHEMA_VERSION,
    threadId: thread.threadId,
    deliveryKey,
    message,
    fingerprint,
  };
}

function readRecord(file: string): DurableChatDeliveryRecord {
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(file, READ_FILE_OPEN_FLAGS);
    if (!fs.fstatSync(descriptor).isFile()) {
      throw new DurableChatDeliveryCorruptError();
    }
    return normalizeRecord(JSON.parse(fs.readFileSync(descriptor, "utf8")));
  } catch (error) {
    if (error instanceof DurableChatDeliveryCorruptError) throw error;
    throw new DurableChatDeliveryCorruptError();
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function openedDirectoryMatchesPath(
  directory: string,
  descriptor: number,
): boolean {
  const opened = fs.fstatSync(descriptor);
  const named = fs.lstatSync(directory);
  return (
    opened.isDirectory() &&
    named.isDirectory() &&
    !named.isSymbolicLink() &&
    opened.dev === named.dev &&
    opened.ino === named.ino
  );
}

function openDirectoryNoFollow(directory: string): number {
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(directory, DIRECTORY_OPEN_FLAGS);
    if (!openedDirectoryMatchesPath(directory, descriptor)) {
      throw new DurableChatDeliveryCorruptError();
    }
    return descriptor;
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (error instanceof DurableChatDeliveryCorruptError) throw error;
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ELOOP" || code === "ENOTDIR" || code === "ENOENT") {
      throw new DurableChatDeliveryCorruptError();
    }
    throw error;
  }
}

function assertOpenedDirectoryStillMatchesPath(
  directory: string,
  descriptor: number,
): void {
  try {
    if (!openedDirectoryMatchesPath(directory, descriptor)) {
      throw new DurableChatDeliveryCorruptError();
    }
  } catch (error) {
    if (error instanceof DurableChatDeliveryCorruptError) throw error;
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ELOOP" || code === "ENOTDIR" || code === "ENOENT") {
      throw new DurableChatDeliveryCorruptError();
    }
    throw error;
  }
}

function fsyncDirectory(directory: string): void {
  const descriptor = openDirectoryNoFollow(directory);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * Build a directory chain one component at a time without following symlinks.
 *
 * Each component and its parent are fsynced child-first. We deliberately also
 * sync an EEXIST component: it may have been created concurrently by a writer
 * that has not made its parent entry durable yet. Holding and re-validating the
 * parent descriptor closes the ordinary check/create gap; Node does not expose
 * mkdirat(2), so the inode checks also fail closed if a named parent is swapped.
 */
function ensureDurableDeliveryDirectory(directory: string): void {
  const workspaceRoot = path.resolve(BASE);
  const relative = path.relative(workspaceRoot, directory);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new DurableChatDeliveryCorruptError();
  }

  const segments = relative.split(path.sep);
  let parentPath = workspaceRoot;
  let parentDescriptor = openDirectoryNoFollow(parentPath);
  try {
    for (const segment of segments) {
      if (!segment || segment === "." || segment === "..") {
        throw new DurableChatDeliveryCorruptError();
      }
      assertOpenedDirectoryStillMatchesPath(parentPath, parentDescriptor);

      const childPath = path.join(parentPath, segment);
      try {
        fs.mkdirSync(childPath, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") throw error;
      }

      const childDescriptor = openDirectoryNoFollow(childPath);
      try {
        assertOpenedDirectoryStillMatchesPath(parentPath, parentDescriptor);
        assertOpenedDirectoryStillMatchesPath(childPath, childDescriptor);
        fs.fsyncSync(childDescriptor);
        fs.fsyncSync(parentDescriptor);
      } catch (error) {
        fs.closeSync(childDescriptor);
        throw error;
      }

      fs.closeSync(parentDescriptor);
      parentDescriptor = childDescriptor;
      parentPath = childPath;
    }
  } finally {
    fs.closeSync(parentDescriptor);
  }
}

/**
 * Publish one immutable chat delivery without exposing a partially written
 * final path. The hard-link is the insert-only compare-and-set: concurrent
 * writers race on one inode name, and retries must present the same payload.
 */
export function appendDurableChatDelivery(input: {
  threadId: string;
  deliveryKey: string;
  message: Omit<DurableChatDeliveryMessage, "deliveryKey" | "ts"> & {
    /** First writer owns display time; retries may omit it safely. */
    ts?: number;
  };
}): { created: boolean; fingerprint: string } {
  const thread = canonicalThread(input.threadId);
  const deliveryKey = canonicalDeliveryKey(input.deliveryKey);
  const message = canonicalMessage(
    { ...input.message, ts: input.message.ts ?? Date.now(), deliveryKey },
    deliveryKey,
  );
  const base = {
    schemaVersion: DELIVERY_SCHEMA_VERSION,
    threadId: thread.threadId,
    deliveryKey,
    message,
  } as const;
  const record: DurableChatDeliveryRecord = {
    ...base,
    fingerprint: recordFingerprint(base),
  };
  const directory = deliveryDirectory(thread.threadId);
  const finalFile = deliveryFile(thread.threadId, deliveryKey);
  ensureDurableDeliveryDirectory(directory);
  const temporaryFile = path.join(
    directory,
    `.${path.basename(finalFile)}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor: number | undefined;
  let temporaryFileCreated = false;
  try {
    descriptor = fs.openSync(temporaryFile, CREATE_FILE_OPEN_FLAGS, 0o600);
    temporaryFileCreated = true;
    fs.writeFileSync(
      descriptor,
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8",
    );
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    try {
      fs.linkSync(temporaryFile, finalFile);
      fsyncDirectory(directory);
      return { created: true, fingerprint: record.fingerprint };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") throw error;
      const existing = readRecord(finalFile);
      if (
        logicalDeliveryFingerprint(existing) !==
        logicalDeliveryFingerprint(record)
      ) {
        throw new DurableChatDeliveryConflictError();
      }
      return { created: false, fingerprint: existing.fingerprint };
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(temporaryFile);
      if (temporaryFileCreated) fsyncDirectory(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    }
  }
}

export function listDurableChatDeliveries(
  threadId: string,
): DurableChatDeliveryMessage[] {
  const thread = canonicalThread(threadId);
  const directory = deliveryDirectory(thread.threadId);
  let files: string[];
  try {
    files = fs
      .readdirSync(directory)
      .filter((file) => /^[a-f0-9]{64}\.json$/.test(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw error;
  }
  return files
    .map((file) => readRecord(path.join(directory, file)))
    .map((record) => {
      if (record.threadId !== thread.threadId) {
        throw new DurableChatDeliveryCorruptError();
      }
      return record.message;
    })
    .sort(
      (left, right) =>
        left.ts - right.ts || left.deliveryKey.localeCompare(right.deliveryKey),
    );
}
