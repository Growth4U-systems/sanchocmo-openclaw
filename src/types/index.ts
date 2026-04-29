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
  description?: string;
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
export type TaskType = "content" | "outreach" | "foundation" | "research" | "analysis" | "execution" | "tool";

export interface Task {
  id: string;               // "P01-T01"
  name: string;
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
  status: TaskStatus;
  channel: string;          // "web", "content", "intelligence"...
  type: TaskType;
  batch_type?: string;      // Legacy fallback for type
  skill: string;
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

/**
 * Status canónicos para una `ContentTask` (sub-task del Content Engine).
 *
 * Estos estados NO son los `TaskStatus` generales — el flujo de redacción
 * tiene su propio ciclo de vida. La transición es lineal con dos terminales
 * (`Published` y `Discarded`), más `Deferred` que vuelve la idea a la queue.
 *
 * - `New`: idea recién generada por el cron Idea Builder, con angle.
 * - `Approved`: aprobada (Slack/Discord/UI). El pipeline (deep-research →
 *   Clarify → writing) corre durante este estado. Para visibilidad usa el
 *   sub-estado `pipeline_state` ("researching" | "clarify-needed" | "drafting").
 * - `Draft`: drafts iniciales generados, listos para iterar.
 * - `Media`: drafts listos pero esperando media (imagen, video, carrusel).
 * - `Review`: todo listo (texto + media), esperando sign-off final.
 * - `Ready`: aprobado para publicar, fecha asignada (queda esperando fase 6).
 * - `Published`: publicado.
 * - `Discarded`: descartado ("Rechazar" en Slack o manual).
 * - `Deferred`: "Más tarde" en Slack — vuelve al pool sin publicar hoy.
 */
export type ContentTaskStatus =
  | "New"
  | "Approved"
  | "Draft"
  | "Media"
  | "Review"
  | "Ready"
  | "Published"
  | "Discarded"
  | "Deferred";

/** Runtime allowlist — mirror of ContentTaskStatus for validation. */
export const VALID_CONTENT_TASK_STATUSES: readonly ContentTaskStatus[] = [
  "New",
  "Approved",
  "Draft",
  "Media",
  "Review",
  "Ready",
  "Published",
  "Discarded",
  "Deferred",
] as const;

/**
 * Sub-estado visible en UI mientras `status === "Approved"` y la skill de
 * Escudero Content corre el pipeline. Permite renderizar un badge concreto
 * sin inflar el enum principal con estados de minutos/horas.
 */
export type ContentTaskPipelineState =
  | "researching"
  | "clarify-needed"
  | "drafting";

/**
 * `ContentTask`: tarea anidada bajo una task `type: "content"` (la task del
 * día creada por Editorial Dispatch). Cada idea aprobada se convierte en una
 * ContentTask con su propio thread, skill y documentos (drafts).
 *
 * Constraint: `parent_task_id` SOLO puede apuntar a una `Task` con
 * `type: "content"`. Validar en `setContentTaskStatus` y endpoints.
 */
export interface ContentTask {
  id: string;                       // "P-Content-Semana-18-T01-C01"
  parent_task_id: string;           // "P-Content-Semana-18-T01" — must be type=content
  idea_id: string;                  // Linked idea in idea-queue.json
  name: string;
  status: ContentTaskStatus;
  pipeline_state?: ContentTaskPipelineState;  // Visible only while status === "Approved"
  clarify_status?: "pending" | "answered" | "skipped";
  skill: string;                    // social-writer | seo-content | instagram-content | newsletter
  target_channels: string[];        // ["linkedin", "twitter"] — drafts produced for these
  documents: { path: string; name?: string; channel?: string }[];
  mc_chat_thread_id?: string;
  discord_thread_id?: string;
  owner?: string;                   // "Escudero Content"
  created_at: string;               // ISO8601
  updated_at?: string;
  approved_at?: string;
  published_at?: string;
  discarded_at?: string;
  deferred_at?: string;
  scheduled_for?: string;           // Set when status moves to Ready
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

export interface FoundationState {
  version: string;          // "3.0"
  started_at: string;
  updated_at: string;
  brand_summary: BrandSummary;
  sections: Record<string, Section>;
  presentations: { name: string; file: string; type: string; section: string }[];
}

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
  supabase: { url: string; anon_key: string };
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

export interface Integration {
  client: string;
  dataSources: Record<string, DataSource>;
  metricsSheet?: { spreadsheetId: string; folderId: string; url: string };
  updatedAt: string;
}

// --- Atalaya ---

export interface AtalayaProfile {
  id: string;
  platform: "linkedin" | "twitter" | "instagram";
  url: string;
  handle?: string;
  name?: string;
  category: string;         // "Growth", "Founder", "SEO", "AI"...
  active: boolean;
  added_at: string;
}

export interface AtalayaConfig {
  followed_profiles: AtalayaProfile[];
  channels_to_monitor: Record<string, string[]>;
}

export interface AtalayaReport {
  run_date: string;
  mode: string;
  client_slug: string;
  trigger: "manual" | "cron";
  competitors_analyzed: {
    name: string;
    slug: string;
    channels_scraped: Record<string, {
      status: string;
      items_found: number;
      content: { full_text: string; date: string; is_new: boolean }[];
    }>;
  }[];
  followed_profiles_analyzed: {
    name: string;
    platform: string;
    url: string;
    category: string;
    content: Record<string, unknown>[];
  }[];
  ideas_generated: {
    id: string;
    source_type: string;
    pattern_identified: string;
    adapted_idea: Record<string, unknown>;
  }[];
  contacts_detected: {
    name: string;
    platform: string;
    url: string;
    relevance: string;
  }[];
  comparison_with_last_run: {
    last_run_date: string;
    new_items_by_channel: Record<string, unknown>;
    notable_changes: string[];
  };
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
