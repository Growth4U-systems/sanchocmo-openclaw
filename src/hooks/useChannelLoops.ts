import { useQuery } from "@tanstack/react-query";
import type { ChannelLoopsPayload } from "@/types";

/**
 * Per-channel loop state for the 📡 Canales view (SAN-141).
 * Backed by /api/content-engine/channel-loops — always derived, never cached
 * server-side, so a short staleTime keeps counters honest after mutations.
 */
export function useChannelLoops(slug: string | null) {
  return useQuery<ChannelLoopsPayload>({
    queryKey: ["channel-loops", slug],
    queryFn: async () => {
      const res = await fetch(`/api/content-engine/channel-loops?slug=${slug}`);
      if (!res.ok) throw new Error(`Failed to load channel loops (${res.status})`);
      return res.json();
    },
    enabled: !!slug,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
