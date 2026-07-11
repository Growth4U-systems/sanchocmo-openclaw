import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspace = process.cwd();
const sidebar = fs.readFileSync(
  path.join(workspace, "src/components/layout/Sidebar.tsx"),
  "utf8",
);
const chatSidebar = fs.readFileSync(
  path.join(workspace, "src/components/chat/chat-sidebar.tsx"),
  "utf8",
);

test("the global chat entry opens General without creating a task", () => {
  assert.match(sidebar, /function openChat\(\)/);
  assert.match(sidebar, /buildGeneralThread\(chatSlug\)/);
  assert.match(sidebar, /t\("chat\.openChat"\)/);
  assert.doesNotMatch(sidebar, /buildNewTaskThread/);
});

test("new task creation is an explicit action inside chat", () => {
  assert.match(chatSidebar, /selectThread\(buildNewTaskThread\(slug\)\)/);
  assert.match(chatSidebar, /onClick=\{handleNewTask\}/);
  assert.match(chatSidebar, /t\("newTask"\)/);
});
