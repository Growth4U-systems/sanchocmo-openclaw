import * as z from "zod/v4";

/**
 * The versioned dashboard DEFINITION for Métricas v2 (SAN-265).
 *
 * Unifies "what to measure" (plan: funnel + KPIs) and "how it's shown"
 * (tabs, surfaces, North Star) into one object that lives in `metric_dashboards`,
 * is edited conversationally by Merlin and versioned with revert. `customSurfaces`
 * (bespoke cards, e.g. A/B tests) and `customMetrics` (formula KPIs) keep the 8
 * standard surfaces untouched per client.
 */

export const SURFACE_KEYS = [
  "reputation",
  "web",
  "product",
  "pipeline",
  "paid",
  "email",
  "social",
  "partnerships",
] as const;

export const kpiSchema = z.object({
  name: z.string(),
  source: z.string().optional(),
  metric: z.string().optional(),
  category: z.string().optional(),
  tier: z.enum(["primary", "leading", "lagging"]).optional(),
  format: z.string().optional(),
  formula: z.string().optional(),
});

export const funnelStepSchema = z.object({
  name: z.string(),
  source: z.string().optional(),
  metric: z.string().optional(),
  manual: z.boolean().optional(),
});

export const customMetricSchema = z.object({
  id: z.string(),
  label: z.string(),
  formula: z.string(),
  format: z.string().optional(),
  tier: z.string().optional(),
  surface: z.string().optional(),
});

export const customCardSchema = z.object({
  title: z.string(),
  value: z.string().optional(),
  subtitle: z.string().optional(),
  source: z.string().optional(),
});

export const customSurfaceSchema = z.object({
  key: z.string(),
  name: z.string(),
  emoji: z.string().optional(),
  source: z.string().optional(),
  cards: z.array(customCardSchema).default([]),
});

export const tabSchema = z.object({
  key: z.string(),
  label: z.string(),
  visible: z.boolean().default(true),
  order: z.number().default(0),
});

export const surfaceRefSchema = z.object({
  surface: z.enum(SURFACE_KEYS),
  visible: z.boolean().default(true),
  order: z.number().default(0),
});

export const northStarSchema = z.object({
  kpiRef: z.string().optional(),
  label: z.string().optional(),
  target: z.number().nullable().optional(),
});

export const planSchema = z.object({
  activationEvent: z.string().optional(),
  funnel: z.array(funnelStepSchema).default([]),
  kpis: z.array(kpiSchema).default([]),
});

export const dashboardDefinitionSchema = z.object({
  archetype: z.string().default("lead-to-sale"),
  activationEvent: z.string().optional(),
  northStar: northStarSchema.default({}),
  tabs: z.array(tabSchema).default([]),
  surfaces: z.array(surfaceRefSchema).default([]),
  plan: planSchema.default({ funnel: [], kpis: [] }),
  customSurfaces: z.array(customSurfaceSchema).default([]),
  customMetrics: z.array(customMetricSchema).default([]),
});

export type DashboardDefinition = z.infer<typeof dashboardDefinitionSchema>;
export type CustomMetric = z.infer<typeof customMetricSchema>;

/** Parse + apply defaults; throws z.ZodError on an invalid definition. */
export function parseDashboardDefinition(value: unknown): DashboardDefinition {
  return dashboardDefinitionSchema.parse(value);
}

/**
 * Validate a custom-metric formula without evaluating it: only identifiers,
 * dotted source.metric refs, numbers, arithmetic, parentheses and whitespace.
 * No function calls, no `eval`-able constructs. (SAN-266 will evaluate it
 * against connected sources via the existing planKpis engine.)
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
