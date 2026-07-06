import type { ChannelMode } from "@/types";

export interface NormalizedCadenceProfile {
  id?: string;
  name: string;
  role?: string;
  handle?: string;
  posts_per_week?: number;
  pillars_slant?: string[];
  voice_doc?: string;
  owner?: string;
  metricool_profile_id?: string;
  primary_kpi?: string;
}

export interface NormalizedCadenceChannel {
  active?: boolean;
  frequency?: string;
  best_days: string[];
  best_times: string[];
  gating?: string;
  content_types: string[];
  mode?: ChannelMode;
  label?: string;
  strategy_doc?: string;
  metrics_provider?: string;
  primary_kpi?: string;
  profiles: NormalizedCadenceProfile[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "on", "active"].includes(normalized)) return true;
    if (["false", "no", "0", "off", "inactive"].includes(normalized)) return false;
  }
  return undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export function toChannelList(primary: unknown, many: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const channel of [...toStringArray(primary), ...toStringArray(many)]) {
    if (seen.has(channel)) continue;
    seen.add(channel);
    out.push(channel);
  }
  return out;
}

function normalizeProfile(value: unknown, fallbackId?: string): NormalizedCadenceProfile | null {
  if (!isRecord(value)) return null;
  const name = optionalString(value.name);
  if (!name) return null;
  return {
    id: optionalString(value.id) || fallbackId,
    name,
    role: optionalString(value.role),
    handle: optionalString(value.handle),
    posts_per_week: optionalNumber(value.posts_per_week),
    pillars_slant: toStringArray(value.pillars_slant),
    voice_doc: optionalString(value.voice_doc),
    owner: optionalString(value.owner),
    metricool_profile_id: optionalString(value.metricool_profile_id),
    primary_kpi: optionalString(value.primary_kpi),
  };
}

function normalizeProfiles(value: unknown): NormalizedCadenceProfile[] {
  if (Array.isArray(value)) {
    return value
      .map((profile) => normalizeProfile(profile))
      .filter((profile): profile is NormalizedCadenceProfile => !!profile);
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([id, profile]) => normalizeProfile(profile, id))
      .filter((profile): profile is NormalizedCadenceProfile => !!profile);
  }
  return [];
}

function normalizeChannel(value: unknown): NormalizedCadenceChannel {
  const ch = isRecord(value) ? value : {};
  const mode = ch.mode === "always-on" ? "always-on" : ch.mode === "scheduled" ? "scheduled" : undefined;
  return {
    active: optionalBoolean(ch.active),
    frequency: optionalString(ch.frequency),
    best_days: toStringArray(ch.best_days),
    best_times: toStringArray(ch.best_times),
    gating: optionalString(ch.gating),
    content_types: toStringArray(ch.content_types),
    mode,
    label: optionalString(ch.label),
    strategy_doc: optionalString(ch.strategy_doc),
    metrics_provider: optionalString(ch.metrics_provider),
    primary_kpi: optionalString(ch.primary_kpi),
    profiles: normalizeProfiles(ch.profiles),
  };
}

export function normalizeCadenceChannels(data: unknown): Record<string, NormalizedCadenceChannel> {
  const channels = isRecord(data) && "channels" in data ? data.channels : data;
  const out: Record<string, NormalizedCadenceChannel> = {};

  if (Array.isArray(channels)) {
    for (const item of channels) {
      if (!isRecord(item)) continue;
      const key = optionalString(item.key) || optionalString(item.channel);
      if (!key) continue;
      out[key] = normalizeChannel(item);
    }
    return out;
  }

  if (!isRecord(channels)) return out;
  for (const [key, value] of Object.entries(channels)) {
    out[key] = normalizeChannel(value);
  }
  return out;
}
