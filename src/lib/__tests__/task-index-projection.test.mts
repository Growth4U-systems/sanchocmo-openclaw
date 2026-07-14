import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { UnifiedTaskRow } from "../data/tasks";

const { buildTaskIndex } = await import("../data/task-index");

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "task-index-"));
const slug = "acme";
const brand = path.join(workspace, "brand", slug);
fs.mkdirSync(path.join(brand, "docs"), { recursive: true });
fs.mkdirSync(path.join(brand, "chat"), { recursive: true });
fs.writeFileSync(path.join(brand, "docs", "exists.md"), "# Existing");
fs.writeFileSync(path.join(brand, "chat", "task-p00-t01.json"), "{}");
fs.writeFileSync(path.join(brand, "chat", "content-ct-1.json"), "{}");
fs.writeFileSync(path.join(brand, "chat", "custom-promoted.json"), "{}");

after(() => fs.rmSync(workspace, { recursive: true, force: true }));

const rows: UnifiedTaskRow[] = [
  {
    id: "P00",
    name: "Fast Foundation",
    type: "project",
    status: "in-progress",
    parent_id: null,
    project_id: "P00",
    depth: 0,
  },
  {
    id: "P00-T01",
    name: "Ejecutar Fast Foundation",
    type: "execution",
    status: "completed",
    parent_id: "P00",
    project_id: "P00",
    depth: 1,
    agent: "sancho",
    deliverable_file: "docs/exists.md",
    mc_chat_thread_id: "acme:legacy:P00-T01",
  },
  {
    id: "CT-1",
    name: "Artículo",
    type: "content_task",
    status: "Draft",
    parent_id: "P00-T01",
    parent_task_id: "P00-T01",
    project_id: "P00",
    depth: 2,
    idea_id: "idea-1",
    target_channels: ["blog", "linkedin"],
    documents: [{ path: "content/missing.md" }],
  },
  {
    id: "TASK-ORPHAN",
    name: "Independiente",
    type: "execution",
    status: "todo",
    parent_id: null,
    project_id: "P99-DELETED",
    depth: 0,
    skill: "MISSING",
  },
];

test("the index uses canonical rows, resolves anchors, and excludes project rows from stats", () => {
  const { entries, stats } = buildTaskIndex(slug, rows, { baseDir: workspace });

  assert.equal(entries.length, 3);
  assert.equal(stats.total, 3);
  assert.equal(stats.docOk, 1);
  assert.equal(stats.threadOk, 2);
  assert.equal(stats.skillOk, 1);

  const task = entries.find((entry) => entry.taskId === "P00-T01");
  assert.ok(task);
  assert.equal(task.projectName, "Fast Foundation");
  assert.equal(task.deliverableFile, "brand/acme/docs/exists.md");
  assert.equal(task.docExists, true);
  assert.equal(task.threadFileExists, true);
  assert.equal(task.mcChatThreadId, "acme:task:p00-t01");
  assert.equal(task.executionMode, "agent");
  assert.equal(task.skillOk, true);

  const contentTask = entries.find((entry) => entry.taskId === "CT-1");
  assert.ok(contentTask);
  assert.equal(contentTask.parentTaskId, "P00-T01");
  assert.equal(contentTask.skillOk, false);
  assert.equal(contentTask.threadFileExists, true);
  assert.deepEqual(contentTask.channelSkills, [
    { channel: "blog", skill: "seo-content" },
    { channel: "linkedin", skill: "social-writer" },
  ]);

  const orphan = entries.find((entry) => entry.taskId === "TASK-ORPHAN");
  assert.ok(orphan);
  assert.equal(orphan.projectId, "SIN-PROYECTO");
  assert.equal(orphan.projectName, "Tareas independientes");
  assert.equal(orphan.skillOk, false);
});

test("a persisted custom chat anchor wins over the generated task thread", () => {
  const customRows = rows.map((row) => (
    row.id === "P00-T01" ? { ...row, mc_chat_thread_id: "custom-promoted" } : row
  ));
  const { entries } = buildTaskIndex(slug, customRows, { baseDir: workspace });
  const task = entries.find((entry) => entry.taskId === "P00-T01");

  assert.ok(task);
  assert.equal(task.threadFileExists, true);
  assert.equal(task.mcChatThreadId, "acme:custom-promoted");
});
