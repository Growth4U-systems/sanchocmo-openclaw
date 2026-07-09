import { promises as fs } from "fs";
import path from "path";
import { brandDir } from "@/lib/data/paths";
import { getRuntime } from "@/lib/runtime";
import {
  odFindProjectByBaseDir,
  odImportFolder,
  odListProjects,
  odPatchProject,
  resolveOdConfig,
} from "@/lib/open-design/client";
import type { OdClientConfig, OdProject } from "@/lib/open-design/types";

const MAPPING_FILE = path.join(
  getRuntime().state.home(),
  "workspace-maese-pedro",
  "od-projects.json",
);

interface MappingShape {
  [slug: string]: Record<string, string>;
}

export interface OpenDesignProjectResolution {
  ok: boolean;
  clientSlug: string;
  scope: string;
  baseDir: string;
  found: boolean;
  projectId: string | null;
  project: OdProject | null;
  imported?: boolean;
  mappingUpdated?: boolean;
  designSystemApplied?: boolean;
  designSystemError?: string;
  webUrl: string | null;
  daemonUrl: string;
}

export function normalizeOpenDesignScope(scope: string | undefined): string {
  const raw = (scope || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  if (raw.startsWith("/") || /^[a-zA-Z]:\//.test(raw)) {
    throw new Error("scope must be brand-relative");
  }
  const normalized = path.posix.normalize(raw);
  if (normalized === "." || normalized === "") return "";
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error("Open Design scope traversal is not allowed");
  }
  return normalized;
}

export async function resolveOpenDesignBrandDir(clientSlug: string, scope?: string) {
  const root = path.resolve(brandDir(clientSlug));
  const normalizedScope = normalizeOpenDesignScope(scope);
  const baseDir = normalizedScope ? path.resolve(root, normalizedScope) : root;
  if (baseDir !== root && !baseDir.startsWith(`${root}${path.sep}`)) {
    throw new Error("Open Design scope resolves outside the brand directory");
  }

  let stat;
  try {
    stat = await fs.stat(baseDir);
  } catch {
    throw new Error(`Open Design scope not found: ${normalizedScope || "."}`);
  }
  if (!stat.isDirectory()) {
    throw new Error("Open Design scope must be a directory");
  }

  return { clientSlug, scope: normalizedScope, baseDir };
}

export async function resolveExistingOpenDesignProject(
  clientSlug: string,
  scope: string | undefined,
  config: OdClientConfig = resolveOdConfig(),
): Promise<OpenDesignProjectResolution> {
  const target = await resolveOpenDesignBrandDir(clientSlug, scope);
  const mapping = await readMapping();
  const mappedProjectId = mapping[clientSlug]?.[target.scope];
  let project = mappedProjectId ? await findProjectById(mappedProjectId, config) : null;
  if (!project) project = await odFindProjectByBaseDir(target.baseDir, config);

  return {
    ok: true,
    clientSlug,
    scope: target.scope,
    baseDir: target.baseDir,
    found: Boolean(project),
    projectId: project?.id ?? null,
    project: project ?? null,
    webUrl: project ? `${config.webUrl}/projects/${project.id}` : null,
    daemonUrl: config.daemonUrl,
  };
}

export async function previewOpenDesignProjectImport(
  clientSlug: string,
  scope: string | undefined,
  options: { applyDesignSystem?: boolean } = {},
) {
  const target = await resolveOpenDesignBrandDir(clientSlug, scope);
  return {
    clientSlug,
    scope: target.scope,
    baseDir: target.baseDir,
    mappingFile: MAPPING_FILE,
    applyDesignSystem: options.applyDesignSystem !== false,
    willImportIfMissing: true,
    willPersistMapping: true,
  };
}

export async function ensureOpenDesignProject(
  clientSlug: string,
  scope: string | undefined,
  options: { applyDesignSystem?: boolean; config?: OdClientConfig } = {},
): Promise<OpenDesignProjectResolution> {
  const config = options.config ?? resolveOdConfig();
  const target = await resolveOpenDesignBrandDir(clientSlug, scope);
  const mapping = await readMapping();
  let projectId: string | undefined = mapping[clientSlug]?.[target.scope];
  let project: OdProject | null = projectId ? await findProjectById(projectId, config) : null;
  let imported = false;

  if (!project) {
    project = await odFindProjectByBaseDir(target.baseDir, config);
    projectId = project?.id;
  }

  if (!project) {
    const result = await odImportFolder({ baseDir: target.baseDir }, config);
    project = result.project;
    projectId = result.project.id;
    imported = true;
  }

  let mappingUpdated = false;
  if (projectId && mapping[clientSlug]?.[target.scope] !== projectId) {
    if (!mapping[clientSlug]) mapping[clientSlug] = {};
    mapping[clientSlug][target.scope] = projectId;
    await writeMapping(mapping);
    mappingUpdated = true;
  }

  let designSystemApplied = false;
  let designSystemError: string | undefined;
  if (options.applyDesignSystem !== false && project.designSystemId !== clientSlug) {
    try {
      project = await odPatchProject(project.id, { designSystemId: clientSlug }, config);
      designSystemApplied = project.designSystemId === clientSlug;
    } catch (err) {
      designSystemError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    ok: true,
    clientSlug,
    scope: target.scope,
    baseDir: target.baseDir,
    found: true,
    projectId: project.id,
    project,
    imported,
    mappingUpdated,
    designSystemApplied,
    ...(designSystemError ? { designSystemError } : {}),
    webUrl: `${config.webUrl}/projects/${project.id}`,
    daemonUrl: config.daemonUrl,
  };
}

async function findProjectById(projectId: string, config: OdClientConfig): Promise<OdProject | null> {
  const projects = await odListProjects(config);
  return projects.find((project) => project.id === projectId) ?? null;
}

async function readMapping(): Promise<MappingShape> {
  try {
    const raw = await fs.readFile(MAPPING_FILE, "utf8");
    return JSON.parse(raw) as MappingShape;
  } catch {
    return {};
  }
}

async function writeMapping(mapping: MappingShape): Promise<void> {
  await fs.mkdir(path.dirname(MAPPING_FILE), { recursive: true });
  await fs.writeFile(MAPPING_FILE, JSON.stringify(mapping, null, 2) + "\n", "utf8");
}
