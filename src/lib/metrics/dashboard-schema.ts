import * as z from "zod/v4";
import { formulaValidationMessage } from "./formula";

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
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  formula: z.string().superRefine((formula, ctx) => {
    const message = formulaValidationMessage(formula);
    if (message) ctx.addIssue({ code: "custom", message });
  }),
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
}).superRefine((definition, ctx) => {
  const ids = new Set<string>();
  definition.customMetrics.forEach((metric, index) => {
    if (ids.has(metric.id)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate custom metric id: ${metric.id}`,
        path: ["customMetrics", index, "id"],
      });
    }
    ids.add(metric.id);
  });
});

export type DashboardDefinition = z.infer<typeof dashboardDefinitionSchema>;
export type CustomMetric = z.infer<typeof customMetricSchema>;

/** Parse + apply defaults; throws z.ZodError on an invalid definition. */
export function parseDashboardDefinition(value: unknown): DashboardDefinition {
  return dashboardDefinitionSchema.parse(value);
}

// The formula validator lives in a zero-dependency module so the client metrics
// page can import it without pulling zod into its bundle. Re-exported here so
// existing server-side importers (metric-dashboard, MCP server) are unchanged.
export { formulaValidationMessage, isSafeFormula, parseMetricFormula } from "./formula";
