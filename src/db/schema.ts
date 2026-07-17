import {
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { desc, sql } from "drizzle-orm";

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
// Durable agent-run ledger (SAN-469)
// ============================================================

export const agentRuns = pgTable("agent_runs", {
  id: text("id").primaryKey(),
  idempotencyKey: text("idempotency_key"),
  threadId: text("thread_id").notNull(),
  traceId: text("trace_id"),
  runtime: text("runtime").notNull(),
  agent: text("agent"),
  skill: text("skill"),
  skills: jsonb("skills").$type<string[]>(),
  skillMode: text("skill_mode"),
  taskId: text("task_id"),
  taskContract: jsonb("task_contract").$type<Record<string, unknown>>(),
  status: text("status").notNull().default("queued"),
  input: jsonb("input").$type<unknown>(),
  output: jsonb("output").$type<unknown>(),
  error: text("error"),
  callbackFingerprints: jsonb("callback_fingerprints").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("agent_runs_thread_idempotency_idx")
    .on(table.threadId, table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL AND ${table.status} IN ('queued', 'running', 'completed')`),
  index("agent_runs_thread_created_idx").on(table.threadId, table.createdAt),
  index("agent_runs_thread_status_idx").on(table.threadId, table.status, table.createdAt),
  index("agent_runs_trace_idx").on(table.traceId),
  index("agent_runs_task_idx").on(table.taskId),
]);

export const agentRunEvents = pgTable("agent_run_events", {
  sequence: bigserial("sequence", { mode: "number" }).notNull(),
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  threadId: text("thread_id").notNull(),
  traceId: text("trace_id"),
  type: text("type").notNull(),
  ts: timestamp("ts").notNull().defaultNow(),
  data: jsonb("data").$type<unknown>(),
}, (table) => [
  index("agent_run_events_run_sequence_idx").on(table.runId, table.sequence),
  index("agent_run_events_thread_sequence_idx").on(table.threadId, table.sequence),
  index("agent_run_events_trace_idx").on(table.traceId),
  index("agent_run_events_ts_idx").on(table.ts),
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
// Metric source runs (SAN-300) — collection ledger. `date_basis=collection`
// keeps exactly one execution-health row per (slug, day, source); additional
// `provider` rows record exact attempted provider days for routine pulls and
// historical backfills. They carry ok/partial/error/skipped/connected_no_data,
// when the attempt ran, and how many rows it wrote/removed.
// ============================================================

export const metricSourceRuns = pgTable("metric_source_runs", {
  id: text("id").primaryKey(), // hash(slug, metric_date, source)
  slug: text("slug").notNull(),
  metricDate: text("metric_date").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull(), // ok | partial | error | skipped | connected_no_data
  // `collection` is the execution/health day. `provider` is an exact day the
  // API was asked for, including historical backfills; readers must not apply
  // the routine provider lag to exact evidence.
  dateBasis: text("date_basis").notNull().default("collection"),
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
  index("metric_source_runs_slug_source_basis_date_idx").on(
    table.slug,
    table.source,
    table.dateBasis,
    table.metricDate,
  ),
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

// ============================================================
// Generic execution control plane — durable run/step/event ledger
// ============================================================

// These tables retain `timestamp without time zone` for compatibility. Their
// wall-clock values are UTC by contract, including writes that use a column
// default rather than the execution-control repository.
const executionUtcTimestampDefault = sql`clock_timestamp() AT TIME ZONE 'UTC'`;

export const executionRuns = pgTable(
  "execution_runs",
  {
    id: text("id").primaryKey(),
    // Contracted after the expand/backfill window. It is part of both the
    // authorization boundary and the idempotency identity.
    tenantKey: text("tenant_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    operation: text("operation").notNull(),
    mode: text("mode").notNull().default("shadow"),
    status: text("status").notNull().default("queued"),
    currentStep: text("current_step"),
    traceId: text("trace_id"),
    input: jsonb("input").$type<unknown>(),
    output: jsonb("output").$type<unknown>(),
    error: text("error"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    // Nullable for pre-0022 rows; current writers lazily adopt only exact matches.
    commandFingerprint: text("command_fingerprint"),
    availableAt: timestamp("available_at")
      .notNull()
      .default(executionUtcTimestampDefault),
    leaseOwner: text("lease_owner"),
    // A bearer lease token is never persisted in cleartext.
    leaseTokenHash: text("lease_token_hash"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    claimCount: integer("claim_count").notNull().default(0),
    handlerAttempt: integer("handler_attempt").notNull().default(0),
    blockedReasonCode: text("blocked_reason_code"),
    blockedAt: timestamp("blocked_at"),
    cancelRequestId: text("cancel_request_id"),
    cancelRequestedAt: timestamp("cancel_requested_at"),
    cancelActorType: text("cancel_actor_type"),
    cancelActorId: text("cancel_actor_id"),
    cancelReasonCode: text("cancel_reason_code"),
    cancelAcknowledgedAt: timestamp("cancel_acknowledged_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(executionUtcTimestampDefault),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(executionUtcTimestampDefault),
  },
  (table) => [
    check(
      "execution_runs_mode_check",
      sql`${table.mode} in ('shadow', 'canary', 'active')`,
    ),
    check(
      "execution_runs_status_check",
      sql`${table.status} in ('queued', 'running', 'waiting_approval', 'blocked', 'completed', 'partial', 'failed', 'cancelled')`,
    ),
    check(
      "execution_runs_block_reason_code_check",
      sql`${table.blockedReasonCode} is null or ${table.blockedReasonCode} in ('handler_version_invalid', 'handler_contract_unsupported', 'handler_contract_mismatch', 'execution_policy_mismatch', 'command_contract_mismatch', 'runtime_authority_unavailable')`,
    ),
    check(
      "execution_runs_block_shape_check",
      sql`(
        ${table.status} = 'blocked' and
        ${table.blockedReasonCode} is not null and
        ${table.blockedAt} is not null and
        ${table.leaseOwner} is null and
        ${table.leaseTokenHash} is null and
        ${table.leaseExpiresAt} is null and
        ${table.finishedAt} is null
      ) or (
        ${table.status} <> 'blocked' and
        ${table.blockedReasonCode} is null and
        ${table.blockedAt} is null
      )`,
    ),
    check(
      "execution_runs_metadata_object_check",
      sql`jsonb_typeof(${table.metadata}) = 'object'`,
    ),
    check(
      "execution_runs_cancellation_shape_check",
      sql`(
      ${table.cancelRequestId} is null and
      ${table.cancelRequestedAt} is null and
      ${table.cancelActorType} is null and
      ${table.cancelActorId} is null and
      ${table.cancelReasonCode} is null and
      ${table.cancelAcknowledgedAt} is null
    ) or (
      ${table.cancelRequestId} is not null and
      ${table.cancelRequestedAt} is not null and
      ${table.cancelActorType} is not null and
      ${table.cancelActorId} is not null and
      ${table.cancelReasonCode} is not null and
      (
        (${table.status} = 'running' and ${table.cancelAcknowledgedAt} is null) or
        (${table.status} = 'cancelled' and ${table.cancelAcknowledgedAt} is not null)
      )
    )`,
    ),
    check(
      "execution_runs_cancel_request_id_check",
      sql`${table.cancelRequestId} is null or ${table.cancelRequestId} ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|cancel_[a-f0-9]{32,64})$'`,
    ),
    check(
      "execution_runs_cancel_actor_type_check",
      sql`${table.cancelActorType} is null or ${table.cancelActorType} in ('user', 'service', 'system')`,
    ),
    check(
      "execution_runs_cancel_actor_id_check",
      sql`${table.cancelActorId} is null or ${table.cancelActorId} ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'`,
    ),
    check(
      "execution_runs_cancel_reason_code_check",
      sql`${table.cancelReasonCode} is null or ${table.cancelReasonCode} in ('user_requested', 'superseded', 'invalid_command', 'policy_blocked', 'operator_intervention', 'system_shutdown')`,
    ),
    uniqueIndex("execution_runs_tenant_aggregate_idempotency_idx").on(
      table.tenantKey,
      table.aggregateType,
      table.aggregateId,
      table.operation,
      table.idempotencyKey,
    ),
    uniqueIndex("execution_runs_id_tenant_idx").on(table.id, table.tenantKey),
    index("execution_runs_aggregate_created_idx").on(
      table.aggregateType,
      table.aggregateId,
      table.createdAt,
    ),
    index("execution_runs_status_updated_idx").on(
      table.status,
      table.updatedAt,
    ),
    index("execution_runs_tenant_created_idx").on(
      table.tenantKey,
      table.createdAt,
      table.id,
    ),
    index("execution_runs_tenant_status_created_idx").on(
      table.tenantKey,
      table.status,
      table.createdAt,
      table.id,
    ),
    index("execution_runs_tenant_operation_status_created_idx").on(
      table.tenantKey,
      table.operation,
      table.status,
      table.createdAt,
      table.id,
    ),
    index("execution_runs_tenant_operation_created_idx").on(
      table.tenantKey,
      table.operation,
      table.createdAt,
      table.id,
    ),
    index("execution_runs_trace_idx").on(table.traceId),
    index("execution_runs_queued_claim_idx")
      .on(
        table.tenantKey,
        table.operation,
        table.mode,
        table.availableAt,
        table.createdAt,
        table.id,
      )
      .where(
        sql`${table.status} = 'queued' and ${table.mode} in ('canary', 'active')`,
      ),
    index("execution_runs_running_expired_lease_idx")
      .on(table.tenantKey, table.operation, table.mode, table.leaseExpiresAt)
      .where(
        sql`${table.status} = 'running' and ${table.leaseExpiresAt} is not null`,
      ),
    index("execution_runs_runnable_scope_idx")
      .on(table.operation, table.mode, table.tenantKey)
      .where(
        sql`${table.status} in ('queued', 'running') and ${table.mode} in ('canary', 'active')`,
      ),
    index("execution_runs_cancellation_requested_idx")
      .on(
        table.tenantKey,
        table.operation,
        table.mode,
        table.cancelRequestedAt,
        table.id,
      )
      .where(
        sql`${table.status} = 'running' and ${table.cancelRequestId} is not null`,
      ),
    index("execution_runs_blocked_scope_idx")
      .on(
        table.operation,
        table.mode,
        table.tenantKey,
        table.blockedAt,
        table.id,
      )
      .where(
        sql`${table.status} = 'blocked' and ${table.mode} in ('canary', 'active')`,
      ),
  ],
);

/**
 * Authoritative root execution tree plus monotonic Stop tombstone. Public run
 * metadata may mirror the origin for diagnostics, but it grants no authority.
 */
export const executionOrigins = pgTable(
  "execution_origins",
  {
    tenantKey: text("tenant_key").notNull(),
    kind: text("kind").notNull(),
    parentAgentRunId: text("parent_agent_run_id").notNull(),
    cancelRequestId: text("cancel_request_id"),
    cancelRequestedAt: timestamp("cancel_requested_at"),
    cancelActorType: text("cancel_actor_type"),
    cancelActorId: text("cancel_actor_id"),
    cancelReasonCode: text("cancel_reason_code"),
    commandOperation: text("command_operation"),
    commandFingerprint: text("command_fingerprint"),
    commandClaimedAt: timestamp("command_claimed_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(executionUtcTimestampDefault),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(executionUtcTimestampDefault),
  },
  (table) => [
    primaryKey({
      name: "execution_origins_pkey",
      columns: [table.tenantKey, table.kind, table.parentAgentRunId],
    }),
    check(
      "execution_origins_kind_check",
      sql`${table.kind} = 'mc_chat_parent_run'`,
    ),
    check(
      "execution_origins_parent_agent_run_id_check",
      sql`${table.parentAgentRunId} ~ '^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$'`,
    ),
    check(
      "execution_origins_cancel_request_id_check",
      sql`${table.cancelRequestId} is null or ${table.cancelRequestId} ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|cancel_[a-f0-9]{32,64})$'`,
    ),
    check(
      "execution_origins_cancel_actor_type_check",
      sql`${table.cancelActorType} is null or ${table.cancelActorType} in ('user', 'service', 'system')`,
    ),
    check(
      "execution_origins_cancel_actor_id_check",
      sql`${table.cancelActorId} is null or ${table.cancelActorId} ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'`,
    ),
    check(
      "execution_origins_cancel_reason_code_check",
      sql`${table.cancelReasonCode} is null or ${table.cancelReasonCode} in ('user_requested', 'superseded', 'invalid_command', 'policy_blocked', 'operator_intervention', 'system_shutdown')`,
    ),
    check(
      "execution_origins_cancellation_shape_check",
      sql`(
        ${table.cancelRequestId} is null and
        ${table.cancelRequestedAt} is null and
        ${table.cancelActorType} is null and
        ${table.cancelActorId} is null and
        ${table.cancelReasonCode} is null
      ) or (
        ${table.cancelRequestId} is not null and
        ${table.cancelRequestedAt} is not null and
        ${table.cancelActorType} is not null and
        ${table.cancelActorId} is not null and
        ${table.cancelReasonCode} is not null
      )`,
    ),
    check(
      "execution_origins_command_operation_check",
      sql`${table.commandOperation} is null or ${table.commandOperation} ~ '^[a-z][a-z0-9._-]{0,127}$'`,
    ),
    check(
      "execution_origins_command_fingerprint_check",
      sql`${table.commandFingerprint} is null or ${table.commandFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "execution_origins_command_claim_shape_check",
      sql`(
        ${table.commandOperation} is null and
        ${table.commandFingerprint} is null and
        ${table.commandClaimedAt} is null
      ) or (
        ${table.commandOperation} is not null and
        ${table.commandFingerprint} is not null and
        ${table.commandClaimedAt} is not null
      )`,
    ),
    index("execution_origins_cancelled_idx")
      .on(table.tenantKey, table.cancelRequestedAt, table.parentAgentRunId)
      .where(sql`${table.cancelRequestId} is not null`),
  ],
);

/** Immutable authoritative registration of one durable run under its root. */
export const executionRunOrigins = pgTable(
  "execution_run_origins",
  {
    runId: text("run_id").primaryKey(),
    tenantKey: text("tenant_key").notNull(),
    kind: text("kind").notNull(),
    parentAgentRunId: text("parent_agent_run_id").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(executionUtcTimestampDefault),
  },
  (table) => [
    check(
      "execution_run_origins_kind_check",
      sql`${table.kind} = 'mc_chat_parent_run'`,
    ),
    foreignKey({
      name: "execution_run_origins_run_tenant_fk",
      columns: [table.runId, table.tenantKey],
      foreignColumns: [executionRuns.id, executionRuns.tenantKey],
    }).onDelete("cascade"),
    foreignKey({
      name: "execution_run_origins_origin_fk",
      columns: [table.tenantKey, table.kind, table.parentAgentRunId],
      foreignColumns: [
        executionOrigins.tenantKey,
        executionOrigins.kind,
        executionOrigins.parentAgentRunId,
      ],
    }).onDelete("restrict"),
    index("execution_run_origins_root_run_idx").on(
      table.tenantKey,
      table.kind,
      table.parentAgentRunId,
      table.runId,
    ),
  ],
);

export const executionSteps = pgTable(
  "execution_steps",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => executionRuns.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    status: text("status").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    input: jsonb("input").$type<unknown>(),
    output: jsonb("output").$type<unknown>(),
    error: text("error"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(executionUtcTimestampDefault),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(executionUtcTimestampDefault),
  },
  (table) => [
    check(
      "execution_steps_status_check",
      sql`${table.status} in ('pending', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled', 'skipped')`,
    ),
    check("execution_steps_attempt_check", sql`${table.attempt} >= 0`),
    uniqueIndex("execution_steps_run_key_idx").on(table.runId, table.stepKey),
    index("execution_steps_run_status_idx").on(table.runId, table.status),
  ],
);

export const executionEffects = pgTable(
  "execution_effects",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => executionRuns.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    effectKey: text("effect_key").notNull(),
    handlerVersion: integer("handler_version").notNull(),
    definitionVersion: integer("definition_version").notNull(),
    capability: text("capability").notNull(),
    safety: text("safety").notNull(),
    payloadSchemaVersion: integer("payload_schema_version").notNull(),
    payloadFingerprint: text("payload_fingerprint").notNull(),
    policyFingerprint: text("policy_fingerprint").notNull(),
    receiptSchemaVersion: integer("receipt_schema_version").notNull(),
    status: text("status").notNull().default("prepared"),
    attemptCount: integer("attempt_count").notNull().default(0),
    reconcileCount: integer("reconcile_count").notNull().default(0),
    receipt: jsonb("receipt").$type<Record<string, unknown>>(),
    receiptFingerprint: text("receipt_fingerprint"),
    lastErrorCode: text("last_error_code"),
    availableAt: timestamp("available_at")
      .notNull()
      .default(executionUtcTimestampDefault),
    lastAttemptAt: timestamp("last_attempt_at"),
    lastDeadlineAt: timestamp("last_deadline_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(executionUtcTimestampDefault),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(executionUtcTimestampDefault),
  },
  (table) => [
    uniqueIndex("execution_effects_run_step_unique").on(
      table.runId,
      table.stepKey,
    ),
    uniqueIndex("execution_effects_effect_key_unique").on(table.effectKey),
    check(
      "execution_effects_status_check",
      sql`${table.status} in ('prepared', 'retry_wait', 'uncertain', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      "execution_effects_safety_check",
      sql`${table.safety} in ('read_only', 'target_idempotency', 'reconcile_before_replay')`,
    ),
    check(
      "execution_effects_attempt_check",
      sql`${table.attemptCount} >= 0 and ${table.reconcileCount} >= 0`,
    ),
    check(
      "execution_effects_versions_check",
      sql`${table.handlerVersion} > 0 and ${table.definitionVersion} > 0 and ${table.payloadSchemaVersion} > 0 and ${table.receiptSchemaVersion} > 0`,
    ),
    check(
      "execution_effects_step_key_check",
      sql`${table.stepKey} ~ '^[a-z][a-z0-9._-]{0,63}$'`,
    ),
    check(
      "execution_effects_effect_key_check",
      sql`octet_length(${table.effectKey}) between 1 and 512 and ${table.effectKey} !~ '[[:space:]]'`,
    ),
    check(
      "execution_effects_capability_check",
      sql`${table.capability} ~ '^[a-z][a-z0-9._-]{0,127}$'`,
    ),
    check(
      "execution_effects_payload_hash_check",
      sql`${table.payloadFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "execution_effects_policy_hash_check",
      sql`${table.policyFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "execution_effects_receipt_hash_check",
      sql`${table.receiptFingerprint} is null or ${table.receiptFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "execution_effects_error_code_check",
      sql`${table.lastErrorCode} is null or ${table.lastErrorCode} ~ '^[a-z][a-z0-9._-]{0,127}$'`,
    ),
    check(
      "execution_effects_receipt_size_check",
      sql`${table.receipt} is null or (jsonb_typeof(${table.receipt}) = 'object' and octet_length(${table.receipt}::text) <= 16384)`,
    ),
    check(
      "execution_effects_succeeded_receipt_check",
      sql`(${table.status} = 'succeeded') = (${table.receipt} is not null and ${table.receiptFingerprint} is not null)`,
    ),
    index("execution_effects_run_status_idx").on(
      table.runId,
      table.status,
      table.stepKey,
    ),
    index("execution_effects_retry_idx")
      .on(table.availableAt, table.runId)
      .where(sql`${table.status} in ('retry_wait', 'uncertain')`),
  ],
);

/**
 * Generic durable outbox for terminal product projections. One compact row per
 * run is enough: the immutable command and terminal result remain authoritative
 * on execution_runs and are loaded only after a fenced claim.
 */
export const executionTerminalProjections = pgTable(
  "execution_terminal_projections",
  {
    runId: text("run_id")
      .primaryKey()
      .references(() => executionRuns.id, { onDelete: "restrict" }),
    tenantKey: text("tenant_key").notNull(),
    operation: text("operation").notNull(),
    mode: text("mode").notNull(),
    terminalStatus: text("terminal_status").notNull(),
    state: text("state").notNull().default("pending"),
    availableAt: timestamp("available_at")
      .notNull()
      .default(executionUtcTimestampDefault),
    claimCount: integer("claim_count").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseTokenHash: text("lease_token_hash"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    lastAttemptAt: timestamp("last_attempt_at"),
    lastErrorCode: text("last_error_code"),
    projectedAt: timestamp("projected_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(executionUtcTimestampDefault),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(executionUtcTimestampDefault),
  },
  (table) => [
    check(
      "execution_terminal_projections_mode_check",
      sql`${table.mode} in ('canary', 'active')`,
    ),
    check(
      "execution_terminal_projections_terminal_status_check",
      sql`${table.terminalStatus} in ('completed', 'partial', 'failed', 'cancelled')`,
    ),
    check(
      "execution_terminal_projections_state_check",
      sql`${table.state} in ('pending', 'running', 'retry_wait', 'succeeded', 'blocked')`,
    ),
    check(
      "execution_terminal_projections_claim_count_check",
      sql`${table.claimCount} >= 0 and ${table.claimCount} <= 1000000`,
    ),
    check(
      "execution_terminal_projections_scope_check",
      sql`octet_length(${table.tenantKey}) between 1 and 128 and ${table.tenantKey} = lower(${table.tenantKey}) and ${table.tenantKey} ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$' and ${table.operation} ~ '^[a-z][a-z0-9._-]{0,127}$'`,
    ),
    check(
      "execution_terminal_projections_lease_shape_check",
      sql`(
        ${table.state} = 'running' and
        ${table.leaseOwner} is not null and
        ${table.leaseTokenHash} is not null and
        ${table.leaseExpiresAt} is not null
      ) or (
        ${table.state} <> 'running' and
        ${table.leaseOwner} is null and
        ${table.leaseTokenHash} is null and
        ${table.leaseExpiresAt} is null
      )`,
    ),
    check(
      "execution_terminal_projections_lease_owner_check",
      sql`${table.leaseOwner} is null or (octet_length(${table.leaseOwner}) between 1 and 160 and ${table.leaseOwner} !~ '[[:cntrl:]]')`,
    ),
    check(
      "execution_terminal_projections_lease_hash_check",
      sql`${table.leaseTokenHash} is null or ${table.leaseTokenHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "execution_terminal_projections_error_code_check",
      sql`${table.lastErrorCode} is null or ${table.lastErrorCode} ~ '^[a-z][a-z0-9._-]{0,127}$'`,
    ),
    check(
      "execution_terminal_projections_error_state_check",
      sql`(
        ${table.state} in ('retry_wait', 'blocked') and
        ${table.lastErrorCode} is not null
      ) or (
        ${table.state} in ('pending', 'succeeded') and
        ${table.lastErrorCode} is null
      ) or ${table.state} = 'running'`,
    ),
    check(
      "execution_terminal_projections_attempt_shape_check",
      sql`(
        ${table.claimCount} = 0 and ${table.lastAttemptAt} is null
      ) or (
        ${table.claimCount} > 0 and ${table.lastAttemptAt} is not null
      )`,
    ),
    check(
      "execution_terminal_projections_projected_check",
      sql`(${table.state} = 'succeeded') = (${table.projectedAt} is not null)`,
    ),
    index("execution_terminal_projections_claim_idx")
      .on(
        table.tenantKey,
        table.operation,
        table.mode,
        table.availableAt,
        table.createdAt,
        table.runId,
      )
      .where(sql`${table.state} in ('pending', 'retry_wait')`),
    index("execution_terminal_projections_stale_lease_idx")
      .on(table.tenantKey, table.operation, table.mode, table.leaseExpiresAt)
      .where(sql`${table.state} = 'running'`),
    index("execution_terminal_projections_runnable_scope_idx")
      .on(table.operation, table.mode, table.tenantKey)
      .where(sql`${table.state} in ('pending', 'retry_wait', 'running')`),
    index("execution_terminal_projections_blocked_idx")
      .on(table.updatedAt, table.operation, table.mode, table.tenantKey)
      .where(sql`${table.state} = 'blocked'`),
    index("execution_terminal_projections_blocked_scope_idx")
      .on(table.operation, table.mode, table.tenantKey)
      .where(sql`${table.state} = 'blocked'`),
  ],
);

/**
 * Product-owned, immutable read model for the bounded native Leads search
 * canary. The generic Ledger owns execution state; this table owns only the
 * user-visible terminal search result. Insert-only projection by run id makes
 * stale terminal deliveries harmless and detects divergent replays.
 */
export const leadsSearchProjections = pgTable(
  "leads_search_projections",
  {
    runId: text("run_id")
      .primaryKey()
      .references(() => executionRuns.id, { onDelete: "restrict" }),
    tenantKey: text("tenant_key").notNull(),
    terminalStatus: text("terminal_status").notNull(),
    candidateCount: integer("candidate_count").notNull().default(0),
    result: jsonb("result").$type<Record<string, unknown>>(),
    projectionFingerprint: text("projection_fingerprint").notNull(),
    projectedAt: timestamp("projected_at")
      .notNull()
      .default(executionUtcTimestampDefault),
  },
  (table) => [
    check(
      "leads_search_projections_tenant_check",
      sql`octet_length(${table.tenantKey}) between 1 and 128 and ${table.tenantKey} = lower(${table.tenantKey}) and ${table.tenantKey} ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$'`,
    ),
    check(
      "leads_search_projections_status_check",
      sql`${table.terminalStatus} in ('completed', 'partial', 'failed', 'cancelled')`,
    ),
    check(
      "leads_search_projections_candidate_count_check",
      sql`${table.candidateCount} between 0 and 10`,
    ),
    check(
      "leads_search_projections_result_check",
      sql`(
        ${table.terminalStatus} = 'completed' and
        ${table.result} is not null and
        jsonb_typeof(${table.result}) = 'object' and
        octet_length(${table.result}::text) <= 16384
      ) or (
        ${table.terminalStatus} in ('partial', 'failed', 'cancelled') and
        ${table.result} is null and
        ${table.candidateCount} = 0
      )`,
    ),
    check(
      "leads_search_projections_fingerprint_check",
      sql`${table.projectionFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    index("leads_search_projections_tenant_projected_idx").on(
      table.tenantKey,
      desc(table.projectedAt),
      desc(table.runId),
    ),
  ],
);

export const executionEvents = pgTable(
  "execution_events",
  {
    sequence: bigserial("sequence", { mode: "number" }).notNull(),
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => executionRuns.id, { onDelete: "cascade" }),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    traceId: text("trace_id"),
    type: text("type").notNull(),
    ts: timestamp("ts").notNull().default(executionUtcTimestampDefault),
    data: jsonb("data").$type<unknown>(),
  },
  (table) => [
    index("execution_events_run_sequence_idx").on(table.runId, table.sequence),
    index("execution_events_aggregate_sequence_idx").on(
      table.aggregateType,
      table.aggregateId,
      table.sequence,
    ),
    index("execution_events_trace_idx").on(table.traceId),
    index("execution_events_ts_idx").on(table.ts),
  ],
);
