import assert from "node:assert/strict";
import { test } from "node:test";
import type { TaskIndexEntry } from "../task-index-types";

const {
  projectTaskIndex,
  taskIndexEntryKey,
  taskIndexProjectIsExpanded,
} = await import("../task-index-hierarchy");

function entry(taskId: string, overrides: Partial<TaskIndexEntry> = {}): TaskIndexEntry {
  return {
    projectId: "P00",
    projectName: "Fast Foundation",
    taskId,
    taskName: taskId,
    status: "todo",
    skill: "fast-foundation",
    skillOk: true,
    deliverableFile: `brand/acme/tasks/${taskId}/deliverable.md`,
    docExists: true,
    mcChatThreadId: `acme:task:${taskId.toLowerCase()}`,
    threadFileExists: true,
    pillar: null,
    type: "execution",
    ...overrides,
  };
}

const parent = entry("P00-T01", { taskName: "Ejecutar Fast Foundation" });
const childOne = entry("P00-T01.1", { parentTaskId: parent.taskId, taskName: "Configurar fuentes" });
const childTwo = entry("P00-T01.2", { parentTaskId: parent.taskId, taskName: "Verificar contexto" });
const sibling = entry("P00-T02", { taskName: "Meeting Intelligence" });
const hierarchy = [parent, childOne, childTwo, sibling];

test("project accordions start closed and open automatically for active projections", () => {
  assert.equal(taskIndexProjectIsExpanded("P00", new Set(), "all", ""), false);
  assert.equal(taskIndexProjectIsExpanded("P00", new Set(["P00"]), "all", ""), true);
  assert.equal(taskIndexProjectIsExpanded("P00", new Set(), "issues", ""), true);
  assert.equal(taskIndexProjectIsExpanded("P00", new Set(), "all", "fuentes"), true);
  assert.equal(taskIndexProjectIsExpanded("P00", new Set(), "all", "   "), false);
});

test("the approved default keeps child rows collapsed", () => {
  const groups = projectTaskIndex(hierarchy, { filter: "all", search: "", expanded: new Set() });

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].rows.map((row) => row.entry.taskId), ["P00-T01", "P00-T02"]);
  assert.equal(groups[0].rows[0].hasChildren, true);
  assert.equal(groups[0].rows[0].expanded, false);
  assert.equal(groups[0].rows[0].autoExpanded, false);
});

test("expanding a task only inserts its indented descendants inline", () => {
  const expanded = new Set([taskIndexEntryKey(parent)]);
  const groups = projectTaskIndex(hierarchy, { filter: "all", search: "", expanded });

  assert.deepEqual(groups[0].rows.map((row) => [row.entry.taskId, row.depth]), [
    ["P00-T01", 0],
    ["P00-T01.1", 1],
    ["P00-T01.2", 1],
    ["P00-T02", 0],
  ]);
});

test("search retains and auto-expands the ancestor of a matching child", () => {
  const groups = projectTaskIndex(hierarchy, { filter: "all", search: "fuentes", expanded: new Set() });

  assert.deepEqual(groups[0].rows.map((row) => row.entry.taskId), ["P00-T01", "P00-T01.1"]);
  assert.equal(groups[0].rows[0].expanded, true);
  assert.equal(groups[0].rows[0].autoExpanded, true);
});

test("issue filtering keeps parent context without leaking unrelated rows", () => {
  const withIssue = hierarchy.map((item) => (
    item.taskId === childTwo.taskId ? { ...item, docExists: false } : item
  ));
  const groups = projectTaskIndex(withIssue, { filter: "issues", search: "", expanded: new Set() });

  assert.deepEqual(groups[0].rows.map((row) => row.entry.taskId), ["P00-T01", "P00-T01.2"]);
});

test("cyclic parent data remains visible and is emitted only once", () => {
  const cyclic = [
    entry("P00-A", { parentTaskId: "P00-B" }),
    entry("P00-B", { parentTaskId: "P00-A" }),
  ];
  const groups = projectTaskIndex(cyclic, { filter: "all", search: "", expanded: new Set(["P00::P00-A"]) });

  assert.deepEqual(new Set(groups[0].rows.map((row) => row.entry.taskId)), new Set(["P00-A", "P00-B"]));
  assert.equal(groups[0].rows.length, 2);
});
