/**
 * Cliente HTTP para el daemon de Open Design.
 * Punto único de comunicación entre MC y el daemon (localhost:7456).
 * Lectura: GET endpoints (skills, design-systems, projects, prompt-templates).
 * Escritura: POST (chat SSE, import folder, artifacts/save).
 *
 * Lee config de env: OD_DAEMON_URL, OD_WEB_URL, OD_REPO_PATH (con defaults sensatos).
 * Path filesystem se enriquece para ítems del catálogo upstream — la UI lo usa para mostrar
 * links clicables al SKILL.md / DESIGN.md en disco.
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { brandDir } from "@/lib/data/paths";
import type {
  OdArtifact,
  OdChatRequest,
  OdClientConfig,
  OdDesignSystem,
  OdExportRequest,
  OdHealth,
  OdImportFolderRequest,
  OdImportFolderResponse,
  OdProject,
  OdPromptTemplate,
  OdSkill,
  OdSseEvent,
} from "./types";
import { readOdSseEvents } from "./sse";

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

export function resolveOdConfig(): OdClientConfig {
  const usePublic = process.env.OD_USE_PUBLIC === "true";
  return {
    daemonUrl:
      (usePublic ? process.env.OD_PUBLIC_DAEMON_URL : process.env.OD_DAEMON_URL) ||
      "http://localhost:7456",
    webUrl:
      (usePublic ? process.env.OD_PUBLIC_WEB_URL : process.env.OD_WEB_URL) ||
      "http://localhost:3100",
    repoPath: process.env.OD_REPO_PATH || "/Users/ragi/open-design",
    apiToken: process.env.OD_API_TOKEN?.trim() || undefined,
  };
}

/**
 * Build the request init OD endpoints expect when the daemon enforces
 * Phase 5 hosted-mode auth:
 *
 *   - `Authorization: Bearer <token>` satisfies the bearer middleware.
 *   - For writes (PUT/POST/PATCH/DELETE), `Origin: <webUrl>` exercises the
 *     escape hatch in origin-validation.ts (`extraAllowedOrigins.includes(origin)
 *     → return true`) so the same-origin guard accepts server-to-server calls
 *     from MC. `OD_WEB_URL` must therefore be listed in `OD_ALLOWED_ORIGINS`
 *     on the daemon side (the setup script does this automatically).
 *
 * Returns the input init unchanged when no token is configured — keeps the
 * local dev flow (loopback daemon, no token) working without code branches
 * elsewhere.
 */
function withOdAuth(init: RequestInit | undefined, config: OdClientConfig): RequestInit {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(config.extraHeaders || {})) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (!config.apiToken) return { ...(init ?? {}), headers };
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${config.apiToken}`);
  }
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !headers.has("Origin")) {
    headers.set("Origin", config.webUrl);
  }
  return { ...init, headers };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class OdDaemonOfflineError extends Error {
  constructor(daemonUrl: string, cause?: unknown) {
    super(
      `OD daemon offline at ${daemonUrl}. Arranca con: ~/.openclaw/scripts/od-daemon.sh start`,
    );
    this.name = "OdDaemonOfflineError";
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

async function odFetch(
  endpoint: string,
  init?: RequestInit,
  config: OdClientConfig = resolveOdConfig(),
): Promise<Response> {
  const url = `${config.daemonUrl}${endpoint}`;
  let response: Response;
  try {
    response = await fetch(url, withOdAuth(init, config));
  } catch (err) {
    throw new OdDaemonOfflineError(config.daemonUrl, err);
  }
  return response;
}

/**
 * PUT /api/app-config — set daemon-wide preferences (designSystemId, skillId,
 * agentModels, etc.). Used by launch-editor to pre-select the brand's design
 * system before the user opens the OD web app.
 *
 * Goes through `odFetch`, so the Bearer + Origin auth headers are added
 * automatically when OD_API_TOKEN is configured.
 */
export async function odSetAppConfig(
  partial: Record<string, unknown>,
  config?: OdClientConfig,
): Promise<{ ok: boolean; status: number }> {
  const response = await odFetch(
    "/api/app-config",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    },
    config,
  );
  return { ok: response.ok, status: response.status };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function odHealth(config?: OdClientConfig): Promise<OdHealth> {
  const response = await odFetch("/api/health", undefined, config);
  if (!response.ok) {
    throw new Error(`OD health failed: ${response.status}`);
  }
  return (await response.json()) as OdHealth;
}

// ---------------------------------------------------------------------------
// Skills, design systems, prompt templates
// ---------------------------------------------------------------------------

function pickItems<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const k of keys) {
      const v = obj[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

export async function odListSkills(
  filter?: string,
  config: OdClientConfig = resolveOdConfig(),
): Promise<OdSkill[]> {
  const qs = filter ? `?filter=${encodeURIComponent(filter)}` : "";
  const response = await odFetch(`/api/skills${qs}`, undefined, config);
  if (!response.ok) throw new Error(`odListSkills failed: ${response.status}`);
  const payload = await response.json();
  const items = pickItems<OdSkill>(payload, ["items", "skills"]);
  // Enriquecer con filePath
  return items.map((s) => ({
    ...s,
    filePath: path.join(config.repoPath, "skills", s.id, "SKILL.md"),
  }));
}

export async function odListDesignSystems(
  filter?: string,
  config: OdClientConfig = resolveOdConfig(),
): Promise<OdDesignSystem[]> {
  const qs = filter ? `?filter=${encodeURIComponent(filter)}` : "";
  const response = await odFetch(`/api/design-systems${qs}`, undefined, config);
  if (!response.ok) throw new Error(`odListDesignSystems failed: ${response.status}`);
  const payload = await response.json();
  let items = pickItems<OdDesignSystem>(payload, ["items", "design-systems"]);
  // Fallback: si el daemon devuelve 0, leemos filesystem directamente
  if (items.length === 0) {
    try {
      const dsDir = path.join(config.repoPath, "design-systems");
      const entries = await fs.readdir(dsDir, { withFileTypes: true });
      items = entries
        .filter((e) => e.isDirectory())
        .map((e) => ({
          id: e.name,
          name: e.name.charAt(0).toUpperCase() + e.name.slice(1),
        }));
    } catch {
      // si falla el fallback, devolvemos lista vacía
    }
  }
  return items.map((ds) => ({
    ...ds,
    filePath: path.join(config.repoPath, "design-systems", ds.id, "DESIGN.md"),
  }));
}

export async function odListPromptTemplates(
  category?: "image" | "video" | "audio",
  config: OdClientConfig = resolveOdConfig(),
): Promise<OdPromptTemplate[]> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  const response = await odFetch(`/api/prompt-templates${qs}`, undefined, config);
  if (!response.ok) {
    // Endpoint puede no existir en algunas versiones; fallback FS
    try {
      const promptsDir = path.join(config.repoPath, "prompt-templates");
      const cats = ["image", "video", "audio"] as const;
      const collected: OdPromptTemplate[] = [];
      for (const cat of cats) {
        if (category && cat !== category) continue;
        try {
          const dir = path.join(promptsDir, cat);
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const e of entries) {
            if (!e.isDirectory()) continue;
            collected.push({
              id: `${cat}/${e.name}`,
              name: e.name.replace(/-/g, " "),
              category: cat,
              filePath: path.join(dir, e.name),
            });
          }
        } catch {
          // ignora subdir ausente
        }
      }
      return collected;
    } catch {
      return [];
    }
  }
  const payload = await response.json();
  const items = pickItems<OdPromptTemplate>(payload, ["items", "prompt-templates"]);
  return items.map((p) => ({
    ...p,
    filePath: p.filePath ?? path.join(config.repoPath, "prompt-templates", p.id),
  }));
}

export async function odListCraftGuides(
  config: OdClientConfig = resolveOdConfig(),
): Promise<{ id: string; name: string; filePath: string }[]> {
  // No hay endpoint REST conocido para craft. Listamos directamente del filesystem.
  const craftDir = path.join(config.repoPath, "craft");
  try {
    const entries = await fs.readdir(craftDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "README.md")
      .map((e) => ({
        id: e.name.replace(/\.md$/, ""),
        name: e.name.replace(/\.md$/, "").replace(/-/g, " "),
        filePath: path.join(craftDir, e.name),
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function odListProjects(config?: OdClientConfig): Promise<OdProject[]> {
  const response = await odFetch("/api/projects", undefined, config);
  if (!response.ok) throw new Error(`odListProjects failed: ${response.status}`);
  const payload = await response.json();
  return pickItems<OdProject>(payload, ["projects", "items"]);
}

export async function odImportFolder(
  body: OdImportFolderRequest,
  config?: OdClientConfig,
): Promise<OdImportFolderResponse> {
  const response = await odFetch(
    "/api/import/folder",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    config,
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`odImportFolder failed: ${response.status} ${text}`);
  }
  return (await response.json()) as OdImportFolderResponse;
}

/** Encuentra el project de OD que registra un baseDir concreto. */
export async function odFindProjectByBaseDir(
  baseDir: string,
  config?: OdClientConfig,
): Promise<OdProject | null> {
  const projects = await odListProjects(config);
  const target = path.resolve(baseDir);
  return (
    projects.find((p) => path.resolve(p.metadata?.baseDir ?? "") === target) ?? null
  );
}

// ---------------------------------------------------------------------------
// Project resolution (slug + scope → projectId)
//
// Extracted from the /api/open-design/resolve-project route so server-side
// callers (e.g. the carousel OD-render path) can resolve a project WITHOUT an
// HTTP self-call. The route now delegates here. Mapping persistence and the
// designSystemId patch behave exactly as before.
// ---------------------------------------------------------------------------

/** `~/.openclaw/workspace-maese-pedro/od-projects.json`. mapping[slug][scope] = projectId. */
const OD_PROJECT_MAPPING_FILE = path.join(
  process.env.OPENCLAW_HOME ?? path.join(os.homedir(), ".openclaw"),
  "workspace-maese-pedro",
  "od-projects.json",
);

interface OdProjectMapping {
  [slug: string]: Record<string, string>;
}

async function readOdProjectMapping(): Promise<OdProjectMapping> {
  try {
    return JSON.parse(await fs.readFile(OD_PROJECT_MAPPING_FILE, "utf8")) as OdProjectMapping;
  } catch {
    return {};
  }
}

async function writeOdProjectMapping(mapping: OdProjectMapping): Promise<void> {
  await fs.mkdir(path.dirname(OD_PROJECT_MAPPING_FILE), { recursive: true });
  await fs.writeFile(OD_PROJECT_MAPPING_FILE, JSON.stringify(mapping, null, 2) + "\n", "utf8");
}

export interface OdResolveProjectResult {
  projectId: string;
  /** Absolute path of the resolved scope directory on disk. */
  baseDir: string;
  /** Echoes back the scope (brand-relative folder, "" = brand root). */
  scope: string;
}

/**
 * Resolve the OD projectId for a brand sub-folder (`scope`, brand-relative;
 * "" = brand root). Mapping → daemon lookup → lazy import. Also ensures the
 * project's `designSystemId === slug` so the agentic editor uses the brand's
 * DESIGN.md (best-effort; ignored if the design system isn't in OD's catalog).
 *
 * @throws OdDaemonOfflineError when the daemon can't be reached.
 * @throws Error when the scope escapes the brand dir or isn't a directory.
 */
export async function odResolveProject(
  slug: string,
  scope = "",
  config: OdClientConfig = resolveOdConfig(),
): Promise<OdResolveProjectResult> {
  const root = brandDir(slug);
  const absTarget = path.resolve(scope ? path.join(root, scope) : root);

  // Path-traversal guard — scope must stay inside the brand dir.
  if (!absTarget.startsWith(path.resolve(root))) {
    throw new Error(`Forbidden — scope outside brand dir: ${scope}`);
  }
  const stat = await fs.stat(absTarget).catch(() => null);
  if (!stat) throw new Error(`scope not found: ${scope}`);
  if (!stat.isDirectory()) throw new Error(`scope must be a directory: ${scope}`);

  const mapping = await readOdProjectMapping();
  let projectId: string | undefined = mapping[slug]?.[scope];
  let projectRecord: { id: string; designSystemId: string | null } | undefined;

  // List projects: validate the cached mapping + capture current designSystemId.
  const projects = await odListProjects(config);
  if (projectId) {
    const found = projects.find((p) => p.id === projectId);
    if (!found) projectId = undefined; // orphan — re-import below
    else projectRecord = { id: found.id, designSystemId: found.designSystemId ?? null };
  }
  if (!projectId) {
    const existing = projects.find((p) => p.metadata?.baseDir === absTarget);
    if (existing) {
      projectId = existing.id;
      projectRecord = { id: existing.id, designSystemId: existing.designSystemId ?? null };
    }
  }

  // Still missing → lazy-create by importing the folder.
  if (!projectId) {
    const result = await odImportFolder({ baseDir: absTarget }, config);
    projectId = result.project.id;
    projectRecord = { id: result.project.id, designSystemId: result.project.designSystemId ?? null };
  }

  // Persist mapping if it changed.
  if (mapping[slug]?.[scope] !== projectId) {
    if (!mapping[slug]) mapping[slug] = {};
    mapping[slug][scope] = projectId;
    await writeOdProjectMapping(mapping);
  }

  // Ensure designSystemId === slug so OD uses the brand DESIGN.md. Best-effort:
  // if the slug isn't a design system in OD's catalog the patch errors and we
  // ignore it (editor still opens, just without the design system).
  if (projectRecord && projectRecord.designSystemId !== slug) {
    try {
      await odPatchProject(projectId, { designSystemId: slug }, config);
    } catch (err) {
      console.warn(`[odResolveProject] could not set designSystemId="${slug}":`, err);
    }
  }

  return { projectId, baseDir: absTarget, scope };
}

// ---------------------------------------------------------------------------
// Chat (SSE)
// ---------------------------------------------------------------------------

export async function odChat(
  body: OdChatRequest,
  config: OdClientConfig = resolveOdConfig(),
): Promise<AsyncGenerator<OdSseEvent>> {
  // SSE needs the raw streaming `fetch` (odFetch consumes nothing but returns a
  // Response we'd have to hand off — we keep the stream here), but the request
  // init still goes through `withOdAuth` so the Bearer token + Origin header are
  // attached when the hosted Staging daemon enforces Phase 5 auth. Previously
  // this POST sent no Authorization header and the daemon rejected it once
  // OD_API_TOKEN was set (SAN-245).
  const response = await fetch(
    `${config.daemonUrl}/api/chat`,
    withOdAuth(
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
      },
      config,
    ),
  ).catch((err) => {
    throw new OdDaemonOfflineError(config.daemonUrl, err);
  });
  // El orquestador od-generate inyecta `context.template` con el contrato meta.json
  // de la plantilla (generation_strategy, output_format). validateArtifact lo usa
  // para enrutar a validación HTML vs binaria.
  const hint = extractStrategyHint(body.context);
  return wrapWithValidation(readOdSseEvents(response), body.projectId, config, hint);
}

function extractStrategyHint(context: Record<string, unknown> | undefined): ArtifactStrategyHint | undefined {
  if (!context || typeof context !== "object") return undefined;
  const tpl = (context as Record<string, unknown>).template;
  if (!tpl || typeof tpl !== "object") return undefined;
  const t = tpl as Record<string, unknown>;
  const strategy = typeof t.generation_strategy === "string" ? t.generation_strategy : undefined;
  const format = typeof t.output_format === "string" ? t.output_format : undefined;
  if (!strategy && !format) return undefined;
  return {
    generation_strategy: strategy as ArtifactStrategyHint["generation_strategy"],
    output_format: format as ArtifactStrategyHint["output_format"],
  };
}

/**
 * Envuelve el stream de eventos SSE para emitir un evento sintético `validation`
 * tras el `done`. La validación corre `validateArtifact(projectId, config, hint)`
 * que enruta a comprobaciones HTML o binarias según la strategy del template.
 * NO bloquea: las warnings se reportan pero el flujo sigue.
 */
async function* wrapWithValidation(
  source: AsyncGenerator<OdSseEvent>,
  projectId: string,
  config: OdClientConfig,
  hint?: ArtifactStrategyHint,
): AsyncGenerator<OdSseEvent> {
  let sawDone = false;
  for await (const event of source) {
    yield event;
    if (event.type === "done") sawDone = true;
  }
  if (sawDone) {
    try {
      const v = await validateArtifact(projectId, config, hint);
      yield {
        type: "validation",
        ok: v.ok,
        warnings: v.warnings,
        htmlCount: v.htmlCount,
        dataOdIdCount: v.dataOdIdCount,
      };
    } catch {
      // Validación es best-effort; no bloquea
    }
  }
}

// ---------------------------------------------------------------------------
// Artifacts / export
// ---------------------------------------------------------------------------

export async function odExport(
  body: OdExportRequest,
  config?: OdClientConfig,
): Promise<{ ok: boolean; path?: string }> {
  const response = await odFetch(
    "/api/artifacts/save",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    config,
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`odExport failed: ${response.status} ${text}`);
  }
  return (await response.json()) as { ok: boolean; path?: string };
}

export async function odListArtifacts(
  projectId: string,
  config?: OdClientConfig,
): Promise<OdArtifact[]> {
  const response = await odFetch(
    `/api/projects/${encodeURIComponent(projectId)}/artifacts`,
    undefined,
    config,
  );
  if (!response.ok) {
    // Endpoint puede no existir; devolvemos vacío
    return [];
  }
  const payload = await response.json();
  return pickItems<OdArtifact>(payload, ["artifacts", "items"]);
}

// ---------------------------------------------------------------------------
// Project files (used by validateArtifact post-generation)
// ---------------------------------------------------------------------------

export interface OdProjectFile {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  mtime?: number;
  kind?: string;
  mime?: string;
}

/** Lista los archivos de un proyecto OD (recursivo). */
export async function odListProjectFiles(
  projectId: string,
  config?: OdClientConfig,
): Promise<OdProjectFile[]> {
  const response = await odFetch(
    `/api/projects/${encodeURIComponent(projectId)}/files`,
    undefined,
    config,
  );
  if (!response.ok) {
    return [];
  }
  const payload = await response.json();
  return pickItems<OdProjectFile>(payload, ["files", "items"]);
}

/** Build the daemon URL that serves a single project file's bytes.
 *  The web form `/projects/<id>/files/<path>` does NOT exist on the daemon
 *  (→404); only this `/api/...` form returns the file content. */
function odProjectFileUrl(projectId: string, filePath: string, config: OdClientConfig): string {
  return `${config.daemonUrl}/api/projects/${encodeURIComponent(projectId)}/files/${filePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** Lee el contenido de un archivo concreto del proyecto OD (string). */
export async function odReadProjectFile(
  projectId: string,
  filePath: string,
  config: OdClientConfig = resolveOdConfig(),
): Promise<string | null> {
  const url = odProjectFileUrl(projectId, filePath, config);
  try {
    // Goes through withOdAuth so the Bearer header is attached for the hosted
    // Staging daemon (Phase 5). GET → no Origin header needed.
    const response = await fetch(url, withOdAuth({ method: "GET" }, config));
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Read a single project file as raw bytes (Buffer). The text sibling
 * `odReadProjectFile` decodes as UTF-8 which corrupts binary assets (PNG/PDF),
 * so the carousel OD-render path (render-od.ts) uses this to pull the exported
 * PDF and per-slide PNGs back from the daemon before uploading them to R2.
 *
 * Throws on a non-OK response (unlike the text reader which returns null) —
 * the OD render path treats a missing exported asset as fatal: we must not
 * silently publish a carousel with missing slides.
 */
export async function odReadProjectFileBinary(
  projectId: string,
  filePath: string,
  config: OdClientConfig = resolveOdConfig(),
): Promise<Buffer> {
  const url = odProjectFileUrl(projectId, filePath, config);
  let response: Response;
  try {
    response = await fetch(url, withOdAuth({ method: "GET" }, config));
  } catch (err) {
    throw new OdDaemonOfflineError(config.daemonUrl, err);
  }
  if (!response.ok) {
    throw new Error(
      `odReadProjectFileBinary failed: ${response.status} for ${filePath} in project ${projectId}`,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export interface ArtifactValidation {
  ok: boolean;
  warnings: string[];
  htmlCount: number;
  dataOdIdCount: number;
  externalUrls: number;
  binaryCount: number;
}

export type OdGenerationStrategy =
  | "html"
  | "html-to-image"
  | "image-model"
  | "html-to-video"
  | "video-model"
  | "audio-model";

export type OdOutputFormat =
  | "html"
  | "png"
  | "jpg"
  | "jpeg"
  | "svg"
  | "mp4"
  | "webm"
  | "mp3"
  | "wav";

export interface ArtifactStrategyHint {
  generation_strategy?: OdGenerationStrategy;
  output_format?: OdOutputFormat;
}

const HTML_STRATEGIES: ReadonlySet<OdGenerationStrategy> = new Set([
  "html",
  "html-to-image",
  "html-to-video",
]);

const BINARY_STRATEGIES: ReadonlySet<OdGenerationStrategy> = new Set([
  "html-to-image",
  "image-model",
  "html-to-video",
  "video-model",
  "audio-model",
]);

const BINARY_EXT_BY_FORMAT: Record<string, string[]> = {
  png: [".png"],
  jpg: [".jpg", ".jpeg"],
  jpeg: [".jpg", ".jpeg"],
  svg: [".svg"],
  mp4: [".mp4"],
  webm: [".webm"],
  mp3: [".mp3"],
  wav: [".wav"],
};

/**
 * Valida que el artifact generado en un proyecto OD sea OD-compliant.
 *
 * Strategy-aware:
 *   - `html` / `html-to-image` / `html-to-video` validan el HTML fuente:
 *     single index.html, data-od-id presente, sin URLs externas (excepto Google Fonts).
 *   - `html-to-image` / `html-to-video` además validan que exista el binario
 *     final con la extensión correcta y `size > 0`.
 *   - `image-model` / `video-model` / `audio-model` validan SOLO el binario
 *     (existe archivo con la extensión esperada, size > 0).
 *
 * Sin hint, asume HTML (compatible con flujos previos al schema multi-strategy).
 *
 * No bloquea el flujo; solo devuelve warnings que el caller puede reportar al
 * thread del usuario.
 */
export async function validateArtifact(
  projectId: string,
  config?: OdClientConfig,
  hint?: ArtifactStrategyHint,
): Promise<ArtifactValidation> {
  const warnings: string[] = [];
  const files = await odListProjectFiles(projectId, config);
  const htmls = files.filter((f) => f.type === "file" && f.path.endsWith(".html"));

  const strategy = hint?.generation_strategy;
  const format = hint?.output_format;

  // Default (sin hint) = comportamiento histórico HTML.
  const checkHtml = !strategy || HTML_STRATEGIES.has(strategy);
  const checkBinary = !!strategy && BINARY_STRATEGIES.has(strategy);

  let dataOdIdCount = 0;
  let externalUrls = 0;
  let binaryCount = 0;

  if (checkHtml) {
    if (htmls.length === 0) {
      warnings.push("⚠ El artifact no contiene HTML — preview no funcionará");
    } else {
      if (htmls.length > 1) {
        warnings.push(
          `⚠ Múltiples HTML detectados (${htmls.length}) — preview puede fragmentarse. Mejor un único index.html`,
        );
      }
      const entry = htmls.find((f) => f.path.endsWith("index.html")) ?? htmls[0];
      const content = await odReadProjectFile(projectId, entry.path, config);
      if (content) {
        const ids = content.match(/data-od-id="[^"]+"/g) ?? [];
        dataOdIdCount = ids.length;
        if (dataOdIdCount === 0) {
          warnings.push(
            "⚠ Sin data-od-id en el HTML — comment overlay y surgical edits deshabilitados. Pídele al agente que añada `data-od-id=\"<slug>\"` a cada sección lógica.",
          );
        }
        const externals = content.match(
          /https?:\/\/(?!fonts\.googleapis\.com|fonts\.gstatic\.com)[^"'\s)]+/g,
        ) ?? [];
        externalUrls = externals.length;
        if (externalUrls > 0) {
          warnings.push(
            `⚠ ${externalUrls} URLs externas detectadas — el preview puede fallar offline. Usa data: URIs, gradientes CSS o SVG inline.`,
          );
        }
      }
    }
  }

  if (checkBinary) {
    const exts = format ? BINARY_EXT_BY_FORMAT[format] ?? [`.${format}`] : Object.values(BINARY_EXT_BY_FORMAT).flat();
    const binaries = files.filter(
      (f) => f.type === "file" && exts.some((ext) => f.path.toLowerCase().endsWith(ext)),
    );
    binaryCount = binaries.length;

    if (binaries.length === 0) {
      warnings.push(
        `⚠ Sin archivo binario ${format ? `(${format})` : ""} en el artifact — strategy ${strategy} esperaba un output binario.`,
      );
    } else {
      const empties = binaries.filter((b) => typeof b.size === "number" && b.size === 0);
      if (empties.length > 0) {
        warnings.push(
          `⚠ ${empties.length} archivo(s) binario(s) con tamaño 0 — la generación falló o se cortó.`,
        );
      }
    }
  }

  return {
    ok: warnings.length === 0,
    warnings,
    htmlCount: htmls.length,
    dataOdIdCount,
    externalUrls,
    binaryCount,
  };
}

/** Patch a project (designSystemId, skillId, metadata, ...). */
export async function odPatchProject(
  projectId: string,
  patch: Partial<{ designSystemId: string | null; skillId: string | null; name: string }>,
  config?: OdClientConfig,
): Promise<OdProject> {
  const response = await odFetch(
    `/api/projects/${encodeURIComponent(projectId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
    config,
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`odPatchProject failed: ${response.status} ${text}`);
  }
  const payload = await response.json();
  // Daemon devuelve { project: {...} }
  return (payload.project ?? payload) as OdProject;
}
