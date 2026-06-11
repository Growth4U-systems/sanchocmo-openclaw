// ============================================================
// Mission Control — Data Models
// Ported from Google Doc section 7 (2026-04-02)
// ============================================================

// --- Projects ---

export type ProjectStatus = "todo" | "active" | "completed" | "blocked" | "archived" | "cancelled" | "discarded" | "in-progress";

export interface Project {
  id: string;               // "P00-Fast-Foundation", "P01"
  slug: string;             // URL-friendly name
  name: string;
  strategy: string;         // Strategic category
  status: ProjectStatus;
  phase: number;            // -1 for foundation, 0+
  category: string;         // "foundation", etc.
  created_at: string;       // ISO8601
  review_date: string | null;
  blocked_by?: string;      // Project ID
  /** Canonical compact task brief. Legacy fields below remain during migration. */
  brief?: string;
  /** Canonical completion/evidence contract. Replaces most deliverable + done criteria usage. */
  completion?: string;
  /** Optional notes that override or constrain the selected skill. */
  execution_notes?: string;
  description?: string;
  agent?: string;
  skill?: string;
  skills?: string[];
  input_documents?: { path: string; name?: string; title?: string; source?: string }[];
  required_inputs?: { id: string; label: string; kind?: string; optional?: boolean; source?: string }[];
  output_documents?: { path: string; name?: string; title?: string; source?: string }[];
  objective?: string | { description?: string; metric?: string; baseline?: number; target?: number; unit?: string };
  approach?: string;
  archive_reason?: string;
  tool?: string;              // Research tool: "trust-engine", "atalaya", etc.
}

export interface ProjectRegistry {
  version: string;
  created_at: string;
  strategic_plan: string;
  projects: Project[];
}

// --- Tasks ---

/**
 * Task status — hardcoded canonical vocabulary (2026-04-15).
 *
 * Only these 5 values are valid. Sancho (and any code path writing to
 * tasks.json) MUST use one of these — no aliases, no creative naming.
 * Enforced at runtime by:
 *   - `src/lib/data/pillar-task-sync.ts` → `setTaskStatus` helper
 *   - `src/pages/api/projects/task-status.ts` → MC API
 *   - `~/.openclaw/workspace-sancho/scripts/update-task-status.py` → CLI
 *
 * If someone writes `"ready"` or `"pending"` directly to tasks.json, the
 * reconcile pass in `reconcilePillarTasks` will (when it runs) bring the
 * task back to `todo` — because non-canonical values fall through to the
 * default bucket.
 */
export type TaskStatus =
  | "todo"
  | "in-progress"
  | "completed"
  | "blocked"
  | "cancelled";

/** Runtime allowlist — mirror of the TaskStatus type for validation. */
export const VALID_TASK_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in-progress",
  "completed",
  "blocked",
  "cancelled",
] as const;
export type TaskType =
  | "project"
  | "content"
  | "outreach"
  | "foundation"
  | "research"
  | "analysis"
  | "execution"
  | "tool"
  | "media"
  | "Media"
  | "content_task"
  /** @deprecated ContentTask is the canonical name; kept only for legacy rows. */
  | "content_subtask";

export interface Task {
  id: string;               // "P01-T01"
  name: string;
  /** Canonical compact task brief. Legacy fields below remain during migration. */
  brief?: string;
  /** Canonical completion/evidence contract. Replaces most deliverable + done criteria usage. */
  completion?: string;
  /** Optional notes that override or constrain the selected skill. */
  execution_notes?: string;
  description: string;
  deliverable: string;       // Human-readable description ("market-and-us/competitors/ con fichas...")
  /**
   * Concrete file path(s) that this task produces, relative to brand/{slug}/.
   * Used by the UI to wire the "Open document" button to the actual file
   * the skill writes (which may NOT be `current.md` — e.g. the
   * competitor-intelligence skill writes `competitive-analysis.current.md`).
   *
   * If absent, the UI falls back to `output_files`, then to the foundation
   * pillar's `output_file`, then to the static `PILLAR_DOC_PATHS` map.
   * Single string for one file, array for multiple deliverables.
   */
  deliverable_file?: string | string[];
  done_criteria: string;
  depends_on: string | null;
  owner: string;            // "Sancho" | "Equipo"
  agent?: string;           // Canonical executing agent slug
  status: TaskStatus;
  channel: string;          // "web", "content", "intelligence"...
  type: TaskType;
  batch_type?: string;      // Legacy fallback for type
  skill: string;
  skills?: string[];        // Canonical skill contract. `skill` remains primary.
  input_documents?: { path: string; name?: string; title?: string; source?: string }[];
  required_inputs?: { id: string; label: string; kind?: string; optional?: boolean; source?: string }[];
  output_documents?: { path: string; name?: string; title?: string; source?: string }[];
  pillar?: string;          // Foundation only
  section?: string;         // Foundation only
  completed?: string;       // ISO8601
  output_files: string[];
  documents?: { path: string; name?: string; title?: string; status?: string; created_at?: string }[];
  /**
   * Everything the thread accumulates: primary deliverable, skill intermediate
   * outputs, user-uploaded files, generated images. Populated via 3 channels:
   *   1. Discord plugin hook on inbound attachments
   *   2. Skill execution wrapper on outbound file writes
   *   3. Manual API call to `POST /api/projects/task-attach`
   * See `execution-gate.md` Fase B.2 + MC CHANGELOG [2.10.6].
   */
  attachments?: TaskAttachment[];
  discord_thread_id?: string;
  mc_chat_thread_id?: string;
  idea_ids?: string[];      // Linked ideas
  /**
   * Nested ContentTask children. Only meaningful when `type === "content"` —
   * for any other task type this field is empty/absent and validators reject
   * non-empty values. Each child represents one approved idea moving through
   * the redacción pipeline (research → clarify → draft → review → ready → published).
   */
  content_tasks?: ContentTask[];
}

export type ProjectTask = Project & { type: "project"; parent_id?: null };
export type ChildTask = Task & { type: Exclude<TaskType, "project" | "content_task" | "content_subtask">; parent_id?: string };
export type ContentTaskRow = ContentTask & { type: "content_task"; parent_id?: string | null };
/** @deprecated Use ContentTaskRow. ContentTask is the product/domain name. */
export type ContentSubtask = ContentTask & { type: "content_subtask"; parent_id?: string | null };


/**
 * Status canónicos para una `ContentTask` (sub-task del Content Engine).
 *
 * Regla: cada estado describe **qué está pendiente / quién actúa próximo**.
 * Los terminales son `Published` y `Discarded`; `Deferred` permite reactivar.
 *
 * - `New`: idea creada, pendiente que el usuario apruebe o descarte.
 * - `Approved`: idea aprobada; sistema produciendo el draft. `pipeline_state`
 *   refleja la fase: `researching` → `clarify-needed` → `drafting`. La
 *   transición a `Draft` es automática al terminar el draft.
 * - `Draft`: texto listo, pendiente review del usuario. La iteración del draft
 *   ocurre dentro del thread del contenido (chat-driven), sin transición.
 * - `Pending Media`: usuario aprobó el texto. Fase de media. `pipeline_state`:
 *   `generating-media` (sin media aún) → `media-review` (media añadida,
 *   pendiente OK del usuario).
 * - `Ready`: usuario aprobó la pieza completa, queue de publicación.
 * - `Published`: publicado (terminal).
 * - `Discarded`: descartado (terminal, alcanzable desde cualquier estado).
 * - `Deferred`: pospuesto, vuelve al pool sin publicar.
 */
export type ContentTaskStatus =
  | "New"
  | "Approved"
  | "Draft"
  | "Pending Media"
  | "Ready"
  | "Published"
  | "Discarded"
  | "Deferred";

/** Runtime allowlist — mirror of ContentTaskStatus for validation. */
export const VALID_CONTENT_TASK_STATUSES: readonly ContentTaskStatus[] = [
  "New",
  "Approved",
  "Draft",
  "Pending Media",
  "Ready",
  "Published",
  "Discarded",
  "Deferred",
] as const;

/**
 * Sub-estado visible en UI durante las fases en las que el sistema o el
 * usuario tienen una acción pendiente sub-granular:
 *  - `status === "Approved"`: `researching` → `clarify-needed` → `drafting`
 *    (controlado por la skill writer).
 *  - `status === "Pending Media"`: `generating-media` (sin media aún) →
 *    `media-review` (media añadida, pendiente aprobación del usuario).
 */
export type ContentTaskPipelineState =
  | "researching"
  | "clarify-needed"
  | "drafting"
  | "generating-media"
  | "media-review";

export const VALID_CONTENT_TASK_PIPELINE_STATES: readonly ContentTaskPipelineState[] = [
  "researching",
  "clarify-needed",
  "drafting",
  "generating-media",
  "media-review",
] as const;

/**
 * Per-channel work phase tracked under `ContentTask.channel_phases`. Replaces
 * the legacy per-draft `meta.status` frontmatter field — `tasks.json` is the
 * single source of truth for "what phase is this channel in". Updated by the
 * writer skill via `PATCH /api/content-engine/content-tasks` (curl from the
 * agent prompt) and by the publishing endpoints on dispatch confirmation.
 */
export type ChannelPhase =
  | "researching"
  | "clarify-needed"
  | "drafting"
  | "draft"
  | "approved"
  | "published";

export const VALID_CHANNEL_PHASES: readonly ChannelPhase[] = [
  "researching",
  "clarify-needed",
  "drafting",
  "draft",
  "approved",
  "published",
] as const;

/**
 * `ContentTask`: tarea anidada bajo una task `type: "content"` (la task del
 * día creada por Editorial Dispatch). Cada idea aprobada se convierte en una
 * ContentTask con su propio thread, skill y documentos (drafts).
 *
 * Constraint: `parent_task_id` SOLO puede apuntar a una `Task` con
 * `type: "content"`. Validar en `setContentTaskStatus` y endpoints.
 */
export interface ContentTask {
  id: string;                       // "P-Content-Semana-18-T01-C01" or "CT-{slug}-{YYYY-MM-DD}-{n}" for orphans
  /**
   * Parent task with `type=content`. Optional: when a ContentTask is created
   * from a research signal it lives orphaned (`status=New`) until the user
   * approves it and Editorial Dispatch attaches it to a weekly parent.
   */
  parent_task_id?: string;
  /**
   * Storage key for per-channel drafts: `brand/{slug}/content/drafts/{idea_id}/`.
   * For legacy ContentTasks created from a separate idea, this points at the
   * source `idea-{date}-{n}` ID. For unified ContentTasks (where the CT IS the
   * idea), this equals `id`. Kept required so existing draft paths keep
   * resolving.
   */
  idea_id: string;
  name: string;
  status: ContentTaskStatus;
  brief?: string;
  completion?: string;
  execution_notes?: string;
  pipeline_state?: ContentTaskPipelineState;  // Visible during status === "Approved" or "Pending Media"
  /**
   * Per-channel work phase. Keys are channel ids from `target_channels`. The
   * writer skill PATCHes this as it progresses (researching → clarify-needed
   * → drafting → draft). Publishing flips entries to `approved`/`published`.
   * Single source of truth for per-channel state — replaces the deprecated
   * draft frontmatter `status` field.
   */
  channel_phases?: Record<string, ChannelPhase>;
  /**
   * Per-channel media requirement. When `"required"`, the publish endpoint
   * refuses to send the post to the provider with empty `media[]`, and the UI
   * blocks the channel from advancing to `approved` until media is attached.
   * Default per channel is `"optional"` (legacy behavior). Set by the writer
   * skill when the plan calls for a carousel, thread with visuals, image post,
   * etc.
   */
  media_policy?: Record<string, "required" | "optional">;
  clarify_status?: "pending" | "answered" | "skipped";
  skill?: string;                   // social-writer | seo-content | instagram-content | newsletter — assigned at Approved
  agent?: string;                   // Canonical executing agent slug
  skills?: string[];
  input_documents?: { path: string; name?: string; title?: string; source?: string }[];
  required_inputs?: { id: string; label: string; kind?: string; optional?: boolean; source?: string }[];
  output_documents?: { path: string; name?: string; title?: string; source?: string }[];
  target_channels: string[];        // ["linkedin", "twitter"] — drafts produced for these
  documents: { path: string; name?: string; channel?: string }[];
  mc_chat_thread_id?: string;
  discord_thread_id?: string;
  owner?: string;                   // "Dulcinea"
  created_at: string;               // ISO8601
  updated_at?: string;
  approved_at?: string;
  pending_media_at?: string;        // Set when user approves draft text and CT enters Pending Media
  published_at?: string;
  discarded_at?: string;
  deferred_at?: string;
  // ---- Discovery-phase fields (inherited from legacy Idea) ----
  /** Scannable 40-90 char headline. UI falls back to first sentence of angle_draft if absent. */
  title?: string;
  /** Content pillar: P1, P2, ... */
  pillar_id?: string;
  /** Hot Take, Proof Post, Framework, Personal Story, ... */
  content_type?: string;
  /** Original target channel from the research cron. After approval expands into `target_channels`. */
  target_channel?: string;
  /** Research signal that triggered this CT. */
  signal?: { summary: string; source: string; url?: string; date: string };
  /** Brand POV paragraph (60-80 words). */
  angle_draft?: string;
  /** 0.0-1.0 confidence in the angle. */
  pov_confidence?: number;
  /** Tags for the kind of signal: contrarian, data-point, framework, ... */
  signal_type?: string[];
  /** References to research-signals/{date}-*.json entries. */
  source_signals?: string[];
  /** When Editorial Dispatch picked this CT for a slot. */
  dispatch_date?: string;
  dispatch_slot?: string;
  archived_at?: string;
  archived_via?: string;
  archived_by?: string;
  approved_via?: string;
  approved_by?: string;
  deferred_by?: string;
  target_date?: string;
  /**
   * @deprecated Use `draft.meta.publishing.scheduled_at` (per-channel) as the
   * single source of truth for when a post is scheduled. This CT-level field
   * was decorative — no publishing flow read it. Kept in the type so existing
   * tasks.json files don't fail to parse; UI no longer surfaces it.
   */
  scheduled_for?: string;
  /**
   * Per-channel draft status. Computed server-side by reading the frontmatter
   * `status` of each `brand/{slug}/content/drafts/{idea_id}/{channel}.md`.
   * Channels without a draft on disk default to `"pending"`. Used by the
   * kanban card to render a chip per channel and decide which column the
   * card lives in (status of the least-advanced channel wins).
   */
  draft_statuses?: Record<string, string>;
  /**
   * Repurposing lineage (SAN-141): set by content-atomizer when this piece
   * was derived from a piece in another channel. Powers the "♻️ derivado"
   * badge and the repurposing strip in the Canales view.
   */
  derived_from?: { idea_id: string; channel: string; title?: string };
}

// ─── Channel loops (SAN-141) ────────────────────────────────────────────────
// Per-channel loop state for the 📡 Canales view. ALWAYS derived at request
// time by /api/content-engine/channel-loops from idea-queue, channel_phases,
// cadence-config, drafts and crons — never persisted (a stored copy would
// drift from the sources of truth).

export type ChannelMode = "scheduled" | "always-on";

export interface ChannelLoopAntenna {
  baseName: string;
  jobId: string | null;
  enabled: boolean;
  schedule: string | null;
  lastRunAt: string | null;
  finding: string | null;
  count: number | null;
  status: string | null;
}

export interface ChannelLoopState {
  channel: string;
  label: string;
  active: boolean;
  mode: ChannelMode;
  cadence: { frequency: string; bestDays: string[]; bestTimes: string[] };
  /** Brand-relative path of the per-channel strategy doc, null when not configured. */
  strategyDoc: string | null;
  strategyDocExists: boolean;
  metricsProvider: "metricool" | "gsc-pending" | "none" | string;
  primaryKpi: string | null;
  stages: {
    antennas: { enabled: number; total: number; hasError: boolean; lastRunAt: string | null };
    ideation: { newCount: number; approvedCount: number };
    creation: { draftingCount: number; clarifyCount: number; readyCount: number; pendingMediaCount: number };
    published: { thisMonth: number; nextSlot: string | null };
    metrics: {
      provider: string;
      /** Average engagement % across published snapshots, null when unavailable. */
      engagementPct: number | null;
      impressions30d: number | null;
      postsWithMetrics: number;
      /** Search Console aggregates for the blog channel (SAN-161). Present
       *  only when the gsc data source is connected and has daily files —
       *  otherwise the UI keeps the honest "pendiente" state. */
      gsc?: {
        clicks30d: number;
        impressions30d: number;
        avgPosition: number | null;
        /** Previous 30-day window for the trend delta. Null without history. */
        prevClicks30d: number | null;
        prevImpressions30d: number | null;
      } | null;
    };
  };
  nextAction: { label: string; tab: "ideas" | "calendar" | "setup"; focusStatus?: string } | null;
  repurposing: { incoming: number; outgoing: number };
  antennas: ChannelLoopAntenna[];
}

export interface RepurposeEntry {
  fromChannel: string;
  fromTitle: string;
  toChannel: string;
  toTitle: string;
  toStatus: string;
  toId: string;
}

export interface ChannelLoopsPayload {
  ok: boolean;
  channels: ChannelLoopState[];
  repurposing: RepurposeEntry[];
  /** Cross-channel connection states the Setup checklist reflects (SAN-161). */
  connections: { gsc: boolean };
  verifiedAt: string;
}

/** One artifact attached to a task — doc, image, csv, json, etc. */
export interface TaskAttachment {
  /** Brand-relative path, e.g. `brand/growth4u/projects/P01-.../tasks/P01-T08/attachments/foo.md` */
  path: string;
  /** MIME type — `image/png`, `text/markdown`, `application/json`, ... */
  type?: string;
  /** Where it came from: `discord`, `skill:<skill-id>`, `manual`, `upload` */
  source?: string;
  /** Short human-readable label, e.g. "Screenshot enviado por Alfonso". */
  label?: string;
  /** ISO-8601 timestamp. */
  added_at: string;
  /** User id / agent id who added it. */
  added_by?: string;
}

export interface TaskFile {
  project_id: string;
  tasks: Task[];
}

// --- Ideas ---

export type IdeaStatus = "new" | "approved" | "rejected" | "executed" | "pool" | "assigned" | "in_progress" | "done";
export type IdeaType = "content" | "contact";
export type IdeaList = "keywords" | "trending" | "gaps" | "repurpose" | "medios" | "partners" | "influencers" | "outreach";

export interface Piece {
  id: string;
  channel: string;
  title: string;
  status: string;
  created_at: string;
}

export interface Idea {
  id: string;               // UUID
  type: IdeaType;
  status: IdeaStatus;
  title: string;
  description: string;
  action: string;           // Concrete next step
  list: IdeaList;           // Group: keywords, trending, gaps, etc.
  category: string;         // "guide", "comparison", "solution"...
  source: string;           // "trust_engine", "keyword_research"...
  goal: string;             // "awareness", "consideration", "conversion"
  theme: string;            // "educativo", "comparativo"...
  channels: string[];       // Normalized multi-channel
  channels_suggested: string[];  // Legacy compat
  target_channel: string;   // For contact ideas
  priority_score: number;   // 0-100
  ecp_relevance: string[];
  source_data: Record<string, unknown>;
  created_at: string;
  task_id: string | null;
  approved_at: string | null;
  approved_by: string | null;
  notes: string;
  project_ids: string[];
  pieces: Piece[];
  updated_at: string;
}

export interface IdeaFile {
  ideas: Idea[];
}

// --- Recommendations ---

export type RecommendationStatus = "pending" | "approved" | "dismissed" | "converted";

export interface Recommendation {
  id: string;
  source: string;
  type: string;               // optimize | investigate | launch | pause | escalate | content_idea | outreach_task | operational
  priority: string;           // high | medium | low
  title: string;
  description: string;
  rationale: string;
  content?: { channels?: string[]; format?: string };
  contact?: Record<string, unknown>;
  operational?: {
    linked_project: string | null;
    linked_metric: string | null;
    suggested_action: string;
  };
  linked_metric?: string;
  linked_project?: string;
  linkedProject?: string;
  suggested_action?: string;
  status: RecommendationStatus;
  created_at: string;
  approved_at?: string;
  actioned_at?: string;
  converted_to?: string | null;
  converted_to_task?: string;
  converted_to_project?: string;
  source_crons?: string[];
  pieces?: Array<{ title: string; channel?: string; description?: string }>;
  _file?: string;
}

// --- Foundation ---

export type PillarStatus = "not-started" | "in-progress" | "approved" | "request-refresh" | "pending-review" | "generated" | "request-changes";

export interface Pillar {
  status: PillarStatus;
  completed_at?: string;
  approved_at?: string;
  output_file?: string;
  output_files?: string[];
  skill?: string;
  layer?: number;
  requires: string[];
  enriches_with: string[];
  optional?: boolean;
}

export interface Synthesis {
  status: PillarStatus;
  output_file?: string;
  requires: string[];
}

export interface Section {
  status: PillarStatus;
  layer: number;            // 0-5
  output_dir: string;
  skill?: string;
  approved_at?: string;
  requires: string[];
  enriches_with: string[];
  pillars?: Record<string, Pillar>;
  syntheses?: Record<string, Synthesis>;
}

export interface BrandSummary {
  company_name: string;
  sector: string;
  description: string;
  north_star: string;
  icps: string[];
  competitors: string[];
  positioning: string;
}

export interface BrandBrainState {
  version: string;          // "3.0"
  started_at: string;
  updated_at: string;
  brand_summary: BrandSummary;
  sections: Record<string, Section>;
  presentations: { name: string; file: string; type: string; section: string }[];
}

/** @deprecated Use BrandBrainState. Kept during rename transition. */
export type FoundationState = BrandBrainState;

// --- Client ---

export type UserRole = "admin" | "client";

export interface Client {
  slug: string;
  name: string;
  emoji?: string;
  url?: string;
  email?: string;
  language?: string;        // "es", "en"
  active: boolean;
  guild?: string;           // Discord guild ID
  workspace: string;        // Path
  phase: number;
  paths: { brand: string; campaigns?: string };
  mcToken?: string;         // Portal access token
  channels?: { insights: string };
  metrics: { apis: string[]; meta_ads?: Record<string, unknown>; ghl?: Record<string, unknown> };
  enabledFeatures?: string[];
  [key: string]: unknown;   // Legacy fields
}

// --- Chat ---

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ChatThread {
  id: string;
  name: string;
  status: "open" | "closed";
  linkedTo: string;
  skill: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

// --- Integrations ---

export interface DataSource {
  provider: string;         // "meta_ads", "ga4", "gsc", "ghl"
  status: "connected" | "disconnected" | "error";
  config: Record<string, string>;
  envVars: string[];
  lastTestedAt: string;
}

export interface SlackIntegration {
  status: "connected" | "disconnected" | "error";
  team_id: string;          // Slack workspace ID (T012345)
  team_name: string;
  bot_user_id: string;      // U012345
  bot_token_encrypted: string;
  scope: string;            // Comma-separated granted scopes
  authed_user_id: string;   // User who authorized
  installed_at: string;     // ISO8601
  last_error?: string;
}

export interface Integration {
  client: string;
  dataSources: Record<string, DataSource>;
  metricsSheet?: { spreadsheetId: string; folderId: string; url: string };
  slack?: SlackIntegration;
  updatedAt: string;
}

// --- Recurring Tasks / Cron ---

export interface RecurringTask {
  id: string;
  name: string;
  slug: string;
  skill: string;
  schedule: string;         // Cron expression
  active: boolean;
  status?: "active" | "paused";
  prompt: string;
  created_at: string;
  updated_at: string;
  _source?: string;         // "openclaw-cron" if managed by openclaw
  ideas_generated?: number;
  [key: string]: unknown;   // Legacy fields
}

export interface CronOutput {
  cronId: string;
  cronName: string;
  slug: string;
  date: string;             // YYYY-MM-DD
  runAtMs: number;
  status: "ok" | "error";
  durationMs: number;
  model: string;
  content: string;          // Markdown
}

// --- Strategies ---

export interface Strategy {
  id: string;
  name: string;
  description: string;
  skill: string;
  category: string;
  score?: number;
  status: "active" | "planned" | "completed" | "archived";
}
