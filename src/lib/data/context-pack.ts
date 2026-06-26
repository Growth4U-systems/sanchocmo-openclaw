/**
 * context-pack.ts — GROUNDING for directly-dispatched specialists (SAN-246).
 *
 * Instance of SAN-218: when a chat thread is dispatched straight to a
 * specialist (`agent:dulcinea`), nobody injects client context — the agent
 * starts blind. This module assembles a BOUNDED "context pack" that the
 * mc-chat gateway prepends to the dispatched user text so every specialist
 * starts GROUNDED (Foundation summary + resolved doc paths) or, when there is
 * no Foundation on disk, FAILS LOUD (verdict="missing") so the gateway can
 * route to kickoff instead of letting the agent invent context.
 *
 * Size discipline: the pack ships a compact SUMMARY (self-sufficient text from
 * the brand-brain view) + RESOLVED PATHS only — never file bodies, and only
 * the top required pillars. The agent reads the files itself from disk; the
 * pack just tells it WHERE and gives enough context to ground the first turn.
 *
 * Boundary note: this is Next/TS land. The mc-chat plugin (ESM, cannot import
 * `src/lib/…`) reaches it over HTTP via `src/pages/api/chat/context-pack.ts`.
 */

import { BASE } from "@/lib/data/paths";
import { assembleBrandBrainState, brandExists } from "@/lib/data/brand-brain-assembler";
import { readSkillContextField } from "@/lib/server/skill-frontmatter";
import { resolveWorkspaceDocPath } from "@/lib/server/doc-paths";

export type ContextPackVerdict = "ok" | "partial" | "missing";

export interface ContextPack {
  slug: string;
  skill: string | null;
  /** Self-sufficient grounding text (positioning + brand snapshot + pillar state). */
  summary: string;
  /** RESOLVED absolute paths of the skill's `context_required` docs that exist on disk. */
  docPaths: string[];
  /** ok = all required docs present, partial = some, missing = no Foundation at all. */
  verdict: ContextPackVerdict;
}

// Cap the number of required docs we resolve+ship, so a skill with a long
// `context_required` list can't bloat the dispatched prompt. The top entries
// in a SKILL.md are the load-bearing pillars (company-brief, brand-voice,
// ecps, positioning, strategic-plan); the rest are enrichment.
const MAX_DOC_PATHS = 6;


/**
 * Build the self-sufficient grounding summary from the brand-brain VIEW.
 * Pulls positioning + the brand snapshot (company / sector / north-star / ICPs
 * / competitors) and a one-line Foundation pillar-state rollup. Kept terse on
 * purpose — this is the text the agent reads BEFORE touching any file.
 */
function buildSummary(slug: string): string {
  const state = assembleBrandBrainState(slug);
  const s = state.brand_summary;
  const lines: string[] = [];

  const name = s.company_name?.trim() || slug;
  lines.push(`Cliente: ${name} (slug: ${slug})`);
  if (s.sector?.trim()) lines.push(`Sector: ${s.sector.trim()}`);
  if (s.description?.trim()) lines.push(`Modelo: ${s.description.trim()}`);
  if (s.north_star?.trim()) lines.push(`North star: ${s.north_star.trim()}`);
  if (s.positioning?.trim()) lines.push(`Positioning: ${s.positioning.trim()}`);
  // icps/competitors entries may be plain strings or { name, link } objects.
  const nameOf = (e: string | { name: string; link?: string }): string =>
    typeof e === "string" ? e : e.name;
  const icpNames = (s.icps ?? []).map(nameOf).filter(Boolean);
  if (icpNames.length) lines.push(`ICPs: ${icpNames.join(", ")}`);
  const competitorNames = (s.competitors ?? []).map(nameOf).filter(Boolean);
  if (competitorNames.length) lines.push(`Competidores: ${competitorNames.join(", ")}`);

  // One-line Foundation rollup: how many pillars are completed vs total.
  let total = 0;
  let completed = 0;
  for (const section of Object.values(state.sections)) {
    for (const pillar of Object.values(section.pillars ?? {})) {
      total += 1;
      if (pillar.status === "completed") completed += 1;
    }
  }
  if (total > 0) lines.push(`Foundation: ${completed}/${total} pilares completados.`);

  return lines.join("\n");
}

/**
 * Resolve a skill's `context_required` templates to RESOLVED ABSOLUTE paths on
 * disk, via the documents resolver (NOT raw `fs` on the literal frontmatter
 * path). The resolver handles layout drift: a request for the canonical
 * `…/x.current.md` transparently resolves to a legacy bare `…/current.md`
 * (and vice versa) when that's what exists on disk. Only existing files are
 * returned. Capped at MAX_DOC_PATHS.
 */
function resolveRequiredDocPaths(slug: string, required: string[]): { abs: string[]; resolvedCount: number; total: number } {
  const abs: string[] = [];
  let resolvedCount = 0;
  const total = required.length;

  for (const template of required.slice(0, MAX_DOC_PATHS)) {
    const docPath = template.replace(/\{slug\}/g, slug);
    try {
      const resolved = resolveWorkspaceDocPath(BASE, docPath, { slug, requireBrand: true });
      if (resolved.exists) {
        resolvedCount += 1;
        abs.push(resolved.absPath);
      }
    } catch {
      // unresolvable template (path traversal, different brand) — skip; the
      // summary still grounds the agent and verdict reflects the miss.
    }
  }

  return { abs, resolvedCount, total };
}

/**
 * Assemble the bounded context pack for a (slug, skill) dispatch.
 *
 * - No brand dir on disk → verdict="missing" (gateway should route to kickoff).
 * - Skill has required docs, all resolve → "ok"; some resolve → "partial".
 * - Skill declares no required docs (or none on disk but brand exists) → "ok"
 *   when the brand exists (the summary is sufficient grounding) — we only emit
 *   "missing" when there is genuinely no Foundation to ground on.
 */
export function assembleContextPack(slug: string, skill: string | null): ContextPack {
  const normalizedSkill = typeof skill === "string" && skill.trim() ? skill.trim() : null;

  if (!brandExists(slug)) {
    return {
      slug,
      skill: normalizedSkill,
      summary: `Cliente: ${slug}\nFoundation: AUSENTE (no existe brand/${slug} en disco).`,
      docPaths: [],
      verdict: "missing",
    };
  }

  const summary = buildSummary(slug);
  const required = readSkillContextField(normalizedSkill, "context_required");
  const { abs, resolvedCount, total } = resolveRequiredDocPaths(slug, required);

  let verdict: ContextPackVerdict;
  if (total === 0) {
    // Skill declares no required docs: the brand exists, summary grounds it.
    verdict = "ok";
  } else if (resolvedCount === 0) {
    // Required docs declared but NONE exist on disk → no Foundation to ground.
    verdict = "missing";
  } else if (resolvedCount < total) {
    verdict = "partial";
  } else {
    verdict = "ok";
  }

  return {
    slug,
    skill: normalizedSkill,
    summary,
    docPaths: abs,
    verdict,
  };
}
