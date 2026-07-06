import { readJSON, writeJSON, listDir } from "./json-io";
import { chatDir, chatThreadFile } from "./paths";
import type { ChatThread, ChatMessage } from "@/types";

const MAX_MESSAGES = 200;

export function loadThread(slug: string, threadId: string): ChatThread | null {
  return readJSON<ChatThread | null>(chatThreadFile(slug, threadId), null);
}

export function saveThread(slug: string, thread: ChatThread): void {
  // Cap messages
  if (thread.messages.length > MAX_MESSAGES) {
    thread.messages = thread.messages.slice(-MAX_MESSAGES);
  }
  writeJSON(chatThreadFile(slug, thread.id), thread);
}

export function listThreads(slug: string): Omit<ChatThread, "messages">[] {
  const dir = chatDir(slug);
  const files = listDir(dir).filter((f) => f.endsWith(".json"));

  return files
    .map((f) => {
      const thread = readJSON<ChatThread | null>(
        `${dir}/${f}`,
        null
      );
      if (!thread) return null;
      // Return without messages for listing
      const { messages, ...rest } = thread;
      return { ...rest, messageCount: messages?.length || 0 };
    })
    .filter(Boolean) as Omit<ChatThread, "messages">[];
}

export function appendMessage(
  slug: string,
  threadId: string,
  message: ChatMessage
): void {
  const thread = loadThread(slug, threadId);
  if (!thread) return;
  thread.messages.push(message);
  thread.updatedAt = new Date().toISOString();
  saveThread(slug, thread);
}
