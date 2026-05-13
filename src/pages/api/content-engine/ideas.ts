/**
 * GET/POST/PATCH /api/content-engine/ideas — CRUD for idea-queue.json
 *
 * GET ?slug=X → returns all ideas (filterable by status, pillar, channel)
 * POST { slug, idea } → append a new idea
 * PATCH { slug, ideaId, fields } → update idea fields (status, approved_at, etc.)
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { contentTaskFromDiscovery, upsertContentTask } from "@/lib/data/content-tasks-flat";

/**
 * Status pipeline for content-engine ideas in `brand/{slug}/content/idea-queue.json`.
 *
 * Subset of `ContentTaskStatus` (see types/index.ts) — the values applicable
 * to an idea before/around the moment it becomes a formal ContentTask.
 * `Draft | Media | Review | Ready` only apply once the idea has been
 * promoted to a ContentTask with thread + skill running.
 */
type IdeaStatus = "New" | "Approved" | "Discarded" | "Deferred" | "Published";

const VALID_IDEA_STATUSES: readonly IdeaStatus[] = ["New", "Approved", "Discarded", "Deferred", "Published"] as const;

interface Idea {
  id: string;
  pillar_id: string;
  content_type: string;
  target_channel: string;
  signal: {
    summary: string;
    source: string;
    url?: string;
    date: string;
  };
  angle_draft: string;
  pov_confidence: number;
  source_signals?: string[];
  created_at: string;
  status: IdeaStatus;
  approved_at?: string;
  approved_via?: string;
  approved_by?: string;
  archived_at?: string;
  archived_via?: string;
  archived_by?: string;
  deferred_at?: string;
  deferred_by?: string;
  target_date?: string;
  dispatch_date?: string;
  dispatch_slot?: string;
  published_at?: string;
  project_task_id?: string;
}

// Migration map for legacy values still present on disk. Applied at read time
// so the API always returns canonical values, even if older idea-queue.json
// files (or skill writes) still carry the legacy strings.
const LEGACY_STATUS_MAP: Record<string, IdeaStatus> = {
  ready: "New",
  approved: "Approved",
  archived: "Discarded",
  discarded: "Discarded",
  stale: "Deferred",
  deferred: "Deferred",
  published: "Published",
};

function canonicalizeStatus(raw: unknown): IdeaStatus {
  if (typeof raw !== "string") return "New";
  if ((VALID_IDEA_STATUSES as readonly string[]).includes(raw)) return raw as IdeaStatus;
  return LEGACY_STATUS_MAP[raw.toLowerCase()] || "New";
}

function loadIdeas(slug: string): Idea[] {
  const filePath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Idea[];
    return raw.map((i) => ({ ...i, status: canonicalizeStatus(i.status) }));
  } catch {
    return [];
  }
}

function saveIdeas(slug: string, ideas: Idea[]) {
  const filePath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(ideas, null, 2));
}

function mirrorIdeaToFlatContentTask(slug: string, idea: Idea): void {
  const ct = contentTaskFromDiscovery(slug, {
    ...idea,
    id: idea.id,
    idea_id: idea.id,
    name: idea.angle_draft || idea.signal?.summary || idea.id,
    target_channels: idea.target_channel ? [idea.target_channel] : [],
  });
  upsertContentTask(slug, ct);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    const ideas = loadIdeas(slug);
    const { status, pillar, channel } = req.query;
    let filtered = ideas;
    if (status) {
      const canonical = canonicalizeStatus(status as string);
      filtered = filtered.filter((i) => i.status === canonical);
    }
    if (pillar) filtered = filtered.filter((i) => i.pillar_id === pillar);
    if (channel) filtered = filtered.filter((i) => i.target_channel === channel);

    // Counts by canonical status
    const counts = {
      total: ideas.length,
      new: ideas.filter((i) => i.status === "New").length,
      approved: ideas.filter((i) => i.status === "Approved").length,
      deferred: ideas.filter((i) => i.status === "Deferred").length,
      discarded: ideas.filter((i) => i.status === "Discarded").length,
      published: ideas.filter((i) => i.status === "Published").length,
    };

    return res.status(200).json({ ok: true, ideas: filtered, counts });
  }

  if (req.method === "POST") {
    const { idea } = req.body;
    if (!idea) return res.status(400).json({ error: "Missing idea" });
    const ideas = loadIdeas(slug);
    const existingIds = new Set(ideas.map((i) => i.id));
    // Resolve a unique id: if caller-supplied or default-generated id collides,
    // append `-b`, `-c`, ... so two batches on the same day can coexist.
    let id = idea.id || `idea-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (existingIds.has(id)) {
      const base = id;
      for (let n = 2; ; n++) {
        const candidate = `${base}-${String.fromCharCode(96 + n)}`;
        if (!existingIds.has(candidate)) { id = candidate; break; }
      }
    }
    const newIdea: Idea = {
      id,
      pillar_id: idea.pillar_id || "",
      content_type: idea.content_type || "",
      target_channel: idea.target_channel || "",
      signal: idea.signal || { summary: "", source: "manual", date: new Date().toISOString().slice(0, 10) },
      angle_draft: idea.angle_draft || "",
      pov_confidence: idea.pov_confidence ?? 0.5,
      source_signals: idea.source_signals || [],
      created_at: new Date().toISOString(),
      status: "New",
    };
    ideas.push(newIdea);
    saveIdeas(slug, ideas);
    mirrorIdeaToFlatContentTask(slug, newIdea);
    return res.status(201).json({ ok: true, idea: newIdea });
  }

  if (req.method === "PATCH") {
    const { ideaId, fields } = req.body;
    if (!ideaId || !fields) return res.status(400).json({ error: "Missing ideaId or fields" });
    const ideas = loadIdeas(slug);
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) return res.status(404).json({ error: "Idea not found" });

    const oldStatus = idea.status;
    const allowed = [
      "status", "approved_at", "approved_via", "approved_by",
      "archived_at", "archived_via", "archived_by",
      "deferred_at", "deferred_by",
      "target_date", "dispatch_date", "dispatch_slot", "published_at",
      "project_task_id", "angle_draft", "pillar_id", "target_channel", "content_type",
    ];
    for (const [k, v] of Object.entries(fields)) {
      if (!allowed.includes(k)) continue;
      if (v === null || v === undefined) {
        delete (idea as unknown as Record<string, unknown>)[k];
      } else if (k === "status") {
        idea.status = canonicalizeStatus(v);
      } else {
        (idea as unknown as Record<string, unknown>)[k] = v;
      }
    }
    saveIdeas(slug, ideas);
    mirrorIdeaToFlatContentTask(slug, idea);

    // Auto-trigger: when status transitions to Approved (any casing), generate
    // drafts + create the ContentTask. Older callers used lowercase, the new
    // Idea Bank UI uses PascalCase — handle both transparently.
    const oldApproved = String(oldStatus || "").toLowerCase() === "approved";
    const newApproved = String(idea.status || "").toLowerCase() === "approved";
    if (!oldApproved && newApproved) {
      try {
        // Internal call to generate-drafts — same server, no auth needed
        const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
        await fetch(`${baseUrl}/api/content-engine/generate-drafts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, ideaId }),
        });
        // Re-read to get the updated idea with drafts
        const updatedIdeas = loadIdeas(slug);
        const updatedIdea = updatedIdeas.find((i) => i.id === ideaId);
        return res.status(200).json({ ok: true, idea: updatedIdea, draftsGenerated: true });
      } catch (e) {
        // Draft generation failed but approval succeeded
        return res.status(200).json({ ok: true, idea, draftsGenerated: false, draftError: (e as Error).message });
      }
    }

    return res.status(200).json({ ok: true, idea });
  }

  res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
