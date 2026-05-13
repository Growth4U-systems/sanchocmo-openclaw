import { useQuery } from "@tanstack/react-query";
import type { OdDesignSystem } from "@/lib/open-design/types";

interface ListResponse<T> {
  items: T[];
  count: number;
  source: "daemon" | "fs";
}

/** Catálogo upstream de design systems del daemon de Open Design (149+ DESIGN.md brand-grade). */
export function useOpenDesignSystems() {
  return useQuery<OdDesignSystem[]>({
    queryKey: ["od-listing", "design-systems"],
    queryFn: async () => {
      const res = await fetch("/api/open-design/listing/design-systems");
      if (!res.ok) throw new Error("Failed to load OD design systems");
      const payload = (await res.json()) as ListResponse<OdDesignSystem>;
      return payload.items ?? [];
    },
    staleTime: 5 * 60_000,
  });
}
