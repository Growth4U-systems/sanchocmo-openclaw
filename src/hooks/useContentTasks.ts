import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ContentTask, ContentTaskStatus, ContentTaskPipelineState } from "@/types";

interface ContentTaskListResponse {
  ok: boolean;
  contentTasks?: ContentTask[];
  error?: string;
}

interface ContentTaskOneResponse {
  ok: boolean;
  contentTask?: ContentTask;
  error?: string;
}

export function useContentTasks(slug: string | null, parentTaskId: string | null) {
  return useQuery<ContentTask[]>({
    queryKey: ["content-tasks", slug, parentTaskId],
    queryFn: async () => {
      const res = await fetch(
        `/api/content-engine/content-tasks?slug=${slug}&parentTaskId=${parentTaskId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch content tasks");
      const data = (await res.json()) as ContentTaskListResponse;
      return data.contentTasks || [];
    },
    enabled: !!slug && !!parentTaskId,
    staleTime: 30_000,
  });
}

export function useContentTask(
  slug: string | null,
  parentTaskId: string | null,
  contentTaskId: string | null,
) {
  return useQuery<ContentTask | null>({
    queryKey: ["content-task", slug, parentTaskId, contentTaskId],
    queryFn: async () => {
      const res = await fetch(
        `/api/content-engine/content-tasks?slug=${slug}&parentTaskId=${parentTaskId}&id=${contentTaskId}`,
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch content task");
      const data = (await res.json()) as ContentTaskOneResponse;
      return data.contentTask || null;
    },
    enabled: !!slug && !!parentTaskId && !!contentTaskId,
    staleTime: 30_000,
  });
}

interface UpdateStatusBody {
  slug: string;
  parentTaskId: string;
  id: string;
  status?: ContentTaskStatus;
  pipeline_state?: ContentTaskPipelineState | null;
}

export function useUpdateContentTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateStatusBody) => {
      const res = await fetch("/api/content-engine/content-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to update content task status");
      }
      return (await res.json()) as ContentTaskOneResponse;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["content-tasks", v.slug, v.parentTaskId] });
      qc.invalidateQueries({ queryKey: ["content-task", v.slug, v.parentTaskId, v.id] });
      qc.invalidateQueries({ queryKey: ["projects", v.slug] });
    },
  });
}

interface UpdateContentTaskBody {
  slug: string;
  parentTaskId: string;
  id: string;
  fields: Partial<
    Pick<
      ContentTask,
      | "name"
      | "skill"
      | "target_channels"
      | "documents"
      | "mc_chat_thread_id"
      | "discord_thread_id"
      | "owner"
      | "scheduled_for"
      | "clarify_status"
    >
  >;
}

export function useUpdateContentTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateContentTaskBody) => {
      const { slug, parentTaskId, id, fields } = body;
      const res = await fetch("/api/content-engine/content-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, parentTaskId, id, ...fields }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to update content task");
      }
      return (await res.json()) as ContentTaskOneResponse;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["content-tasks", v.slug, v.parentTaskId] });
      qc.invalidateQueries({ queryKey: ["content-task", v.slug, v.parentTaskId, v.id] });
      qc.invalidateQueries({ queryKey: ["projects", v.slug] });
    },
  });
}

interface AttachDocBody {
  slug: string;
  parentTaskId: string;
  id: string;
  document: { path: string; name?: string; channel?: string };
}

export function useAttachDocumentToContentTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AttachDocBody) => {
      const res = await fetch("/api/content-engine/content-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, action: "attach-document" }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to attach document");
      }
      return (await res.json()) as ContentTaskOneResponse;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["content-tasks", v.slug, v.parentTaskId] });
      qc.invalidateQueries({ queryKey: ["content-task", v.slug, v.parentTaskId, v.id] });
      qc.invalidateQueries({ queryKey: ["projects", v.slug] });
    },
  });
}

interface DetachDocBody {
  slug: string;
  parentTaskId: string;
  id: string;
  path: string;
}

interface RetriggerBody {
  slug: string;
  contentTaskId: string;
  /** Optional: scope the retry to a single channel (kind="iterate") instead of the full set. */
  channel?: string;
  /** Free-text instruction for iterate. Empty for initial. */
  instruction?: string;
}

export function useRetriggerWriter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: RetriggerBody) => {
      const res = await fetch("/api/content-engine/retrigger-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to retrigger writer");
      }
      return (await res.json()) as { ok: boolean; writerTriggered: boolean; writerError?: string };
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["chat", "thread"] });
      qc.invalidateQueries({ queryKey: ["content-task", v.slug] });
      qc.invalidateQueries({ queryKey: ["projects", v.slug] });
    },
  });
}

export function useDetachDocumentFromContentTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: DetachDocBody) => {
      const res = await fetch("/api/content-engine/content-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, action: "detach-document" }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to detach document");
      }
      return (await res.json()) as ContentTaskOneResponse;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["content-tasks", v.slug, v.parentTaskId] });
      qc.invalidateQueries({ queryKey: ["content-task", v.slug, v.parentTaskId, v.id] });
      qc.invalidateQueries({ queryKey: ["projects", v.slug] });
    },
  });
}

interface ContentTaskActionBody {
  slug: string;
  parentTaskId: string;
  id: string;
}

function makeActionHook(action: string, errorLabel: string) {
  return function useContentTaskAction() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (body: ContentTaskActionBody) => {
        const res = await fetch("/api/content-engine/content-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, action }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error || errorLabel);
        }
        return (await res.json()) as ContentTaskOneResponse;
      },
      onSuccess: (_d, v) => {
        qc.invalidateQueries({ queryKey: ["content-tasks", v.slug, v.parentTaskId] });
        qc.invalidateQueries({ queryKey: ["content-task", v.slug, v.parentTaskId, v.id] });
        qc.invalidateQueries({ queryKey: ["projects", v.slug] });
      },
    });
  };
}

export const useApproveDraft = makeActionHook("approve-draft", "Failed to approve draft");
export const useApproveMedia = makeActionHook("approve-media", "Failed to approve media");
export const usePublishContentTask = makeActionHook("publish", "Failed to publish");
export const useDiscardContentTask = makeActionHook("discard", "Failed to discard");
export const useDeferContentTask = makeActionHook("defer", "Failed to defer");
