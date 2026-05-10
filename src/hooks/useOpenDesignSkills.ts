import { useQuery } from "@tanstack/react-query";
import type { OdSkill } from "@/lib/open-design/types";

interface ListResponse<T> {
  items: T[];
  count: number;
  source: "daemon" | "fs";
}

/** Catálogo upstream de skills del daemon de Open Design (130+ skills). */
export function useOpenDesignSkills() {
  return useQuery<OdSkill[]>({
    queryKey: ["od-listing", "skills"],
    queryFn: async () => {
      const res = await fetch("/api/open-design/listing/skills");
      if (!res.ok) throw new Error("Failed to load OD skills");
      const payload = (await res.json()) as ListResponse<OdSkill>;
      return payload.items ?? [];
    },
    staleTime: 5 * 60_000,
  });
}
