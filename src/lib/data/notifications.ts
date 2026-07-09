import crypto from "crypto";
import { readJSON, writeJSON } from "./json-io";
import { notificationsFile } from "./paths";

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  slug: string;
  created_at: string;
  sent_at: string | null;
  sent: boolean;
  metadata?: Record<string, unknown>;
}

export function loadNotifications(slug: string): Notification[] {
  const data = readJSON<unknown>(notificationsFile(slug), []);
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { notifications?: unknown }).notifications)
      ? (data as { notifications: unknown[] }).notifications
      : [];

  return rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
    .map((row) => {
      const createdAt =
        typeof row.created_at === "string"
          ? row.created_at
          : typeof row.timestamp === "string"
            ? row.timestamp
            : new Date().toISOString();
      const sentAt =
        typeof row.sent_at === "string"
          ? row.sent_at
          : row.sent === true
            ? createdAt
            : null;
      return {
        id: typeof row.id === "string" ? row.id : `ntf_${crypto.randomUUID()}`,
        type: typeof row.type === "string" ? row.type : "notification",
        title: typeof row.title === "string" ? row.title : typeof row.ideaTitle === "string" ? row.ideaTitle : "Notificación",
        body: typeof row.body === "string" ? row.body : "",
        slug,
        created_at: createdAt,
        sent_at: sentAt,
        sent: row.sent === true || Boolean(sentAt),
        metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? row.metadata as Record<string, unknown>
          : undefined,
      };
    });
}

export function saveNotifications(slug: string, notifications: Notification[]): void {
  writeJSON(notificationsFile(slug), notifications);
}

export function getUnsentNotifications(slug: string): Notification[] {
  return loadNotifications(slug).filter((n) => !n.sent && !n.sent_at);
}

export function markNotificationsSent(slug: string, ids: string[]): void {
  const all = loadNotifications(slug);
  const now = new Date().toISOString();
  for (const n of all) {
    if (ids.includes(n.id)) {
      n.sent_at = now;
      n.sent = true;
    }
  }
  saveNotifications(slug, all);
}

/**
 * Append a notification for a client. Returns the created record. The caller
 * supplies type/title/body/metadata; id, created_at and sent_at are set here.
 */
export function addNotification(
  slug: string,
  n: { type: string; title: string; body: string; metadata?: Record<string, unknown> },
): Notification {
  const record: Notification = {
    id: `ntf_${crypto.randomUUID()}`,
    type: n.type,
    title: n.title,
    body: n.body,
    slug,
    created_at: new Date().toISOString(),
    sent_at: null,
    sent: false,
    ...(n.metadata ? { metadata: n.metadata } : {}),
  };
  const all = loadNotifications(slug);
  all.push(record);
  saveNotifications(slug, all);
  return record;
}
