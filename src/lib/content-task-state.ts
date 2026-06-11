import type {
  ChannelPhase,
  ContentTaskPipelineState,
  ContentTaskStatus,
} from "@/types";

/**
 * Pure ContentTask state-machine logic — ranks, aggregation and forward-move
 * rules — extracted from `lib/data/content-tasks.ts` so it can be imported
 * from BOTH the server data layer and pure modules (desync detector, client
 * components) without dragging `fs` along. `content-tasks.ts` imports from
 * here; there is exactly one source of truth for these rules.
 *
 * Design notes (mirrored from the data layer):
 * - `channel_phases` in tasks.json is the single source of truth for "what
 *   phase is this channel's work in". CT.status is derived forward-only from
 *   the aggregate (least-advanced channel wins) — never demoted automatically.
 * - User-driven reverts roll channel_phases back via STATUS_MAX_PHASE.
 */

export const CHANNEL_PHASE_RANK: Record<ChannelPhase, number> = {
  researching: 0,
  "clarify-needed": 1,
  drafting: 2,
  draft: 3,
  approved: 4,
  published: 5,
};

export const STATUS_RANK: Record<ContentTaskStatus, number> = {
  New: 0,
  Approved: 1,
  Draft: 2,
  "Pending Media": 3,
  Ready: 4,
  Published: 5,
  // Terminal off-axis states — never reached by forward ratchet.
  Discarded: 99,
  Deferred: 99,
};

export const PIPELINE_RANK: Record<ContentTaskPipelineState, number> = {
  researching: 0,
  "clarify-needed": 1,
  drafting: 2,
  "generating-media": 0,
  "media-review": 1,
};

/**
 * Maximum channel phase consistent with a given CT.status. Used to symmetrically
 * roll back channel_phases when the user reverts CT.status backward.
 */
export const STATUS_MAX_PHASE: Partial<Record<ContentTaskStatus, ChannelPhase>> = {
  New: undefined,                  // No phases applicable yet.
  Approved: "drafting",            // Within Approved: researching/clarify-needed/drafting allowed.
  Draft: "draft",
  "Pending Media": "approved",
  Ready: "approved",
  Published: "published",
};

/** Lowest-ranked phase across the map (least-advanced channel wins). */
export function aggregateChannelPhases(
  phases: Record<string, ChannelPhase> | undefined,
): ChannelPhase | null {
  if (!phases) return null;
  const entries = Object.values(phases);
  if (entries.length === 0) return null;
  return entries.reduce((acc, p) =>
    CHANNEL_PHASE_RANK[p] < CHANNEL_PHASE_RANK[acc] ? p : acc,
  );
}

/**
 * Map a (least-advanced) channel phase to the canonical CT (status,
 * pipeline_state) it implies.
 */
export function deriveStatusFromPhase(
  phase: ChannelPhase,
): { status: ContentTaskStatus; pipeline_state: ContentTaskPipelineState | null } {
  switch (phase) {
    case "researching":
      return { status: "Approved", pipeline_state: "researching" };
    case "clarify-needed":
      return { status: "Approved", pipeline_state: "clarify-needed" };
    case "drafting":
      return { status: "Approved", pipeline_state: "drafting" };
    case "draft":
      return { status: "Draft", pipeline_state: null };
    case "approved":
      return { status: "Pending Media", pipeline_state: "generating-media" };
    case "published":
      return { status: "Published", pipeline_state: null };
  }
}

/**
 * What a status revert will do to each channel phase: entries above the
 * target status' cap get capped (`to`), or cleared entirely (`to: null`)
 * when the target has no applicable phases (New). Only changed entries are
 * returned. `rollbackChannelPhasesToStatus` applies exactly this — the UI
 * uses it to preview the revert before confirming.
 */
export function computeRollbackPreview(
  channelPhases: Record<string, ChannelPhase> | undefined,
  targetStatus: ContentTaskStatus,
): Array<{ channel: string; from: ChannelPhase; to: ChannelPhase | null }> {
  if (!channelPhases) return [];
  const cap = STATUS_MAX_PHASE[targetStatus];
  const out: Array<{ channel: string; from: ChannelPhase; to: ChannelPhase | null }> = [];
  for (const [channel, from] of Object.entries(channelPhases)) {
    if (cap === undefined) {
      out.push({ channel, from, to: null });
    } else if (CHANNEL_PHASE_RANK[from] > CHANNEL_PHASE_RANK[cap]) {
      out.push({ channel, from, to: cap });
    }
  }
  return out;
}

/** Human labels for the Approved/Pending Media sub-states shown in the UI. */
export const PIPELINE_STATE_LABEL: Record<ContentTaskPipelineState, string> = {
  researching: "investigando",
  "clarify-needed": "clarify pendiente",
  drafting: "redactando",
  "generating-media": "generando media",
  "media-review": "media en revisión",
};

/** Forward-only: returns true if `target` is a strict advance over `current`. */
export function isForwardMove(
  current: { status: ContentTaskStatus; pipeline_state?: ContentTaskPipelineState | null },
  target: { status: ContentTaskStatus; pipeline_state: ContentTaskPipelineState | null },
): boolean {
  const cs = STATUS_RANK[current.status] ?? 0;
  const ts = STATUS_RANK[target.status] ?? 0;
  if (ts > cs) return true;
  if (ts < cs) return false;
  // Same status: compare pipeline_state ranks. Only meaningful for "Approved"
  // (researching → clarify-needed → drafting). For "Pending Media" the
  // generating-media → media-review move is owned by the media subsystem,
  // not by channel_phases — never auto-promote within Pending Media here.
  if (current.status !== "Approved") return false;
  const cp = current.pipeline_state ? PIPELINE_RANK[current.pipeline_state] ?? -1 : -1;
  const tp = target.pipeline_state ? PIPELINE_RANK[target.pipeline_state] ?? -1 : -1;
  return tp > cp;
}
