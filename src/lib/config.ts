export type MissionControlTasksBackend = "json" | "db-shadow" | "db";

export const MC_TASKS_BACKEND: MissionControlTasksBackend = (() => {
  const raw = process.env.MC_TASKS_BACKEND || "json";
  if (raw === "json" || raw === "db-shadow" || raw === "db") return raw;
  return "json";
})();

export const MC_TASKS_WORKSPACE = process.env.MC_TASKS_WORKSPACE || "workspace-sancho";
