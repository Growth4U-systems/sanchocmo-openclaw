import { readJSON, writeJSON } from "./json-io";
import { ideasFile, contentIdeaQueueFile } from "./paths";
import type { Idea } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeContentIdea(raw: any): Idea {
  // Map content-engine fields → generic Idea shape used elsewhere.
  return {
    id: raw.id,
    type: raw.type || "content",
    status: raw.status,
    title: raw.title || raw.angle_draft?.split(/[.!?\n]/)[0]?.slice(0, 140) || raw.id,
    description: raw.angle_draft || raw.signal?.summary || "",
    source: raw.source || (raw.source_signals?.length ? "research-signals" : "content-engine"),
    list: raw.list || (raw.target_channel === "blog" ? "keywords" : "content"),
    channels: raw.channels || (raw.target_channel ? [raw.target_channel] : []),
    target_channel: raw.target_channel || "",
    priority_score: raw.priority_score ?? Math.round((raw.pov_confidence || 0) * 100),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    notes: raw.notes || "",
    project_ids: raw.project_id ? [raw.project_id] : (raw.project_ids || []),
    task_id: raw.project_task_id || raw.task_id,
    // Pass-through content-engine specific fields (Idea type allows them via index sig in some places)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(raw as any),
  } as Idea;
}

export function loadIdeas(slug: string): Idea[] {
  const generic = readJSON<{ ideas: Idea[] } | Idea[]>(ideasFile(slug), { ideas: [] });
  const genericList: Idea[] = Array.isArray(generic) ? generic : generic.ideas || [];

  // Merge in content-engine queue items (different file, different schema)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ceRaw = readJSON<any[]>(contentIdeaQueueFile(slug), []);
  const ceList: Idea[] = (Array.isArray(ceRaw) ? ceRaw : []).map(normalizeContentIdea);

  // De-dupe by id (generic wins if collision — preserves prior edits)
  const seen = new Set(genericList.map((i) => i.id));
  for (const i of ceList) if (!seen.has(i.id)) genericList.push(i);
  return genericList;
}

export function saveIdeas(slug: string, ideas: Idea[]): void {
  writeJSON(ideasFile(slug), { ideas });
}

export function findIdea(slug: string, ideaId: string): Idea | undefined {
  return loadIdeas(slug).find((i) => i.id === ideaId);
}
