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
  DiscoveryRunnerErrorCode,
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

export {
  AMBIGUOUS_ACCOUNT_REVIEW_NOTE,
  BUSINESS_ACCOUNT_DISQUALIFY_NOTE,
  qualifyCandidate,
  qualifyCandidates,
} from "./qualify-enrich";
export type { QualifiedCandidate, QualifyOptions } from "./qualify-enrich";
export {
  classifyAccountType,
  classifyCandidateAccountType,
} from "./account-type-classifier";
export type {
  AccountTypeClassification,
  AccountTypeProfile,
  AccountTypeVerdict,
} from "./account-type-classifier";

export { fixturesEnabledByEnv, loadFixtureCandidates } from "./fixtures";

export {
  assertDiscoverySearchId,
  assertDiscoveryStoreSlug,
  advanceSearchExecutionGeneration,
  archiveSearch,
  DiscoveryStoreValidationError,
  getSearch,
  isValidDiscoverySearchId,
  isSearchArchived,
  listSearches,
  listSearchIds,
  newSearchId,
  saveSearch,
  searchFile,
  searchRelativePath,
  searchesDir,
  updateRunnerState,
} from "./discovery-store";
export type { DiscoveryStoreValidationCode } from "./discovery-store";

export {
  createDiscoverySearch,
  DiscoveryCommandError,
  isDiscoverySetupPending,
  DISCOVERY_RUNNER_SKILL,
  DISCOVERY_TASK_TYPE,
} from "./create-search";
export type {
  CreateDiscoverySearchResult,
  CreateSearchResult,
} from "./create-search";
export {
  getDiscoverySetupAdmissionStatus,
  DiscoverySetupCommandError,
} from "./discovery-setup-worker";
export type {
  DiscoverySetupPendingResult,
  DiscoverySetupPublicStatus,
} from "./discovery-setup-worker";
export { isDiscoveryLedgerAuthoritative } from "./discovery-execution-policy";

export {
  applyDiscoveryPlanGates,
  runDiscoverySearch,
} from "./discovery-runner";
export type {
  RunDiscoveryOptions,
  RunDiscoveryResult,
} from "./discovery-runner";
export {
  discoveryJobId,
  enqueueDiscoverySearchRun,
  resumeQueuedDiscoverySearches,
} from "./discovery-jobs";
export type { EnqueueDiscoverySearchRunOptions } from "./discovery-jobs";
export {
  DiscoveryDurableWorkerConfigurationError,
  DiscoveryRetryConflictError,
  getCanaryDiscoveryRuntimeReadiness,
  getCanaryDiscoveryWorkerReadiness,
  processNextCanaryDiscoveryRun,
  processNextCanaryDiscoverySetupRun,
  reconcileCanaryDiscoverySearches,
  requestDiscoverySearchRun,
  startCanaryDiscoveryWorkers,
  stopCanaryDiscoveryWorkers,
  wakeCanaryDiscoveryWorker,
  wakeCanaryDiscoverySetupWorker,
} from "./discovery-durable-worker";
export {
  buildLiveDiscoveryQueries,
  scrapeLiveDiscoveryCandidates,
  supportsLiveDiscovery,
  unsupportedLiveDiscoveryNetworks,
} from "./scrapecreators-live";

export { triggerDiscoveryRunner } from "./trigger-runner";
export type {
  TriggerDiscoveryRunnerInput,
  TriggerDiscoveryRunnerResult,
} from "./trigger-runner";

// ── SAN-80 · Plantillas + Contacto + Inbox + negotiation-assist ─────────────

export {
  extractTemplateVariableKeys,
  findInvalidTemplateExpressions,
  findUnsupportedTemplateFallbacks,
  findUnsupportedTemplateVariables,
  instantiateTemplate,
  parseTemplate,
  renderTemplateText,
  serializeTemplate,
  slugifyTemplateName,
  templateRelativePath,
  templateSummary,
  TEMPLATE_VARIABLE_OPTIONS,
  TEMPLATE_VARIABLES,
  toYalcSequence,
  toYalcTemplateText,
} from "./templates";
export type {
  AssignedTemplate,
  PartnershipTemplate,
  TemplateCampaignType,
  TemplateKind,
  TemplateRenderContext,
  TemplateStep,
  TemplateSummary,
  TemplateVariableOption,
  TemplateVariableSource,
} from "./templates";

export { SEED_TEMPLATES } from "./template-seeds";

export {
  assignTemplatesFromPlan,
  assignTemplateToSearch,
  seedDemoTemplates,
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
  contactDraftPreviewsFromResponse,
  contactGateDraftsFromResponse,
  unresolvedTemplateVariables,
  unresolvedVariablesFromDrafts,
} from "./contact-preview";
export type {
  ContactDraftPreview,
  ContactDraftStep,
  ContactGateDraft,
} from "./contact-preview";

export {
  INBOX_STATE_LABELS,
  INBOX_STATES,
  inboxConversations,
  inboxStateCounts,
  inboxStateForLead,
} from "./inbox-mapping";
export type {
  InboxLeadLike,
  InboxStateKey,
  InboxStateMeta,
} from "./inbox-mapping";

export {
  detectLatestPrice,
  detectPrices,
  insertAnalysisParagraph,
  negotiationBreakEven,
  NICHE_ER_BENCHMARK_PCT,
} from "./negotiation";
export type { DetectedPrice, NegotiationCalcInput } from "./negotiation";

// ── SAN-81 · Reporting por creator (vive en Metrics — cierra el loop) ───────

export { buildCreatorReport, REPORT_SPARKLINE_BUCKETS } from "./creator-report";
export type {
  BuildCreatorReportOptions,
  CreatorPerformancePost,
  CreatorPerformanceRecord,
  CreatorReport,
  CreatorReportFeedback,
  CreatorReportFeedbackDelta,
  CreatorReportPostRow,
  CreatorReportRow,
  CreatorReportTotals,
  PerformanceSource,
  ReportPeriodDays,
} from "./creator-report";

export {
  materializePerformanceSeeds,
  SEED_PERFORMANCE,
} from "./performance-seeds";
export type {
  SeedPerformanceCreator,
  SeedPerformancePost,
} from "./performance-seeds";

export {
  ensurePerformanceSeed,
  loadPerformance,
  performanceFile,
  savePerformance,
} from "./performance-store";

export {
  creatorReportForSlug,
  parseReportPeriod,
  REPORT_PERIODS,
} from "./report-service";
export type { CreatorReportServiceOptions } from "./report-service";

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
