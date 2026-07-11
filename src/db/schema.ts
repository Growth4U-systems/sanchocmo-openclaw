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
  uniqueIndex,
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

// ============================================================
// One-shot task routing proposals
// ============================================================

export const taskRouteProposals = pgTable("task_route_proposals", {
  id: text("id").primaryKey(),
  clientSlug: text("client_slug").notNull(),
  sourceThreadId: text("source_thread_id").notNull(),
  groupId: text("group_id").notNull(),
  agent: text("agent").notNull(),
  skill: text("skill"),
  skills: jsonb("skills").$type<string[]>(),
  name: text("name").notNull(),
  brief: text("brief").notNull(),
  candidateTaskIds: jsonb("candidate_task_ids").$type<string[]>(),
  createdAt: timestamp("created_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => [
  uniqueIndex("task_route_proposals_source_idx").on(table.clientSlug, table.sourceThreadId),
  index("task_route_proposals_expires_idx").on(table.expiresAt),
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
// Intelligence Engine (SAN-270) — normalized signal + proposals + metrics plan
// The spine of the continuous-improvement loop (Plan 03). One engine, many
// detectors: adapters write `signals`, the engine emits `improvement_proposals`.
// ============================================================

// Normalized time series. Adapters (P2) write here; detectors query it
// (percentiles / period-over-period / group-by) instead of scanning JSONs.
export const signals = pgTable("signals", {
  id: text("id").primaryKey(), // sig_<stableId(slug,category,provider,entity,metric,dims,capturedAt)>
  slug: text("slug").notNull(),
  category: text("category").notNull(), // content | web_analytics | crm | outreach | ads | meeting
  provider: text("provider").notNull(), // metricool | ga4 | gsc | meeting | ...
  entityType: text("entity_type"), // post | page | sequence | meeting | ...
  entityId: text("entity_id"),
  dims: jsonb("dims").$type<Record<string, string | number | null>>(), // {author, content_type, pillar, channel, hour, ...}
  metric: text("metric").notNull(), // impressions | engagement_pct | raw_text | ...
  value: real("value"), // numeric signal (null for text signals)
  text: text("text"), // text signal (meetings/comments) → feeds textMatch
  capturedAt: timestamp("captured_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("signals_slug_idx").on(table.slug),
  slugCategoryMetricIdx: index("signals_slug_category_metric_idx").on(table.slug, table.category, table.metric),
  capturedAtIdx: index("signals_captured_at_idx").on(table.capturedAt),
}));

// Generalizes mi_recommendations + domain/signalRef/confidence/rationale.
// Backbone of the unified Improvement Inbox (P3).
export const improvementProposals = pgTable("improvement_proposals", {
  id: text("id").primaryKey(), // prop_<stableId(slug,domain,ruleId,dimKey,window)>
  slug: text("slug").notNull(),
  domain: text("domain").notNull(), // content | seo | cro | outreach | ads | meeting | skill
  ruleId: text("rule_id"), // rule that emitted it
  signalRef: text("signal_ref"), // soft ref to signals.id (no FK: the series is pruned)
  title: text("title").notNull(),
  description: text("description"),
  rationale: text("rationale"), // narrative with numbers
  confidence: real("confidence"), // 0..1
  priority: text("priority").notNull().default("medium"),
  targetType: text("target_type").notNull().default("task"),
  targetId: text("target_id"),
  targetSkill: text("target_skill"), // suggested skill (content-atomizer, ...)
  targetAgent: text("target_agent"), // Dulcinea | Rocinante | Merlin | ...
  documentName: text("document_name"),
  status: text("status").notNull().default("recommended"), // recommended → approved/rejected → converted
  taskId: text("task_id"),
  taskStatus: text("task_status").notNull().default("recommended"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  convertedAt: timestamp("converted_at"),
}, (table) => ({
  slugIdx: index("improvement_proposals_slug_idx").on(table.slug),
  slugStatusIdx: index("improvement_proposals_slug_status_idx").on(table.slug, table.status),
  slugDomainIdx: index("improvement_proposals_slug_domain_idx").on(table.slug, table.domain),
}));

// Living metrics plan (Metrics First). Grain = slug·category·metric.
// approvalMode/threshold are slug-level (carried by the north-star row in practice).
export const metricsPlan = pgTable("metrics_plan", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  category: text("category").notNull(),
  provider: text("provider"), // active provider for this category
  metric: text("metric"), // target metric
  target: real("target"),
  direction: text("direction"), // higher_better | lower_better
  isNorthStar: boolean("is_north_star").notNull().default(false),
  active: boolean("active").notNull().default(true),
  approvalMode: text("approval_mode").notNull().default("review_all"), // review_all | auto_apply
  autoApplyConfidenceThreshold: real("auto_apply_confidence_threshold"),
  config: jsonb("config").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("metrics_plan_slug_idx").on(table.slug),
  slugCategoryIdx: index("metrics_plan_slug_category_idx").on(table.slug, table.category),
}));

// Closes the loop (worked/didn't) → calibrates confidence in future cycles.
export const proposalOutcomes = pgTable("proposal_outcomes", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  proposalId: text("proposal_id").notNull().references(() => improvementProposals.id, { onDelete: "cascade" }),
  outcome: text("outcome").notNull(), // worked | didnt | inconclusive
  metricBefore: real("metric_before"),
  metricAfter: real("metric_after"),
  notes: text("notes"),
  measuredAt: timestamp("measured_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("proposal_outcomes_slug_idx").on(table.slug),
  proposalIdx: index("proposal_outcomes_proposal_idx").on(table.proposalId),
}));

// ============================================================
// Metric snapshots (SAN-263/SAN-300 · Métricas v2) — DB-only time-series
// source of truth. One tidy row per slug/date/source/metric/dimensions.
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

// ============================================================
// Metric collection schedule (SAN-300) — editable per-source cadence. One row
// per (slug, source); the daily "Morning Metrics" cron collects only the sources
// due today. Sensible defaults live in code (collection-schedule.ts); a row here
// is an override. `days_of_week` uses JS getDay() (0=Sun…6=Sat).
// ============================================================

export const metricCollectionSchedule = pgTable("metric_collection_schedule", {
  id: text("id").primaryKey(), // hash(slug, source)
  slug: text("slug").notNull(),
  source: text("source").notNull(),
  cadence: text("cadence").notNull().default("daily"), // daily | weekly | twice_weekly | custom
  daysOfWeek: jsonb("days_of_week").$type<number[]>().notNull().default([]),
  cronExpr: text("cron_expr"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("metric_collection_schedule_slug_idx").on(table.slug),
]);

// ============================================================
// Metric source runs (SAN-300) — collection ledger: exactly one row per
// (slug, day, source) recording how that tool's collection went (ok/error/
// skipped), when, and how many rows it wrote/removed. This is the "one row per
// tool per day" view and the home for health/monitoring once JSON is retired.
// ============================================================

export const metricSourceRuns = pgTable("metric_source_runs", {
  id: text("id").primaryKey(), // hash(slug, metric_date, source)
  slug: text("slug").notNull(),
  metricDate: text("metric_date").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull(), // ok | error | skipped
  collectedAt: timestamp("collected_at"),
  rowCount: integer("row_count").notNull().default(0),
  deletedCount: integer("deleted_count").notNull().default(0),
  cadence: text("cadence"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("metric_source_runs_slug_date_idx").on(table.slug, table.metricDate),
  index("metric_source_runs_slug_source_idx").on(table.slug, table.source),
]);

// ============================================================
// Metric semantic layer (SAN-354) - dashboard-ready KPI values computed from
// metric_snapshots with quality status and provenance. Raw snapshots remain the
// source of truth; these tables are a read model for dashboard/API consumers.
// ============================================================

export const metricKpiRuns = pgTable("metric_kpi_runs", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  rangeFrom: text("range_from").notNull(),
  rangeTo: text("range_to").notNull(),
  status: text("status").notNull().default("running"), // running | ok | error
  trigger: text("trigger").notNull().default("agent"),
  definitionVersion: integer("definition_version"),
  valuesCount: integer("values_count").notNull().default(0),
  qualitySummary: jsonb("quality_summary").$type<Record<string, number>>().notNull().default({}),
  errors: jsonb("errors").$type<Array<Record<string, unknown>>>().notNull().default([]),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("metric_kpi_runs_slug_range_idx").on(table.slug, table.rangeFrom, table.rangeTo),
  index("metric_kpi_runs_slug_status_idx").on(table.slug, table.status),
]);

export const metricKpiValues = pgTable("metric_kpi_values", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => metricKpiRuns.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  kpiId: text("kpi_id").notNull(),
  label: text("label").notNull(),
  dashboardBlock: text("dashboard_block").notNull(),
  surface: text("surface"),
  source: text("source"),
  metricName: text("metric_name"),
  value: real("value"),
  valueText: text("value_text"),
  unit: text("unit"),
  qualityStatus: text("quality_status").notNull(), // ok | partial | missing | dirty | stale | demo
  provenanceLabel: text("provenance_label").notNull(),
  inputRefs: jsonb("input_refs").$type<Array<Record<string, unknown>>>().notNull().default([]),
  sourceCoverage: real("source_coverage").notNull().default(0),
  rangeFrom: text("range_from").notNull(),
  rangeTo: text("range_to").notNull(),
  definitionVersion: integer("definition_version"),
  computedAt: timestamp("computed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("metric_kpi_values_run_idx").on(table.runId),
  index("metric_kpi_values_slug_kpi_idx").on(table.slug, table.kpiId),
  index("metric_kpi_values_slug_block_idx").on(table.slug, table.dashboardBlock),
  index("metric_kpi_values_slug_surface_idx").on(table.slug, table.surface),
]);

// ============================================================
// Metric funnel/stage semantic layer (SAN-362) - maps raw snapshot metrics onto
// business funnel stages and persists stage/channel rollups. This is intentionally
// pre-attribution: rows stay keyed by source/channel so later layers can dedupe.
// ============================================================

export const metricFunnelStageMap = pgTable("metric_funnel_stage_map", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  archetype: text("archetype").notNull().default("lead-to-sale"),
  stageId: text("stage_id").notNull(),
  stageLabel: text("stage_label").notNull(),
  stageOrder: integer("stage_order").notNull(),
  surface: text("surface"),
  source: text("source").notNull(),
  metricName: text("metric_name").notNull(),
  sourceAliases: jsonb("source_aliases").$type<string[]>().notNull().default([]),
  metricAliases: jsonb("metric_aliases").$type<string[]>().notNull().default([]),
  dimensionsFilter: jsonb("dimensions_filter").$type<Record<string, string>>().notNull().default({}),
  channel: text("channel"),
  aggregation: text("aggregation").notNull().default("sum"),
  qualityOverride: text("quality_override"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("metric_funnel_stage_map_slug_idx").on(table.slug),
  index("metric_funnel_stage_map_slug_stage_idx").on(table.slug, table.stageId),
]);

export const metricStageRollups = pgTable("metric_stage_rollups", {
  id: text("id").primaryKey(),
  runId: text("run_id"),
  mapId: text("map_id"),
  slug: text("slug").notNull(),
  stageId: text("stage_id").notNull(),
  stageLabel: text("stage_label").notNull(),
  stageOrder: integer("stage_order").notNull(),
  stageDate: text("stage_date").notNull(),
  channel: text("channel").notNull(),
  surface: text("surface"),
  source: text("source").notNull(),
  metricName: text("metric_name").notNull(),
  value: real("value").notNull(),
  qualityStatus: text("quality_status").notNull(),
  provenanceLabel: text("provenance_label").notNull(),
  inputRefs: jsonb("input_refs").$type<Array<Record<string, unknown>>>().notNull().default([]),
  dimensions: jsonb("dimensions").$type<Record<string, string>>().notNull().default({}),
  rangeFrom: text("range_from").notNull(),
  rangeTo: text("range_to").notNull(),
  definitionVersion: integer("definition_version"),
  computedAt: timestamp("computed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("metric_stage_rollups_slug_date_idx").on(table.slug, table.stageDate),
  index("metric_stage_rollups_slug_stage_idx").on(table.slug, table.stageId),
  index("metric_stage_rollups_slug_channel_idx").on(table.slug, table.channel),
  index("metric_stage_rollups_slug_range_idx").on(table.slug, table.rangeFrom, table.rangeTo),
]);
