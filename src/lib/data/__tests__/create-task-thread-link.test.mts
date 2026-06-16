/**
 * SAN-210 · createTask({ mc_chat_thread_id }) — promover un hilo de chat a tarea.
 * El agente, al detectar trabajo real, crea la tarea con su threadId. La app:
 *   - persiste el vínculo hilo→tarea (mc_chat_thread_id),
 *   - es idempotente: una tarea por hilo (find-or-create por mc_chat_thread_id).
 * Cubre el path json (file mode). DB mode comparte la misma lógica.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-threadlink-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";

const { createTask, findTaskByThreadId } = await import("../tasks");

const SLUG = "demo";
const THREAD = "demo:skill:my-skill";

test("createTask persists mc_chat_thread_id on the created task", async () => {
  // Host project so the json backend has somewhere to place the child task.
  const project = (await createTask(SLUG, { type: "project", name: "Skills" })) as { id: string };
  const task = (await createTask(SLUG, {
    parent_id: project.id,
    name: "Crear skill my-skill",
    skill: "skill-creator",
    agent: "cervantes",
    mc_chat_thread_id: THREAD,
  })) as { id: string; mc_chat_thread_id?: string };

  assert.equal(task.mc_chat_thread_id, THREAD, "thread link stored on the task");
});

test("createTask is idempotent per thread: a second call returns the SAME task", async () => {
  const project = (await createTask(SLUG, { type: "project", name: "Skills 2" })) as { id: string };
  const first = (await createTask(SLUG, {
    parent_id: project.id,
    name: "Editar skill outreach",
    skill: "skill-creator",
    agent: "cervantes",
    mc_chat_thread_id: "demo:skill:outreach-edit",
  })) as { id: string };

  const second = (await createTask(SLUG, {
    parent_id: project.id,
    name: "Editar skill outreach (otra vez)",
    skill: "skill-creator",
    agent: "cervantes",
    mc_chat_thread_id: "demo:skill:outreach-edit",
  })) as { id: string };

  assert.equal(second.id, first.id, "same thread → same task, no duplicate");
});

test("findTaskByThreadId locates the task hung off a thread", async () => {
  const project = (await createTask(SLUG, { type: "project", name: "Media" })) as { id: string };
  const created = (await createTask(SLUG, {
    parent_id: project.id,
    name: "Refinar logo",
    skill: "od-refine",
    agent: "maese-pedro",
    mc_chat_thread_id: "demo:asset:logo-png",
  })) as { id: string };

  const found = (await findTaskByThreadId(SLUG, "demo:asset:logo-png")) as { id: string } | null;
  assert.equal(found?.id, created.id);
  assert.equal(await findTaskByThreadId(SLUG, "demo:asset:nope"), null, "unknown thread → null");
});

test("createTask without mc_chat_thread_id is unchanged (no link, always creates)", async () => {
  const project = (await createTask(SLUG, { type: "project", name: "Plain" })) as { id: string };
  const a = (await createTask(SLUG, { parent_id: project.id, name: "T" })) as { id: string; mc_chat_thread_id?: string };
  const b = (await createTask(SLUG, { parent_id: project.id, name: "T" })) as { id: string };
  assert.equal(a.mc_chat_thread_id, undefined, "no thread link when none given");
  assert.notEqual(a.id, b.id, "no idempotency without a thread id");
});
