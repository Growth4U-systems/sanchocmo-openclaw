import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ContentTask, ContentTaskStatus, ContentTaskPipelineState } from "@/types";

/**
 * Whether the CT is in a phase where the agent or system is actively working
 * on it — used to decide whether to poll for state updates. The user-driven
 * stable states (Draft awaiting human, media-review, Ready, terminal) don't
 * need polling: nothing is going to change without user action.
 */
function isWorkingState(ct: ContentTask | null | undefined): boolean {
  if (!ct) return false;
  // Terminal / already-final: nobody is going to advance them without user
  // action that itself triggers an invalidation.
  if (ct.status === "Published" || ct.status === "Discarded" || ct.status === "Deferred") {
    return false;
  }
  // Any non-terminal state: poll. Sancho can advance Draft → Pending Media
  // (after media generation) or Pending Media → Pending Media/media-review
  // (after attaching assets) without the user touching anything, so we have
  // to keep refetching until the CT lands in a terminal state. Previously
  // we stopped polling at Draft/Ready/Pending Media and the UI showed stale
  // "Aprobar texto" buttons → 409 on click.
  return true;
}

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
    // Poll every 5s while any CT in the list is being worked on, so the
    // kanban reflects channel_phases / pipeline_state moves the agent
    // makes via PATCH without the user having to refresh.
    refetchInterval: (q) => {
      const list = q.state.data || [];
      return list.some(isWorkingState) ? 5_000 : false;
    },
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
    refetchInterval: (q) => (isWorkingState(q.state.data) ? 5_000 : false),
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
      qc.invalidateQueries({ queryKey: ["tasks", v.slug] });
      qc.invalidateQueries({ queryKey: ["task-rows", v.slug] });
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
      qc.invalidateQueries({ queryKey: ["tasks", v.slug] });
      qc.invalidateQueries({ queryKey: ["task-rows", v.slug] });
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
      qc.invalidateQueries({ queryKey: ["tasks", v.slug] });
      qc.invalidateQueries({ queryKey: ["task-rows", v.slug] });
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
      qc.invalidateQueries({ queryKey: ["tasks", v.slug] });
      qc.invalidateQueries({ queryKey: ["task-rows", v.slug] });
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
      qc.invalidateQueries({ queryKey: ["tasks", v.slug] });
      qc.invalidateQueries({ queryKey: ["task-rows", v.slug] });
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
        qc.invalidateQueries({ queryKey: ["tasks", v.slug] });
        qc.invalidateQueries({ queryKey: ["task-rows", v.slug] });
      },
      // On failure — typically a 409 because the local CT state is stale (the
      // agent advanced the CT via PATCH before this click landed) — refresh
      // the CT immediately so the next render shows the correct button for
      // the actual current status, instead of an action that just 409'd.
      onError: (_e, v) => {
        qc.invalidateQueries({ queryKey: ["content-task", v.slug, v.parentTaskId, v.id] });
        qc.invalidateQueries({ queryKey: ["content-tasks", v.slug, v.parentTaskId] });
      },
    });
  };
}

export const useApproveDraft = makeActionHook("approve-draft", "Failed to approve draft");
export const useApproveMedia = makeActionHook("approve-media", "Failed to approve media");
export const usePublishContentTask = makeActionHook("publish", "Failed to publish");
export const useDiscardContentTask = makeActionHook("discard", "Failed to discard");
export const useDeferContentTask = makeActionHook("defer", "Failed to defer");
