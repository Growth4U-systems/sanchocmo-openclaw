import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import { createContentTask, attachDocumentToContentTask } from "@/lib/data/content-tasks";
import { createEmptyDraft, createSpecialDoc, draftRelPath } from "@/lib/data/drafts";
import { triggerWriter } from "@/lib/data/writer-trigger";

export interface ContentApprovalOptions {
  approvedBy?: string;
  approvedVia?: string;
  triggerWriter?: boolean;
}

export interface ContentApprovalPreview {
  ideaId: string;
  title: string | null;
  alreadyApproved: boolean;
  alreadyProvisioned: boolean;
  projectId: string;
  taskId: string;
  contentTaskId: string | null;
  channels: string[];
  skill: string;
  draftPaths: string[];
  supportDocPaths: string[];
  willSetApproved: boolean;
  writerWillTrigger: boolean;
}

export interface ContentApprovalResult {
  ideaId: string;
  contentTaskId: string;
  projectId: string;
  taskId: string;
  channelsProvisioned: string[];
  supportDocs: Array<{ path: string; created: boolean }>;
  skill: string;
  writerTriggered: boolean;
  writerError?: string;
  idea: ContentIdeaRecord;
}

export type ContentIdeaRecord = Record<string, unknown> & {
  id: string;
  status?: string;
  title?: string;
  target_channel?: string;
  angle_draft?: string;
  signal?: { summary?: string };
};

export function previewContentIdeaApproval(
  slug: string,
  ideaId: string,
  options: ContentApprovalOptions = {},
): ContentApprovalPreview {
  const idea = requireIdea(slug, ideaId);
  const primaryChannel = typeof idea.target_channel === "string" && idea.target_channel
    ? idea.target_channel
    : "linkedin";
  const channels = expandChannels(primaryChannel);
  const skill = writerSkillFor(primaryChannel);
  const { projectId, taskId } = weeklyProjectAndTaskIds();
  const alreadyApproved = isApproved(idea.status);

  return {
    ideaId,
    title: typeof idea.title === "string" ? idea.title : null,
    alreadyApproved,
    alreadyProvisioned: typeof idea.content_task_id === "string" && Boolean(idea.content_task_id),
    projectId,
    taskId,
    contentTaskId: typeof idea.content_task_id === "string" ? idea.content_task_id : null,
    channels,
    skill,
    draftPaths: channels.map((channel) => draftRelPath(ideaId, channel)),
    supportDocPaths: ["proposal", "research", "clarify"].map((kind) => draftRelPath(ideaId, kind)),
    willSetApproved: !alreadyApproved,
    writerWillTrigger: options.triggerWriter !== false,
  };
}

export async function approveContentIdea(
  slug: string,
  ideaId: string,
  options: ContentApprovalOptions = {},
): Promise<ContentApprovalResult> {
  const ideas = loadIdeas(slug);
  const idea = findIdea(ideas, ideaId);
  if (!idea) throw new Error("Idea not found");

  if (!isApproved(idea.status)) {
    const now = new Date().toISOString();
    idea.status = "Approved";
    idea.approved_at = now;
    idea.approved_via = options.approvedVia || "mcp";
    if (options.approvedBy) idea.approved_by = options.approvedBy;
    saveIdeas(slug, ideas);
  }

  return provisionApprovedContentIdea(slug, ideaId, {
    triggerWriter: options.triggerWriter,
  });
}

export async function provisionApprovedContentIdea(
  slug: string,
  ideaId: string,
  options: Pick<ContentApprovalOptions, "triggerWriter"> = {},
): Promise<ContentApprovalResult> {
  const ideas = loadIdeas(slug);
  const idea = findIdea(ideas, ideaId);
  if (!idea) throw new Error("Idea not found");
  if (!isApproved(idea.status)) {
    throw new Error("Idea must be approved before generating drafts");
  }

  const primaryChannel = typeof idea.target_channel === "string" && idea.target_channel
    ? idea.target_channel
    : "linkedin";
  const channels = expandChannels(primaryChannel);
  const skill = writerSkillFor(primaryChannel);
  const { projectId, taskId } = ensureWeeklyProjectAndTask(slug, ideaId);

  const contentTask = createContentTask(slug, {
    parent_task_id: taskId,
    idea_id: ideaId,
    name: (idea.title as string) || `Idea ${ideaId}`,
    skill,
    target_channels: channels,
    status: "Approved",
    pipeline_state: "researching",
    channel_phases: Object.fromEntries(channels.map((channel) => [channel, "researching" as const])),
  });

  const angle = typeof idea.angle_draft === "string" ? idea.angle_draft : "";
  const signal = idea.signal && typeof idea.signal.summary === "string" ? idea.signal.summary : "";
  const provisioned: string[] = [];

  for (const channel of channels) {
    createEmptyDraft(
      slug,
      ideaId,
      channel,
      {
        idea_id: ideaId,
        channel,
        kind: "channel-draft",
        content_task_id: contentTask.id,
        parent_task_id: taskId,
        iteration: 0,
        clarify_status: "pending",
      },
      starterBody(channel, angle, signal),
    );
    attachDocumentToContentTask(slug, taskId, contentTask.id, {
      path: draftRelPath(ideaId, channel),
      name: channel.charAt(0).toUpperCase() + channel.slice(1),
      channel,
    });
    provisioned.push(channel);
  }

  const supportDocs: Array<{ path: string; created: boolean }> = [];
  for (const [kind, body] of buildSupportDocs(idea, ideaId, angle, signal, channels, skill)) {
    const result = createSpecialDoc(slug, ideaId, kind, contentTask.id, taskId, body);
    supportDocs.push(result);
    if (result.created) {
      attachDocumentToContentTask(slug, taskId, contentTask.id, {
        path: result.path,
        name: kind.charAt(0).toUpperCase() + kind.slice(1),
        channel: kind,
      });
    }
  }

  idea.project_task_id = taskId;
  idea.project_id = projectId;
  idea.content_task_id = contentTask.id;
  idea.content_task_channels = channels;
  saveIdeas(slug, ideas);

  let writerTriggered = false;
  let writerError: string | undefined;
  if (options.triggerWriter !== false) {
    const trigger = await triggerWriter({
      slug,
      contentTaskId: contentTask.id,
      parentTaskId: taskId,
      projectId,
      ideaId,
      channels,
      skill,
      instruction: "",
      kind: "initial",
    });
    writerTriggered = trigger.forwardedToGateway;
    writerError = trigger.error;
  }

  return {
    ideaId,
    contentTaskId: contentTask.id,
    projectId,
    taskId,
    channelsProvisioned: provisioned,
    supportDocs,
    skill,
    writerTriggered,
    writerError,
    idea,
  };
}

function loadIdeas(slug: string): ContentIdeaRecord[] {
  const filePath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return Array.isArray(raw) ? raw.filter(isRecord).map(normalizeIdea) : [];
  } catch {
    return [];
  }
}

function saveIdeas(slug: string, ideas: ContentIdeaRecord[]): void {
  const filePath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(ideas, null, 2));
}

function requireIdea(slug: string, ideaId: string): ContentIdeaRecord {
  const idea = findIdea(loadIdeas(slug), ideaId);
  if (!idea) throw new Error("Idea not found");
  return idea;
}

function findIdea(ideas: ContentIdeaRecord[], ideaId: string): ContentIdeaRecord | null {
  return ideas.find((idea) => idea.id === ideaId) || null;
}

function normalizeIdea(value: Record<string, unknown>): ContentIdeaRecord {
  return {
    ...value,
    id: typeof value.id === "string" && value.id ? value.id : `idea-${Date.now()}`,
    status: canonicalIdeaStatus(value.status),
  };
}

function canonicalIdeaStatus(raw: unknown): string {
  if (typeof raw !== "string") return "New";
  if (raw === "New" || raw === "Approved" || raw === "Discarded" || raw === "Deferred" || raw === "Published") return raw;
  const lower = raw.toLowerCase();
  if (lower === "approved") return "Approved";
  if (lower === "archived" || lower === "discarded") return "Discarded";
  if (lower === "stale" || lower === "deferred") return "Deferred";
  if (lower === "published") return "Published";
  return "New";
}

function isApproved(status: unknown): boolean {
  return String(status || "").toLowerCase() === "approved";
}

function writerSkillFor(channel: string): string {
  const c = (channel || "").toLowerCase();
  if (c === "linkedin" || c === "x" || c === "twitter") return "social-writer";
  if (c === "instagram" || c === "ig") return "instagram-content";
  if (c === "blog" || c === "seo") return "seo-content";
  if (c === "newsletter" || c === "email") return "newsletter";
  return "social-writer";
}

function expandChannels(primary: string): string[] {
  const channels = [primary];
  if (primary === "linkedin" && !channels.includes("twitter")) channels.push("twitter");
  if (primary === "twitter" && !channels.includes("linkedin")) channels.push("linkedin");
  if (primary === "blog" && !channels.includes("linkedin")) channels.push("linkedin");
  return channels;
}

function weeklyProjectAndTaskIds(now = new Date()): { projectId: string; taskId: string } {
  const weekNum = Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
  const projectId = `P-Content-Semana-${weekNum}`;
  const dayOfWeek = now.getDay();
  const taskNum = dayOfWeek === 0 ? 7 : dayOfWeek;
  return {
    projectId,
    taskId: `${projectId}-T${String(taskNum).padStart(2, "0")}`,
  };
}

function ensureWeeklyProjectAndTask(slug: string, ideaId: string): { projectId: string; taskId: string } {
  const now = new Date();
  const { projectId, taskId } = weeklyProjectAndTaskIds(now);
  const dateStr = now.toISOString().slice(0, 10);

  const projectsDir = path.join(BASE, "brand", slug, "projects");
  let projDir = "";
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    const match = dirs.find((entry) => entry.isDirectory() && entry.name.startsWith(projectId));
    if (match) projDir = path.join(projectsDir, match.name);
  } catch {
    // Missing projects dir is created below.
  }

  if (!projDir) {
    projDir = path.join(projectsDir, projectId);
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, "project.json"), JSON.stringify({
      id: projectId,
      name: `Content Semana ${projectId.replace("P-Content-Semana-", "")}`,
      description: `Contenido semanal — semana ${projectId.replace("P-Content-Semana-", "")} de ${now.getFullYear()}`,
      status: "active",
      category: "content",
      created_at: now.toISOString(),
    }, null, 2));
    fs.writeFileSync(path.join(projDir, "tasks.json"), "[]");
  }

  const tasksPath = path.join(projDir, "tasks.json");
  let tasks: Record<string, unknown>[] = [];
  try {
    tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8")) as Record<string, unknown>[];
  } catch {
    // Malformed or missing task file is treated as empty.
  }

  if (!tasks.find((task) => task.id === taskId)) {
    const chatThreadId = `task-${taskId.toLowerCase()}`;
    tasks.push({
      id: taskId,
      name: `Contenido ${dateStr}`,
      description: `Ideas de contenido aprobadas para ${dateStr}`,
      type: "content",
      status: "in-progress",
      skill: "social-writer",
      deliverable_file: `brand/${slug}/content/published/${dateStr}.json`,
      mc_chat_thread_id: chatThreadId,
      discord_thread_id: null,
      owner: "Dulcinea",
      created_at: now.toISOString(),
      idea_ids: [],
    });
    fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));

    const chatDir = path.join(BASE, "brand", slug, "chat");
    fs.mkdirSync(chatDir, { recursive: true });
    const chatFile = path.join(chatDir, `${chatThreadId}.json`);
    if (!fs.existsSync(chatFile)) {
      fs.writeFileSync(chatFile, JSON.stringify({ messages: [], createdAt: now.toISOString() }, null, 2));
    }
  }

  const task = tasks.find((entry) => entry.id === taskId);
  if (task) {
    const ideaIds = Array.isArray(task.idea_ids) ? (task.idea_ids as string[]) : [];
    if (!ideaIds.includes(ideaId)) {
      task.idea_ids = [...ideaIds, ideaId];
      fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
    }
  }

  return { projectId, taskId };
}

function starterBody(channel: string, angleDraft: string, signal: string): string {
  return `# ${channel} draft\n\n## Ángulo aprobado\n\n${angleDraft}\n\n## Signal\n\n${signal}\n\n---\n\n_Pendiente: Dulcinea ejecutará deep-research → Clarify → writer y reemplazará este placeholder con el draft real._\n`;
}

function buildSupportDocs(
  idea: ContentIdeaRecord,
  ideaId: string,
  angle: string,
  signal: string,
  channels: string[],
  skill: string,
): Array<["proposal" | "research" | "clarify", string]> {
  const title = typeof idea.title === "string" && idea.title ? idea.title : ideaId;
  const proposalBody = [
    `# Propuesta — ${title}`,
    "",
    "## Ángulo aprobado",
    angle || "_(sin ángulo registrado)_",
    "",
    "## Signal",
    signal || "_(sin signal registrado)_",
    "",
    "## Canales objetivo",
    channels.map((channel) => `- ${channel}`).join("\n"),
    "",
    "## Skill principal",
    skill,
  ].join("\n");

  const researchBody = [
    `# Research — ${title}`,
    "",
    "_Pendiente. Dulcinea rellenará este documento con el deep-research:_",
    "_fuentes consultadas, queries usadas y key findings._",
    "",
    "## Sources",
    "",
    "## Queries",
    "",
    "## Key findings",
    "",
  ].join("\n");

  const clarifyBody = [
    `# Clarify — ${title}`,
    "",
    "_Pendiente. Dulcinea postará aquí las preguntas necesarias antes de redactar._",
    "_Cada pregunta tendrá una sección \"Respuesta humana:\" para que la rellenes._",
    "_Cuando estén todas respondidas, el agente avanzará al draft._",
    "",
  ].join("\n");

  return [
    ["proposal", proposalBody],
    ["research", researchBody],
    ["clarify", clarifyBody],
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
