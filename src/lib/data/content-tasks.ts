import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import { listDrafts, loadDraft } from "@/lib/data/drafts";
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

const CHANNEL_PHASE_RANK: Record<ChannelPhase, number> = {
  researching: 0,
  "clarify-needed": 1,
  drafting: 2,
  draft: 3,
  approved: 4,
  published: 5,
};

const STATUS_RANK: Record<ContentTaskStatus, number> = {
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

const PIPELINE_RANK: Record<ContentTaskPipelineState, number> = {
  researching: 0,
  "clarify-needed": 1,
  drafting: 2,
  "generating-media": 0,
  "media-review": 1,
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
 * pipeline_state) it implies. `null` for unmapped or unsupported.
 */
function deriveStatusFromPhase(
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

/** Forward-only: returns true if `target` is a strict advance over `current`. */
function isForwardMove(
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

/**
 * Maximum channel phase consistent with a given CT.status. Used to symmetrically
 * roll back channel_phases when the user reverts CT.status backward.
 */
const STATUS_MAX_PHASE: Partial<Record<ContentTaskStatus, ChannelPhase>> = {
  New: undefined,                  // No phases applicable yet.
  Approved: "drafting",            // Within Approved: researching/clarify-needed/drafting allowed.
  Draft: "draft",
  "Pending Media": "approved",
  Ready: "approved",
  Published: "published",
};

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

  // Media Gate (defense in depth): a channel marked `media_policy=required`
  // cannot reach `approved` (publishing-ready) without media attached on the
  // corresponding draft. The publish endpoint also enforces this — duplicating
  // the check here means curl / agent paths that flip channel_phases directly
  // can't bypass it.
  if (phase === "approved" && ct.media_policy?.[channel] === "required") {
    const draft = loadDraft(slug, ct.idea_id, channel);
    const mediaCount = draft?.meta.media?.length ?? 0;
    if (mediaCount === 0) {
      throw new Error(
        `Channel ${channel} requires media (media_policy="required") — cannot advance to "approved" without media attached.`,
      );
    }
  }

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

  // Media Gate (defense in depth) — same rule as setChannelPhase, applied to
  // every channel in the bulk patch that's being moved to "approved".
  for (const [channel, p] of Object.entries(patch)) {
    if (p !== "approved") continue;
    if (ct.media_policy?.[channel] !== "required") continue;
    const draft = loadDraft(slug, ct.idea_id, channel);
    const mediaCount = draft?.meta.media?.length ?? 0;
    if (mediaCount === 0) {
      throw new Error(
        `Channel ${channel} requires media (media_policy="required") — cannot advance to "approved" without media attached.`,
      );
    }
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

  const cap = STATUS_MAX_PHASE[ct.status];
  if (cap === undefined) {
    // No applicable phases (status=New) → clear the map entirely.
    delete ct.channel_phases;
    ct.updated_at = new Date().toISOString();
    saveProjectTasks(file);
    return ct;
  }

  const capRank = CHANNEL_PHASE_RANK[cap];
  let mutated = false;
  const next: Record<string, ChannelPhase> = {};
  for (const [ch, p] of Object.entries(ct.channel_phases)) {
    if (CHANNEL_PHASE_RANK[p] > capRank) {
      next[ch] = cap;
      mutated = true;
    } else {
      next[ch] = p;
    }
  }
  if (mutated) {
    ct.channel_phases = next;
    ct.updated_at = new Date().toISOString();
    saveProjectTasks(file);
  }
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
    | "discord_thread_id"
    | "owner"
    | "scheduled_for"
    | "clarify_status"
    | "media_policy"
  >
>;

const UPDATABLE_FIELDS: readonly (keyof ContentTaskUpdateInput)[] = [
  "name",
  "skill",
  "target_channels",
  "documents",
  "mc_chat_thread_id",
  "discord_thread_id",
  "owner",
  "scheduled_for",
  "clarify_status",
  "media_policy",
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
