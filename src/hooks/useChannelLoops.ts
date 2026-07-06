import { useQuery } from "@tanstack/react-query";
import type {
  ChannelLoopAntenna,
  ChannelLoopState,
  ChannelLoopsPayload,
  PersonaLoopState,
  RepurposeEntry,
} from "@/types";

/**
 * Per-channel loop state for the 📡 Canales view (SAN-141).
 * Backed by /api/content-engine/channel-loops — always derived, never cached
 * server-side, so a short staleTime keeps counters honest after mutations.
 */
export function useChannelLoops(slug: string | null) {
  return useQuery<ChannelLoopsPayload>({
    queryKey: ["channel-loops", slug],
    queryFn: async () => {
      const res = await fetch(`/api/content-engine/channel-loops?slug=${slug}`);
      if (!res.ok) throw new Error(`Failed to load channel loops (${res.status})`);
      return normalizeChannelLoopsPayload(await res.json());
    },
    enabled: !!slug,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizePersona(raw: unknown): PersonaLoopState {
  const p = asRecord(raw);
  const stages = asRecord(p.stages);
  const ideation = asRecord(stages.ideation);
  const creation = asRecord(stages.creation);
  const published = asRecord(stages.published);
  const next = asRecord(p.nextAction);
  const nextAction =
    typeof next.label === "string"
      ? {
          label: next.label,
          ...(typeof next.focusStatus === "string" ? { focusStatus: next.focusStatus } : {}),
        }
      : null;

  return {
    id: asString(p.id, asString(p.name, "voice")),
    name: asString(p.name, asString(p.id, "Voz")),
    role: asNullableString(p.role),
    handle: asNullableString(p.handle),
    pillarsSlant: asStringArray(p.pillarsSlant),
    stages: {
      ideation: {
        newCount: asNumber(ideation.newCount),
        approvedCount: asNumber(ideation.approvedCount),
      },
      creation: {
        draftingCount: asNumber(creation.draftingCount),
        clarifyCount: asNumber(creation.clarifyCount),
        readyCount: asNumber(creation.readyCount),
      },
      published: {
        thisMonth: asNumber(published.thisMonth),
      },
    },
    nextAction,
  };
}

function normalizeAntenna(raw: unknown): ChannelLoopAntenna {
  const a = asRecord(raw);
  return {
    baseName: asString(a.baseName, "Antenna"),
    jobId: asNullableString(a.jobId),
    enabled: asBoolean(a.enabled),
    schedule: asNullableString(a.schedule),
    lastRunAt: asNullableString(a.lastRunAt),
    finding: asNullableString(a.finding),
    count: typeof a.count === "number" && Number.isFinite(a.count) ? a.count : null,
    status: asNullableString(a.status),
  };
}

function normalizeChannel(raw: unknown): ChannelLoopState {
  const ch = asRecord(raw);
  const channel = asString(ch.channel, "unknown");
  const cadence = asRecord(ch.cadence);
  const stages = asRecord(ch.stages);
  const antennas = asRecord(stages.antennas);
  const ideation = asRecord(stages.ideation);
  const creation = asRecord(stages.creation);
  const published = asRecord(stages.published);
  const metrics = asRecord(stages.metrics);
  const gsc = asRecord(metrics.gsc);
  const next = asRecord(ch.nextAction);
  const nextTab: "ideas" | "calendar" | "setup" =
    next.tab === "calendar" || next.tab === "setup" ? next.tab : "ideas";
  const nextAction =
    typeof next.label === "string"
      ? {
          label: next.label,
          tab: nextTab,
          ...(typeof next.focusStatus === "string" ? { focusStatus: next.focusStatus } : {}),
        }
      : null;

  return {
    channel,
    label: asString(ch.label, channel),
    active: asBoolean(ch.active),
    mode: ch.mode === "always-on" ? "always-on" : "scheduled",
    cadence: {
      frequency: asString(cadence.frequency),
      bestDays: asStringArray(cadence.bestDays),
      bestTimes: asStringArray(cadence.bestTimes),
    },
    strategyDoc: asNullableString(ch.strategyDoc),
    strategyDocExists: asBoolean(ch.strategyDocExists),
    metricsProvider: asString(ch.metricsProvider, "none"),
    primaryKpi: asNullableString(ch.primaryKpi),
    stages: {
      antennas: {
        enabled: asNumber(antennas.enabled),
        total: asNumber(antennas.total),
        hasError: asBoolean(antennas.hasError),
        lastRunAt: asNullableString(antennas.lastRunAt),
      },
      ideation: {
        newCount: asNumber(ideation.newCount),
        approvedCount: asNumber(ideation.approvedCount),
      },
      creation: {
        draftingCount: asNumber(creation.draftingCount),
        clarifyCount: asNumber(creation.clarifyCount),
        readyCount: asNumber(creation.readyCount),
        pendingMediaCount: asNumber(creation.pendingMediaCount),
      },
      published: {
        thisMonth: asNumber(published.thisMonth),
        nextSlot: asNullableString(published.nextSlot),
      },
      metrics: {
        provider: asString(metrics.provider, asString(ch.metricsProvider, "none")),
        engagementPct: typeof metrics.engagementPct === "number" ? metrics.engagementPct : null,
        impressions30d: typeof metrics.impressions30d === "number" ? metrics.impressions30d : null,
        postsWithMetrics: asNumber(metrics.postsWithMetrics),
        gsc:
          Object.keys(gsc).length > 0
            ? {
                clicks30d: asNumber(gsc.clicks30d),
                impressions30d: asNumber(gsc.impressions30d),
                avgPosition: typeof gsc.avgPosition === "number" ? gsc.avgPosition : null,
                prevClicks30d: typeof gsc.prevClicks30d === "number" ? gsc.prevClicks30d : null,
                prevImpressions30d: typeof gsc.prevImpressions30d === "number" ? gsc.prevImpressions30d : null,
              }
            : null,
      },
    },
    nextAction,
    repurposing: {
      incoming: asNumber(asRecord(ch.repurposing).incoming),
      outgoing: asNumber(asRecord(ch.repurposing).outgoing),
    },
    antennas: Array.isArray(ch.antennas) ? ch.antennas.map(normalizeAntenna) : [],
    personas: Array.isArray(ch.personas) ? ch.personas.map(normalizePersona) : [],
    unassignedPool: asNumber(ch.unassignedPool),
  };
}

function normalizeRepurpose(raw: unknown): RepurposeEntry {
  const r = asRecord(raw);
  return {
    fromChannel: asString(r.fromChannel),
    fromTitle: asString(r.fromTitle),
    toChannel: asString(r.toChannel),
    toTitle: asString(r.toTitle),
    toStatus: asString(r.toStatus),
    toId: asString(r.toId),
  };
}

function normalizeChannelLoopsPayload(raw: unknown): ChannelLoopsPayload {
  const payload = asRecord(raw);
  return {
    ok: asBoolean(payload.ok, true),
    channels: Array.isArray(payload.channels) ? payload.channels.map(normalizeChannel) : [],
    repurposing: Array.isArray(payload.repurposing) ? payload.repurposing.map(normalizeRepurpose) : [],
    connections: { gsc: asBoolean(asRecord(payload.connections).gsc) },
    verifiedAt: asString(payload.verifiedAt, new Date(0).toISOString()),
  };
}
