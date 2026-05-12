import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project, Task } from "@/types";
import { useTasks } from "@/hooks/useTasks";

interface ProjectWithTasks {
  project: Project;
  tasks: Task[];
}

export function useProjects(slug: string | null) {
  return useTasks(slug, { type: "project", include: "children" }) as ReturnType<typeof useQuery<ProjectWithTasks[]>>;
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; projectId: string; taskId: string; status: string }) => {
      const res = await fetch("/api/projects/task-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update task status");
      return res.json();
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["projects", v.slug] }); },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; taskId: string; fields: Partial<Task> }) => {
      const res = await fetch("/api/projects/task-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update task");
      return res.json();
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["projects", v.slug] }); },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; projectId: string; updates: Partial<Project> }) => {
      const { slug, projectId, updates } = body;
      const res = await fetch("/api/projects/project-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, projectId, fields: updates }),
      });
      if (!res.ok) throw new Error("Failed to update project");
      return res.json();
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["projects", v.slug] }); },
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; projectId: string }) => {
      const res = await fetch("/api/projects/project-archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to archive project");
      return res.json();
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["projects", v.slug] }); },
  });
}
