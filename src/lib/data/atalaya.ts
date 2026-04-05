import path from "path";
import { readJSON, writeJSON } from "./json-io";
import { atalayaDir } from "./paths";
import type { AtalayaConfig } from "@/types";

export function loadAtalayaConfig(slug: string): AtalayaConfig {
  return readJSON<AtalayaConfig>(path.join(atalayaDir(slug), "config.json"), {
    followed_profiles: [],
    channels_to_monitor: {},
  });
}

export function saveAtalayaConfig(slug: string, config: AtalayaConfig): void {
  writeJSON(path.join(atalayaDir(slug), "config.json"), config);
}

export function loadPendingIdeas(slug: string): unknown[] {
  return readJSON<unknown[]>(path.join(atalayaDir(slug), "pending-ideas.json"), []);
}

export function savePendingIdeas(slug: string, ideas: unknown[]): void {
  writeJSON(path.join(atalayaDir(slug), "pending-ideas.json"), ideas);
}

export function loadPendingProfiles(slug: string): unknown[] {
  return readJSON<unknown[]>(path.join(atalayaDir(slug), "profiles-pending.json"), []);
}
