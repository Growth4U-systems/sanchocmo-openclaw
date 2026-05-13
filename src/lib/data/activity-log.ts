/**
 * Append-only activity log for the Content Engine.
 *
 * Each line in `brand/{slug}/content/activity-log.jsonl` is a JSON event:
 *   { ts: ISO, type, text, icon?, accent?, meta? }
 *
 * Used by:
 *   - Slack interactivity (approve / discard)
 *   - Editorial Dispatch endpoint (publish)
 *   - Engine/Estado UI (read 24h)
 */

import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";

export type ActivityType = "publish" | "approve" | "discard" | "edit" | "cron-run" | "idea-created";
export type ActivityAccent = "sage" | "rust" | "navy" | "sun" | "brick";

export interface ActivityEvent {
  ts: string;
  type: ActivityType;
  text: string;
  icon?: string;
  accent?: ActivityAccent;
  meta?: Record<string, unknown>;
}

function activityLogPath(slug: string): string {
  return path.join(BASE, "brand", slug, "content", "activity-log.jsonl");
}

/** Append one event. Creates the file + parent dir if missing. */
export function logActivity(slug: string, event: Omit<ActivityEvent, "ts"> & { ts?: string }): void {
  const file = activityLogPath(slug);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const full: ActivityEvent = { ts: new Date().toISOString(), ...event };
  fs.appendFileSync(file, JSON.stringify(full) + "\n");
}

/** Read all events newest-first. Optional limit. */
export function readActivity(slug: string, limit?: number): ActivityEvent[] {
  const file = activityLogPath(slug);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
  const out: ActivityEvent[] = [];
  for (const line of lines.reverse()) {
    try { out.push(JSON.parse(line)); }
    catch { /* skip bad line */ }
    if (limit && out.length >= limit) break;
  }
  return out;
}
