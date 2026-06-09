import path from "path";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import { brandDir } from "@/lib/data/paths";

// Read/write the per-cron publish destination stored in
// brand/<slug>/client-config.json under crons.<cronKey>. This is the write
// side that backs the MC UI; resolvePublishTarget (target.ts) is the read side
// consumed at publish time. Both read the same `publish_transport` /
// `publish_channel` fields, so the UI and the cron stay in sync.

export interface CronPublishConfig {
  transport: string;
  channel_id: string;
  channel_name?: string;
}

interface CronEntry {
  publish_transport?: string;
  publish_channel?: string;
  publish_channel_name?: string;
  [k: string]: unknown;
}
interface ClientConfig {
  publish?: { default_transport?: string };
  crons?: Record<string, CronEntry>;
  [k: string]: unknown;
}

function configPath(slug: string): string {
  return path.join(brandDir(slug), "client-config.json");
}

/** Current publish destination for a cron, or null if none is configured. */
export function getCronPublishConfig(slug: string, cronKey: string): CronPublishConfig | null {
  const cfg = readJSON<ClientConfig>(configPath(slug), {});
  const cron = cfg.crons?.[cronKey];
  if (!cron?.publish_channel) return null;
  return {
    transport: cron.publish_transport || cfg.publish?.default_transport || "slack",
    channel_id: cron.publish_channel,
    channel_name: cron.publish_channel_name,
  };
}

/** Write the publish destination for a cron into client-config.json.
 *  Creates the crons object / cron entry if missing; preserves other fields. */
export function setCronPublishConfig(slug: string, cronKey: string, cfg: CronPublishConfig): void {
  const data = readJSON<ClientConfig>(configPath(slug), {});
  if (!data.crons) data.crons = {};
  const existing = data.crons[cronKey] || {};
  data.crons[cronKey] = {
    ...existing,
    publish_transport: cfg.transport,
    publish_channel: cfg.channel_id,
    publish_channel_name: cfg.channel_name,
  };
  writeJSON(configPath(slug), data);
}
