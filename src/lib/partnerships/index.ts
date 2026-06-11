/**
 * Partnerships discovery · API pública (SAN-79)
 *
 * Slice Discovery→Selección: plan por chat → búsqueda (tarea Outreach +
 * campaign Yalc) → runner (ScrapeCreators agentic o fixtures) → qualify-enrich
 * con calc-creator-core → Leads scoreados en Yalc (entrada por
 * qualification_mode). Consumido por los endpoints `/api/partnerships/*`,
 * la tool MCP `yalc_create_search` y el script `scripts/run-discovery-search.mts`.
 */

export type {
  DiscoveryLeadPayload,
  DiscoveryPlan,
  DiscoveryRunnerMode,
  DiscoveryRunnerState,
  DiscoveryRunnerStats,
  DiscoveryRunnerStatus,
  DiscoverySearchRecord,
  LeadQualityComponents,
  RawDiscoveryCandidate,
} from "./discovery-types";

export {
  buildCampaignPayload,
  describePlan,
  DiscoveryPlanError,
  normalizeNetwork,
  parseDiscoveryPlan,
} from "./discovery-plan";

export {
  candidateToCreatorMetrics,
  normalizeCandidate,
  normalizeCandidates,
  normalizeHandle,
} from "./discovery-normalize";
export type { NormalizeResult } from "./discovery-normalize";

export { qualifyCandidate, qualifyCandidates } from "./qualify-enrich";
export type { QualifiedCandidate, QualifyOptions } from "./qualify-enrich";

export { fixturesEnabledByEnv, loadFixtureCandidates } from "./fixtures";

export {
  getSearch,
  listSearches,
  newSearchId,
  saveSearch,
  searchFile,
  searchRelativePath,
  searchesDir,
  updateRunnerState,
} from "./discovery-store";

export { createDiscoverySearch, DISCOVERY_RUNNER_SKILL, DISCOVERY_TASK_TYPE } from "./create-search";
export type { CreateSearchResult } from "./create-search";

export { runDiscoverySearch } from "./discovery-runner";
export type { RunDiscoveryOptions, RunDiscoveryResult } from "./discovery-runner";
