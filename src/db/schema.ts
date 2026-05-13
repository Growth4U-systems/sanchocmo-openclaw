import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
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
  discordThreadId: text("discord_thread_id"),

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
