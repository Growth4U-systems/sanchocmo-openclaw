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

export type TaskStatus = "todo" | "ready" | "in_progress" | "in-progress" | "done" | "completed" | "blocked" | "pending" | "discarded" | "cancelled";
export type TaskType = "content" | "outreach" | "foundation" | "research" | "analysis" | "execution" | "tool";

export interface Task {
  id: string;               // "P01-T01"
  name: string;
  description: string;
  deliverable: string;
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
  discord_thread_id?: string;
  idea_ids?: string[];      // Linked ideas
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
