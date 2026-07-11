/**
 * task-create-helpers.ts — Shared helpers for task/project creation.
 *
 * Architectural principle (2026-04-15): every task and project in MC is
 * born with its durable document/chat anchors atomically set, so the chat
 * sidebar (and any other surface) can resolve the thread's associated doc
 * and chat
 * by direct lookup — NOT by retro-active heuristics.
 *
 * The durable anchors:
 *   1. `deliverable_file` — the concrete file path the skill writes
 *   2. `mc_chat_thread_id` — canonical name of the MC chat JSON file
 *      (`brand/{slug}/chat/{mc_chat_thread_id}.json`)
 *
 * `skill` is an optional execution harness, not an identity anchor. When it
 * is present the task starts guided/pinned; when absent the owning agent
 * selects a skill (or none) per turn. Blueprints may still require a skill as
 * a product contract, but generic task creation must not fail without one.
 *
 * (`discord_thread_id` was the 4th anchor — Discord retired, SAN-183 F5.)
 *
 * This module is the enforcement layer for API endpoints that create
 * tasks / projects. Every create endpoint MUST:
 *
 *   1. Accept `deliverable_file` (and optional `skill`) in the request body and
 *      validate them via `requireTaskAnchors()` BEFORE writing.
 *   2. Generate `mc_chat_thread_id` via `canonicalChatThreadId(taskId)`.
 *   3. Create the empty chat thread JSON file via `ensureEmptyChatThread()`.
 */

import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";

/** Minimal shape a create endpoint must accept for a new task. */
export interface TaskCreateInput {
  id: string;
  name: string;
  skill?: string;
  deliverable_file?: string | string[];
  mc_chat_thread_id?: string;
  [key: string]: unknown;
}

/** Minimal shape for a new project. */
export interface ProjectCreateInput {
  id: string;
  name: string;
  skill?: string;            // optional for projects (projects are orchestrators)
  deliverable_file?: string; // optional for projects
  mc_chat_thread_id?: string;
  [key: string]: unknown;
}

export class TaskAnchorError extends Error {
  constructor(message: string, public missing: string[]) {
    super(message);
    this.name = "TaskAnchorError";
  }
}

/**
 * Enforce the required document anchor (`deliverable_file`) when the task
 * produces a document.
 * Throws a `TaskAnchorError` with the list of missing fields if not.
 *
 * Exemption (SAN-183 F5): tasks of type `integration` (connect Meeting
 * Intelligence / Call Prep / Daily Pulse) and `execution` (orchestration, e.g.
 * "Ejecutar Strategic Plan") produce configuration or projects, not documents
 * — `deliverable_file` is not required for them. The chat anchor is generated
 * by `applyTaskAnchors`; skill remains optional in every case.
 *
 * Callers should catch and return 400 to the API consumer.
 */
export function requireTaskAnchors(task: TaskCreateInput): void {
  const missing: string[] = [];
  const deliverableExempt = task.type === "integration" || task.type === "execution";
  if (
    !deliverableExempt &&
    (!task.deliverable_file ||
      (typeof task.deliverable_file === "string" && task.deliverable_file.trim() === "") ||
      (Array.isArray(task.deliverable_file) && task.deliverable_file.length === 0))
  ) {
    missing.push("deliverable_file");
  }
  if (missing.length > 0) {
    throw new TaskAnchorError(
      `Task '${task.id}' missing required anchors: ${missing.join(", ")}. ` +
        `Document-producing tasks must be created with \`deliverable_file\` ` +
        `so the chat sidebar and other surfaces can resolve their output. ` +
        `The \`skill\` field is optional: its presence selects a guided harness; ` +
        `its absence selects agent-led execution. See ` +
        `src/lib/data/task-create-helpers.ts and the execution-gate protocol.`,
      missing
    );
  }
}

/**
 * Canonical chat thread id for a task. Always `task-{id.lower()}`.
 * Example: `P01-T03` → `task-p01-t03`.
 *
 * This id is the FILENAME (without `.json`) of the MC chat thread file:
 *   `brand/{slug}/chat/{canonicalChatThreadId}.json`
 */
export function canonicalChatThreadId(taskId: string): string {
  return `task-${taskId.toLowerCase()}`;
}

/** Canonical chat thread id for a project. `project-{id.lower()}`. */
export function canonicalProjectChatThreadId(projectId: string): string {
  return `project-${projectId.toLowerCase()}`;
}

/**
 * Ensure an empty chat thread file exists for the given slug + chat id.
 * Creates the file if missing, with shape `{ "messages": [] }`. Idempotent —
 * if the file already exists, leaves it alone.
 *
 * Called at task/project creation time so the chat sidebar has a thread
 * to bind to immediately, instead of creating it lazily on first send.
 */
export function ensureEmptyChatThread(slug: string, chatThreadId: string): void {
  const chatDir = path.join(BASE, "brand", slug, "chat");
  fs.mkdirSync(chatDir, { recursive: true });
  const filePath = path.join(chatDir, `${chatThreadId}.json`);
  if (fs.existsSync(filePath)) return;
  fs.writeFileSync(
    filePath,
    JSON.stringify({ messages: [], createdAt: new Date().toISOString() }, null, 2)
  );
}

/**
 * Populate the anchors on a task-input before writing to tasks.json.
 * Mutates `task` in place. Validates `deliverable_file` when required;
 * auto-computes `mc_chat_thread_id` if missing.
 *
 * Also creates the empty chat thread JSON file.
 *
 * Use this in every create endpoint AFTER assigning the task id.
 */
export function applyTaskAnchors(slug: string, task: TaskCreateInput): TaskCreateInput {
  requireTaskAnchors(task);
  const mcChatThreadId = task.mc_chat_thread_id || canonicalChatThreadId(task.id);
  task.mc_chat_thread_id = mcChatThreadId;
  ensureEmptyChatThread(slug, mcChatThreadId);
  return task;
}

/** Same as `applyTaskAnchors` but for projects. Skill is optional. */
export function applyProjectAnchors(slug: string, project: ProjectCreateInput): ProjectCreateInput {
  const mcChatThreadId =
    project.mc_chat_thread_id || canonicalProjectChatThreadId(project.id);
  project.mc_chat_thread_id = mcChatThreadId;
  ensureEmptyChatThread(slug, mcChatThreadId);
  return project;
}
