/**
 * SAN-162 — resolve which publishing account a voice publishes from.
 *
 * A voice = a person on a network. `founder-led-setup` writes voices as
 * cadence-config `channels.{channel}.profiles[]`, each with an optional
 * `metricool_profile_id` (the voice's Metricool brand / blogId). Publishing
 * routes to that account so "Alfonso on LinkedIn" and "Martín on LinkedIn" go
 * to different Metricool brands.
 *
 * Pure picker (testable, no I/O) + a thin fs wrapper that reads cadence-config.
 * Shared by the publish API and any MCP/Sancho publish path — one routing rule,
 * two surfaces.
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { BASE } from "@/lib/data/paths";
import { personaId } from "@/lib/data/persona-loops";

interface CadenceProfile {
  id?: string;
  name: string;
  metricool_profile_id?: string;
}
interface CadenceChannelLite {
  profiles?: CadenceProfile[];
}
export type CadenceChannelsLite = Record<string, CadenceChannelLite>;

/**
 * Pure: given the parsed cadence channels, the target channel and the content's
 * author (voice id), return that voice's `metricool_profile_id` — or null when
 * there's no author, no matching voice, or the voice has no account configured.
 * Matching mirrors persona-loops: by explicit `id`, else slug-of-name.
 */
export function pickVoiceMetricoolProfileId(
  channels: CadenceChannelsLite,
  channel: string,
  author: string | null | undefined,
): string | null {
  if (!author) return null;
  const profiles = channels[channel]?.profiles || [];
  const match = profiles.find((p) => personaId(p) === author);
  return match?.metricool_profile_id?.trim() || null;
}

function readCadenceChannels(slug: string): CadenceChannelsLite {
  const f = path.join(BASE, "brand", slug, "content", "configs", "cadence-config.yml");
  if (!fs.existsSync(f)) return {};
  try {
    const data = yaml.load(fs.readFileSync(f, "utf-8")) as { channels?: CadenceChannelsLite };
    return data?.channels || {};
  } catch {
    return {};
  }
}

/** fs wrapper: resolve a voice's Metricool account from cadence-config on disk. */
export function getVoiceMetricoolProfileId(
  slug: string,
  channel: string,
  author: string | null | undefined,
): string | null {
  if (!author) return null;
  return pickVoiceMetricoolProfileId(readCadenceChannels(slug), channel, author);
}
