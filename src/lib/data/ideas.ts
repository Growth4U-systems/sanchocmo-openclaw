import { readJSON, writeJSON } from "./json-io";
import { ideasFile } from "./paths";
import type { Idea } from "@/types";

export function loadIdeas(slug: string): Idea[] {
  const data = readJSON<{ ideas: Idea[] } | Idea[]>(ideasFile(slug), { ideas: [] });
  return Array.isArray(data) ? data : data.ideas || [];
}

export function saveIdeas(slug: string, ideas: Idea[]): void {
  writeJSON(ideasFile(slug), { ideas });
}

export function findIdea(slug: string, ideaId: string): Idea | undefined {
  return loadIdeas(slug).find((i) => i.id === ideaId);
}
