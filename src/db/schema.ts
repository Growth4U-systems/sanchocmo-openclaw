import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ============================================================
// User & Auth tables (compatible with BetterAuth schema)
// ============================================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// ============================================================
// Subscription table — Polar webhook data
// ============================================================

export const subscription = pgTable("subscription", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt").notNull(),
  modifiedAt: timestamp("modifiedAt"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  recurringInterval: text("recurringInterval").notNull(),
  status: text("status").notNull(),
  currentPeriodStart: timestamp("currentPeriodStart").notNull(),
  currentPeriodEnd: timestamp("currentPeriodEnd").notNull(),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
  canceledAt: timestamp("canceledAt"),
  startedAt: timestamp("startedAt").notNull(),
  endsAt: timestamp("endsAt"),
  endedAt: timestamp("endedAt"),
  customerId: text("customerId").notNull(),
  productId: text("productId").notNull(),
  discountId: text("discountId"),
  checkoutId: text("checkoutId").notNull(),
  customerCancellationReason: text("customerCancellationReason"),
  customerCancellationComment: text("customerCancellationComment"),
  metadata: text("metadata"),
  customFieldData: text("customFieldData"),
  userId: text("userId").references(() => user.id),
});

// ============================================================
// Meeting Intelligence — Neon-backed source of truth
// ============================================================

export const miSources = pgTable("mi_sources", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  sourceId: text("source_id"),
  url: text("url"),
  enabled: boolean("enabled").notNull().default(true),
  scope: jsonb("scope").$type<Record<string, unknown> | null>(),
  filter: jsonb("filter").$type<Record<string, unknown> | null>(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("mi_sources_slug_idx").on(table.slug),
  slugKindIdx: index("mi_sources_slug_kind_idx").on(table.slug, table.kind),
}));

export const miSettings = pgTable("mi_settings", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  syncEnabled: boolean("sync_enabled").notNull().default(false),
  syncTime: text("sync_time").notNull().default("18:00"),
  syncTimezone: text("sync_timezone").notNull().default("Europe/Madrid"),
  syncCronExpr: text("sync_cron_expr").notNull().default("0 18 * * *"),
  syncLimit: integer("sync_limit").notNull().default(60),
  cronJobId: text("cron_job_id"),
  routing: jsonb("routing").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("mi_settings_slug_idx").on(table.slug),
}));

export const miRuns = pgTable("mi_runs", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  status: text("status").notNull().default("queued"),
  trigger: text("trigger").notNull().default("agent"),
  sourcesScanned: jsonb("sources_scanned").$type<Record<string, unknown> | null>(),
  metrics: jsonb("metrics").$type<Record<string, unknown> | null>(),
  errors: jsonb("errors").$type<unknown[] | Record<string, unknown> | null>(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("mi_runs_slug_idx").on(table.slug),
  slugStatusIdx: index("mi_runs_slug_status_idx").on(table.slug, table.status),
}));

export const miMeetings = pgTable("mi_meetings", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  sourceId: text("source_id"),
  runId: text("run_id").references(() => miRuns.id, { onDelete: "set null" }),
  externalId: text("external_id"),
  title: text("title").notNull(),
  meetingDate: text("meeting_date").notNull(),
  meetingTime: text("meeting_time"),
  sourceLabel: text("source_label").notNull().default("Manual"),
  status: text("status").notNull().default("needs_raw_sync"),
  rawStatus: text("raw_status").notNull().default("missing"),
  meetingType: text("meeting_type").notNull().default("meeting"),
  participants: jsonb("participants").$type<string[] | null>(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("mi_meetings_slug_idx").on(table.slug),
  slugDateIdx: index("mi_meetings_slug_date_idx").on(table.slug, table.meetingDate),
  sourceIdx: index("mi_meetings_source_idx").on(table.sourceId),
}));

export const miMeetingArtifacts = pgTable("mi_meeting_artifacts", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => miMeetings.id, { onDelete: "cascade" }),
  rawText: text("raw_text"),
  summaryText: text("summary_text"),
  sourcePayload: jsonb("source_payload").$type<Record<string, unknown> | null>(),
  checksum: text("checksum"),
  fetchedAt: timestamp("fetched_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("mi_artifacts_slug_idx").on(table.slug),
  meetingIdx: index("mi_artifacts_meeting_idx").on(table.meetingId),
}));

export const miInsights = pgTable("mi_insights", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  meetingId: text("meeting_id").references(() => miMeetings.id, { onDelete: "cascade" }),
  runId: text("run_id").references(() => miRuns.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  rationale: text("rationale"),
  owner: text("owner"),
  confidence: real("confidence"),
  evidence: jsonb("evidence").$type<Record<string, unknown> | null>(),
  status: text("status").notNull().default("draft"),
  sourceLabel: text("source_label"),
  eventDate: text("event_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("mi_insights_slug_idx").on(table.slug),
  meetingIdx: index("mi_insights_meeting_idx").on(table.meetingId),
  slugKindIdx: index("mi_insights_slug_kind_idx").on(table.slug, table.kind),
  slugStatusIdx: index("mi_insights_slug_status_idx").on(table.slug, table.status),
}));

export const miDocumentImpacts = pgTable("mi_document_impacts", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  meetingId: text("meeting_id").references(() => miMeetings.id, { onDelete: "cascade" }),
  insightId: text("insight_id").references(() => miInsights.id, { onDelete: "set null" }),
  documentName: text("document_name").notNull(),
  documentPath: text("document_path"),
  impactType: text("impact_type").notNull().default("possible_update"),
  status: text("status").notNull().default("possible_update"),
  severity: text("severity").notNull().default("medium"),
  reason: text("reason"),
  proposedChange: text("proposed_change"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("mi_impacts_slug_idx").on(table.slug),
  meetingIdx: index("mi_impacts_meeting_idx").on(table.meetingId),
  documentIdx: index("mi_impacts_document_idx").on(table.slug, table.documentName),
}));

export const miRecommendations = pgTable("mi_recommendations", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  meetingId: text("meeting_id").references(() => miMeetings.id, { onDelete: "cascade" }),
  insightId: text("insight_id").references(() => miInsights.id, { onDelete: "set null" }),
  impactId: text("impact_id").references(() => miDocumentImpacts.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("medium"),
  targetType: text("target_type").notNull().default("task"),
  targetId: text("target_id"),
  documentName: text("document_name"),
  status: text("status").notNull().default("recommended"),
  taskId: text("task_id"),
  taskStatus: text("task_status").notNull().default("recommended"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  convertedAt: timestamp("converted_at"),
}, (table) => ({
  slugIdx: index("mi_recommendations_slug_idx").on(table.slug),
  meetingIdx: index("mi_recommendations_meeting_idx").on(table.meetingId),
  slugStatusIdx: index("mi_recommendations_slug_status_idx").on(table.slug, table.status),
}));

// ============================================================
// POV Bank — Neon-backed source of truth
// ============================================================

export const povBanks = pgTable("pov_banks", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  version: integer("version").notNull().default(3),
  global: jsonb("global").$type<Record<string, unknown>>().notNull().default({}),
  versionHistory: jsonb("version_history").$type<Array<Record<string, unknown>>>().notNull().default([]),
  status: text("status").notNull().default("active"),
  source: text("source").notNull().default("neon"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("pov_banks_slug_idx").on(table.slug),
  statusIdx: index("pov_banks_status_idx").on(table.status),
}));

export const povPillars = pgTable("pov_pillars", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  bankId: text("bank_id").references(() => povBanks.id, { onDelete: "cascade" }),
  pillarId: text("pillar_id").notNull(),
  pillarName: text("pillar_name"),
  coreBelief: text("core_belief"),
  weSayYesTo: jsonb("we_say_yes_to").$type<string[]>().notNull().default([]),
  weSayNoTo: jsonb("we_say_no_to").$type<string[]>().notNull().default([]),
  preferredAngles: jsonb("preferred_angles").$type<string[]>().notNull().default([]),
  evidenceWeCite: jsonb("evidence_we_cite").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("pov_pillars_slug_idx").on(table.slug),
  slugPillarIdx: index("pov_pillars_slug_pillar_idx").on(table.slug, table.pillarId),
  bankIdx: index("pov_pillars_bank_idx").on(table.bankId),
}));

export const povEvidenceItems = pgTable("pov_evidence_items", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  bankId: text("bank_id").references(() => povBanks.id, { onDelete: "cascade" }),
  pillarId: text("pillar_id").notNull(),
  sourceType: text("source_type").notNull(),
  signalType: text("signal_type").notNull(),
  statement: text("statement").notNull(),
  exactQuote: text("exact_quote"),
  speaker: text("speaker"),
  context: text("context"),
  sourceRef: jsonb("source_ref").$type<Record<string, unknown> | null>(),
  privacy: text("privacy").notNull().default("internal_exact_public_anonymous"),
  status: text("status").notNull().default("candidate"),
  usedIn: jsonb("used_in").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("pov_evidence_slug_idx").on(table.slug),
  slugPillarIdx: index("pov_evidence_slug_pillar_idx").on(table.slug, table.pillarId),
  sourceIdx: index("pov_evidence_source_idx").on(table.slug, table.sourceType),
  statusIdx: index("pov_evidence_status_idx").on(table.slug, table.status),
}));

export const povClarifyPatterns = pgTable("pov_clarify_patterns", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  bankId: text("bank_id").references(() => povBanks.id, { onDelete: "cascade" }),
  pillarId: text("pillar_id").notNull(),
  patternType: text("pattern_type").notNull(),
  pattern: text("pattern").notNull(),
  evidenceCount: integer("evidence_count").notNull().default(1),
  confidence: real("confidence"),
  sourceRefs: jsonb("source_refs").$type<Array<Record<string, unknown>>>().notNull().default([]),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("pov_clarify_patterns_slug_idx").on(table.slug),
  slugPillarIdx: index("pov_clarify_patterns_slug_pillar_idx").on(table.slug, table.pillarId),
  statusIdx: index("pov_clarify_patterns_status_idx").on(table.slug, table.status),
}));

export const povUpdateProposals = pgTable("pov_update_proposals", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  bankId: text("bank_id").references(() => povBanks.id, { onDelete: "cascade" }),
  pillarId: text("pillar_id"),
  targetField: text("target_field").notNull(),
  currentValue: jsonb("current_value").$type<unknown>(),
  proposedValue: jsonb("proposed_value").$type<unknown>(),
  rationale: text("rationale"),
  evidenceItemIds: jsonb("evidence_item_ids").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("recommended"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
}, (table) => ({
  slugIdx: index("pov_update_proposals_slug_idx").on(table.slug),
  statusIdx: index("pov_update_proposals_status_idx").on(table.slug, table.status),
  targetIdx: index("pov_update_proposals_target_idx").on(table.slug, table.pillarId, table.targetField),
}));

// ============================================================
// Mission Control tasks
// ============================================================

export const tasks = pgTable("tasks", {
  sourceKey: text("source_key").primaryKey(),
  id: text("id").notNull(),
  workspaceSlug: text("workspace_slug").notNull(),
  brandSlug: text("brand_slug").notNull(),
  parentId: text("parent_id"),
  parentKey: text("parent_key"),

  type: text("type").notNull(),
  status: text("status").notNull(),

  name: text("name").notNull(),
  brief: text("brief"),
  completion: text("completion"),
  executionNotes: text("execution_notes"),
  description: text("description"),
  slug: text("slug"),
  owner: text("owner"),
  agent: text("agent"),
  skill: text("skill"),
  skills: jsonb("skills"),
  channel: text("channel"),
  deliverable: text("deliverable"),
  deliverableFile: jsonb("deliverable_file"),
  doneCriteria: text("done_criteria"),
  dependsOn: text("depends_on"),
  inputDocuments: jsonb("input_documents"),
  requiredInputs: jsonb("required_inputs"),
  outputDocuments: jsonb("output_documents"),

  pillar: text("pillar"),
  section: text("section"),

  strategy: text("strategy"),
  phase: integer("phase"),
  category: text("category"),
  objective: jsonb("objective"),
  approach: text("approach"),
  archiveReason: text("archive_reason"),
  blockedBy: text("blocked_by"),
  tool: text("tool"),

  ideaId: text("idea_id"),
  pipelineState: text("pipeline_state"),
  clarifyStatus: text("clarify_status"),
  targetChannels: jsonb("target_channels"),
  channelPhases: jsonb("channel_phases"),
  mediaPolicy: jsonb("media_policy"),
  scheduledFor: timestamp("scheduled_for"),
  draftStatuses: jsonb("draft_statuses"),

  mcChatThreadId: text("mc_chat_thread_id"),
  discordThreadId: text("discord_thread_id"), // DEPRECATED (Discord retirado, SAN-183 F5) — column drop pendiente de migración

  outputFiles: jsonb("output_files"),
  documents: jsonb("documents"),
  attachments: jsonb("attachments"),
  ideaIds: jsonb("idea_ids"),
  legacyExtras: jsonb("legacy_extras"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  approvedAt: timestamp("approved_at"),
  pendingMediaAt: timestamp("pending_media_at"),
  publishedAt: timestamp("published_at"),
  discardedAt: timestamp("discarded_at"),
  deferredAt: timestamp("deferred_at"),
  reviewDate: timestamp("review_date"),
}, (table) => [
  foreignKey({
    name: "tasks_parent_key_fk",
    columns: [table.parentKey],
    foreignColumns: [table.sourceKey],
  }).onDelete("cascade"),
  index("tasks_workspace_slug_idx").on(table.workspaceSlug),
  index("tasks_brand_slug_idx").on(table.brandSlug),
  index("tasks_workspace_brand_id_idx").on(table.workspaceSlug, table.brandSlug, table.id),
  index("tasks_parent_id_idx").on(table.parentId),
  index("tasks_parent_key_idx").on(table.parentKey),
  index("tasks_brand_type_idx").on(table.brandSlug, table.type),
  index("tasks_brand_status_idx").on(table.brandSlug, table.status),
  index("tasks_brand_agent_idx").on(table.brandSlug, table.agent),
  index("tasks_brand_pillar_idx").on(table.brandSlug, table.pillar),
  index("tasks_idea_id_idx").on(table.ideaId),
]);

// ============================================================
// Shared Document Comments (SAN-15, v2 threads/resolve SAN-148)
// ============================================================

export const sharedDocComments = pgTable("shared_doc_comments", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  docPath: text("doc_path").notNull(),
  docVersion: integer("doc_version"),
  author: text("author").notNull(),
  email: text("email"),
  body: text("body").notNull(),
  anchorText: text("anchor_text"),
  anchorContext: text("anchor_context"),
  anchorDocOffset: integer("anchor_doc_offset"),
  // v2 (SAN-148): 1-level threads — replies carry parentId and NO anchor
  parentId: text("parent_id"),
  // v2 (SAN-148): resolve/reopen, public and reversible (Notion model)
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
  // v2 (SAN-148): W3C TextQuoteSelector context for robust re-anchoring
  anchorPrefix: text("anchor_prefix"),
  anchorSuffix: text("anchor_suffix"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("shared_doc_comments_slug_idx").on(table.slug),
  index("shared_doc_comments_slug_doc_idx").on(table.slug, table.docPath, table.createdAt),
  index("shared_doc_comments_parent_idx").on(table.parentId),
  index("shared_doc_comments_open_idx").on(table.slug, table.docPath, table.resolved, table.createdAt),
]);

// ============================================================
// Sancho MCP audit events
// ============================================================

export const mcpAuditEvents = pgTable("mcp_audit_events", {
  id: text("id").primaryKey(),
  principalId: text("principal_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  toolName: text("tool_name").notNull(),
  clientSlug: text("client_slug"),
  ok: boolean("ok").notNull(),
  error: text("error"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("mcp_audit_events_created_at_idx").on(table.createdAt),
  index("mcp_audit_events_principal_idx").on(table.principalId),
  index("mcp_audit_events_tool_idx").on(table.toolName),
  index("mcp_audit_events_client_idx").on(table.clientSlug),
  index("mcp_audit_events_ok_idx").on(table.ok),
]);

export const feedbackInsights = pgTable("feedback_insights", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  slug: text("slug").notNull(),
  docPath: text("doc_path").notNull(),
  skillId: text("skill_id"),
  category: text("category").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  proposedChange: text("proposed_change"),
  sourceCommentIds: jsonb("source_comment_ids").$type<string[]>().default([]).notNull(),
  status: text("status").notNull().default("new"),
  routedRef: text("routed_ref"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("feedback_insights_slug_idx").on(table.slug),
  index("feedback_insights_slug_status_idx").on(table.slug, table.status),
  index("feedback_insights_run_idx").on(table.runId),
]);

// ============================================================
// Intake submissions (SAN-17) — public kickoff form
// ============================================================

export const intakeSubmissions = pgTable("intake_submissions", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  respondentName: text("respondent_name").notNull(),
  respondentEmail: text("respondent_email"),
  answers: jsonb("answers").notNull(),
  status: text("status").notNull().default("submitted"),
  attachments: jsonb("attachments"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
}, (table) => [
  index("intake_submissions_slug_idx").on(table.slug),
]);

// ============================================================
// Metric snapshots (SAN-263 · Métricas v2) — time-series mirror of
// brand/<slug>/metrics/<date>.json. One tidy row per
// slug/date/source/metric/dimensions; the JSON files stay source of truth.
// ============================================================

export const metricSnapshots = pgTable("metric_snapshots", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  metricDate: text("metric_date").notNull(),
  source: text("source").notNull(),
  metricName: text("metric_name").notNull(),
  value: real("value"),
  valueText: text("value_text"),
  dimensions: jsonb("dimensions").$type<Record<string, string> | null>(),
  dimsKey: text("dims_key").notNull().default(""),
  grain: text("grain").notNull().default("day"),
  collectedAt: timestamp("collected_at"),
  ingestRunId: text("ingest_run_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  // Uniqueness is the deterministic hashed `id` PK (collision-negligible); no
  // raw-dims_key unique index, which could exceed Postgres' btree index-row
  // size limit on long GSC/GA4 URL/query dimensions (Codex review).
  index("metric_snapshots_slug_date_idx").on(table.slug, table.metricDate),
  index("metric_snapshots_slug_source_metric_idx").on(table.slug, table.source, table.metricName),
  index("metric_snapshots_slug_source_date_idx").on(table.slug, table.source, table.metricDate),
]);

// ============================================================
// Metric dashboards (SAN-265 · Métricas v2) — versioned dashboard definition
// (presentation + plan + custom), one row per slug, with an append-only
// version_history of full snapshots for revert. Modeled on POV Bank.
// ============================================================

export const metricDashboards = pgTable("metric_dashboards", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  version: integer("version").notNull().default(1),
  definition: jsonb("definition").$type<Record<string, unknown>>().notNull().default({}),
  versionHistory: jsonb("version_history").$type<Array<Record<string, unknown>>>().notNull().default([]),
  status: text("status").notNull().default("active"),
  source: text("source").notNull().default("neon"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("metric_dashboards_slug_idx").on(table.slug),
]);
