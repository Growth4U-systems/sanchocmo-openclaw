import fs from "fs";
import path from "path";
import { BASE, chatReadStateFile } from "./paths";
import { readJSON, writeJSON } from "./json-io";

/**
 * MC-Chat state management — ported from mc-server.js in-memory state.
 * In-memory caches for status updates and cancelled threads.
 */

// In-memory status cache (status updates don't persist to disk)
const statusCache = new Map<string, { text: string; agent?: string; ts: number }>();
const cancelledThreads = new Set<string>();

export function getStatusEntry(threadId: string) {
  return statusCache.get(threadId) || null;
}

export function setStatusEntry(threadId: string, data: { text: string; agent?: string; ts: number }) {
  statusCache.set(threadId, data);
}

export function clearStatus(threadId: string) {
  statusCache.delete(threadId);
}

export function markCancelled(threadId: string) {
  cancelledThreads.add(threadId);
}

export function consumeCancelled(threadId: string): boolean {
  if (cancelledThreads.has(threadId)) {
    cancelledThreads.delete(threadId);
    return true;
  }
  return false;
}

// Gateway URL and secret
export function getGatewayUrl(): string {
  return process.env.MC_CHAT_GATEWAY || "http://localhost:18800";
}

export function getChatSecret(): string | undefined {
  return process.env.MC_CHAT_SECRET;
}

// Thread persistence (disk-based, same as legacy)
interface ThreadData {
  messages: { role: string; text: string; ts: number; agent?: string }[];
  discordThreadId?: string;
  discordChannelId?: string;
  updatedAt?: number;
}

function threadFile(threadId: string): string {
  const colonIdx = threadId.indexOf(":");
  if (colonIdx < 0) return path.join(BASE, "brand", threadId, "chat", "general.json");
  const slug = threadId.slice(0, colonIdx);
  const shortId = threadId.slice(colonIdx + 1);
  // Sanitize shortId for filesystem — must match mc-server.js logic (: → -)
  const safeId = shortId.replace(/:/g, "-").replace(/[^a-zA-Z0-9\-_]/g, "");
  const chatDir = path.join(BASE, "brand", slug, "chat");
  return path.join(chatDir, `${safeId}.json`);
}

export function getThread(threadId: string): ThreadData {
  return readJSON<ThreadData>(threadFile(threadId), { messages: [] });
}

export function saveThread(threadId: string, data: ThreadData) {
  writeJSON(threadFile(threadId), data);
}

export function addMessage(threadId: string, role: string, text: string, agent?: string) {
  const thread = getThread(threadId);
  thread.messages.push({ role, text, ts: Date.now(), agent });
  // Cap messages at 200
  if (thread.messages.length > 200) {
    thread.messages = thread.messages.slice(-200);
  }
  thread.updatedAt = Date.now();
  saveThread(threadId, thread);
}

// ---------------------------------------------------------------------------
// Read-state helpers
// ---------------------------------------------------------------------------

type ReadStateMap = Record<string, { lastReadTs: number }>;

export function getReadState(slug: string): ReadStateMap {
  return readJSON<ReadStateMap>(chatReadStateFile(slug), {});
}

export function markThreadRead(slug: string, shortId: string) {
  const state = getReadState(slug);
  state[shortId] = { lastReadTs: Date.now() };
  writeJSON(chatReadStateFile(slug), state);
}

/** Return the epoch-ms ts of the last bot/assistant message, or null. */
function getLastBotTs(messages: { role: string; ts: string | number }[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") {
      const raw = messages[i].ts;
      if (!raw) return null;
      // ts can be ISO string or epoch number
      return typeof raw === "number" ? raw : new Date(raw).getTime();
    }
  }
  return null;
}

export function listThreadsForSlug(slug: string) {
  const chatDir = path.join(BASE, "brand", slug, "chat");
  const threads: unknown[] = [];
  const readState = getReadState(slug);

  try {
    if (!fs.existsSync(chatDir)) return threads;
    for (const f of fs.readdirSync(chatDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(chatDir, f), "utf-8"));
        const shortId = f.replace(".json", "");
        const tid = slug + ":" + shortId;
        const msgs = data.messages || [];
        const last = msgs[msgs.length - 1];
        const lastBotTs = getLastBotTs(msgs);
        const lastReadTs = readState[shortId]?.lastReadTs ?? 0;
        const hasUnread = lastBotTs !== null && lastBotTs > lastReadTs;
        threads.push({
          id: tid,
          shortId,
          name: shortId.replace(/-/g, " "),
          messageCount: msgs.length,
          updatedAt: data.updatedAt || 0,
          lastMessage: last
            ? { role: last.role, text: (last.text || "").slice(0, 80), ts: last.ts }
            : null,
          hasUnread,
          lastBotTs,
        });
      } catch {
        // skip invalid files
      }
    }
  } catch {
    // dir doesn't exist
  }

  // Sort: general first, then unread (by lastBotTs desc), then read (by updatedAt desc)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  threads.sort((a: any, b: any) => {
    if (a.shortId === "general") return -1;
    if (b.shortId === "general") return 1;
    if (a.hasUnread && !b.hasUnread) return -1;
    if (!a.hasUnread && b.hasUnread) return 1;
    if (a.hasUnread && b.hasUnread) return (b.lastBotTs || 0) - (a.lastBotTs || 0);
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  return threads;
}
