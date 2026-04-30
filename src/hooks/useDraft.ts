import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Draft, DraftFrontmatter } from "@/lib/data/drafts";

interface DraftResponse {
  ok: boolean;
  draft?: Draft;
  error?: string;
}

interface DraftListResponse {
  ok: boolean;
  drafts?: Draft[];
  error?: string;
}

export function useDraft(
  slug: string | null,
  ideaId: string | null,
  channel: string | null,
) {
  return useQuery<Draft | null>({
    queryKey: ["draft", slug, ideaId, channel],
    queryFn: async () => {
      const res = await fetch(
        `/api/content-engine/drafts?slug=${slug}&ideaId=${ideaId}&channel=${channel}`,
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch draft");
      const data = (await res.json()) as DraftResponse;
      return data.draft || null;
    },
    enabled: !!slug && !!ideaId && !!channel,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

export function useDraftList(slug: string | null, ideaId: string | null) {
  return useQuery<Draft[]>({
    queryKey: ["drafts", slug, ideaId],
    queryFn: async () => {
      const res = await fetch(
        `/api/content-engine/drafts?slug=${slug}&ideaId=${ideaId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch drafts");
      const data = (await res.json()) as DraftListResponse;
      return data.drafts || [];
    },
    enabled: !!slug && !!ideaId,
    staleTime: 30_000,
  });
}

interface SaveDraftVars {
  slug: string;
  ideaId: string;
  channel: string;
  body?: string;
  meta?: Partial<DraftFrontmatter>;
}

export function useSaveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SaveDraftVars) => {
      const res = await fetch("/api/content-engine/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to save draft");
      }
      return (await res.json()) as DraftResponse;
    },
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: ["draft", v.slug, v.ideaId, v.channel] });
      qc.invalidateQueries({ queryKey: ["drafts", v.slug, v.ideaId] });
    },
  });
}

interface IterateDraftVars {
  slug: string;
  ideaId: string;
  channel: string;
  instruction: string;
}

export function useIterateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: IterateDraftVars) => {
      const res = await fetch("/api/content-engine/iterate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to request iteration");
      }
      return (await res.json()) as DraftResponse & { iteration?: number };
    },
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: ["draft", v.slug, v.ideaId, v.channel] });
      qc.invalidateQueries({ queryKey: ["chat", "thread"] });
    },
  });
}
