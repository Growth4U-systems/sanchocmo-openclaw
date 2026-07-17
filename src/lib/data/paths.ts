import path from "path";

/**
 * Base workspace directory — where the legacy data lives.
 * Configurable via MC_WORKSPACE env var.
 */
export function mcWorkspaceDir(): string {
  return process.env.MC_WORKSPACE || path.join(
    process.env.HOME || "/Users/ragi",
    ".openclaw",
    "workspace-sancho"
  );
}

export const BASE = mcWorkspaceDir();

/**
 * Install home — the directory that holds the framework assets every runtime
 * shares (skills/, the workspace-* dirs, …). Product installs set it explicitly:
 * each docker/runtimes boot.sh exports MC_WORKSPACE=$SANCHO_HOME/workspace-sancho,
 * so the parent of the MC workspace is SANCHO_HOME everywhere. Deliberately
 * NOT the active runtime's state.home() — that is per-runtime private state
 * (e.g. workspace-sancho/_runtime/external-http) and locating install assets
 * through it emptied the Skills panel when prod switched runtimes (SAN-485).
 * OPENCLAW_HOME stays honored between the two: existing installs configure
 * the home through it, and context-pack/control/upload-r2 still read it.
 */
export function installHome(): string {
  return (
    process.env.SANCHO_HOME ||
    process.env.OPENCLAW_HOME ||
    path.dirname(mcWorkspaceDir())
  );
}

/** Central skills catalog — install-level, identical under every runtime. */
export function skillsRoot(): string {
  return path.join(installHome(), "skills");
}

export const CLIENTS_FILE = path.join(BASE, "clients.json");

/**
 * System PATH for child process execution (node, openclaw, gog, etc.)
 */
export const EXEC_PATH = process.env.PATH || "/usr/local/bin:/usr/bin:/bin";

// Per-client paths
export function brandDir(slug: string) {
  return path.join(BASE, "brand", slug);
}

export function ideasFile(slug: string) {
  return path.join(BASE, "brand", slug, "ideas.json");
}

// Content Engine idea queue (antennas + idea-builder). Different file/schema from
// ideas.json; both are merged by loadIdeas(). Centralized here so every reader/
// writer points at the same location.
export function contentIdeaQueueFile(slug: string) {
  return path.join(BASE, "brand", slug, "content", "idea-queue.json");
}

export function projectDir(slug: string, projectId: string) {
  return path.join(BASE, "brand", slug, "projects", projectId);
}

export function projectFile(slug: string, projectId: string) {
  return path.join(BASE, "brand", slug, "projects", projectId, "project.json");
}

export function tasksFile(slug: string, projectId: string) {
  return path.join(BASE, "brand", slug, "projects", projectId, "tasks.json");
}

export function recurringTasksFile(slug: string) {
  return path.join(BASE, "brand", slug, "idea-generation", "recurring-tasks.json");
}

export function notificationsFile(slug: string) {
  return path.join(BASE, "brand", slug, "idea-generation", "notifications.json");
}

export function chatDir(slug: string) {
  return path.join(BASE, "brand", slug, "chat");
}

export function chatThreadFile(slug: string, threadId: string) {
  return path.join(BASE, "brand", slug, "chat", `${threadId}.json`);
}

export function chatReadStateFile(slug: string) {
  return path.join(BASE, "brand", slug, "chat", "_read-state.json");
}

export function meetingIntelligenceDir(slug: string) {
  return path.join(BASE, "brand", slug, "intelligence");
}

export function meetingIntelligenceConfigFile(slug: string) {
  return path.join(meetingIntelligenceDir(slug), "config.json");
}

export function integrationsFile(slug: string) {
  return path.join(BASE, "brand", slug, "integrations.json");
}

export function metricsDir(slug: string) {
  return path.join(BASE, "brand", slug, "metrics");
}

export function monitoringDir(slug: string) {
  return path.join(BASE, "brand", slug, "monitoring");
}

export function strategiesCatalogFile() {
  // Shared skills tree lives at ~/.openclaw/skills/, one level above BASE.
  return path.join(BASE, "..", "skills", "strategic-plan", "references", "strategies-catalog.json");
}

export function apiHealthFile() {
  // OpenClaw convention: instance/runtime state lives in workspace _system/.
  return path.join(BASE, "_system", "api-health.json");
}

export function mcDataFile() {
  return path.join(BASE, "memory", "mc", "mc-data.js");
}

export function changelogFile() {
  return path.join(BASE, "memory", "CHANGELOG.md");
}

export function sourcesFile(slug: string) {
  return path.join(BASE, "brand", slug, "sources.json");
}

export function competitorsSourcesFile(slug: string) {
  return path.join(BASE, "brand", slug, "market-and-us", "competitors", "sources.json");
}

export function chatConfigFile(slug: string) {
  return path.join(BASE, "brand", slug, "chat-config.json");
}
