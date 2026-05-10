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
  };
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
    response = await fetch(url, init);
  } catch (err) {
    throw new OdDaemonOfflineError(config.daemonUrl, err);
  }
  return response;
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

interface ListResponse<T> {
  items?: T[];
  skills?: T[];
  "design-systems"?: T[];
  "prompt-templates"?: T[];
}

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
// Chat (SSE)
// ---------------------------------------------------------------------------

export async function odChat(
  body: OdChatRequest,
  config: OdClientConfig = resolveOdConfig(),
): Promise<AsyncGenerator<OdSseEvent>> {
  const response = await fetch(`${config.daemonUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
  }).catch((err) => {
    throw new OdDaemonOfflineError(config.daemonUrl, err);
  });
  return readOdSseEvents(response);
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
