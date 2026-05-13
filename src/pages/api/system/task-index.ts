/**
 * GET /api/system/task-index?slug=X
 *
 * Canonical task execution index. Reads the unified `tasks` table through
 * the data layer, not legacy project JSON files.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { listUnifiedTaskRowsAsync, type UnifiedTaskRow } from "@/lib/data/tasks";
import { BASE } from "@/lib/data/paths";
import {
  dependencyIds,
  documentRefsFromUnknown,
  inferTaskExecutionContract,
  requiredInputsFromUnknown,
  skillListFromUnknown,
  type TaskDocumentRef,
  type RequiredInputRef,
} from "@/lib/data/task-execution-contract";

interface TaskIndexEntry {
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
  status: string;
  type: string;
  agent: string;
  skill: string;
  skills: string[];
  inputDocuments: TaskDocumentRef[];
  requiredInputs: RequiredInputRef[];
  outputDocuments: TaskDocumentRef[];
  dependsOn: string[];
  mcChatThreadId: string;
  threadFileExists: boolean;
  outputDocsExist: number;
  outputDocsMissing: number;
  issues: string[];
  ok: boolean;
  pillar: string | null;
  parentTaskId?: string;
  isContentTask?: boolean;
}

function absBrandPath(slug: string, docPath: string) {
  const clean = docPath.replace(/^\/+/, "");
  if (clean.startsWith(BASE)) return clean;
  if (clean.startsWith("brand/")) return path.join(BASE, clean.slice("brand/".length));
  return path.join(BASE, "brand", slug, clean);
}

function docExists(slug: string, doc: TaskDocumentRef) {
  return !!doc.path && fs.existsSync(absBrandPath(slug, doc.path));
}

function asOutputDocuments(row: UnifiedTaskRow, brandSlug: string): TaskDocumentRef[] {
  const contract = inferTaskExecutionContract(row as unknown as Parameters<typeof inferTaskExecutionContract>[0], { brandSlug });
  return contract.outputDocuments.length > 0
    ? contract.outputDocuments
    : [
        ...documentRefsFromUnknown(row.deliverable_file, "deliverable_file"),
        ...documentRefsFromUnknown(row.output_files, "output_files"),
        ...documentRefsFromUnknown(row.documents, "documents"),
      ];
}

function projectFor(row: UnifiedTaskRow, rowsById: Map<string, UnifiedTaskRow>) {
  if (row.type === "project") return row;
  let current: UnifiedTaskRow | undefined = row;
  const seen = new Set<string>();
  while (current?.parent_id && !seen.has(current.parent_id)) {
    seen.add(current.parent_id);
    const parent = rowsById.get(current.parent_id);
    if (!parent) break;
    if (parent.type === "project") return parent;
    current = parent;
  }
  return row.project_id ? rowsById.get(row.project_id) || null : null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const rows = await listUnifiedTaskRowsAsync(slug);
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const outputById = new Map(rows.map((row) => [row.id, asOutputDocuments(row, slug)]));

  const entries: TaskIndexEntry[] = rows.map((row) => {
    const project = projectFor(row, rowsById);
    const dependencyOutputs = dependencyIds(row.depends_on).flatMap((id) => outputById.get(id) || []);
    const contract = inferTaskExecutionContract(row as unknown as Parameters<typeof inferTaskExecutionContract>[0], {
      brandSlug: slug,
      dependencyOutputs,
    });
    const agent = row.agent || contract.agent;
    const skill = row.skill || contract.skill;
    const skills = skillListFromUnknown(row.skills).length ? skillListFromUnknown(row.skills) : contract.skills;
    const inputDocuments = documentRefsFromUnknown(row.input_documents, "input_documents").length
      ? documentRefsFromUnknown(row.input_documents, "input_documents")
      : contract.inputDocuments;
    const requiredInputs = requiredInputsFromUnknown(row.required_inputs);
    const outputDocuments = asOutputDocuments(row, slug);
    const outputDocsExist = outputDocuments.filter((doc) => docExists(slug, doc)).length;
    const outputDocsMissing = Math.max(0, outputDocuments.length - outputDocsExist);
    const thread = row.mc_chat_thread_id || `${row.type === "content_task" ? "content" : row.type === "project" ? "project" : "task"}-${row.id.toLowerCase()}`;
    const threadFileExists = fs.existsSync(path.join(BASE, "brand", slug, "chat", `${thread}.json`));
    const dependsOn = dependencyIds(row.depends_on);
    const issues: string[] = [];

    if (!agent) issues.push("Sin agente");
    if (!skill) issues.push("Sin skill primaria");
    if (skills.length === 0) issues.push("Sin skills");
    if (outputDocuments.length === 0) issues.push("Sin output document");
    if (!threadFileExists) issues.push("Sin thread");
    if (dependsOn.length > 0 && inputDocuments.length === 0) issues.push("Dependencias sin inputs documentales");
    if (requiredInputs.some((input) => !input.optional) && inputDocuments.length === 0) issues.push("Inputs requeridos sin evidencia");

    return {
      projectId: project?.id || row.project_id || row.id,
      projectName: project?.name || row.parent_name || row.name,
      taskId: row.id,
      taskName: row.name,
      status: row.status,
      type: row.type,
      agent,
      skill,
      skills,
      inputDocuments,
      requiredInputs,
      outputDocuments,
      dependsOn,
      mcChatThreadId: thread,
      threadFileExists,
      outputDocsExist,
      outputDocsMissing,
      issues,
      ok: issues.length === 0,
      pillar: row.pillar || null,
      parentTaskId: row.parent_id || undefined,
      isContentTask: row.type === "content_task" || row.type === "content_subtask",
    };
  });

  const stats = {
    total: entries.length,
    ok: entries.filter((entry) => entry.ok).length,
    issues: entries.filter((entry) => !entry.ok).length,
    agentOk: entries.filter((entry) => !!entry.agent).length,
    skillOk: entries.filter((entry) => !!entry.skill && entry.skills.length > 0).length,
    outputOk: entries.filter((entry) => entry.outputDocuments.length > 0).length,
    inputOk: entries.filter((entry) => entry.dependsOn.length === 0 || entry.inputDocuments.length > 0).length,
    threadOk: entries.filter((entry) => entry.threadFileExists).length,
  };

  return res.status(200).json({ ok: true, entries, stats });
}

export default withErrorHandler(handler);
