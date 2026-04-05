// ============================================================
// Pillar Document Paths — ported from mission-control.html:5833-5863
// Maps foundation pillars to their output document paths.
// Used by the pinned document system in chat threads.
// ============================================================

/**
 * Default doc paths per pillar (fallback when foundation-state.json
 * doesn't have an output_file for the pillar).
 * Each entry is an array of paths to try in order.
 */
export const PILLAR_DOC_PATHS: Record<string, string[]> = {
  "fast-foundation": ["company-brief/current.md"],
  "company-brief": ["company-brief/current.md"],
  "market-analysis": ["market-and-us/market/current.md"],
  "competitor-analysis": ["market-and-us/competitors/current.md"],
  "self-analysis": ["market-and-us/self/current.md"],
  "market-synthesis": ["market-and-us/swot/current.md"],
  "niche-discovery": ["go-to-market/ecps/current.md"],
  "niche-basic": ["go-to-market/ecps/current.md"],
  "existing-customer-data": ["go-to-market/existing-customers/current.md"],
  "ecp-validation": ["go-to-market/ecp-validation/current.md"],
  positioning: ["go-to-market/positioning/current.md"],
  pricing: ["go-to-market/pricing/current.md"],
  "brand-voice": ["brand-identity/voice-profile/current.md", "brand-identity/brand-voice/current.md"],
  "brand-voice-snapshot": ["brand-voice/current.md"],
  "visual-identity": ["brand-identity/visual-identity/current.md"],
  "content-strategy": ["strategies/content/current.md"],
  "social-media-strategy": ["strategies/social/current.md"],
  "email-strategy": ["strategies/email/current.md"],
  "paid-media-strategy": ["strategies/paid/current.md"],
  "partnership-strategy": ["strategies/partnerships/current.md"],
  "web-strategy": ["strategies/web/current.md"],
  "metrics-setup": ["metrics/setup/current.md"],
  "strategic-plan": ["strategic-plan/current.md"],
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
