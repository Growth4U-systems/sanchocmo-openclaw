/**
 * calc-creator-core · tool MCP `yalc_breakeven` (SAN-75, pasada B)
 *
 * Wrapper FINO del motor de break-even para el principio transversal
 * UI = chat = MCP: recibe deal + funnel explícitos, o un `leadId` para leer
 * followers/ER del lead vía Yalc, y devuelve el cálculo completo.
 *
 * Entrypoint SEPARADO del index del paquete (importa zod + tipos del MCP
 * SDK): el registrador se inyecta con los helpers del server
 * (`src/lib/mcp/server.ts` en esta rama; SAN-80 puede re-registrarla igual
 * sobre el server de SAN-77 con una línea).
 *
 * El camino `leadId` depende de `GET /api/leads` de Yalc (SAN-77, PR #19 de
 * Yalc-Growth4U): hasta que ese PR esté desplegado, usa followers/ER
 * explícitos. El lead serializado de SAN-77 trae `followers` y
 * `engagementRate` (en %, p.ej. 3.4 = 3.4%) — mismas unidades que el motor.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { computeBreakEven } from "./break-even";
import type { BreakEvenDeal, BreakEvenFunnel } from "./types";

export const YALC_BREAKEVEN_TOOL_NAME = "yalc_breakeven";

/** Métricas mínimas del lead que necesita el motor (shape de SAN-77). */
export interface YalcBreakevenLeadMetrics {
  followers?: number | null;
  /** ER en % (Yalc `engagementRate`: 3.4 = 3.4%). */
  engagementRatePct?: number | null;
  handle?: string | null;
}

/** Dependencias que inyecta el MCP server (transporte + auth + auditoría). */
export interface RegisterYalcBreakevenToolOptions {
  /** Scope + acceso al cliente (p.ej. `yalc:read`). Debe lanzar si no procede. */
  assertAccess: (clientSlug: string) => void | Promise<void>;
  /** Envoltura de ejecución del server (auditoría/errores), estilo `runTool`. */
  run: (
    toolName: string,
    clientSlug: string,
    handler: () => Promise<CallToolResult>,
  ) => Promise<CallToolResult>;
  /** Serializador JSON → CallToolResult del server. */
  jsonResult: (value: unknown) => CallToolResult;
  /**
   * Lee followers/ER de un lead vía Yalc (`GET /api/leads`, SAN-77).
   * Opcional: sin él, `leadId` devuelve un error explicativo.
   */
  fetchLeadMetrics?: (clientSlug: string, leadId: string) => Promise<YalcBreakevenLeadMetrics>;
}

export const yalcBreakevenInputSchema = {
  clientSlug: z.string().min(1).describe("Sancho client slug."),
  leadId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "YALC lead id — reads followers/engagementRate from the lead (requires SAN-77 Yalc endpoints). Explicit followers/engagementRatePct override lead values.",
    ),
  followers: z.number().min(0).optional().describe("Creator followers (overrides lead value)."),
  engagementRatePct: z
    .number()
    .min(0)
    .optional()
    .describe("Creator engagement rate in % (e.g. 4.8). Missing → neutral ER adjustment ×1."),
  erBenchmarkPct: z
    .number()
    .positive()
    .optional()
    .describe("Niche ER benchmark in %. Default: the tier benchmark from config."),
  posts: z.number().int().min(1).describe("Number of posts in the package."),
  format: z
    .string()
    .min(1)
    .optional()
    .describe("Post format: reel (default) | post | story | video | carrusel (aliases accepted)."),
  feeEur: z.number().min(0).describe("Total deal price in EUR."),
  structure: z
    .enum(["fijo", "mixto"])
    .optional()
    .describe("Deal structure: 'fijo' (default, flat fee) or 'mixto' (flat + variable CPA)."),
  variableCpaEur: z
    .number()
    .min(0)
    .optional()
    .describe("Variable CPA in EUR (only for structure 'mixto')."),
  targetCacEur: z
    .number()
    .min(1)
    .optional()
    .describe("Target CAC in EUR (default 80 from seeded config; production value comes from Metrics)."),
  incentiveMultiplier: z
    .number()
    .positive()
    .optional()
    .describe("Incentive multiplier on the attainable side (canonical ×1 / ×1.5 / ×2 / ×3)."),
  reachRatePct: z
    .number()
    .min(0)
    .optional()
    .describe("Average reach per post as % of followers (default 30)."),
  clickToSignupPct: z.number().min(0).optional().describe("Funnel click→signup % (default 8)."),
  signupToKycPct: z.number().min(0).optional().describe("Funnel signup→KYC % (default 60)."),
  kycToFirstTxPct: z.number().min(0).optional().describe("Funnel KYC→first_tx % (default 70)."),
};

type YalcBreakevenInput = {
  clientSlug: string;
  leadId?: string;
  followers?: number;
  engagementRatePct?: number;
  erBenchmarkPct?: number;
  posts: number;
  format?: string;
  feeEur: number;
  structure?: "fijo" | "mixto";
  variableCpaEur?: number;
  targetCacEur?: number;
  incentiveMultiplier?: number;
  reachRatePct?: number;
  clickToSignupPct?: number;
  signupToKycPct?: number;
  kycToFirstTxPct?: number;
};

/**
 * Lógica pura de la tool (sin transporte): resuelve métricas (input > lead),
 * ejecuta el motor y devuelve el payload JSON. Exportada para tests.
 */
export async function runYalcBreakeven(
  input: YalcBreakevenInput,
  fetchLeadMetrics?: RegisterYalcBreakevenToolOptions["fetchLeadMetrics"],
): Promise<Record<string, unknown>> {
  let lead: (YalcBreakevenLeadMetrics & { id: string }) | null = null;

  if (input.leadId && (input.followers === undefined || input.engagementRatePct === undefined)) {
    if (!fetchLeadMetrics) {
      throw new Error(
        "leadId lookup is not available on this deployment (requires SAN-77 Yalc lead endpoints); pass followers/engagementRatePct explicitly.",
      );
    }
    const metrics = await fetchLeadMetrics(input.clientSlug, input.leadId);
    lead = { id: input.leadId, ...metrics };
  }

  const followers = input.followers ?? lead?.followers ?? undefined;
  if (followers === undefined || followers === null) {
    throw new Error(
      input.leadId
        ? `Lead ${input.leadId} has no followers metric; pass followers explicitly.`
        : "Provide either followers or leadId.",
    );
  }
  const engagementRatePct = input.engagementRatePct ?? lead?.engagementRatePct ?? undefined;

  const deal: BreakEvenDeal = {
    posts: input.posts,
    format: input.format,
    feeEur: input.feeEur,
    structure: input.structure,
    variableCpaEur: input.variableCpaEur,
    targetCacEur: input.targetCacEur,
    incentiveMultiplier: input.incentiveMultiplier,
  };
  const funnel: BreakEvenFunnel = {
    followers,
    engagementRatePct: engagementRatePct ?? undefined,
    erBenchmarkPct: input.erBenchmarkPct,
    reachRatePct: input.reachRatePct,
    clickToSignupPct: input.clickToSignupPct,
    signupToKycPct: input.signupToKycPct,
    kycToFirstTxPct: input.kycToFirstTxPct,
  };

  return {
    ok: true,
    clientSlug: input.clientSlug,
    lead: lead ? { id: lead.id, handle: lead.handle ?? null } : null,
    breakeven: computeBreakEven(deal, funnel),
  };
}

/**
 * Registra `yalc_breakeven` en un McpServer. El server inyecta auth,
 * auditoría, serialización y (opcional) el lector de leads de Yalc.
 */
export function registerYalcBreakevenTool(
  server: McpServer,
  options: RegisterYalcBreakevenToolOptions,
): void {
  server.registerTool(
    YALC_BREAKEVEN_TOOL_NAME,
    {
      title: "YALC partner break-even calc",
      description:
        "Computes the Partnerships break-even for a creator deal: required first_tx to hit the target CAC (flat or flat+variable structure), attainable first_tx (reach × CTR × ER adjustment × funnel × incentive multiplier), verdict (VIABLE/AJUSTADO/NO VIABLE/INVIABLE) and suggested counter-offer. Pass followers/engagementRatePct explicitly or a leadId to read them from YALC. Requires yalc:read.",
      inputSchema: yalcBreakevenInputSchema,
    },
    async (input) =>
      options.run(YALC_BREAKEVEN_TOOL_NAME, input.clientSlug, async () => {
        await options.assertAccess(input.clientSlug);
        const payload = await runYalcBreakeven(input as YalcBreakevenInput, options.fetchLeadMetrics);
        return options.jsonResult(payload);
      }),
  );
}
