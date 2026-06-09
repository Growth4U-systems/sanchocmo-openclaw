// ============================================================
// Pillar Document Paths — ported from mission-control.html:5833-5863
// Maps foundation pillars to their output document paths.
// Used by the pinned document system in chat threads.
// ============================================================

/**
 * Default doc paths per pillar (fallback when foundation-state.json
 * doesn't have an output_file for the pillar).
 * Each entry is an array of paths to try in order.
 *
 * Lite fallback convention (added v1.1, 2026-05-20):
 *   For pillars whose canonical path is also a fast-foundation output target,
 *   we list `current.md` first and the sibling `lite.md` second. `current.md`
 *   is produced by the full skill; `lite.md` is produced by `fast-foundation`
 *   as a preliminary seed. The dashboard shows whichever exists, preferring full.
 *
 *   Consumers MUST treat lite.md as preliminary (badge "lite" in UI). Cross-
 *   skill consumers (positioning, pricing, etc.) DO NOT fall back to lite —
 *   that's intentional and lives in each consumer's `context_required`.
 */
export const PILLAR_DOC_PATHS: Record<string, string[]> = {
  // no lite fallback by design (SAN-13): fastcontext is FF's single canonical output
  "fast-context": ["fastcontext/fastcontext.current.md"],
  "fast-foundation": ["fastcontext/fastcontext.current.md"],
  "company-brief": ["company-brief/company-brief.current.md", "company-brief/lite.md"],
  "company-context": ["company-context/company-context.current.md", "company-context/lite.md"],
  "business-model": ["business-model/business-model.current.md", "business-model/lite.md"],
  "budget": ["budget/budget.current.md", "budget/lite.md"],
  "seo-audit": ["site-audit/seo-audit/seo-audit.current.md", "trust-engine/seo-audit.json"],
  "own-media-audit": ["site-audit/own-media-audit/own-media-audit.current.md", "trust-engine/own-media-audit.json"],
  "market-analysis": ["market-and-us/market/market.current.md", "market-and-us/market/lite.md"],
  "competitor-analysis": ["market-and-us/competitors/competitors.current.md"],
  "self-analysis": ["market-and-us/self/self.current.md", "market-and-us/self/lite.md"],
  "market-synthesis": ["market-and-us/swot/swot.current.md"],
  "niche-discovery": ["go-to-market/ecps/ecps.current.md", "go-to-market/ecps/lite.md"],
  "niche-basic": ["go-to-market/ecps/ecps.current.md", "go-to-market/ecps/lite.md"],
  "existing-customer-data": ["go-to-market/existing-customers/existing-customers.current.md"],
  "ecp-validation": ["go-to-market/ecp-validation/ecp-validation.current.md"],
  positioning: ["go-to-market/positioning/positioning.current.md"],
  pricing: ["go-to-market/pricing/pricing.current.md"],
  "brand-voice": ["brand-identity/voice-profile/voice-profile.current.md", "brand-identity/brand-voice/brand-voice.current.md"],
  "brand-voice-snapshot": ["brand-voice/brand-voice.current.md", "brand-voice/lite.md"],
  "visual-identity": ["brand-identity/visual-identity/visual-identity.current.md"],
  "content-strategy": ["strategies/content/content.current.md"],
  "social-media-strategy": ["strategies/social/social.current.md"],
  "email-strategy": ["strategies/email/email.current.md"],
  "paid-media-strategy": ["strategies/paid/paid.current.md"],
  "partnership-strategy": ["strategies/partnerships/partnerships.current.md"],
  "web-strategy": ["strategies/web/web.current.md"],
  "metrics-setup": ["metrics/setup/setup.current.md"],
  "strategic-plan": ["strategic-plan/strategic-plan.current.md"],
  "foundation-presentation": ["presentations/foundation-deck.html"],
  "strategic-presentation": ["presentations/strategic-deck.html"],
};

/**
 * Resolve the doc path for a pillar, checking foundation-state.json first,
 * then falling back to PILLAR_DOC_PATHS.
 */
export function resolvePillarDocPath(
  pillarKey: string,
  foundationState?: { sections?: Record<string, { pillars?: Record<string, { output_file?: string }> }> }
): string | null {
  // Check foundation-state.json first (has exact output_file per pillar)
  if (foundationState?.sections) {
    for (const section of Object.values(foundationState.sections)) {
      const pillar = section.pillars?.[pillarKey];
      if (pillar?.output_file) return pillar.output_file;
    }
  }

  // Fallback to static mapping
  const paths = PILLAR_DOC_PATHS[pillarKey];
  return paths?.[0] || null;
}

/**
 * Resolve doc path(s) for a task. Tries multiple sources in priority order:
 *
 *   1. `task.deliverable_file` — explicit field set on the task. This is the
 *      authoritative source when present (skills know what file they write).
 *   2. `task.output_files` — legacy field, also explicit.
 *   3. `task.pillar` → `foundation-state.json.pillars[pillar].output_file`
 *   4. `task.pillar` → static `PILLAR_DOC_PATHS` fallback
 *
 * Returns an array of relative paths (relative to `brand/{slug}/`). Empty
 * array if nothing can be resolved. The first element is the primary.
 *
 * Why this exists:
 *   The old `resolvePillarDocPath` only knew how to map pillar → conventional
 *   `current.md` path. Skills like `competitor-intelligence` actually write
 *   `competitive-analysis.current.md`, breaking the convention. This resolver
 *   reads the explicit `deliverable_file` set by the skill (or by a migration
 *   script) so the UI never has to guess.
 */
export function resolveTaskDocPaths(
  task: {
    deliverable_file?: string | string[];
    output_files?: string[];
    pillar?: string;
  },
  foundationState?: { sections?: Record<string, { pillars?: Record<string, { output_file?: string }> }> }
): string[] {
  const stripBrand = (p: string) => p.replace(/^brand\/[^/]+\//, "");

  // 1) Explicit deliverable_file on the task (canonical when present)
  if (task.deliverable_file) {
    const arr = Array.isArray(task.deliverable_file) ? task.deliverable_file : [task.deliverable_file];
    const files = arr.filter((p) => !p.endsWith("/"));
    const dirs = arr.filter((p) => p.endsWith("/"));

    if (files.length > 0) return files.map(stripBrand);

    // Directory deliverables (e.g. `brand/X/brand-book/visual-identity/templates/`):
    // a single doc fetch would 404, so fall back to `output_files`. Skills emit
    // those as paths relative to the deliverable directory's parent (e.g.
    // `templates/blog-post/template.html` next to `brand-book/visual-identity/`),
    // so we resolve them against that parent here.
    if (dirs.length > 0 && task.output_files && task.output_files.length > 0) {
      const baseDir = stripBrand(dirs[0]).replace(/\/$/, "");
      const parent = baseDir.includes("/") ? baseDir.slice(0, baseDir.lastIndexOf("/")) : "";
      return task.output_files.map((f) => {
        const stripped = stripBrand(f);
        if (stripped.startsWith(`${baseDir}/`)) return stripped;
        return parent ? `${parent}/${stripped}` : stripped;
      });
    }
    // Bare directory with no output_files — fall through to other resolution.
  }

  // 2) Legacy output_files (no deliverable_file at all)
  if (task.output_files && task.output_files.length > 0) {
    return task.output_files.map(stripBrand);
  }

  // 3 & 4) Fall back to pillar-based resolution
  if (task.pillar) {
    const docPath = resolvePillarDocPath(task.pillar, foundationState);
    if (docPath) return [stripBrand(docPath)];
  }

  return [];
}
