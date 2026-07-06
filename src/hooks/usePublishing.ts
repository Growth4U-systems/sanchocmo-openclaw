import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Draft, PublishingMeta } from "@/lib/data/drafts";
import type { ProviderInfo } from "@/lib/publishing/types";

interface ProvidersResponse {
  providers: ProviderInfo[];
}

export function usePublishProviders(slug: string | null, channel: string | null) {
  return useQuery<ProviderInfo[]>({
    queryKey: ["publishing", "providers", slug, channel],
    queryFn: async () => {
      const qs = new URLSearchParams({ slug: slug!, ...(channel ? { channel } : {}) });
      const res = await fetch(`/api/publishing/providers?${qs}`);
      if (!res.ok) throw new Error("Failed to load providers");
      const data = (await res.json()) as ProvidersResponse;
      return Array.isArray(data.providers) ? data.providers : [];
    },
    enabled: !!slug && !!channel,
    staleTime: 60_000,
  });
}

interface PublishResponse {
  ok: boolean;
  publishing?: PublishingMeta;
  draft?: Draft;
  error?: string;
}

export function usePublishDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slug: string;
      ideaId: string;
      channel: string;
      providerId: string;
      schedule?: { publishAt: string };
    }) => {
      const res = await fetch("/api/publishing/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      const data = (await res.json().catch(() => ({}))) as PublishResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || "Publish failed");
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["draft", v.slug, v.ideaId, v.channel] });
      qc.invalidateQueries({ queryKey: ["drafts", v.slug, v.ideaId] });
    },
  });
}

export function useCancelPublishing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { slug: string; ideaId: string; channel: string }) => {
      const res = await fetch("/api/publishing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      const data = (await res.json().catch(() => ({}))) as PublishResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || "Cancel failed");
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["draft", v.slug, v.ideaId, v.channel] });
    },
  });
}

interface StatusResponse {
  publishing: PublishingMeta | null;
}

/** Polls the provider for status while the post is in-flight (publishing or
 *  scheduled). Stops once the post is published, failed or canceled. */
export function usePublishingStatus(
  slug: string | null,
  ideaId: string | null,
  channel: string | null,
  active: boolean,
) {
  return useQuery<PublishingMeta | null>({
    queryKey: ["publishing", "status", slug, ideaId, channel],
    queryFn: async () => {
      const qs = new URLSearchParams({ slug: slug!, ideaId: ideaId!, channel: channel! });
      const res = await fetch(`/api/publishing/status?${qs}`);
      if (!res.ok) throw new Error("Failed to load status");
      const data = (await res.json()) as StatusResponse;
      return data.publishing;
    },
    enabled: !!slug && !!ideaId && !!channel && active,
    refetchInterval: active ? 5_000 : false,
  });
}
