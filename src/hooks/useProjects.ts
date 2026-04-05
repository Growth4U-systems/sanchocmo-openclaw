import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project, Task } from "@/types";

interface ProjectWithTasks {
  project: Project;
  tasks: Task[];
}

export function useProjects(slug: string | null) {
  return useQuery<ProjectWithTasks[]>({
    queryKey: ["projects", slug],
    queryFn: async () => {
      const res = await fetch(`/api/projects?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      return data.projects || [];
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
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

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; projectId: string; updates: Partial<Project> }) => {
      const res = await fetch("/api/projects/project-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
