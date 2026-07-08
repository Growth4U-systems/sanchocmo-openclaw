/**
 * Tipos del cliente para el daemon de Open Design (https://github.com/nexu-io/open-design,
 * Apache-2.0). Reflejan la API REST/SSE expuesta en localhost:7456 sin importar el package
 * `@open-design/contracts` directamente — MC habla con OD por HTTP, no por imports.
 */

// ---------------------------------------------------------------------------
// REST resources
// ---------------------------------------------------------------------------

export interface OdSkill {
  id: string;
  name: string;
  description?: string;
  /** "template" | "design-system" | "prototype" | "deck" | "audit" | "infra" | "research" ... */
  mode?: string;
  /** Output surface: "video" | "html" | "deck" | "image" | "audio" | "web" ... */
  surface?: string;
  /** "desktop" | "web" | "mobile" | "tablet" | "auto" */
  platform?: string;
  /** "planning" | "operations" | "review" | ... */
  scenario?: string;
  /** "html" | "image" | "audio" | "deck" | ... */
  previewType?: string;
  designSystemRequired?: boolean;
  craftRequires?: string[];
  triggers?: string[];
  defaultFor?: string[];
  /** Upstream skill ID this one extends, if any. */
  upstream?: string | null;
  /** Path absoluto al SKILL.md upstream (enriquecido server-side). */
  filePath?: string;
}

export interface OdDesignSystem {
  id: string;
  /** Display title (camelCase from daemon: `title`). */
  title?: string;
  /** Fallback to title for backwards compat. */
  name?: string;
  /** "Themed & Unique" | "Brand" | "Pattern" ... */
  category?: string;
  summary?: string;
  /** 4 hex codes for swatch preview. */
  swatches?: string[];
  /** "web" | "deck" | "mobile" | ... */
  surface?: string;
  /** "built-in" | "user" */
  source?: string;
  filePath?: string;
}

export interface OdPromptTemplate {
  id: string;
  title?: string;
  name?: string;
  summary?: string;
  /** "image" | "video" | "audio" */
  surface?: "image" | "video" | "audio";
  /** Legacy alias for surface. */
  category?: "image" | "video" | "audio" | string;
  tags?: string[];
  source?: { repo?: string; license?: string; author?: string };
  thumbnail?: string;
  filePath?: string;
}

export interface OdCraftGuide {
  id: string;
  name: string;
  summary?: string;
  filePath: string;
}

export interface OdProject {
  id: string;
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  metadata: {
    kind?: string;
    baseDir?: string;
    importedFrom?: string;
    entryFile?: string;
  };
  createdAt: number;
  updatedAt: number;
  status?: { value: string };
}

export interface OdArtifact {
  id: string;
  projectId: string;
  kind?: string;
  primaryFile?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
}

export interface OdHealth {
  ok: boolean;
  version: string;
}

// ---------------------------------------------------------------------------
// SSE events (chat)
// ---------------------------------------------------------------------------

export type OdSseEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; tool: string; args?: Record<string, unknown> }
  | { type: "tool_result"; tool: string; result?: unknown }
  | { type: "thinking"; delta?: string }
  | { type: "artifact_created"; artifactId: string; primaryFile?: string }
  | { type: "error"; message: string }
  | { type: "done"; artifactId?: string }
  | { type: "raw"; eventName?: string; data: unknown }
  /**
   * Evento sintético emitido por nuestro wrapper tras `done`. Reporta el
   * resultado de `validateArtifact` (data-od-id count, single HTML, no externals).
   * Las warnings se muestran al usuario como mensaje system. NO bloquea.
   */
  | { type: "validation"; ok: boolean; warnings: string[]; htmlCount: number; dataOdIdCount: number };

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

export interface OdImportFolderRequest {
  baseDir: string;
}

export interface OdImportFolderResponse {
  project: OdProject;
  conversationId?: string;
  entryFile?: string;
}

export interface OdChatRequest {
  projectId: string;
  skillId?: string;
  designSystemId?: string;
  prompt: string;
  /** Modo opcional: "generate" (default) | "refine". `refine` requiere artifactId. */
  mode?: "generate" | "refine";
  artifactId?: string;
  /** Contexto adicional inyectado en el system prompt (DESIGN.md inline, brand slug, etc.). */
  context?: Record<string, unknown>;
}

export interface OdExportRequest {
  artifactId: string;
  format: "html" | "pdf" | "pptx" | "zip" | "mp4" | "md";
  destination?: string;
}

// ---------------------------------------------------------------------------
// Cliente config
// ---------------------------------------------------------------------------

export interface OdClientConfig {
  /** http://localhost:7456 por default (env: OD_DAEMON_URL). */
  daemonUrl: string;
  /** http://localhost:3100 por default (env: OD_WEB_URL). Para construir URLs del iframe. */
  webUrl: string;
  /** /Users/ragi/open-design por default (env: OD_REPO_PATH). Para enriquecer filePath de skills. */
  repoPath: string;
  /**
   * Bearer token compartido con el daemon (env: OD_API_TOKEN). Requerido por
   * la guarda Phase 5 del fork ≥ 0.7.0 cuando OD_BIND_HOST != loopback.
   * Vacío → no se manda Authorization header (modo dev local sin token).
   */
  apiToken?: string;
  /** Optional server-to-server metadata headers, e.g. request tracing. */
  extraHeaders?: Record<string, string>;
}

/** Response of GET /api/open-design/status — backs the Library's three-state UI. */
export interface OdStatus {
  /** Operator explicitly enabled the OD overlay (OD_DAEMON_URL / OD_WEB_URL / OD_API_TOKEN). */
  configured: boolean;
  /** Daemon reachable (only meaningful when configured). */
  healthy: boolean;
  /** Resolved daemon URL, surfaced in the "daemon down" state. */
  daemonUrl: string;
}
