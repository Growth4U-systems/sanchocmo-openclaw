import path from "path";
import { readJSON } from "@/lib/data/json-io";
import { brandDir } from "@/lib/data/paths";
import type { PublishTarget } from "./types";

interface CronPublishConfig {
  publish_transport?: string;
  publish_channel?: string;
}
interface ClientConfig {
  publish?: { default_transport?: string };
  crons?: Record<string, CronPublishConfig>;
}

export function resolvePublishTarget(slug: string, cronKey: string): PublishTarget {
  const cfg = readJSON<ClientConfig>(path.join(brandDir(slug), "client-config.json"), {});
  const cron = cfg.crons?.[cronKey];
  if (!cron) {
    throw new Error(`Cron "${cronKey}" not found in ${slug}/client-config.json`);
  }
  if (!cron.publish_channel) {
    throw new Error(`No publish_channel configured for cron "${cronKey}" in ${slug}/client-config.json`);
  }
  const transport = cron.publish_transport || cfg.publish?.default_transport || "slack";
  return { transport, channel: cron.publish_channel };
}
