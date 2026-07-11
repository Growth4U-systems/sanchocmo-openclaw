import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-task-routing-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";

const {
  canonicalTaskRouteThreadId,
  resolveSameGroupTaskRoute,
  resolveSameGroupTaskRouteFromRows,
  scoreTaskRouteCandidate,
} = await import("../task-routing");

type Row = Parameters<typeof scoreTaskRouteCandidate>[0];

function project(id: string): Row {
  return {
    id,
    name: `Group ${id}`,
    type: "project",
    status: "active",
    parent_id: null,
    project_id: id,
    depth: 0,
  };
}

function task(id: string, groupId: string, fields: Partial<Row> = {}): Row {
  return {
    id,
    name: `Task ${id}`,
    type: "execution",
    status: "todo",
    parent_id: groupId,
    project_id: groupId,
    depth: 1,
    ...fields,
  };
}

test("pure scorer requires exact anchors and never reuses a fuzzy name alone", () => {
  const candidate = task("P1-T1", "P1", {
    name: "Estrategia contenido trimestral",
    agent: "dulcinea",
    skill: "content-strategy",
  });

  const anchored = scoreTaskRouteCandidate(candidate, {
    requestedName: "Estrategia de contenido trimestral",
    requestedAgent: "Dulcinea",
    requestedSkill: "content-strategy",
  });
  assert.equal(anchored.strength, "strong");
  assert.equal(anchored.eligibleForReuse, true);
  assert.ok(anchored.signals.includes("name_strong"));

  const nameOnly = scoreTaskRouteCandidate(candidate, {
    requestedName: "Estrategia de contenido trimestral",
  });
  assert.equal(nameOnly.strength, "weak");
  assert.equal(nameOnly.eligibleForReuse, false);

  const wrongAgent = scoreTaskRouteCandidate(candidate, {
    requestedAgent: "rocinante",
    requestedSkill: "content-strategy",
  });
  assert.equal(wrongAgent.eligibleForReuse, false);
  assert.ok(wrongAgent.signals.includes("agent_mismatch"));
});

test("a unique compatible active task is reused only inside the source group", () => {
  const rows = [
    project("P1"),
    project("P2"),
    task("P1-T0", "P1", { mc_chat_thread_id: "task-p1-t0" }),
    task("P1-T1", "P1", {
      name: "Crear calendario editorial",
      agent: "dulcinea",
      skill: "social-writer",
      mc_chat_thread_id: "demo:task:P1-T1",
    }),
    task("P2-T1", "P2", {
      name: "Crear calendario editorial",
      agent: "dulcinea",
      skill: "social-writer",
    }),
  ];

  const resolution = resolveSameGroupTaskRouteFromRows(rows, {
    clientSlug: "demo",
    sourceThreadId: "demo:task-p1-t0",
    requestedName: "Crear calendario editorial",
    requestedAgent: "dulcinea",
    requestedSkill: "social-writer",
  });

  assert.equal(resolution.kind, "reuse");
  if (resolution.kind !== "reuse") return;
  assert.equal(resolution.reason, "unique_compatible");
  assert.equal(resolution.groupId, "P1");
  assert.equal(resolution.target.taskId, "P1-T1");
  assert.equal(resolution.target.targetThreadId, "demo:task-P1-T1");
});

test("multiple equally compatible tasks are returned as deterministic choices", () => {
  const rows = [
    project("P1"),
    task("P1-T2", "P1", { name: "B task", skill: "research" }),
    task("P1-T1", "P1", { name: "A task", skill: "research" }),
  ];
  const resolution = resolveSameGroupTaskRouteFromRows(rows, {
    clientSlug: "demo",
    groupId: "P1",
    requestedSkill: "research",
  });

  assert.equal(resolution.kind, "ambiguous");
  if (resolution.kind !== "ambiguous") return;
  assert.equal(resolution.reason, "multiple_compatible");
  assert.deepEqual(resolution.candidates.map((candidate) => candidate.taskId), ["P1-T1", "P1-T2"]);
});

test("a unique exact-name candidate beats nearby strong candidates", () => {
  const rows = [
    project("P1"),
    task("P1-T1", "P1", {
      name: "Estrategia de contenido trimestral",
      skill: "content-strategy",
    }),
    task("P1-T2", "P1", {
      name: "Estrategia contenido trimestral",
      skill: "content-strategy",
    }),
  ];
  const resolution = resolveSameGroupTaskRouteFromRows(rows, {
    clientSlug: "demo",
    groupId: "P1",
    requestedName: "Estrategia de contenido trimestral",
    requestedSkill: "content-strategy",
  });

  assert.equal(resolution.kind, "reuse");
  if (resolution.kind !== "reuse") return;
  assert.equal(resolution.target.taskId, "P1-T1");
});

test("terminal tasks are excluded and creation is suggested in the same group", () => {
  const rows = [
    project("P1"),
    task("P1-T0", "P1"),
    task("P1-T1", "P1", {
      name: "Auditar mercado",
      status: "completed",
      agent: "rocinante",
      skill: "market-research",
    }),
  ];
  const resolution = resolveSameGroupTaskRouteFromRows(rows, {
    clientSlug: "demo",
    sourceTaskId: "P1-T0",
    requestedName: "Auditar mercado",
    requestedAgent: "rocinante",
    requestedSkill: "market-research",
  });

  assert.equal(resolution.kind, "suggest_create");
  if (resolution.kind !== "suggest_create") return;
  assert.equal(resolution.groupId, "P1");
  assert.equal(resolution.reason, "no_compatible_task");
  assert.deepEqual(resolution.nearbyCandidates, []);
});

test("an explicit active target wins without heuristic compatibility checks", () => {
  const rows = [
    project("P1"),
    task("P1-T1", "P1", {
      name: "Target",
      agent: "dulcinea",
      skill: "social-writer",
      mc_chat_thread_id: "demo:skill:editorial",
    }),
  ];
  const resolution = resolveSameGroupTaskRouteFromRows(rows, {
    clientSlug: "demo",
    targetTaskId: "p1-t1",
    targetThreadId: "demo:skill-editorial",
    requestedAgent: "rocinante",
    requestedSkill: "market-research",
  });

  assert.equal(resolution.kind, "reuse");
  if (resolution.kind !== "reuse") return;
  assert.equal(resolution.reason, "explicit_target");
  assert.equal(resolution.target.targetThreadId, "demo:skill-editorial");
});

test("an explicit target cannot cross the supplied source/group boundary", () => {
  const rows = [
    project("P1"),
    project("P2"),
    task("P1-T0", "P1", { mc_chat_thread_id: "task-p1-t0" }),
    task("P2-T1", "P2", {
      name: "Target in another group",
      skill: "research",
      mc_chat_thread_id: "task-p2-t1",
    }),
  ];

  const bounded = resolveSameGroupTaskRouteFromRows(rows, {
    clientSlug: "demo",
    sourceTaskId: "P1-T0",
    targetTaskId: "P2-T1",
  });
  assert.equal(bounded.kind, "suggest_create");
  if (bounded.kind !== "suggest_create") return;
  assert.equal(bounded.reason, "explicit_target_outside_group");
  assert.equal(bounded.groupId, "P1");
  assert.equal(bounded.unavailableTarget?.groupId, "P2");

  const unbounded = resolveSameGroupTaskRouteFromRows(rows, {
    clientSlug: "demo",
    targetTaskId: "P2-T1",
  });
  assert.equal(unbounded.kind, "reuse");
  if (unbounded.kind !== "reuse") return;
  assert.equal(unbounded.reason, "explicit_target");
  assert.equal(unbounded.groupId, "P2");

  const inactiveRows = rows.map((row) => row.id === "P2-T1" ? { ...row, status: "archived" } : row);
  const inactiveOutside = resolveSameGroupTaskRouteFromRows(inactiveRows, {
    clientSlug: "demo",
    sourceTaskId: "P1-T0",
    targetTaskId: "P2-T1",
  });
  assert.equal(inactiveOutside.kind, "suggest_create");
  if (inactiveOutside.kind !== "suggest_create") return;
  assert.equal(inactiveOutside.reason, "explicit_target_outside_group");
});

test("heuristic routing excludes the source task but explicit targeting may reuse it", () => {
  const rows = [
    project("P1"),
    task("P1-T0", "P1", {
      name: "Research market",
      agent: "rocinante",
      skill: "market-research",
      mc_chat_thread_id: "task-p1-t0",
    }),
  ];

  const heuristic = resolveSameGroupTaskRouteFromRows(rows, {
    clientSlug: "demo",
    sourceThreadId: "demo:task-p1-t0",
    requestedName: "Research market",
    requestedAgent: "rocinante",
    requestedSkill: "market-research",
  });
  assert.equal(heuristic.kind, "suggest_create");
  if (heuristic.kind !== "suggest_create") return;
  assert.equal(heuristic.reason, "no_compatible_task");
  assert.equal(heuristic.groupId, "P1");

  const explicit = resolveSameGroupTaskRouteFromRows(rows, {
    clientSlug: "demo",
    sourceThreadId: "demo:task-p1-t0",
    targetTaskId: "P1-T0",
  });
  assert.equal(explicit.kind, "reuse");
  if (explicit.kind !== "reuse") return;
  assert.equal(explicit.reason, "explicit_target");
  assert.equal(explicit.target.taskId, "P1-T0");
});

test("an explicit inactive target is never reused", () => {
  const rows = [
    project("P1"),
    task("P1-T1", "P1", { status: "archived", mc_chat_thread_id: "task-p1-t1" }),
  ];
  const resolution = resolveSameGroupTaskRouteFromRows(rows, {
    clientSlug: "demo",
    groupId: "P1",
    targetTaskId: "P1-T1",
  });

  assert.equal(resolution.kind, "suggest_create");
  if (resolution.kind !== "suggest_create") return;
  assert.equal(resolution.reason, "explicit_target_inactive");
  assert.equal(resolution.unavailableTarget?.taskId, "P1-T1");
});

test("group context is required when neither source nor explicit group resolves", () => {
  const rows = [project("P1")];
  assert.deepEqual(
    resolveSameGroupTaskRouteFromRows(rows, {
      clientSlug: "demo",
      requestedSkill: "research",
    }),
    { kind: "group_required", reason: "no_group_context" },
  );
  assert.deepEqual(
    resolveSameGroupTaskRouteFromRows(rows, {
      clientSlug: "demo",
      sourceTaskId: "missing",
      requestedSkill: "research",
    }),
    { kind: "group_required", reason: "source_not_found" },
  );
});

test("canonical target threads use persisted anchors and safe task fallbacks", () => {
  assert.equal(
    canonicalTaskRouteThreadId(task("P1-T1", "P1", { mc_chat_thread_id: "task-p1-t1" }), "demo"),
    "demo:task-p1-t1",
  );
  assert.equal(
    canonicalTaskRouteThreadId(task("P1-T2", "P1"), "demo"),
    "demo:task-p1-t2",
  );
});

test("async resolver reads the existing JSON unified task backend", async () => {
  const projectDir = path.join(tmp, "brand", "json-demo", "projects", "P9");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "project.json"), JSON.stringify({
    id: "P9",
    slug: "group-p9",
    name: "Group P9",
    strategy: "growth",
    status: "active",
    phase: 1,
    category: "growth",
    created_at: new Date(0).toISOString(),
    review_date: null,
  }));
  fs.writeFileSync(path.join(projectDir, "tasks.json"), JSON.stringify([{
    id: "P9-T1",
    name: "Research market",
    description: "",
    deliverable: "",
    done_criteria: "",
    depends_on: null,
    owner: "Rocinante",
    agent: "rocinante",
    status: "todo",
    channel: "intelligence",
    type: "research",
    skill: "market-research",
    output_files: [],
    mc_chat_thread_id: "task-p9-t1",
  }]));

  const resolution = await resolveSameGroupTaskRoute({
    clientSlug: "json-demo",
    groupId: "P9",
    requestedName: "Research market",
    requestedAgent: "rocinante",
    requestedSkill: "market-research",
  });
  assert.equal(resolution.kind, "reuse");
  if (resolution.kind !== "reuse") return;
  assert.equal(resolution.target.taskId, "P9-T1");
  assert.equal(resolution.target.targetThreadId, "json-demo:task-p9-t1");
});
