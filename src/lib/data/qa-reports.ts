/**
 * Typed access to QA reports written by `qa-bot`. The skill emits a YAML
 * frontmatter (see `workspace-sancho/skills/qa-bot/SKILL.md` Phase 4) that we
 * read here as structured data. For legacy reports written before the
 * frontmatter convention, we fall back to scraping the body with regexes so
 * the UI keeps working until those files are rewritten.
 */

export interface QaReportFrontmatter {
  kind?: "qa-report";
  /** Basename of the file this QA report verifies, e.g. `research.md`. */
  target?: string;
  mode?: "deep" | "quick";
  verdict?: "PASS" | "NEEDS REVISION" | "MAJOR ISSUES";
  /** 0-10 confidence score. */
  score?: number;
  /** Unique sources reviewed during research. */
  sources?: number;
  /** Number of web searches executed. */
  searches?: number;
  /** ISO 8601 timestamp. */
  qa_at?: string;
}

export interface QaSummary {
  score?: number;
  sources?: number;
  searches?: number;
  verdict?: QaReportFrontmatter["verdict"];
}

/**
 * Pull score / sources / searches from the markdown body. Used as a legacy
 * fallback for QA reports written before frontmatter was added.
 *
 * Two body formats coexist in the wild:
 *   1. HTML comment marker: `<!-- ... | fuentes: 19 | búsquedas: 12 | qa-score: 8.5 -->`
 *   2. Inline markdown: `**QA Score:** 8.5/10`, `19 fuentes`, `12 queries`,
 *      `**Búsquedas ejecutadas:** 12`.
 */
export function parseQaReportBody(body: string | null | undefined): QaSummary | null {
  if (!body) return null;

  const SCORE_RES = [
    /\*\*\s*qa\s*score\s*:?\s*\*\*\s*(\d+(?:[.,]\d+)?)/i,
    /qa[-\s]?score\s*[:=]\s*(\d+(?:[.,]\d+)?)/i,
  ];
  // Order matters: explicit "**Fuentes:** N" wins; then post-arrow actual
  // count "→ N fuentes" (used by qa-bot checklists); then any "N fuentes"
  // *not* preceded by a threshold marker (`≥`, `≤`, `>=`, `<=`); then loose
  // forms. Without the lookbehind the regex matches `≥10 fuentes` instead of
  // the real number.
  const SOURCE_RES = [
    /\*\*\s*fuentes\s*:?\s*\*\*\s*(\d+)/i,
    /→\s*(\d+)\s+fuentes/i,
    /\((\d+)\s*\/\s*\d+\s+sourced\)/i,
    /(?<![≥≤<>=\d])(\d+)\s+fuentes/i,
    /fuentes?\s*[:=]\s*(\d+)/i,
    // English fallbacks (legacy reports). The table form is
    // `| Total unique sources | 5/5 | 14 (≥10 required) |` — the count we
    // care about is in the *third* column (the "Nota"), not the second
    // (which is a M/N rubric score). Skip the score column explicitly.
    /total\s+unique\s+sources\s*\|[^|]+\|\s*(\d+)/i,
    /(?<![≥≤<>=\d])(\d+)\s+unique\s+sources/i,
    /(?<![≥≤<>=\d])(\d+)\s+sources/i,
  ];
  const SEARCH_RES = [
    /\*\*\s*b[úu]squedas[^*]*\*\*\s*(\d+)/i,
    /→\s*(\d+)\s+(?:b[úu]squedas|queries)/i,
    /(?<![≥≤<>=\d])(\d+)\s+(?:b[úu]squedas|queries)/i,
    /b[úu]squedas?\s*[:=]\s*(\d+)/i,
  ];

  const firstMatch = (patterns: RegExp[]): string | undefined => {
    for (const re of patterns) {
      const m = body.match(re);
      if (m) return m[1];
    }
    return undefined;
  };

  const scoreRaw = firstMatch(SCORE_RES);
  const sourcesRaw = firstMatch(SOURCE_RES);
  const searchesRaw = firstMatch(SEARCH_RES);

  if (!scoreRaw && !sourcesRaw && !searchesRaw) return null;
  return {
    score: scoreRaw ? parseFloat(scoreRaw.replace(",", ".")) : undefined,
    sources: sourcesRaw ? parseInt(sourcesRaw, 10) : undefined,
    searches: searchesRaw ? parseInt(searchesRaw, 10) : undefined,
  };
}

/**
 * Read a QA summary from a loaded report. Merges frontmatter (authoritative)
 * with body parsing as a per-field fallback — qa-bot frontmatters in the wild
 * sometimes carry `score` but omit `sources`/`searches`, even when the body
 * has them ("**Fuentes:** N", "14/14 sourced", or the
 * `<!-- ... | fuentes: N | búsquedas: M -->` HTML marker on research.md).
 * Returns null only when nothing was found anywhere.
 */
export function extractQaSummary(
  meta: unknown,
  body: string | null | undefined,
): QaSummary | null {
  const fm = (meta && typeof meta === "object" ? meta : {}) as QaReportFrontmatter;
  const fromBody = parseQaReportBody(body) || {};
  const score = typeof fm.score === "number" ? fm.score : fromBody.score;
  const sources = typeof fm.sources === "number" ? fm.sources : fromBody.sources;
  const searches = typeof fm.searches === "number" ? fm.searches : fromBody.searches;
  const verdict = fm.verdict;
  if (score == null && sources == null && searches == null && !verdict) return null;
  return { score, sources, searches, verdict };
}
