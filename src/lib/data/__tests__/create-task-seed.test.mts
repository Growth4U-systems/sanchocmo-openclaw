/**
 * SAN-195 (b) · createTask({ seedFromTaskSet }) — el creador genérico siembra
 * un task-set del manifest al crear un proyecto (sin endpoint nuevo). Es el path
 * exacto que llama la UI de Outreach ("Crear proyecto de Outreach") y
 * createDiscoverySearch (proyecto por búsqueda).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-createtask-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";

const { createTask, listProjectsWithTasks } = await import("../tasks");

const SLUG = "demo";

test("createTask(type=project, seedFromTaskSet) seeds the manifest task-set, anchored", async () => {
  const project = (await createTask(SLUG, {
    type: "project",
    name: "Outreach",
    category: "outreach-setup",
    status: "in-progress",
    seedFromTaskSet: "outreach-setup",
  })) as { id: string };

  assert.ok(project.id, "project id assigned");

  // project.json: category set, seed directive NOT leaked into the stored project.
  const projDir = path.join(tmp, "brand", SLUG, "projects", project.id);
  const proj = JSON.parse(fs.readFileSync(path.join(projDir, "project.json"), "utf-8")) as Record<string, unknown>;
  assert.equal(proj.category, "outreach-setup");
  assert.equal(proj.seedFromTaskSet, undefined, "seedFromTaskSet is a directive, not a field");

  // tasks.json: 3 anchored tasks (integration tasks omit deliverable_file).
  const tasks = JSON.parse(fs.readFileSync(path.join(projDir, "tasks.json"), "utf-8")) as Array<Record<string, unknown>>;
  assert.equal(tasks.length, 3);
  assert.deepEqual(
    tasks.map((t) => t.id),
    [`${project.id}-T01`, `${project.id}-T02`, `${project.id}-T03`],
  );
  assert.equal(tasks[0].skill, "yalc-operator");
  assert.equal(tasks[0].agent, "rocinante");
  assert.equal(tasks[0].deliverable_file, undefined, "T01 (integration) omits deliverable_file");
  assert.equal(tasks[1].deliverable_file, `brand/${SLUG}/outreach-playbook/outreach-playbook.current.md`);
  assert.equal(tasks[0].mc_chat_thread_id, `task-${project.id.toLowerCase()}-t01`);

  // Anchors created the empty chat thread file for each task.
  for (const t of tasks) {
    const threadFile = path.join(tmp, "brand", SLUG, "chat", `${t.mc_chat_thread_id}.json`);
    assert.ok(fs.existsSync(threadFile), `chat thread created for ${t.id}`);
  }

  // Listing surfaces the project with its seeded children.
  const listed = await listProjectsWithTasks(SLUG);
  const found = listed.find((p) => p.project.id === project.id);
  assert.ok(found, "project listed");
  assert.equal(found?.tasks.length, 3);
});

test("createTask with unknown seedFromTaskSet throws", async () => {
  await assert.rejects(
    () => createTask(SLUG, { type: "project", name: "x", seedFromTaskSet: "does-not-exist" }),
    /unknown seedFromTaskSet/,
  );
});

test("createTask(type=project) without seedFromTaskSet stays empty (no behavior change)", async () => {
  const project = (await createTask(SLUG, { type: "project", name: "Plain" })) as { id: string };
  const projDir = path.join(tmp, "brand", SLUG, "projects", project.id);
  const tasks = JSON.parse(fs.readFileSync(path.join(projDir, "tasks.json"), "utf-8")) as unknown[];
  assert.deepEqual(tasks, [], "no seed → empty tasks.json (unchanged)");
});
