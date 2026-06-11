/**
 * Pure logic for the SAN-163 author axis. No fs, no I/O — fully unit-testable.
 * Consumed by /api/content-engine/channel-loops to split a channel into
 * per-persona sub-loops and by the UI to suggest an author for an idea.
 */
import type { ContentTask, PersonaProfile, PersonaLoopState } from "@/types";

/** Stable author key for a profile: explicit id, else a slug of its name. */
export function personaId(p: { id?: string; name: string }): string {
  if (p.id && p.id.trim()) return p.id.trim();
  return p.name
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Suggest which persona an idea belongs to by matching each persona's
 * `pillars_slant` keywords against the idea's title + angle. First persona with
 * a hit wins; null when nothing matches or no persona declares slants.
 */
export function suggestAuthor(
  idea: Pick<ContentTask, "title" | "angle_draft" | "pillar_id">,
  personas: PersonaProfile[],
): string | null {
  const haystack = `${idea.title || ""} ${idea.angle_draft || ""} ${idea.pillar_id || ""}`.toLowerCase();
  for (const p of personas) {
    const slants = (p.pillars_slant || []).map((s) => s.toLowerCase().trim()).filter(Boolean);
    if (slants.some((s) => haystack.includes(s))) return personaId(p);
  }
  return null;
}

/**
 * Split a channel's ContentTasks into per-persona sub-loops + the count of
 * unassigned tasks (the brand-level pool). Stage counts mirror the channel
 * aggregator's own status buckets so the nested loop reads identically.
 */
export function buildPersonaLoops(
  channelCts: ContentTask[],
  personas: PersonaProfile[],
): { personas: PersonaLoopState[]; unassignedPool: number } {
  const ids = new Set(personas.map((p) => personaId(p)));
  const unassignedPool = channelCts.filter((c) => !c.author || !ids.has(c.author)).length;

  const loops: PersonaLoopState[] = personas.map((p) => {
    const id = personaId(p);
    const mine = channelCts.filter((c) => c.author === id);
    const newCount = mine.filter((c) => c.status === "New").length;
    const approvedCount = mine.filter((c) => c.status === "Approved").length;
    const draftingCount = mine.filter((c) => c.status === "Draft").length;
    const clarifyCount = mine.filter(
      (c) => c.clarify_status === "pending" && (c.status === "Draft" || c.status === "Approved"),
    ).length;
    const readyCount = mine.filter((c) => c.status === "Ready").length;
    const thisMonth = mine.filter((c) => c.status === "Published").length;

    let nextAction: PersonaLoopState["nextAction"] = null;
    if (clarifyCount > 0) nextAction = { label: `${clarifyCount} clarify pendiente${clarifyCount > 1 ? "s" : ""}`, focusStatus: "Draft" };
    else if (newCount > 0) nextAction = { label: `${newCount} idea${newCount > 1 ? "s" : ""} por aprobar`, focusStatus: "New" };
    else if (readyCount > 0) nextAction = { label: `${readyCount} lista${readyCount > 1 ? "s" : ""} para programar` };

    return {
      id,
      name: p.name,
      role: p.role ?? null,
      handle: p.handle ?? null,
      stages: {
        ideation: { newCount, approvedCount },
        creation: { draftingCount, clarifyCount, readyCount },
        published: { thisMonth },
      },
      nextAction,
    };
  });

  return { personas: loops, unassignedPool };
}
