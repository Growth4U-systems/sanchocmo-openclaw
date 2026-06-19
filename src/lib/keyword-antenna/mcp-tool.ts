/**
 * keyword-antenna · MCP tools (SAN-260)
 *
 * Thin wrappers over the shared data layer (`@/lib/data/keyword-antenna`), the
 * same one the `keyword-antenna` skill reaches over HTTP — one implementation,
 * two surfaces. Discovery (DataForSEO/GSC/the 3 modes) runs agent-side and feeds
 * candidates in; these tools score + persist.
 *
 * Entrypoint SEPARATE from the data layer (imports zod + the MCP SDK): the
 * registrar is injected with the server's helpers (auth/run/jsonResult), mirror
 * of `calc-creator-core/mcp-tool.ts`.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import {
  scoreKeyword,
  dedupeCandidates,
  promoteKeywordsToIdeas,
  listKeywordOpportunities,
  type KeywordCandidate,
  type DiscoveryMode,
} from "@/lib/data/keyword-antenna";

export const RUN_KEYWORD_ANTENNA_TOOL = "sancho_run_keyword_antenna";
export const LIST_KEYWORD_OPPORTUNITIES_TOOL = "sancho_list_keyword_opportunities";

/** Dependencies injected by the MCP server (transport + auth + audit). */
export interface RegisterKeywordAntennaToolsOptions {
  /** Scope + client access for reads (`seo:read`). Must throw if not allowed. */
  assertReadAccess: (clientSlug: string) => void | Promise<void>;
  /** Scope + client access for writes (`seo:write`). Must throw if not allowed. */
  assertWriteAccess: (clientSlug: string) => void | Promise<void>;
  /** Server execution wrapper (audit/errors), `runTool` style. */
  run: (toolName: string, clientSlug: string, handler: () => Promise<CallToolResult>) => Promise<CallToolResult>;
  /** Server JSON → CallToolResult serializer. */
  jsonResult: (value: unknown) => CallToolResult;
}

const DISCOVERY_MODES = ["identity", "six-circles", "competitor-gap", "gsc-nearmiss", "demand"] as const;

const candidateSchema = z.object({
  keyword: z.string().min(1),
  pillarId: z.string().optional().describe("Content pillar key (P1, P2, …) from content-pillars.md."),
  angleDraft: z.string().optional().describe("Optional editorial angle for the idea. If omitted, Sancho generates a deterministic SEO angle."),
  angle_draft: z.string().optional().describe("Alias for angleDraft when callers reuse idea-queue field names."),
  discoveredBy: z.array(z.enum(DISCOVERY_MODES)).optional(),
  intent: z.enum(["informational", "commercial", "transactional", "navigational"]).optional(),
  bofuCategory: z.string().optional(),
  demand: z
    .object({
      volume: z.number().nullable().optional(),
      gscImpressions: z.number().nullable().optional(),
      trend: z.enum(["up", "flat", "down"]).nullable().optional(),
    })
    .optional(),
  winnability: z
    .object({
      kdGap: z.number().nullable().optional(),
      currentRank: z.number().nullable().optional(),
      competitorsRanking: z.number().nullable().optional(),
      serpPageType: z.string().nullable().optional(),
    })
    .optional(),
  businessValue: z.number().min(0).max(1).optional().describe("0..1; defaults from bofuCategory."),
  strategicFlag: z.boolean().optional().describe("Declared target → priority floor, never filtered out."),
  aiCitability: z
    .object({
      aiOverviewPresent: z.boolean().optional(),
      citedNow: z.boolean().optional(),
      shareOfVoice: z.number().nullable().optional(),
    })
    .optional(),
  recommendedPageType: z.string().optional(),
});

export const runKeywordAntennaInputSchema = {
  clientSlug: z.string().min(1).describe("Sancho client slug."),
  candidates: z
    .array(candidateSchema)
    .min(1)
    .describe("Keyword candidates from the antenna's discovery step (the agent gathers them via DataForSEO/GSC/6-Circles)."),
  dryRun: z.boolean().default(true).describe("When true (default), only previews scoring; writes no Ideas."),
  confirm: z.boolean().default(false).describe("Must be true with dryRun=false to promote candidates to seo Ideas."),
};

export const listKeywordOpportunitiesInputSchema = {
  clientSlug: z.string().min(1).describe("Sancho client slug."),
  pillarId: z.string().optional().describe("Filter to one content pillar (P1, P2, …)."),
  minPriority: z.number().min(0).max(100).optional().describe("Minimum priorityScore."),
  mode: z.enum(DISCOVERY_MODES).optional().describe("Filter by discovery mode."),
  limit: z.number().int().min(1).max(200).optional().describe("Max Ideas to return."),
};

/** Registers both keyword-antenna tools. The server injects auth/run/jsonResult. */
export function registerKeywordAntennaTools(server: McpServer, options: RegisterKeywordAntennaToolsOptions): void {
  server.registerTool(
    RUN_KEYWORD_ANTENNA_TOOL,
    {
      title: "Run Keyword Antenna (score + promote)",
      description:
        "Scores agent-supplied keyword candidates (priority = businessValue × winnability × demand × strategicFit, " +
        "a separate AEO aiOpportunity, and an anti-thin-programmatic guardrail) and promotes them as enriched seo " +
        "Ideas into the Blog idea queue. The agent/skill runs the DataForSEO/GSC/6-Circles discovery and passes the " +
        "candidates in. Requires seo:write. Defaults to dry-run; set dryRun=false and confirm=true to write.",
      inputSchema: runKeywordAntennaInputSchema,
    },
    async (input) =>
      options.run(RUN_KEYWORD_ANTENNA_TOOL, input.clientSlug, async () => {
        await options.assertWriteAccess(input.clientSlug);
        const scored = dedupeCandidates(input.candidates as KeywordCandidate[]).map((c) => scoreKeyword(c));
        if (input.dryRun !== false || input.confirm !== true) {
          return options.jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to promote these keywords to Ideas.",
            scored,
          });
        }
        const promote = promoteKeywordsToIdeas(input.clientSlug, scored);
        return options.jsonResult({ ok: true, ...promote });
      }),
  );

  server.registerTool(
    LIST_KEYWORD_OPPORTUNITIES_TOOL,
    {
      title: "List Keyword Antenna opportunities",
      description:
        "Lists enriched seo Ideas (source=keyword-antenna) for a client, sorted by priorityScore desc. Requires seo:read.",
      inputSchema: listKeywordOpportunitiesInputSchema,
    },
    async (input) =>
      options.run(LIST_KEYWORD_OPPORTUNITIES_TOOL, input.clientSlug, async () => {
        await options.assertReadAccess(input.clientSlug);
        const ideas = listKeywordOpportunities(input.clientSlug, {
          pillarId: input.pillarId,
          minPriority: input.minPriority,
          mode: input.mode as DiscoveryMode | undefined,
          limit: input.limit,
        });
        return options.jsonResult({ ok: true, count: ideas.length, ideas });
      }),
  );
}
