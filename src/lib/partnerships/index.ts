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

// ── SAN-80 · Plantillas + Contacto + Inbox + negotiation-assist ─────────────

export {
  instantiateTemplate,
  parseTemplate,
  renderTemplateText,
  serializeTemplate,
  slugifyTemplateName,
  templateRelativePath,
  templateSummary,
  TEMPLATE_VARIABLES,
  toYalcSequence,
} from "./templates";
export type {
  AssignedTemplate,
  PartnershipTemplate,
  TemplateCampaignType,
  TemplateKind,
  TemplateRenderContext,
  TemplateStep,
  TemplateSummary,
} from "./templates";

export { SEED_TEMPLATES } from "./template-seeds";

export {
  assignTemplatesFromPlan,
  assignTemplateToSearch,
  ensureSeedTemplates,
  findSearchByCampaign,
  findSearchSequence,
  getTemplate,
  listAssignedTemplates,
  listTemplates,
  listTemplateSummaries,
  saveTemplate,
  templateFile,
  templatesDir,
  TemplateValidationError,
} from "./template-store";
export type { AssignTemplateResult, SaveTemplateInput } from "./template-store";

export { contactPartnerLeads, PartnerContactError } from "./contact";
export type { ContactGateResult, ContactLeadsInput } from "./contact";

export {
  INBOX_STATE_LABELS,
  INBOX_STATES,
  inboxConversations,
  inboxStateCounts,
  inboxStateForLead,
} from "./inbox-mapping";
export type { InboxLeadLike, InboxStateKey, InboxStateMeta } from "./inbox-mapping";

export {
  detectLatestPrice,
  detectPrices,
  insertAnalysisParagraph,
  negotiationBreakEven,
  NICHE_ER_BENCHMARK_PCT,
} from "./negotiation";
export type { DetectedPrice, NegotiationCalcInput } from "./negotiation";

// ── SAN-76 · Model config (defaults calc-creator-core + overrides en Yalc) ──

export {
  assertModelConfigPartial,
  defaultModelConfig,
  getEffectiveModelConfig,
  mergeOverrideDocuments,
  ModelConfigValidationError,
  previewModelConfigUpdate,
  putModelConfigOverrides,
} from "./model-config";
export type { EffectiveModelConfig, ModelConfigPreview } from "./model-config";
