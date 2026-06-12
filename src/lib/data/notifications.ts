import crypto from "crypto";
import { readJSON, writeJSON } from "./json-io";
import { notificationsFile } from "./paths";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  slug: string;
  created_at: string;
  sent_at: string | null;
  metadata?: Record<string, unknown>;
}

export function loadNotifications(slug: string): Notification[] {
  const data = readJSON<{ notifications: Notification[] }>(
    notificationsFile(slug),
    { notifications: [] }
  );
  return data.notifications || [];
}

export function saveNotifications(slug: string, notifications: Notification[]): void {
  writeJSON(notificationsFile(slug), { notifications });
}

export function getUnsentNotifications(slug: string): Notification[] {
  return loadNotifications(slug).filter((n) => !n.sent_at);
}

export function markNotificationsSent(slug: string, ids: string[]): void {
  const all = loadNotifications(slug);
  const now = new Date().toISOString();
  for (const n of all) {
    if (ids.includes(n.id)) {
      n.sent_at = now;
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
    ...(n.metadata ? { metadata: n.metadata } : {}),
  };
  const all = loadNotifications(slug);
  all.push(record);
  saveNotifications(slug, all);
  return record;
}
