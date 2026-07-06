import type { ContentTask } from "@/types";
import { VALID_CONTENT_TASK_PIPELINE_STATES } from "@/types";
import type { ChannelPhase, ContentTaskPipelineState } from "@/types";
import type { Draft } from "@/lib/data/drafts";
import {
  aggregateChannelPhases,
  deriveStatusFromPhase,
  isForwardMove,
} from "@/lib/content-task-state";

/**
 * Pure desync detector for the content pipeline (SAN-153).
 *
 * The writer agent reports channel phases via curl; when it forgets, the
 * phase freezes while the artifacts on disk (drafts, clarify, media) tell the
 * real story. This module compares a ContentTask against its observable
 * artifacts and emits `DesyncReport`s. Reports flagged `promotable: true`
 * carry evidence strong enough for the reconciler to fix forward-only on its
 * own; the rest surface in the UI with a suggested action.
 *
 * Deliberately fs-free: callers (`content-reconciliation.ts`) load the
 * artifacts and hand them in, so the rules are unit-testable in isolation
 * and the reconciler is the ONLY writer. Never promote toward `approved`
 * (human decision + media gate) or `published` (publishing reconciler owns
 * that boundary).
 */

export type DesyncKind =
  | "draft-on-disk-phase-stale"    // R1: real draft written but phase never reported
  | "media-attached-state-stale"   // R4: media attached but pipeline_state stuck
  | "status-behind-aggregate"      // R5: phases persisted but forward promote lost
  | "clarify-answered-phase-stale" // D1: clarify answered, writer never resumed
  | "writer-stalled"               // D2: working state with no agent activity
  | "invalid-pipeline-state";      // D3: corrupted pipeline_state value

export interface DesyncReport {
  contentTaskId: string;
  parentTaskId: string;
  ideaId: string;
  channel?: string;
  kind: DesyncKind;
  detail: string;
  observed: { status: string; pipeline_state?: string | null; phase?: string };
  expected?: { phase?: ChannelPhase; status?: string };
  promotable: boolean;
  suggested_action: "auto-promote" | "retrigger-writer" | "review";
  detected_at: string;
}

export interface CtArtifacts {
  ct: ContentTask;
  parentTaskId: string;
  /** All drafts of the CT's idea (listDrafts) — channel drafts + clarify/research/proposal. */
  drafts: Draft[];
  /** mtime (epoch ms) of each channel draft file. Missing entry = unknown → never promotable. */
  draftMtimes: Record<string, number>;
  /** `getThread(threadId).updatedAt` — last chat activity. Null when no thread. */
  threadUpdatedAt: number | null;
  /** `getStatusEntry(threadId) !== null` — the agent is mid-run right now. */
  agentActive: boolean;
  now: number;
}

export interface DesyncConfig {
  /** Hours without thread/CT activity before a working CT counts as stalled. */
  stalledHours?: number;
}

const DEFAULT_STALLED_HOURS = 4;

/** Phases that mean "the writer owes work on this channel". */
const PRE_DRAFT_PHASES: ReadonlySet<ChannelPhase> = new Set([
  "researching",
  "clarify-needed",
  "drafting",
]);

const WORKING_PIPELINE_STATES: ReadonlySet<ContentTaskPipelineState> = new Set([
  "researching",
  "clarify-needed",
  "drafting",
]);

// Both stub texts in use: createEmptyDraft's starter (generate-drafts.ts) and
// the research/clarify placeholder rendered in the draft page.
const PLACEHOLDER_RES = [
  /Pendiente\. (?:Dulcinea|Escudero) rellenará/i,
  /_?Pendiente: Dulcinea ejecutará/i,
];

/** Channel a draft file represents — file location wins over frontmatter
 *  (the agent rewrites `kind:`/`channel:` with no contract; see the same
 *  rule in maybePromoteContentTaskFromMedia). */
function draftChannel(d: Draft): string {
  return d.relPath.split("/").pop()?.replace(/\.md$/, "") || d.meta.channel || "";
}

/** A channel draft whose body is real publishable content, not a stub. */
export function isRealDraftBody(d: Draft): boolean {
  const body = (d.body || "").trim();
  if (body.length < 200) return false;
  if ((d.meta.iteration ?? 0) < 1) return false;
  return !PLACEHOLDER_RES.some((re) => re.test(body));
}

export function detectDesyncs(a: CtArtifacts, cfg?: DesyncConfig): DesyncReport[] {
  const { ct } = a;
  const reports: DesyncReport[] = [];
  const detectedAt = new Date(a.now).toISOString();

  // Terminal states are never touched; New has no phases yet.
  if (["New", "Published", "Discarded", "Deferred"].includes(ct.status)) return reports;

  const base = {
    contentTaskId: ct.id,
    parentTaskId: a.parentTaskId,
    ideaId: ct.idea_id,
    detected_at: detectedAt,
  };
  const observedCt = { status: ct.status, pipeline_state: ct.pipeline_state ?? null };

  const byChannel = new Map<string, Draft>();
  for (const d of a.drafts) byChannel.set(draftChannel(d), d);
  const ctUpdatedMs = Date.parse(ct.updated_at ?? "");

  // R1 — real draft on disk, written AFTER the last CT action, but the phase
  // was never advanced. The mtime guard is what keeps a manual revert from
  // being undone: rolling back bumps ct.updated_at past the old .md mtime,
  // so only evidence NEWER than the revert can re-promote.
  for (const [channel, phase] of Object.entries(ct.channel_phases || {})) {
    if (!PRE_DRAFT_PHASES.has(phase)) continue;
    const d = byChannel.get(channel);
    if (!d || !isRealDraftBody(d)) continue;
    const mtime = a.draftMtimes[channel];
    if (mtime === undefined || !(mtime > ctUpdatedMs)) continue;
    reports.push({
      ...base,
      channel,
      kind: "draft-on-disk-phase-stale",
      detail: `Draft real en disco (${d.body.trim().length} chars, iteration ${d.meta.iteration}) posterior a la última acción del CT, pero la fase sigue en "${phase}".`,
      observed: { ...observedCt, phase },
      expected: { phase: "draft" },
      promotable: true,
      suggested_action: "auto-promote",
    });
  }

  // R4 — media attached while pipeline_state never left generating-media.
  if (ct.status === "Pending Media" && ct.pipeline_state === "generating-media") {
    const channelSet = new Set(ct.target_channels || []);
    const withMedia = a.drafts.find(
      (d) => channelSet.has(draftChannel(d)) && (d.meta.media?.length ?? 0) > 0,
    );
    if (withMedia) {
      reports.push({
        ...base,
        channel: draftChannel(withMedia),
        kind: "media-attached-state-stale",
        detail: `Hay media adjunta (${withMedia.meta.media?.length}) pero pipeline_state sigue en "generating-media".`,
        observed: observedCt,
        expected: { status: "Pending Media" },
        promotable: true,
        suggested_action: "auto-promote",
      });
    }
  }

  // R5 — phases already imply a more advanced status (promote was lost).
  const agg = aggregateChannelPhases(ct.channel_phases);
  if (agg) {
    const target = deriveStatusFromPhase(agg);
    if (isForwardMove(ct, target)) {
      reports.push({
        ...base,
        kind: "status-behind-aggregate",
        detail: `Las fases por canal (mínimo "${agg}") implican status "${target.status}" pero el CT sigue en "${ct.status}".`,
        observed: observedCt,
        expected: { status: target.status },
        promotable: true,
        suggested_action: "auto-promote",
      });
    }
  }

  // D3 — corrupted pipeline_state (e.g. a ChannelPhase leaked in).
  if (
    ct.pipeline_state != null &&
    !VALID_CONTENT_TASK_PIPELINE_STATES.includes(ct.pipeline_state)
  ) {
    reports.push({
      ...base,
      kind: "invalid-pipeline-state",
      detail: `pipeline_state "${ct.pipeline_state}" no es un valor válido (${VALID_CONTENT_TASK_PIPELINE_STATES.join(", ")}).`,
      observed: observedCt,
      promotable: false,
      suggested_action: "review",
    });
  }

  const anyPromotable = reports.some((r) => r.promotable);

  // D1 — human answered clarify but the writer never resumed (and there is no
  // real draft yet — if there were, R1 covers it). Not promotable: jumping to
  // "drafting" would hide that the writer is NOT actually working.
  const clarify = byChannel.get("clarify");
  const clarifyDone =
    clarify && ["answered", "skipped"].includes(clarify.meta.clarify_status ?? "");
  if (clarifyDone && !anyPromotable) {
    for (const [channel, phase] of Object.entries(ct.channel_phases || {})) {
      if (phase !== "clarify-needed") continue;
      const d = byChannel.get(channel);
      if (d && isRealDraftBody(d)) continue;
      reports.push({
        ...base,
        channel,
        kind: "clarify-answered-phase-stale",
        detail: `Clarify está "${clarify.meta.clarify_status}" pero el canal sigue en "clarify-needed" sin draft real — el writer no retomó.`,
        observed: { ...observedCt, phase },
        promotable: false,
        suggested_action: "retrigger-writer",
      });
    }
  }

  // D2 — working state with zero signals beyond the threshold. Suppressed
  // when something promotable was found (the promotion changes the picture)
  // or when the agent shows any sign of life.
  if (
    ct.status === "Approved" &&
    ct.pipeline_state != null &&
    WORKING_PIPELINE_STATES.has(ct.pipeline_state) &&
    !anyPromotable &&
    !a.agentActive
  ) {
    const stalledMs = (cfg?.stalledHours ?? DEFAULT_STALLED_HOURS) * 3_600_000;
    const lastSignal = Math.max(a.threadUpdatedAt ?? 0, ctUpdatedMs || 0);
    if (a.now - lastSignal > stalledMs) {
      reports.push({
        ...base,
        kind: "writer-stalled",
        detail: `CT en "${ct.status}/${ct.pipeline_state}" sin actividad del agente desde hace ${Math.round((a.now - lastSignal) / 3_600_000)}h.`,
        observed: observedCt,
        promotable: false,
        suggested_action: "retrigger-writer",
      });
    }
  }

  return reports;
}
