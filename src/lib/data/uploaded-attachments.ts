import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { BASE, brandDir, chatDir } from "./paths";
import { readJSON, writeJSON } from "./json-io";
import { sanitizeShortId } from "../thread-id";

export interface UploadedAttachment {
  url: string;
  filename: string;
  mimeType?: string;
  type?: string;
  size?: number;
}

export interface UploadedAttachmentReference {
  threadId: string;
  threadFile: string;
  messageIndex: number;
  messageTs?: number;
  role?: string;
  agent?: string;
  textPreview?: string;
}

export interface UploadedAttachmentIndexItem {
  id: string;
  filename: string;
  mimeType: string;
  size?: number;
  url: string;
  source: "chat";
  firstSeenAt?: number;
  lastSeenAt?: number;
  references: UploadedAttachmentReference[];
}

export interface UploadedAttachmentIndex {
  version: 1;
  slug: string;
  generatedAt: string;
  count: number;
  indexPath: string;
  note: string;
  items: UploadedAttachmentIndexItem[];
}

interface ChatMessageLike {
  role?: string;
  text?: string;
  ts?: number;
  agent?: string;
  attachments?: unknown;
}

interface ThreadDataLike {
  messages?: ChatMessageLike[];
}

const MAX_TEXT_PREVIEW = 180;

export function uploadedAttachmentIndexPath(slug: string): string {
  return path.join(brandDir(slug), "attachments", "index.json");
}

export function uploadedAttachmentIndexBrandPath(slug: string): string {
  return `brand/${slug}/attachments/index.json`;
}

function cleanText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.replace(/[\r\n]+/g, " ").trim() || fallback;
}

function normalizeAttachment(input: unknown): UploadedAttachmentIndexItem | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const url = cleanText(record.url);
  if (!url) return null;
  const filename = cleanText(record.filename, "archivo-adjunto");
  const mimeType = cleanText(record.mimeType ?? record.type, "application/octet-stream");
  const rawSize = Number(record.size);
  return {
    id: createHash("sha256").update(url).digest("hex").slice(0, 16),
    filename,
    mimeType,
    size: Number.isFinite(rawSize) && rawSize >= 0 ? Math.round(rawSize) : undefined,
    url,
    source: "chat",
    firstSeenAt: undefined,
    lastSeenAt: undefined,
    references: [],
  };
}

function textPreview(value: unknown): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  return text.length > MAX_TEXT_PREVIEW ? `${text.slice(0, MAX_TEXT_PREVIEW).trimEnd()}...` : text;
}

function threadIdFromFile(slug: string, filePath: string): string {
  return `${slug}:${path.basename(filePath, ".json")}`;
}

function threadFileForId(threadId: string): { slug: string; file: string } | null {
  const colonIdx = threadId.indexOf(":");
  if (colonIdx < 0) return null;
  const slug = threadId.slice(0, colonIdx);
  const shortId = sanitizeShortId(threadId.slice(colonIdx + 1));
  if (!slug || !shortId) return null;
  return { slug, file: path.join(chatDir(slug), `${shortId}.json`) };
}

function listChatFiles(slug: string): string[] {
  const dir = chatDir(slug);
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function addReference(
  item: UploadedAttachmentIndexItem,
  reference: UploadedAttachmentReference,
  messageTs: number | undefined,
) {
  item.references.push(reference);
  if (messageTs !== undefined) {
    item.firstSeenAt = item.firstSeenAt === undefined ? messageTs : Math.min(item.firstSeenAt, messageTs);
    item.lastSeenAt = item.lastSeenAt === undefined ? messageTs : Math.max(item.lastSeenAt, messageTs);
  }
}

export function buildUploadedAttachmentIndex(slug: string): UploadedAttachmentIndex {
  const byUrl = new Map<string, UploadedAttachmentIndexItem>();

  for (const filePath of listChatFiles(slug)) {
    const thread = readJSON<ThreadDataLike>(filePath, { messages: [] });
    const messages = Array.isArray(thread.messages) ? thread.messages : [];
    const threadId = threadIdFromFile(slug, filePath);
    messages.forEach((message, messageIndex) => {
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      for (const rawAttachment of attachments) {
        const normalized = normalizeAttachment(rawAttachment);
        if (!normalized) continue;
        const existing = byUrl.get(normalized.url) ?? normalized;
        if (existing !== normalized) {
          existing.filename ||= normalized.filename;
          existing.mimeType ||= normalized.mimeType;
          existing.size ??= normalized.size;
        }
        addReference(
          existing,
          {
            threadId,
            threadFile: path.relative(BASE, filePath),
            messageIndex,
            messageTs: message.ts,
            role: message.role,
            agent: message.agent,
            textPreview: textPreview(message.text),
          },
          message.ts,
        );
        byUrl.set(existing.url, existing);
      }
    });
  }

  const items = Array.from(byUrl.values()).sort((a, b) => {
    const lastA = a.lastSeenAt ?? 0;
    const lastB = b.lastSeenAt ?? 0;
    if (lastA !== lastB) return lastB - lastA;
    return a.filename.localeCompare(b.filename);
  });

  return {
    version: 1,
    slug,
    generatedAt: new Date().toISOString(),
    count: items.length,
    indexPath: uploadedAttachmentIndexBrandPath(slug),
    note:
      "Indice de archivos subidos por chat. Los agentes deben abrir este indice solo cuando el usuario pida trabajar con archivos/documentos subidos.",
    items,
  };
}

export function writeUploadedAttachmentIndex(slug: string): UploadedAttachmentIndex {
  const index = buildUploadedAttachmentIndex(slug);
  if (index.count > 0 || fs.existsSync(uploadedAttachmentIndexPath(slug))) {
    writeJSON(uploadedAttachmentIndexPath(slug), index);
  }
  return index;
}

export function syncUploadedAttachmentIndexForThread(threadId: string): UploadedAttachmentIndex | null {
  const resolved = threadFileForId(threadId);
  if (!resolved) return null;
  return writeUploadedAttachmentIndex(resolved.slug);
}

export function listBrandSlugsWithChats(): string[] {
  const root = path.join(BASE, "brand");
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("_"))
      .filter((entry) => fs.existsSync(path.join(root, entry.name, "chat")))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function rebuildAllUploadedAttachmentIndexes(): UploadedAttachmentIndex[] {
  return listBrandSlugsWithChats().map((slug) => writeUploadedAttachmentIndex(slug));
}
