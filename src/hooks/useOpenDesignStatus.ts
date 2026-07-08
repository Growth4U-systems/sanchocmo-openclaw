import { useQuery } from "@tanstack/react-query";
import type { OdStatus } from "@/lib/open-design/types";

/**
 * Open Design service status: whether the OD overlay is configured and, if so,
 * whether its daemon is reachable. Backs the Library's three-state UI (SAN-415).
 */
export function useOpenDesignStatus() {
  return useQuery<OdStatus>({
    queryKey: ["od-status"],
    queryFn: async () => {
      const res = await fetch("/api/open-design/status");
      if (!res.ok) throw new Error("Failed to load Open Design status");
      return (await res.json()) as OdStatus;
    },
    staleTime: 60_000,
  });
}
