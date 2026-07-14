import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import type { UnifiedTaskRow } from "@/lib/data/tasks";
import { resolveTaskDocPaths } from "@/lib/pillar-doc-paths";
import { resolveWorkspaceDocPath } from "@/lib/server/doc-paths";
import { sanitizeShortId } from "@/lib/thread-id";
import type { TaskIndexEntry, TaskIndexStats } from "@/lib/task-index-types";

const naturalCollator = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});

function writerSkillFor(channel: string): string {
  const normalized = channel.toLowerCase();
  if (normalized === "linkedin" || normalized === "x" || normalized === "twitter") return "social-writer";
  if (normalized === "instagram" || normalized === "ig") return "instagram-content";
  if (normalized === "blog" || normalized === "seo") return "seo-content";
  if (normalized === "newsletter" || normalized === "email") return "newsletter";
  return "social-writer";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function firstDocumentPath(row: UnifiedTaskRow): string {
  const taskPaths = resolveTaskDocPaths(row);
  if (taskPaths[0]) return taskPaths[0];

  const documents = Array.isArray(row.documents) ? row.documents : [];
  const documentPath = documents.find((document) => document && typeof document.path === "string")?.path;
  if (documentPath) return documentPath;

  const outputDocuments = Array.isArray(row.output_documents) ? row.output_documents : [];
  return outputDocuments.find((document) => document && typeof document.path === "string")?.path || "";
}

function resolveDocument(slug: string, row: UnifiedTaskRow, baseDir: string) {
  const candidate = firstDocumentPath(row);
  if (!candidate) return { deliverableFile: "", docExists: false };

  let workspacePath = candidate;
  if (path.isAbsolute(workspacePath)) {
    const relative = path.relative(path.resolve(baseDir), path.resolve(workspacePath));
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return { deliverableFile: candidate, docExists: false };
    }
    workspacePath = relative;
  }

  try {
    const resolved = resolveWorkspaceDocPath(baseDir, workspacePath, { slug, requireBrand: true });
    return {
      deliverableFile: resolved.canonicalPath,
      docExists: resolved.exists,
    };
  } catch {
    return { deliverableFile: candidate, docExists: false };
  }
}

function threadFile(baseDir: string, slug: string, threadId: string): string {
  const prefix = `${slug}:`;
  const shortId = threadId.startsWith(prefix) ? threadId.slice(prefix.length) : threadId;
  return path.join(baseDir, "brand", slug, "chat", `${sanitizeShortId(shortId)}.json`);
}

function fullThreadId(slug: string, threadId: string): string {
  return threadId.startsWith(`${slug}:`) ? threadId : `${slug}:${threadId}`;
}

function resolveThread(slug: string, row: UnifiedTaskRow, baseDir: string, isContentTask: boolean) {
  const storedRaw = typeof row.mc_chat_thread_id === "string" ? row.mc_chat_thread_id.trim() : "";
  const storedThread = storedRaw ? fullThreadId(slug, storedRaw) : "";
  const canonicalThread = `${slug}:${isContentTask ? "content" : "task"}:${row.id.toLowerCase()}`;
  const candidates = isContentTask
    ? [canonicalThread, storedThread]
    : [storedThread, canonicalThread];
  const uniqueCandidates = candidates.filter((candidate, index) => candidate && candidates.indexOf(candidate) === index);
  const existingThread = uniqueCandidates.find((candidate) => fs.existsSync(threadFile(baseDir, slug, candidate)));
  const chosenThread = existingThread || uniqueCandidates[0] || canonicalThread;

  return {
    mcChatThreadId: chosenThread,
    threadFileExists: Boolean(existingThread),
  };
}

function projectForRow(row: UnifiedTaskRow, rowsById: Map<string, UnifiedTaskRow>) {
  const seen = new Set<string>();
  let current: UnifiedTaskRow | undefined = row;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.type === "project") return current;
    current = current.parent_id ? rowsById.get(current.parent_id) : undefined;
  }

  if (row.project_id) {
    const explicitProject = rowsById.get(row.project_id);
    if (explicitProject?.type === "project") return explicitProject;
  }

  return null;
}

function compareEntries(a: TaskIndexEntry, b: TaskIndexEntry): number {
  return naturalCollator.compare(a.projectId, b.projectId)
    || naturalCollator.compare(a.taskId, b.taskId)
    || naturalCollator.compare(a.taskName, b.taskName);
}

export function buildTaskIndex(
  slug: string,
  rows: UnifiedTaskRow[],
  options: { baseDir?: string } = {},
): { entries: TaskIndexEntry[]; stats: TaskIndexStats } {
  const baseDir = options.baseDir || BASE;
  const rowsById = new Map<string, UnifiedTaskRow>();
  for (const row of rows) {
    if (!rowsById.has(row.id)) rowsById.set(row.id, row);
  }

  const entries = rows
    .filter((row) => row.type !== "project")
    .map((row): TaskIndexEntry => {
      const project = projectForRow(row, rowsById);
      const projectId = project?.id || "SIN-PROYECTO";
      const projectName = project?.name
        || (projectId === "SIN-PROYECTO" ? "Tareas independientes" : projectId);
      const immediateParentId = row.parent_id || row.parent_task_id;
      const immediateParent = immediateParentId ? rowsById.get(immediateParentId) : undefined;
      const parentTaskId = immediateParentId
        && immediateParentId !== projectId
        && immediateParent?.type !== "project"
        ? immediateParentId
        : undefined;
      const isContentTask = row.type === "content_task" || row.type === "content_subtask";
      const skill = typeof row.skill === "string" ? row.skill.trim() : "";
      const skills = stringArray(row.skills);
      const targetChannels = stringArray(row.target_channels);
      const { deliverableFile, docExists } = resolveDocument(slug, row, baseDir);
      const { mcChatThreadId, threadFileExists } = resolveThread(slug, row, baseDir, isContentTask);
      const skillOk = isContentTask
        ? Boolean(skill) && skill !== "MISSING"
        : skill !== "MISSING";

      return {
        projectId,
        projectName,
        taskId: row.id,
        taskName: row.name || row.id,
        status: row.status || "todo",
        skill,
        skills: skills.length ? skills : undefined,
        agent: typeof row.agent === "string" && row.agent.trim() ? row.agent : undefined,
        skillOk,
        executionMode: skill && skill !== "MISSING" ? "guided" : "agent",
        deliverableFile,
        docExists,
        mcChatThreadId,
        threadFileExists,
        pillar: typeof row.pillar === "string" && row.pillar.trim() ? row.pillar : null,
        type: row.type,
        parentTaskId,
        ideaId: typeof row.idea_id === "string" ? row.idea_id : undefined,
        targetChannels: targetChannels.length ? targetChannels : undefined,
        channelSkills: isContentTask && targetChannels.length
          ? targetChannels.map((channel) => ({ channel, skill: writerSkillFor(channel) }))
          : undefined,
        isContentTask: isContentTask || undefined,
      };
    })
    .sort(compareEntries);

  const byStatus: Record<string, number> = {};
  for (const entry of entries) {
    byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
  }

  const stats: TaskIndexStats = {
    total: entries.length,
    docOk: entries.filter((entry) => entry.docExists).length,
    docMissing: entries.filter((entry) => !entry.docExists).length,
    docPlaceholder: entries.filter((entry) => (
      entry.deliverableFile.includes("/tasks/")
      && entry.deliverableFile.endsWith("/deliverable.md")
    )).length,
    skillOk: entries.filter((entry) => entry.skillOk).length,
    threadOk: entries.filter((entry) => entry.threadFileExists).length,
    byStatus,
  };

  return { entries, stats };
}
