/**
 * pipeline-steps.ts — single import home for the pipeline "step" vocabulary.
 *
 * Client-safe (no `fs`). Mirrors `task-status.ts`.
 *
 * Context (SAN-344): the concrete per-surface step vocabularies are ALREADY
 * enum-validated at their own write sites — `ContentTaskPipelineState` and
 * `ChannelPhase` in `content-tasks.ts`, the partnership `stage` in
 * `partnerships/stage-mapping.ts`, the progress `kind` in the chat webhook. So
 * this module deliberately does NOT introduce a competing write-vocabulary. It:
 *   1. re-exports the two content-pipeline step enums so callers import step
 *      names from ONE place (don't re-declare them in components/gates), and
 *   2. provides a small ABSTRACT, pipeline-agnostic "step" ladder that the
 *      deterministic done-gate validates a free-form `step` against, so an
 *      unrecognized step is caught instead of silently accepted.
 */

export { VALID_CONTENT_TASK_PIPELINE_STATES, VALID_CHANNEL_PHASES } from "@/types";
export type { ContentTaskPipelineState, ChannelPhase } from "@/types";

/**
 * Abstract, pipeline-agnostic step ladder at the "done" altitude. NOT a write
 * vocabulary — the concrete pipelines keep their own enums. This is the
 * canonical set the done-gate checks a passed `step` against.
 */
export const VALID_PIPELINE_STEPS = [
  "research",
  "clarify",
  "draft",
  "review",
  "ready",
  "published",
] as const;
export type PipelineStep = (typeof VALID_PIPELINE_STEPS)[number];

/**
 * Aliases mapping the concrete per-surface step names + common free-form prose
 * onto the abstract ladder. Mirrors `LEGACY_STATUS_ALIASES` in task-status.ts.
 */
const STEP_ALIASES: Record<string, PipelineStep> = {
  // content pipeline_state
  researching: "research",
  "research-pack": "research",
  "clarify-needed": "clarify",
  clarifying: "clarify",
  drafting: "draft",
  writing: "draft",
  "generating-media": "draft",
  "media-review": "review",
  // channel phases / generic prose
  "in-review": "review",
  qa: "review",
  approved: "ready",
  "dispatch-ready": "ready",
  publish: "published",
  live: "published",
};

/**
 * Canonical step or `null`. Unlike `normalizeTaskStatus` (which falls back to a
 * default), this returns `null` for an unknown value so the done-gate can report
 * `INVALID_STEP` — a "done"-moment step is an assertion, not a default.
 */
export function normalizePipelineStep(
  input: string | null | undefined,
): PipelineStep | null {
  const s = (input || "").trim().toLowerCase();
  if (!s) return null;
  if ((VALID_PIPELINE_STEPS as readonly string[]).includes(s)) return s as PipelineStep;
  return STEP_ALIASES[s] ?? null;
}
