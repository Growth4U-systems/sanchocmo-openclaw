/**
 * Custom-metric formula validator (Métricas v2). Zero dependencies on purpose:
 * both the server (dashboard-schema / metric-dashboard / MCP tools) and the
 * client metrics page validate formulas before evaluating them, and the client
 * must NOT pull zod into its bundle just to reach this regex.
 *
 * Validates without evaluating: only identifiers, dotted source.metric refs,
 * numbers, arithmetic, parentheses and whitespace. No function calls, no
 * `eval`-able constructs.
 */
const FORMULA_RE = /^[\w.\s()+\-*/%,]+$/;

export function isSafeFormula(formula: string): boolean {
  if (typeof formula !== "string") return false;
  const trimmed = formula.trim();
  if (!trimmed || trimmed.length > 500) return false;
  if (!FORMULA_RE.test(trimmed)) return false;
  if (/[a-zA-Z_]\w*\s*\(/.test(trimmed)) return false; // reject function calls
  return /[a-zA-Z0-9]/.test(trimmed);
}
