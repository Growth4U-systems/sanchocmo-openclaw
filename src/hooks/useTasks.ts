import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Project, Task } from "@/types";

export interface ProjectWithTasks {
  project: Project;
  tasks: Task[];
}

export function useTasks(slug: string | null, opts: { type?: string; include?: string } = {}) {
  return useQuery<ProjectWithTasks[]>({
    queryKey: ["tasks", slug, opts],
    queryFn: async () => {
      const params = new URLSearchParams({ slug: slug || "" });
      if (opts.type) params.set("type", opts.type);
      if (opts.include) params.set("include", opts.include);
      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const data = await res.json();
      return data.projects || [];
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export function useTask(slug: string | null, id: string | null) {
  return useQuery({
    queryKey: ["task", slug, id],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id || "")}?slug=${encodeURIComponent(slug || "")}`);
      if (!res.ok) throw new Error("Failed to fetch task");
      return (await res.json()).task;
    },
    enabled: !!slug && !!id,
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; taskId: string; fields: Partial<Task> }) => {
      const res = await fetch(`/api/tasks/${encodeURIComponent(body.taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: body.slug, fields: body.fields }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      return res.json();
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tasks", v.slug] });
      qc.invalidateQueries({ queryKey: ["projects", v.slug] });
    },
  });
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; taskId: string; status: string }) => {
      const res = await fetch(`/api/tasks/${encodeURIComponent(body.taskId)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: body.slug, status: body.status }),
      });
      if (!res.ok) throw new Error("Failed to update task status");
      return res.json();
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tasks", v.slug] });
      qc.invalidateQueries({ queryKey: ["projects", v.slug] });
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string } & Record<string, unknown>) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create task");
      return res.json();
    },
    onSuccess: (_d, v) => {
      const task = v?.task as { brand_slug?: string; brandSlug?: string } | undefined;
      const slug = task?.brand_slug || task?.brandSlug;
      if (slug) qc.invalidateQueries({ queryKey: ["tasks", slug] });
    },
  });
}

export function useArchiveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; taskId: string; reason?: string }) => {
      const res = await fetch(`/api/tasks/${encodeURIComponent(body.taskId)}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: body.slug, reason: body.reason }),
      });
      if (!res.ok) throw new Error("Failed to archive task");
      return res.json();
    },
    onSuccess: (_d, v) => {
      const slug = v?.slug;
      if (slug) {
        qc.invalidateQueries({ queryKey: ["tasks", slug] });
        qc.invalidateQueries({ queryKey: ["projects", slug] });
      }
    },
  });
}

export function flattenTasks(tree: ProjectWithTasks[]) {
  return tree.flatMap(({ project, tasks }) => [
    { ...project, type: "project", parent_id: null },
    ...tasks.map((task) => ({ ...task, parent_id: project.id })),
  ]);
}
