import { useQuery } from "@tanstack/react-query";

interface SkillSummary {
  id: string;
  name: string;
  description: string;
}

export function useSkills() {
  return useQuery<SkillSummary[]>({
    queryKey: ["skills"],
    queryFn: async () => {
      const res = await fetch("/api/system/skills");
      if (!res.ok) throw new Error("Failed to fetch skills");
      const data = await res.json();
      return data.skills || [];
    },
    staleTime: 5 * 60_000, // 5 min cache
  });
}
