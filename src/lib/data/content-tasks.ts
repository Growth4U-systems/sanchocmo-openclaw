import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import { listDrafts, loadDraft } from "@/lib/data/drafts";
import {
  aggregateChannelPhases,
  computeRollbackPreview,
  deriveStatusFromPhase,
  isForwardMove,
} from "@/lib/content-task-state";
import {
  ContentTask,
  ContentTaskStatus,
  ContentTaskPipelineState,
  ChannelPhase,
  VALID_CONTENT_TASK_STATUSES,
  VALID_CONTENT_TASK_PIPELINE_STATES,
  VALID_CHANNEL_PHASES,
  Task,
} from "@/types";

/**
 * ContentTask helpers.
 *
 * ContentTasks are nested under a parent Task with `type: "content"`. Each
 * approved idea becomes one ContentTask carrying its own thread, skill, and
 * documents (drafts). They live inside the parent's `content_tasks[]` array
 * in `tasks.json` — same file, no extra storage layer.
 *
 * Constraint enforced at every write: parent must have `type === "content"`.
 */

interface ProjectTasksFile {
  tasks: Record<string, unknown>[];
  filePath: string;
}

function projectsDir(slug: string): string {
  return path.join(BASE, "brand", slug, "projects");
}

function findProjectDirByTaskId(slug: string, taskId: string): string | null {
  const root = projectsDir(slug);
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const tasksPath = path.join(root, entry.name, "tasks.json");
    if (!fs.existsSync(tasksPath)) continue;
    try {
      const tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8")) as Record<string, unknown>[];
      if (tasks.some((t) => t.id === taskId)) return path.join(root, entry.name);
    } catch { /* skip malformed */ }
  }
  return null;
}

function loadProjectTasks(slug: string, taskId: string): ProjectTasksFile | null {
  const projDir = findProjectDirByTaskId(slug, taskId);
  if (!projDir) return null;
  const filePath = path.join(projDir, "tasks.json");
  try {
    const tasks = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>[];
    return { tasks, filePath };
  } catch {
    return null;
  }
}

function saveProjectTasks(file: ProjectTasksFile): void {
  fs.writeFileSync(file.filePath, JSON.stringify(file.tasks, null, 2));
}

/** Get the parent Task and assert it accepts ContentTasks. */
function requireContentParent(slug: string, parentTaskId: string): { file: ProjectTasksFile; parent: Record<string, unknown> } {
  const file = loadProjectTasks(slug, parentTaskId);
  if (!file) throw new Error(`Parent task ${parentTaskId} not found for slug ${slug}`);
  const parent = file.tasks.find((t) => t.id === parentTaskId);
  if (!parent) throw new Error(`Parent task ${parentTaskId} not found in tasks.json`);
  if (parent.type !== "content") {
    throw new Error(`ContentTask can only be nested under type=content tasks (parent ${parentTaskId} is type=${parent.type})`);
  }
  return { file, parent };
}

export function listContentTasks(slug: string, parentTaskId: string): ContentTask[] {
  const file = loadProjectTasks(slug, parentTaskId);
  if (!file) return [];
  const parent = file.tasks.find((t) => t.id === parentTaskId);
  return ((parent?.content_tasks as ContentTask[] | undefined) || []);
}

export function findContentTask(slug: string, parentTaskId: string, contentTaskId: string): ContentTask | null {
  return listContentTasks(slug, parentTaskId).find((c) => c.id === contentTaskId) || null;
}

export interface CreateContentTaskInput {
  parent_task_id: string;
  idea_id: string;
  name: string;
  skill: string;
  target_channels: string[];
  status?: ContentTaskStatus;
  pipeline_state?: ContentTaskPipelineState;
  channel_phases?: Record<string, ChannelPhase>;
  documents?: ContentTask["documents"];
  mc_chat_thread_id?: string;
  owner?: string;
}

/**
 * Create (or return existing) ContentTask. Idempotent: if a ContentTask with
 * the same `idea_id` already exists under the parent, returns that one without
 * creating a duplicate.
 */
export function createContentTask(slug: string, input: CreateContentTaskInput): ContentTask {
  const { file, parent } = requireContentParent(slug, input.parent_task_id);
  const existing = ((parent.content_tasks as ContentTask[] | undefined) || []).find(
    (c) => c.idea_id === input.idea_id,
  );
  if (existing) return existing;

  const list = (parent.content_tasks as ContentTask[] | undefined) || [];
  const seq = String(list.length + 1).padStart(2, "0");
  const id = `${input.parent_task_id}-C${seq}`;

  const now = new Date().toISOString();
  // Canonical thread id matches the convention used by buildContentTaskThread
  // (`${slug}:content:${id.lower()}`) — the threadFile sanitizer turns that
  // into `content-{id.lower()}.json` on disk. Older code used `task-` here
  // by mistake, leaving a dead pointer; we always use `content-` now.
  const threadId = input.mc_chat_thread_id || `content-${id.toLowerCase()}`;
  const contentTask: ContentTask = {
    id,
    parent_task_id: input.parent_task_id,
    idea_id: input.idea_id,
    name: input.name,
    status: input.status || "Approved",
    pipeline_state: input.pipeline_state,
    channel_phases: input.channel_phases,
    skill: input.skill,
    target_channels: input.target_channels,
    documents: input.documents || [],
    mc_chat_thread_id: threadId,
    owner: input.owner || "Dulcinea",
    created_at: now,
    updated_at: now,
  };

  parent.content_tasks = [...list, contentTask];
  saveProjectTasks(file);

  // Pre-create the chat thread file so the index always finds it, even if the
  // user hasn't opened the chat yet. Empty state matches what mc-chat would
  // create on the first message.
  const chatDir = path.join(BASE, "brand", slug, "chat");
  fs.mkdirSync(chatDir, { recursive: true });
  const chatFile = path.join(chatDir, `${threadId}.json`);
  if (!fs.existsSync(chatFile)) {
    fs.writeFileSync(
      chatFile,
      JSON.stringify({ messages: [], createdAt: now }, null, 2),
    );
  }

  return contentTask;
}

/**
 * Update status (and optionally pipeline_state) of a ContentTask. Validates
 * the new status against the canonical list.
 */
export function setContentTaskStatus(
  slug: string,
  parentTaskId: string,
  contentTaskId: string,
  status: ContentTaskStatus,
  pipelineState?: ContentTaskPipelineState | null,
): ContentTask {
  if (!VALID_CONTENT_TASK_STATUSES.includes(status)) {
    throw new Error(`Invalid ContentTaskStatus: ${status}`);
  }
  // Validate pipeline_state too. Without this, callers can leak ChannelPhase
  // values (e.g. "approved", "draft", "published") into pipeline_state, which
  // breaks the UI stepper because nothing matches PIPELINE_RANK and the CT
  // gets stuck (you can't auto-promote forward without a known rank).
  if (
    pipelineState !== null &&
    pipelineState !== undefined &&
    !VALID_CONTENT_TASK_PIPELINE_STATES.includes(pipelineState)
  ) {
    throw new Error(`Invalid ContentTaskPipelineState: ${pipelineState}`);
  }
  const { file, parent } = requireContentParent(slug, parentTaskId);
  const list = (parent.content_tasks as ContentTask[] | undefined) || [];
  const ct = list.find((c) => c.id === contentTaskId);
  if (!ct) throw new Error(`ContentTask ${contentTaskId} not found under ${parentTaskId}`);

  ct.status = status;
  ct.updated_at = new Date().toISOString();
  if (pipelineState === null) delete ct.pipeline_state;
  else if (pipelineState !== undefined) ct.pipeline_state = pipelineState;

  // Phase-entry timestamps (terminal + landmark transitions)
  if (status === "Published" && !ct.published_at) ct.published_at = ct.updated_at;
  if (status === "Discarded" && !ct.discarded_at) ct.discarded_at = ct.updated_at;
  if (status === "Deferred" && !ct.deferred_at) ct.deferred_at = ct.updated_at;
  if (status === "Approved" && !ct.approved_at) ct.approved_at = ct.updated_at;
  if (status === "Pending Media" && !ct.pending_media_at) ct.pending_media_at = ct.updated_at;

  saveProjectTasks(file);
  return ct;
}

// ── channel_phases helpers ──────────────────────────────────────────────────
// `tasks.json` (CT.status + CT.pipeline_state + CT.channel_phases) is the
// single source of truth for "what phase is this work in". The previous design
// stored a redundant `meta.status` per draft `.md` and reconciled CT state
// from those frontmatters on every GET — that self-healing read silently
// undid manual reverts and created a duplicate-state bug. Now: the writer
// skill PATCHes `channel_phases` via the API; setChannelPhase auto-promotes
// CT.status forward only; user-driven reverts symmetrically roll back the
// affected channel_phases entries (see PATCH handler).
//
// The pure state-machine rules (ranks, aggregate, forward-move) live in
// `@/lib/content-task-state` so fs-free modules (desync detector, client
// code) can share them. Re-exported here for back-compat.

export { aggregateChannelPhases };

// ── Fail-loud media gate (SAN-244) ──────────────────────────────────────────
// SELF-CONTAINED BLOCK. A neighbouring gate (e.g. SAN-238 research gate) can be
// added right beside this one with minimal conflict — keep it delimited.
//
// Decision (Alfonso): a REAL code gate, not agent obedience. The pipeline must
// NOT advance a channel to the dispatch-ready phase (`approved`, the phase the
// publish endpoint requires before sending to a provider) unless either:
//   (a) there is ≥1 real media asset on the channel draft, OR
//   (b) the user/agent set an explicit `media_status: "skipped"` escape.
// This is the hard stop that turns Dulcinea's "I saved a visual at <path>"
// confabulation into a 409 instead of a silently text-only carousel.
//
// Extends the original SAN-153 gate (which blocked empty media → approved but
// had no skip escape and threw a generic Error → 400). Consolidated here so the
// two write paths (setChannelPhase / setChannelPhases) share one rule, and the
// PATCH endpoint can map it to a precise 409.

/** Thrown by `assertMediaReady`. Carries an HTTP status so the API layer can
 *  return 409 (Conflict) instead of a generic 400/500. */
export class MediaGateError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "MediaGateError";
  }
}

/**
 * Fail-loud gate for the `→ approved` (dispatch-ready) transition.
 *
 * Throws `MediaGateError` (→ 409) when a channel declares
 * `media_policy="required"` but its draft has no media AND the CT has no
 * explicit `media_status:"skipped"` escape. No-op for any other phase, any
 * non-required channel, or when the escape is set.
 *
 * Mirrors the publish-time check in `src/pages/api/publishing/publish.ts`,
 * applied earlier (at the phase transition) so curl/agent paths that PATCH
 * `channel_phases` directly can't reach a media-ready state with a fabricated
 * asset path.
 */
export function assertMediaReady(
  slug: string,
  ct: ContentTask,
  channel: string,
  phase: ChannelPhase,
): void {
  // Only the dispatch-ready phase is gated. `approved` is the publishing-ready
  // phase — publish.ts refuses any channel not in `approved`/`published`. There
  // is no separate "media-ready" ChannelPhase to gate; `approved` IS it.
  if (phase !== "approved") return;
  if (ct.media_policy?.[channel] !== "required") return;

  // Explicit escape: the user/agent deliberately chose to ship text-only.
  if (ct.media_status === "skipped") return;

  const draft = loadDraft(slug, ct.idea_id, channel);
  const mediaCount = draft?.meta.media?.length ?? 0;
  if (mediaCount === 0) {
    throw new MediaGateError(
      `Channel "${channel}" requires media (media_policy="required") but its ` +
        `draft has no media attached — cannot advance to "approved" ` +
        `(dispatch-ready). Upload the carousel / image(s) and retry, or set ` +
        `media_status:"skipped" on the content task to ship it text-only.`,
    );
  }
}
// ── end media gate ──────────────────────────────────────────────────────────

// ── Fail-loud research gate (SAN-238 P1) ─────────────────────────────────────
// SELF-CONTAINED BLOCK, mirrors the media gate above. Keep it delimited so a
// neighbouring gate can be added with minimal conflict.
//
// Problem: the research→clarify→write contract is enforced ONLY by prose in the
// dispatch prompt. A non-compliant agent can skip deep-research, fabricate a
// "Research Pack" from memory (including a faked `<!-- … | fuentes: N -->`
// marker), and the pipeline accepts it — the empty research.md scaffold
// (`## Sources` / `## Queries` / `## Key findings`, no URLs) written by
// generate-drafts looks "present" but has no real evidence. This is the same
// failure class as SAN-244's confabulated media path, one phase earlier.
//
// Fix: a REAL code gate (not agent obedience). The pipeline must NOT advance a
// channel INTO the post-research phases (`clarify-needed` / `drafting`) unless
// all THREE deep-research artifacts exist AND research.md carries enough REAL,
// unique source URLs. We count actual `http(s)://` URLs parsed from the body —
// we do NOT read the self-reported `<!-- fuentes: N -->` marker, because that
// marker is exactly what a non-compliant agent fakes (qa-reports.ts parses it
// for display; trusting it here would let the fabrication through).
//
// CATASTROPHIC-FAILURE GUARD / KILL-SWITCH: if web_search/Firecrawl ever breaks
// again, real research can't reach the threshold and this gate would freeze ALL
// content tasks. So it ships behind an env flag, default ON (enforcing). Set
// `CONTENT_RESEARCH_GATE=off` to disable instantly (no code revert / redeploy
// of logic) — `assertResearchReady` then becomes a no-op. Confirm web_search
// liveness on the deploy; flip the flag off if research is flaky.
const RESEARCH_GATE_ENABLED = process.env.CONTENT_RESEARCH_GATE !== "off";

// Phases that mean "research is done, we've moved past it". Entering either of
// these is the chokepoint we gate. `researching` (still doing research),
// `draft`/`approved`/`published` (way past — gating those would block normal
// forward flow and re-publishes for tasks whose research predates this gate)
// are intentionally NOT gated.
const RESEARCH_GATED_PHASES: ReadonlySet<ChannelPhase> = new Set<ChannelPhase>([
  "clarify-needed",
  "drafting",
]);

// Minimum distinct real source URLs that must appear in research.md before the
// pipeline will accept the research as "done".
//
// The deep-research contract (skills/deep-research/SKILL.md, Mandatory Rule 3)
// demands ≥10 unique sources. We deliberately do NOT gate at 10: that's the
// quality bar the skill self-enforces, and hard-blocking at 10 would freeze
// legitimately short pieces (a single strong primary source + a corroborating
// secondary one) and over-couple the gate to one skill's rubric. The job of
// THIS gate is narrower: catch the "0 real sources, fabricated from memory"
// failure mode (and the empty scaffold, which has 0 URLs). A conservative floor
// of 3 distinct URLs cleanly separates "did no real research" from "did real
// research", without policing depth. Tune via the constant if needed.
const RESEARCH_MIN_SOURCES = 3;

/** Thrown by `assertResearchReady`. Carries 422 (Unprocessable Entity): the
 *  request is well-formed but the CT's research state can't satisfy the
 *  requested phase advance. Distinct from MediaGateError's 409 so the two gates
 *  surface differently to the caller. */
export class ResearchGateError extends Error {
  readonly statusCode = 422;
  constructor(message: string) {
    super(message);
    this.name = "ResearchGateError";
  }
}

/**
 * Count DISTINCT real source URLs in a research document body. Parses actual
 * `http(s)://…` URLs (Sources Index, inline citations, anywhere), normalizes
 * and dedupes them. Pure + side-effect-free so tests and callers can reuse it.
 *
 * Intentionally ignores the `<!-- … | fuentes: N -->` self-reported marker:
 * that count is agent-authored and is the first thing a non-compliant agent
 * fakes. Only URLs that are physically present count.
 */
export function countResearchSourceUrls(body: string | null | undefined): number {
  if (!body) return 0;
  // Strip HTML comments first so a faked `<!-- fuentes: 12 -->` marker — or any
  // URL parked inside a comment — can never contribute to the count.
  const visible = body.replace(/<!--[\s\S]*?-->/g, "");
  // Match http(s) URLs; stop at whitespace or markdown/sentence delimiters so
  // trailing `)`, `]`, `,`, `.` etc. don't fork one URL into "distinct" ones.
  const matches = visible.match(/https?:\/\/[^\s<>)"'\]]+/gi) || [];
  const seen = new Set<string>();
  for (const raw of matches) {
    // Normalize: drop a trailing punctuation run, lowercase host via URL when
    // parseable, strip a trailing slash. Fall back to the trimmed string.
    let url = raw.replace(/[.,;:!?]+$/, "");
    try {
      const u = new URL(url);
      url = `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`;
    } catch {
      url = url.replace(/\/$/, "");
    }
    seen.add(url);
  }
  return seen.size;
}

/**
 * Fail-loud gate for the `→ clarify-needed` / `→ drafting` transition.
 *
 * Throws `ResearchGateError` (→ 422) when a channel is advanced INTO a
 * post-research phase but the deep-research deliverables aren't really there:
 *   1. `{ideaDir}/research.md` missing, OR
 *   2. `{ideaDir}/QA-REPORT-research.md` missing, OR
 *   3. `brand/{slug}/intelligence/research-log.json` missing, OR
 *   4. research.md contains fewer than `RESEARCH_MIN_SOURCES` distinct real
 *      source URLs (the fabricated/empty-scaffold case).
 *
 * No-op for any non-gated phase, and a full no-op when the kill-switch
 * (`CONTENT_RESEARCH_GATE=off`) is set. `ideaDir` is derived from `ct.idea_id`
 * exactly like the per-channel drafts (`brand/{slug}/content/drafts/{ideaId}/`),
 * matching the paths the writer-trigger prompt instructs the agent to write.
 */
export function assertResearchReady(
  slug: string,
  ct: ContentTask,
  channel: string,
  phase: ChannelPhase,
): void {
  if (!RESEARCH_GATE_ENABLED) return;
  if (!RESEARCH_GATED_PHASES.has(phase)) return;

  const ideaDir = path.join(BASE, "brand", slug, "content", "drafts", ct.idea_id);
  const researchPath = path.join(ideaDir, "research.md");
  const qaReportPath = path.join(ideaDir, "QA-REPORT-research.md");
  const researchLogPath = path.join(BASE, "brand", slug, "intelligence", "research-log.json");

  const fail = (why: string): never => {
    throw new ResearchGateError(
      `Channel "${channel}" cannot advance to "${phase}": ${why}. The ` +
        `research→clarify→write contract requires a real deep-research pass — ` +
        `research.md + QA-REPORT-research.md + intelligence/research-log.json, ` +
        `with ≥${RESEARCH_MIN_SOURCES} distinct real source URLs in research.md ` +
        `(the self-reported "fuentes" marker is NOT counted). Run deep-research ` +
        `for real and retry. If web_search/Firecrawl is down, set ` +
        `CONTENT_RESEARCH_GATE=off to bypass this gate.`,
    );
  };

  if (!fs.existsSync(researchPath)) fail("research.md is missing");
  if (!fs.existsSync(qaReportPath)) fail("QA-REPORT-research.md is missing");
  if (!fs.existsSync(researchLogPath)) fail("intelligence/research-log.json is missing");

  let researchBody = "";
  try {
    researchBody = fs.readFileSync(researchPath, "utf-8");
  } catch {
    fail("research.md could not be read");
  }
  const sourceCount = countResearchSourceUrls(researchBody);
  if (sourceCount < RESEARCH_MIN_SOURCES) {
    fail(
      `research.md has only ${sourceCount} distinct real source URL(s) ` +
        `(need ≥${RESEARCH_MIN_SOURCES}) — looks like an empty scaffold or ` +
        `research fabricated from memory`,
    );
  }
}
// ── end research gate ────────────────────────────────────────────────────────

/**
 * Update one channel's phase under a ContentTask. Persists to `tasks.json` and
 * forward-only auto-promotes `ct.status` / `pipeline_state` based on the new
 * aggregate phase. Never demotes — user-driven reverts roll back phases via
 * the PATCH handler.
 */
export function setChannelPhase(
  slug: string,
  parentTaskId: string,
  contentTaskId: string,
  channel: string,
  phase: ChannelPhase,
): ContentTask {
  if (!VALID_CHANNEL_PHASES.includes(phase)) {
    throw new Error(`Invalid ChannelPhase: ${phase}`);
  }
  const { file, parent } = requireContentParent(slug, parentTaskId);
  const list = (parent.content_tasks as ContentTask[] | undefined) || [];
  const ct = list.find((c) => c.id === contentTaskId);
  if (!ct) throw new Error(`ContentTask ${contentTaskId} not found under ${parentTaskId}`);

  // Fail-loud research gate (SAN-238 P1): block `→ clarify-needed`/`→ drafting`
  // unless the 3 deep-research artifacts exist with ≥N real source URLs.
  // Kill-switch: CONTENT_RESEARCH_GATE=off → no-op. Shared with setChannelPhases.
  assertResearchReady(slug, ct, channel, phase);

  // Fail-loud media gate (SAN-244, extends SAN-153): block `→ approved` with
  // empty required media unless an explicit `media_status:"skipped"` escape is
  // set. Single rule shared with setChannelPhases + the publish endpoint.
  assertMediaReady(slug, ct, channel, phase);

  ct.channel_phases = { ...(ct.channel_phases || {}), [channel]: phase };
  ct.updated_at = new Date().toISOString();
  saveProjectTasks(file);

  // Forward-only auto-promote CT.status from the aggregate phase. Never
  // demote — manual reverts are handled in the PATCH handler.
  const agg = aggregateChannelPhases(ct.channel_phases);
  if (agg) {
    const target = deriveStatusFromPhase(agg);
    if (isForwardMove(ct, target)) {
      // `setContentTaskStatus` re-saves the file; idempotent re-write is fine.
      return setContentTaskStatus(slug, parentTaskId, contentTaskId, target.status, target.pipeline_state);
    }
  }
  return ct;
}

/**
 * Bulk-set channel phases (merge). Useful for migrations and the PATCH
 * endpoint when the agent updates multiple channels at once.
 */
export function setChannelPhases(
  slug: string,
  parentTaskId: string,
  contentTaskId: string,
  patch: Record<string, ChannelPhase>,
): ContentTask {
  for (const [, p] of Object.entries(patch)) {
    if (!VALID_CHANNEL_PHASES.includes(p)) {
      throw new Error(`Invalid ChannelPhase: ${p}`);
    }
  }
  const { file, parent } = requireContentParent(slug, parentTaskId);
  const list = (parent.content_tasks as ContentTask[] | undefined) || [];
  const ct = list.find((c) => c.id === contentTaskId);
  if (!ct) throw new Error(`ContentTask ${contentTaskId} not found under ${parentTaskId}`);

  // Fail-loud gates (SAN-238 research + SAN-244 media) — same rules as
  // setChannelPhase, applied to every channel in the bulk patch. Research gate
  // fires on `→ clarify-needed`/`→ drafting`; media gate on `→ approved`.
  for (const [channel, p] of Object.entries(patch)) {
    assertResearchReady(slug, ct, channel, p);
    assertMediaReady(slug, ct, channel, p);
  }

  ct.channel_phases = { ...(ct.channel_phases || {}), ...patch };
  ct.updated_at = new Date().toISOString();
  saveProjectTasks(file);

  const agg = aggregateChannelPhases(ct.channel_phases);
  if (agg) {
    const target = deriveStatusFromPhase(agg);
    if (isForwardMove(ct, target)) {
      return setContentTaskStatus(slug, parentTaskId, contentTaskId, target.status, target.pipeline_state);
    }
  }
  return ct;
}

/**
 * Roll back any channel_phases entry that's more advanced than what the
 * current `ct.status` allows. Called after a user-driven status revert so
 * the per-channel detail stays coherent (and so the next forward auto-promote
 * doesn't immediately undo the revert).
 */
export function rollbackChannelPhasesToStatus(
  slug: string,
  parentTaskId: string,
  contentTaskId: string,
): ContentTask {
  const { file, parent } = requireContentParent(slug, parentTaskId);
  const list = (parent.content_tasks as ContentTask[] | undefined) || [];
  const ct = list.find((c) => c.id === contentTaskId);
  if (!ct) throw new Error(`ContentTask ${contentTaskId} not found under ${parentTaskId}`);
  if (!ct.channel_phases) return ct;

  // Single source of truth with the UI preview: apply exactly what
  // computeRollbackPreview reports.
  const changes = computeRollbackPreview(ct.channel_phases, ct.status);
  if (changes.length === 0) return ct;

  if (changes.some((c) => c.to === null)) {
    // No applicable phases (status=New) → clear the map entirely.
    delete ct.channel_phases;
  } else {
    const next: Record<string, ChannelPhase> = { ...ct.channel_phases };
    for (const c of changes) next[c.channel] = c.to as ChannelPhase;
    ct.channel_phases = next;
  }
  ct.updated_at = new Date().toISOString();
  saveProjectTasks(file);
  return ct;
}

/** Append a document reference to a ContentTask's `documents[]`. Idempotent by path. */
export function attachDocumentToContentTask(
  slug: string,
  parentTaskId: string,
  contentTaskId: string,
  doc: { path: string; name?: string; channel?: string },
): ContentTask {
  const { file, parent } = requireContentParent(slug, parentTaskId);
  const list = (parent.content_tasks as ContentTask[] | undefined) || [];
  const ct = list.find((c) => c.id === contentTaskId);
  if (!ct) throw new Error(`ContentTask ${contentTaskId} not found under ${parentTaskId}`);
  if (!ct.documents.some((d) => d.path === doc.path)) {
    ct.documents = [...ct.documents, doc];
    ct.updated_at = new Date().toISOString();
    saveProjectTasks(file);
  }
  return ct;
}

/** Remove a document reference from a ContentTask's `documents[]` by path. Idempotent. */
export function removeDocumentFromContentTask(
  slug: string,
  parentTaskId: string,
  contentTaskId: string,
  docPath: string,
): ContentTask {
  const { file, parent } = requireContentParent(slug, parentTaskId);
  const list = (parent.content_tasks as ContentTask[] | undefined) || [];
  const ct = list.find((c) => c.id === contentTaskId);
  if (!ct) throw new Error(`ContentTask ${contentTaskId} not found under ${parentTaskId}`);
  const before = ct.documents.length;
  ct.documents = ct.documents.filter((d) => d.path !== docPath);
  if (ct.documents.length !== before) {
    ct.updated_at = new Date().toISOString();
    saveProjectTasks(file);
  }
  return ct;
}

/**
 * Editable fields for a ContentTask via PATCH. `id`, `parent_task_id`,
 * `idea_id`, `created_at` and the lifecycle timestamps are read-only here —
 * status changes go through `setContentTaskStatus`.
 */
export type ContentTaskUpdateInput = Partial<
  Pick<
    ContentTask,
    | "name"
    | "skill"
    | "target_channels"
    | "documents"
    | "mc_chat_thread_id"
    | "owner"
    | "scheduled_for"
    | "clarify_status"
    | "media_policy"
    | "media_status"
    | "author"
  >
>;

const UPDATABLE_FIELDS: readonly (keyof ContentTaskUpdateInput)[] = [
  "name",
  "skill",
  "target_channels",
  "documents",
  "mc_chat_thread_id",
  "owner",
  "scheduled_for",
  "clarify_status",
  "media_policy",
  "media_status",
  "author",
] as const;

/**
 * Generic field update for a ContentTask. Whitelists writable fields so the
 * caller can't overwrite identity (`id`, `parent_task_id`, `idea_id`) or
 * status timestamps. Status itself flows through `setContentTaskStatus`.
 */
export function updateContentTask(
  slug: string,
  parentTaskId: string,
  contentTaskId: string,
  fields: ContentTaskUpdateInput,
): ContentTask {
  const { file, parent } = requireContentParent(slug, parentTaskId);
  const list = (parent.content_tasks as ContentTask[] | undefined) || [];
  const ct = list.find((c) => c.id === contentTaskId);
  if (!ct) throw new Error(`ContentTask ${contentTaskId} not found under ${parentTaskId}`);

  let dirty = false;
  for (const key of UPDATABLE_FIELDS) {
    if (key in fields && fields[key] !== undefined) {
      (ct as unknown as Record<string, unknown>)[key] = fields[key];
      dirty = true;
    }
  }
  if (dirty) {
    ct.updated_at = new Date().toISOString();
    saveProjectTasks(file);
  }
  return ct;
}

/**
 * Find a ContentTask by its id, scanning all projects of the brand. Useful
 * for entry points that only know `contentTaskId` (drafts, retry triggers,
 * deep-linked URLs) and need to recover the parent context.
 */
export function findContentTaskByIdAcrossProjects(
  slug: string,
  contentTaskId: string,
): { ct: ContentTask; parentTaskId: string; projectDir: string } | null {
  const root = projectsDir(slug);
  if (!fs.existsSync(root)) return null;
  // Case-insensitive: chat thread ids carry the CT id lowercased
  // (writer-trigger#buildThreadId), while tasks.json stores it mixed-case.
  const wanted = contentTaskId.toLowerCase();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const tasksPath = path.join(root, entry.name, "tasks.json");
    if (!fs.existsSync(tasksPath)) continue;
    let tasks: Record<string, unknown>[];
    try {
      tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
    } catch { continue; }
    for (const t of tasks) {
      const cts = (t.content_tasks as ContentTask[] | undefined) || [];
      const match = cts.find((c) => c.id.toLowerCase() === wanted);
      if (match) {
        return {
          ct: match,
          parentTaskId: t.id as string,
          projectDir: path.join(root, entry.name),
        };
      }
    }
  }
  return null;
}

/**
 * Enumerate every ContentTask of the brand with its parent context. Same scan
 * as `findContentTaskByIdAcrossProjects` but exhaustive — used by the content
 * reconciler to sweep the whole pipeline.
 */
export function listAllContentTasks(
  slug: string,
): Array<{ ct: ContentTask; parentTaskId: string; projectDir: string }> {
  const root = projectsDir(slug);
  if (!fs.existsSync(root)) return [];
  const out: Array<{ ct: ContentTask; parentTaskId: string; projectDir: string }> = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const tasksPath = path.join(root, entry.name, "tasks.json");
    if (!fs.existsSync(tasksPath)) continue;
    let tasks: Record<string, unknown>[];
    try {
      tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
    } catch { continue; }
    for (const t of tasks) {
      const cts = (t.content_tasks as ContentTask[] | undefined) || [];
      for (const ct of cts) {
        out.push({ ct, parentTaskId: t.id as string, projectDir: path.join(root, entry.name) });
      }
    }
  }
  return out;
}

/**
 * Re-run the aggregate→status promotion without touching channel_phases.
 * Rescues the case where the phases were persisted but the forward promote
 * never landed (e.g. process died between the two saves). Forward-only, same
 * rules as the ratchet inside `setChannelPhase`. Returns the CT (updated or
 * not), or null when it doesn't exist.
 */
export function promoteStatusFromAggregate(
  slug: string,
  parentTaskId: string,
  contentTaskId: string,
): ContentTask | null {
  const found = findContentTask(slug, parentTaskId, contentTaskId);
  if (!found) return null;
  const agg = aggregateChannelPhases(found.channel_phases);
  if (!agg) return found;
  const target = deriveStatusFromPhase(agg);
  if (!isForwardMove(found, target)) return found;
  return setContentTaskStatus(slug, parentTaskId, contentTaskId, target.status, target.pipeline_state);
}

/**
 * Move the `Pending Media` pipeline_state forward as media is added or
 * removed. Reacts to `media[]` changes on the per-channel drafts. Does NOT
 * change the top-level status — entry into `Pending Media` is driven by the
 * user's explicit "approve draft text" action; exit (to `Ready`) is driven
 * by the user's explicit "approve media" action.
 *
 * Behavior:
 *   - CT in `Pending Media/generating-media` + media added on any channel
 *       → advance pipeline_state to `media-review`.
 *   - CT in `Pending Media/media-review` + all media removed everywhere
 *       → roll back pipeline_state to `generating-media`.
 *   - CT in any other status → no change. Adding media on a `Draft` does
 *     NOT auto-bump the CT to Pending Media (that's an explicit user action).
 *
 * Called from `attachMediaToDraft` and the DELETE media endpoint.
 */
export function maybePromoteContentTaskFromMedia(
  slug: string,
  contentTaskId: string,
): ContentTask | null {
  const found = findContentTaskByIdAcrossProjects(slug, contentTaskId);
  if (!found) return null;
  const { ct, parentTaskId } = found;

  if (ct.status !== "Pending Media") return ct;

  // Filter by filename → target_channels match (NOT by frontmatter `kind`).
  // The agent rewrites `kind:` when finishing a draft and there's no contract
  // forcing it back to "channel-draft" — file location is the single source of
  // truth for whether a doc is a channel draft. (See same fix in
  // /api/content-engine/content-tasks.ts approve-* handlers.)
  const channelSet = new Set(ct.target_channels || []);
  const channelDrafts = listDrafts(slug, ct.idea_id).filter((d) => {
    const ch = d.meta.channel || d.relPath.split("/").pop()?.replace(".md", "") || "";
    return channelSet.has(ch);
  });
  const hasMedia = channelDrafts.some((d) => (d.meta.media?.length ?? 0) > 0);

  if (hasMedia && ct.pipeline_state !== "media-review") {
    return setContentTaskStatus(slug, parentTaskId, contentTaskId, "Pending Media", "media-review");
  }
  if (!hasMedia && ct.pipeline_state !== "generating-media") {
    return setContentTaskStatus(slug, parentTaskId, contentTaskId, "Pending Media", "generating-media");
  }
  return ct;
}

/**
 * Helper used by external callers to look up the parent task type. Useful
 * before invoking other helpers that assume content type.
 */
export function getParentTaskType(slug: string, parentTaskId: string): Task["type"] | null {
  const file = loadProjectTasks(slug, parentTaskId);
  if (!file) return null;
  const parent = file.tasks.find((t) => t.id === parentTaskId);
  return (parent?.type as Task["type"]) || null;
}
