import fs from "fs";
import path from "path";
import { BASE } from "./paths";
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
  const [slug, ...rest] = threadId.split(":");
  const shortId = rest.join(":") || "general";
  const chatDir = path.join(BASE, "brand", slug, "chat");
  return path.join(chatDir, `${shortId}.json`);
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

export function listThreadsForSlug(slug: string) {
  const chatDir = path.join(BASE, "brand", slug, "chat");
  const threads: unknown[] = [];

  try {
    if (!fs.existsSync(chatDir)) return threads;
    for (const f of fs.readdirSync(chatDir).filter((f) => f.endsWith(".json"))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(chatDir, f), "utf-8"));
        const shortId = f.replace(".json", "");
        const tid = slug + ":" + shortId;
        const msgs = data.messages || [];
        const last = msgs[msgs.length - 1];
        threads.push({
          id: tid,
          shortId,
          name: shortId.replace(/-/g, " "),
          messageCount: msgs.length,
          updatedAt: data.updatedAt || 0,
          lastMessage: last
            ? { role: last.role, text: (last.text || "").slice(0, 80), ts: last.ts }
            : null,
        });
      } catch {
        // skip invalid files
      }
    }
  } catch {
    // dir doesn't exist
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  threads.sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return threads;
}
