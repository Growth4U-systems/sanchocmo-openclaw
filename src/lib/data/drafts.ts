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

export interface DraftFrontmatter {
  idea_id: string;
  content_task_id?: string;
  parent_task_id?: string;
  channel: string;
  iteration: number;
  status: "pending" | "researching" | "clarify-needed" | "drafting" | "draft" | "approved" | "published";
  model?: string;
  research_used?: boolean;
  clarify_status?: "pending" | "answered" | "skipped";
  clarify_answers?: Record<string, string>;
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
  const now = new Date().toISOString();
  const fm: DraftFrontmatter = {
    idea_id: meta.idea_id,
    content_task_id: meta.content_task_id,
    parent_task_id: meta.parent_task_id,
    channel: meta.channel,
    iteration: meta.iteration ?? 0,
    status: meta.status ?? "pending",
    model: meta.model,
    research_used: meta.research_used,
    clarify_status: meta.clarify_status,
    clarify_answers: meta.clarify_answers,
    created_at: meta.created_at ?? now,
    updated_at: meta.updated_at ?? now,
  };
  const absPath = draftAbsPath(slug, ideaId, channel);
  writeFrontmatterFile(absPath, fm, starterBody);
  return { meta: fm, body: starterBody, relPath: draftRelPath(ideaId, channel), absPath };
}

/** Update an existing draft. Pass `meta` partials to merge over current frontmatter. */
export function updateDraft(
  slug: string,
  ideaId: string,
  channel: string,
  patch: { meta?: Partial<DraftFrontmatter>; body?: string },
): Draft {
  const existing = loadDraft(slug, ideaId, channel);
  if (!existing) throw new Error(`Draft not found: ${ideaId}/${channel}`);
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

/** Re-export utilities used by API layer. */
export { parseFrontmatter, serializeFrontmatter };
