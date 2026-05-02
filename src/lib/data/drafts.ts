import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import {
  parseFrontmatter,
  serializeFrontmatter,
  readFrontmatterFile,
  writeFrontmatterFile,
} from "@/lib/data/markdown-frontmatter";

/**
 * Drafts-as-documents storage.
 *
 * Each draft is a markdown file with YAML frontmatter at:
 *   brand/{slug}/content/drafts/{idea-id}/{channel}.md
 *
 * The frontmatter carries the operational metadata; the body is the actual
 * draft text the human edits. This mirrors how Foundation docs are stored
 * so the existing `doc-slideover` can render them with no special-casing.
 */

/** What this `.md` represents inside the ContentTask folder.
 *  - `channel-draft`: a publishable per-channel draft (linkedin/blog/twitter/...)
 *  - `proposal`: the initial brief (idea + angle + signal). Read-only artifact.
 *  - `research`: the deep-research dump (sources, queries, key findings).
 *  - `clarify`: clarify questions + human answers, used to update POV DB. */
export type DraftKind = "channel-draft" | "proposal" | "research" | "clarify";

/** Classification of the item this draft is about. The Clarify step uses
 *  this to pick the right Q1-Q4 templates so questions extract real angle
 *  instead of producing generic drafts. See
 *  `workspace-sancho/skills/_shared/clarify-by-type.md`. */
export type ContentItemType =
  | "dato_cifra"
  | "hot_take"
  | "launch"
  | "framework_playbook"
  | "caso_historia"
  | "tendencia_report"
  | "plataforma_cambia";

export const VALID_CONTENT_ITEM_TYPES: readonly ContentItemType[] = [
  "dato_cifra",
  "hot_take",
  "launch",
  "framework_playbook",
  "caso_historia",
  "tendencia_report",
  "plataforma_cambia",
] as const;

/** A media asset attached to a draft (uploaded image or AI-generated). */
export interface MediaAsset {
  url: string;
  type: string;                       // mime, e.g. "image/png"
  source: "uploaded" | "ai-generated";
  prompt?: string;                    // only when source === "ai-generated"
  model?: string;                     // only when source === "ai-generated"
  aspect_ratio?: string;              // e.g. "1.91:1", "1:1"
  created_at: string;
}

/** Publishing lifecycle metadata. Complementary to `status`; only present
 *  once the user kicks off publishing (publish-now or schedule). */
export interface PublishingMeta {
  status: "scheduled" | "publishing" | "published" | "failed" | "canceled";
  provider: string;                   // PublishProvider.id
  scheduled_at?: string;              // ISO; absent when published immediately
  published_at?: string | null;
  external_job_id?: string;           // provider-side scheduled post id
  external_url?: string | null;       // canonical URL once published
  error?: string | null;
}

export interface DraftFrontmatter {
  idea_id: string;
  content_task_id?: string;
  parent_task_id?: string;
  channel: string;
  /** Document kind. Defaults to "channel-draft" when missing for back-compat. */
  kind?: DraftKind;
  iteration: number;
  status: "pending" | "researching" | "clarify-needed" | "drafting" | "draft" | "approved" | "published";
  model?: string;
  research_used?: boolean;
  clarify_status?: "pending" | "answered" | "skipped";
  clarify_answers?: Record<string, string>;
  /** Set by the Clarify step. Drives Q1-Q4 templates and writer adaptations. */
  item_type?: ContentItemType;
  media?: MediaAsset[];
  publishing?: PublishingMeta;
  created_at: string;
  updated_at: string;
}

export interface Draft {
  meta: DraftFrontmatter;
  body: string;
  /** Brand-relative path, e.g. `content/drafts/idea-2026-04-28-8/linkedin.md` */
  relPath: string;
  /** Absolute path on disk. */
  absPath: string;
}

function draftsDir(slug: string, ideaId: string): string {
  return path.join(BASE, "brand", slug, "content", "drafts", ideaId);
}

export function draftRelPath(ideaId: string, channel: string): string {
  return `content/drafts/${ideaId}/${channel}.md`;
}

export function draftAbsPath(slug: string, ideaId: string, channel: string): string {
  return path.join(draftsDir(slug, ideaId), `${channel}.md`);
}

export function loadDraft(slug: string, ideaId: string, channel: string): Draft | null {
  const absPath = draftAbsPath(slug, ideaId, channel);
  const parsed = readFrontmatterFile<DraftFrontmatter>(absPath);
  if (!parsed) return null;
  return {
    meta: parsed.data,
    body: parsed.body,
    relPath: draftRelPath(ideaId, channel),
    absPath,
  };
}

export function listDrafts(slug: string, ideaId: string): Draft[] {
  const dir = draftsDir(slug, ideaId);
  if (!fs.existsSync(dir)) return [];
  const out: Draft[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const channel = entry.name.replace(/\.md$/, "");
    const draft = loadDraft(slug, ideaId, channel);
    if (draft) out.push(draft);
  }
  return out;
}

/**
 * Create the proposal/research/clarify markdown files that live next to the
 * per-channel drafts under `content/drafts/{ideaId}/`. Idempotent — if the
 * file already exists, leaves it alone (so re-running generate-drafts on a
 * re-approval doesn't wipe human edits).
 */
export function createSpecialDoc(
  slug: string,
  ideaId: string,
  kind: "proposal" | "research" | "clarify",
  contentTaskId: string,
  parentTaskId: string,
  body: string,
): { path: string; created: boolean } {
  const channel = kind; // store under the same field for filesystem layout
  const absPath = draftAbsPath(slug, ideaId, channel);
  if (fs.existsSync(absPath)) {
    return { path: draftRelPath(ideaId, channel), created: false };
  }
  const now = new Date().toISOString();
  const fm: DraftFrontmatter = {
    idea_id: ideaId,
    content_task_id: contentTaskId,
    parent_task_id: parentTaskId,
    channel,
    kind,
    iteration: 0,
    status: "pending",
    created_at: now,
    updated_at: now,
  };
  writeFrontmatterFile(absPath, fm, body);
  return { path: draftRelPath(ideaId, channel), created: true };
}

/**
 * Create an empty draft scaffold (frontmatter only) when generate-drafts
 * provisions a ContentTask. The body is the angle_draft as starter content
 * so the user has something to read before the writer skill fills it in.
 */
export function createEmptyDraft(
  slug: string,
  ideaId: string,
  channel: string,
  meta: Partial<DraftFrontmatter> & { idea_id: string; channel: string },
  starterBody = "",
): Draft {
  const absPath = draftAbsPath(slug, ideaId, channel);
  // Idempotent: if the file already exists, return it untouched. Re-running
  // generate-drafts on a re-approval (or a backfill) must NOT clobber human
  // or agent edits already on disk.
  if (fs.existsSync(absPath)) {
    const existing = loadDraft(slug, ideaId, channel);
    if (existing) return existing;
  }
  const now = new Date().toISOString();
  const fm: DraftFrontmatter = {
    idea_id: meta.idea_id,
    content_task_id: meta.content_task_id,
    parent_task_id: meta.parent_task_id,
    channel: meta.channel,
    kind: meta.kind ?? "channel-draft",
    iteration: meta.iteration ?? 0,
    status: meta.status ?? "pending",
    model: meta.model,
    research_used: meta.research_used,
    clarify_status: meta.clarify_status,
    clarify_answers: meta.clarify_answers,
    created_at: meta.created_at ?? now,
    updated_at: meta.updated_at ?? now,
  };
  writeFrontmatterFile(absPath, fm, starterBody);
  return { meta: fm, body: starterBody, relPath: draftRelPath(ideaId, channel), absPath };
}

const VALID_CLARIFY_STATUSES = ["pending", "answered", "skipped"] as const;

/** Update an existing draft. Pass `meta` partials to merge over current frontmatter.
 *  Throws if `meta.status` or `meta.clarify_status` are non-canonical values —
 *  callers (including the agent's writer skill) must use the enum strictly. */
export function updateDraft(
  slug: string,
  ideaId: string,
  channel: string,
  patch: { meta?: Partial<DraftFrontmatter>; body?: string },
): Draft {
  const existing = loadDraft(slug, ideaId, channel);
  if (!existing) throw new Error(`Draft not found: ${ideaId}/${channel}`);

  if (patch.meta?.status !== undefined && !VALID_DRAFT_STATUSES.includes(patch.meta.status)) {
    throw new Error(
      `Invalid draft status: "${patch.meta.status}". ` +
      `Allowed: ${VALID_DRAFT_STATUSES.join(", ")}.`,
    );
  }
  if (
    patch.meta?.clarify_status !== undefined &&
    !VALID_CLARIFY_STATUSES.includes(patch.meta.clarify_status)
  ) {
    throw new Error(
      `Invalid clarify_status: "${patch.meta.clarify_status}". ` +
      `Allowed: ${VALID_CLARIFY_STATUSES.join(", ")}.`,
    );
  }
  if (
    patch.meta?.item_type !== undefined &&
    !VALID_CONTENT_ITEM_TYPES.includes(patch.meta.item_type)
  ) {
    throw new Error(
      `Invalid item_type: "${patch.meta.item_type}". ` +
      `Allowed: ${VALID_CONTENT_ITEM_TYPES.join(", ")}.`,
    );
  }

  // Hard gate: cannot transition into drafting/draft while clarify is still
  // pending. The writer skill must wait for human answers (or explicit skip)
  // before producing a draft. Only applies to channel-drafts — proposal /
  // research / clarify docs are exempt.
  const isChannelDraft = (patch.meta?.kind ?? existing.meta.kind ?? "channel-draft") === "channel-draft";
  const newStatus = patch.meta?.status ?? existing.meta.status;
  const newClarify = patch.meta?.clarify_status ?? existing.meta.clarify_status;
  if (
    isChannelDraft &&
    (newStatus === "drafting" || newStatus === "draft") &&
    newClarify === "pending"
  ) {
    throw new Error(
      `Cannot move draft to "${newStatus}" while clarify_status is "pending". ` +
      `The agent must post clarify questions, wait for answers, then set ` +
      `clarify_status="answered" (or "skipped") before drafting.`,
    );
  }

  const meta: DraftFrontmatter = {
    ...existing.meta,
    ...patch.meta,
    updated_at: new Date().toISOString(),
  };
  const body = patch.body !== undefined ? patch.body : existing.body;
  writeFrontmatterFile(existing.absPath, meta, body);
  return { meta, body, relPath: existing.relPath, absPath: existing.absPath };
}

/**
 * Snapshot the current draft as `{channel}.v{N}.md` before iteration. Returns
 * the relative path of the snapshot. Used by iterate-draft so we keep history.
 */
export function snapshotDraft(slug: string, ideaId: string, channel: string): string | null {
  const existing = loadDraft(slug, ideaId, channel);
  if (!existing) return null;
  const version = existing.meta.iteration ?? 0;
  const snapshotName = `${channel}.v${version}.md`;
  const snapshotAbs = path.join(draftsDir(slug, ideaId), snapshotName);
  fs.copyFileSync(existing.absPath, snapshotAbs);
  return `content/drafts/${ideaId}/${snapshotName}`;
}

export type DraftStatus = DraftFrontmatter["status"];

/**
 * Read the `status` of every draft file in `target_channels[]` for the given
 * idea. Channels with no `.md` on disk yet map to `"pending"`. Used by the
 * kanban to show a per-channel status chip in each ContentTask card.
 */
export const VALID_DRAFT_STATUSES: readonly DraftStatus[] = [
  "pending",
  "researching",
  "clarify-needed",
  "drafting",
  "draft",
  "approved",
  "published",
] as const;

export function getDraftStatuses(
  slug: string,
  ideaId: string,
  channels: string[],
): Record<string, DraftStatus> {
  const out: Record<string, DraftStatus> = {};
  for (const ch of channels) {
    const draft = loadDraft(slug, ideaId, ch);
    const raw = draft?.meta.status;
    // If the file on disk has been corrupted with a non-canonical status,
    // surface it as `pending` so the kanban still places the card and the
    // user can re-run the agent. The validation in `updateDraft` prevents
    // this from being introduced going forward.
    out[ch] = raw && VALID_DRAFT_STATUSES.includes(raw) ? raw : "pending";
  }
  return out;
}

/**
 * Aggregate per-channel statuses into a single phase the kanban can use to
 * place the card in a column. Strategy: take the *least-advanced* channel —
 * the card represents what's still pending. Returns one of:
 *   "pending" | "drafting" | "draft" | "approved" | "published"
 */
// Numeric rank for ordering draft statuses by progress. Only the canonical
// values from `DraftFrontmatter.status` are accepted — anything else is a
// data error (the validation in `updateDraft` rejects writes with non-canonical
// values, so this map is the single source of truth).
const DRAFT_STATUS_RANK: Record<DraftStatus, number> = {
  pending: 0,
  researching: 1,
  "clarify-needed": 1,
  drafting: 2,
  draft: 3,
  approved: 4,
  published: 5,
};

export function aggregateDraftStatus(
  statuses: Record<string, DraftStatus>,
): DraftStatus | null {
  const entries = Object.values(statuses);
  if (entries.length === 0) return null;
  let minRank = Infinity;
  let minStatus: DraftStatus = entries[0];
  for (const s of entries) {
    const r = DRAFT_STATUS_RANK[s];
    if (r !== undefined && r < minRank) {
      minRank = r;
      minStatus = s;
    }
  }
  return minStatus;
}

/** Re-export utilities used by API layer. */
export { parseFrontmatter, serializeFrontmatter };
