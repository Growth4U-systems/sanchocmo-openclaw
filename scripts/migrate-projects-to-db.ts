import fs from "fs";
import path from "path";
import { tasks } from "@/db/schema";
import { canonicalChildTaskId } from "@/lib/data/tasks";
import { taskBriefText, taskCompletionText, taskExecutionNotesText } from "@/lib/data/task-brief";
import { normalizeTaskStatus } from "@/lib/data/pillar-task-sync";

const root = process.cwd();
const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
const workspaces = ["workspace-cervantes", "workspace-escudero", "workspace-main", "workspace-rocinante", "workspace-sancho"];

if (!apply && !dryRun) {
  console.error("Usage: tsx scripts/migrate-projects-to-db.ts --dry-run | --apply");
  process.exit(1);
}

function readJSON(file: string, fallback: any) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function toDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function json(value: unknown) {
  return value === undefined ? null : value;
}

function sourceKey(...parts: string[]) {
  return parts.map((part) => encodeURIComponent(part)).join("/");
}

function splitKnown(record: Record<string, unknown>, known: string[]) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!known.includes(key)) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

const knownProject = [
  "id", "slug", "name", "strategy", "status", "phase", "category", "created_at",
  "updated_at", "review_date", "blocked_by", "description", "objective", "approach",
  "brief", "completion", "execution_notes", "archive_reason", "tool", "completed_at",
];
const knownTask = [
  "id", "name", "description", "deliverable", "deliverable_file", "done_criteria",
  "brief", "completion", "execution_notes",
  "depends_on", "owner", "status", "channel", "type", "batch_type", "skill",
  "pillar", "section", "completed", "completed_at", "output_files", "documents",
  "attachments", "discord_thread_id", "mc_chat_thread_id", "idea_ids", "content_tasks",
  "created", "created_at", "updated_at",
];
const knownContentTask = [
  "id", "parent_task_id", "idea_id", "name", "status", "pipeline_state",
  "brief", "completion", "execution_notes",
  "channel_phases", "media_policy", "clarify_status", "skill", "target_channels",
  "documents", "mc_chat_thread_id", "discord_thread_id", "owner", "created_at",
  "updated_at", "approved_at", "pending_media_at", "published_at", "discarded_at",
  "deferred_at", "scheduled_for", "draft_statuses",
];

let dbClient: typeof import("@/db/drizzle").db | null = null;

async function upsert(row: typeof tasks.$inferInsert) {
  if (dryRun) return;
  dbClient ||= (await import("@/db/drizzle")).db;
  await dbClient.insert(tasks).values(row).onConflictDoUpdate({
    target: tasks.sourceKey,
    set: { ...row, updatedAt: new Date() },
  });
}

async function main() {
const counts = { projects: 0, tasks: 0, contentTasks: 0, skippedOrphans: 0 };

for (const workspace of workspaces) {
  const brandRoot = path.join(root, workspace, "brand");
  if (!fs.existsSync(brandRoot)) continue;
  for (const brandSlug of fs.readdirSync(brandRoot)) {
    const projectsRoot = path.join(brandRoot, brandSlug, "projects");
    if (!fs.existsSync(projectsRoot)) continue;
    const canonicalParentIds = new Map<string, string>();
    const canonicalParentKeys = new Map<string, string>();
    const taskKeyCounts = new Map<string, number>();
    const seenContentTaskIds = new Set<string>();

    async function upsertContentTaskRow(ct: any, fallbackParentId: string | null) {
      if (!ct?.id) {
        counts.skippedOrphans++;
        return;
      }
      const parentId = ct.parent_task_id
        ? (canonicalParentIds.get(String(ct.parent_task_id)) || String(ct.parent_task_id))
        : fallbackParentId;
      const parentKey = parentId ? canonicalParentKeys.get(parentId) || canonicalParentKeys.get(String(ct.parent_task_id || "")) || null : null;
      await upsert({
        sourceKey: sourceKey(workspace, brandSlug, "content_task", String(ct.id)),
        id: String(ct.id),
        workspaceSlug: workspace,
        brandSlug,
        parentId,
        parentKey,
        type: "content_task",
        status: String(ct.status || "New"),
        name: String(ct.name || ct.title || ct.id),
        brief: taskBriefText(ct) || null,
        completion: taskCompletionText(ct) || null,
        executionNotes: taskExecutionNotesText(ct) || null,
        owner: ct.owner || null,
        skill: ct.skill || null,
        ideaId: ct.idea_id || null,
        pipelineState: ct.pipeline_state || null,
        clarifyStatus: ct.clarify_status || null,
        targetChannels: json(ct.target_channels || []),
        channelPhases: json(ct.channel_phases || null),
        mediaPolicy: json(ct.media_policy || null),
        scheduledFor: toDate(ct.scheduled_for || ct.target_date),
        draftStatuses: json(ct.draft_statuses),
        mcChatThreadId: ct.mc_chat_thread_id || null,
        discordThreadId: ct.discord_thread_id || null,
        documents: json(ct.documents || []),
        attachments: json(ct.attachments || []),
        createdAt: toDate(ct.created_at) || new Date(),
        updatedAt: toDate(ct.updated_at) || new Date(),
        approvedAt: toDate(ct.approved_at),
        pendingMediaAt: toDate(ct.pending_media_at),
        publishedAt: toDate(ct.published_at),
        discardedAt: toDate(ct.discarded_at),
        deferredAt: toDate(ct.deferred_at),
        legacyExtras: splitKnown(ct, knownContentTask),
      });
      if (!seenContentTaskIds.has(String(ct.id))) {
        seenContentTaskIds.add(String(ct.id));
        counts.contentTasks++;
      }
    }

    for (const projectDirName of fs.readdirSync(projectsRoot)) {
      const projectDir = path.join(projectsRoot, projectDirName);
      if (!fs.statSync(projectDir).isDirectory()) continue;
      const project = readJSON(path.join(projectDir, "project.json"), null);
      if (!project?.id) continue;
      const projectId = String(project.id);
      const projectKey = sourceKey(workspace, brandSlug, "project", projectId);
      await upsert({
        sourceKey: projectKey,
        id: projectId,
        workspaceSlug: workspace,
        brandSlug,
        parentId: null,
        parentKey: null,
        type: "project",
        status: String(project.status || "todo"),
        name: String(project.name || projectId),
        brief: taskBriefText(project) || null,
        completion: taskCompletionText(project) || null,
        executionNotes: taskExecutionNotesText(project) || null,
        description: project.description || null,
        slug: project.slug || projectDirName,
        strategy: project.strategy || null,
        phase: typeof project.phase === "number" ? project.phase : null,
        category: project.category || null,
        objective: json(project.objective),
        approach: project.approach || null,
        archiveReason: project.archive_reason || null,
        blockedBy: project.blocked_by || null,
        tool: project.tool || null,
        createdAt: toDate(project.created_at) || new Date(),
        updatedAt: toDate(project.updated_at) || new Date(),
        completedAt: toDate(project.completed_at),
        reviewDate: toDate(project.review_date),
        legacyExtras: splitKnown(project, knownProject),
      });
      counts.projects++;

      const rawTasks = readJSON(path.join(projectDir, "tasks.json"), []);
      const projectTasks = Array.isArray(rawTasks) ? rawTasks : rawTasks.tasks || [];
      for (const task of projectTasks) {
        const childId = canonicalChildTaskId(projectId, String(task.id));
        const baseTaskKey = sourceKey(workspace, brandSlug, "task", childId);
        const seenCount = taskKeyCounts.get(baseTaskKey) || 0;
        taskKeyCounts.set(baseTaskKey, seenCount + 1);
        const taskSourceKey = seenCount === 0 ? baseTaskKey : `${baseTaskKey}#${seenCount + 1}`;
        canonicalParentIds.set(String(task.id), childId);
        canonicalParentIds.set(childId, childId);
        if (!canonicalParentKeys.has(String(task.id))) canonicalParentKeys.set(String(task.id), taskSourceKey);
        if (!canonicalParentKeys.has(childId)) canonicalParentKeys.set(childId, taskSourceKey);
        const taskType = String(task.type || task.batch_type || "execution");
        await upsert({
          sourceKey: taskSourceKey,
          id: childId,
          workspaceSlug: workspace,
          brandSlug,
          parentId: projectId,
          parentKey: projectKey,
          type: taskType,
          status: normalizeTaskStatus(String(task.status || "todo")),
          name: String(task.name || childId),
          brief: taskBriefText(task) || null,
          completion: taskCompletionText(task) || null,
          executionNotes: taskExecutionNotesText(task) || null,
          description: task.description || null,
          owner: task.owner || null,
          skill: task.skill || null,
          channel: task.channel || null,
          deliverable: task.deliverable || null,
          deliverableFile: json(task.deliverable_file),
          doneCriteria: task.done_criteria || null,
          dependsOn: task.depends_on || null,
          pillar: task.pillar || null,
          section: task.section || null,
          mcChatThreadId: task.mc_chat_thread_id || null,
          discordThreadId: task.discord_thread_id || null,
          outputFiles: json(task.output_files || []),
          documents: json(task.documents || []),
          attachments: json(task.attachments || []),
          ideaIds: json(task.idea_ids || []),
          createdAt: toDate(task.created_at || task.created) || new Date(),
          updatedAt: toDate(task.updated_at) || new Date(),
          completedAt: toDate(task.completed_at || task.completed),
          legacyExtras: { legacy_id: task.id, ...splitKnown(task, knownTask) },
        });
        counts.tasks++;

        for (const ct of task.content_tasks || []) {
          await upsertContentTaskRow(ct, childId);
        }
      }
    }

    const flatContentTasks = readJSON(path.join(brandRoot, brandSlug, "content", "content-tasks.json"), []);
    if (Array.isArray(flatContentTasks)) {
      for (const ct of flatContentTasks) {
        await upsertContentTaskRow(ct, null);
      }
    }
  }
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", counts }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
