import path from "path";

/**
 * Base workspace directory — where the legacy data lives.
 * Configurable via MC_WORKSPACE env var.
 */
export const BASE = process.env.MC_WORKSPACE || path.join(
  process.env.HOME || "/Users/ragi",
  ".openclaw",
  "workspace-sancho"
);

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
