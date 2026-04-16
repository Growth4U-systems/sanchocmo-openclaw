import { useQuery } from "@tanstack/react-query";

export interface ContentDocument {
  id: string;
  name: string;
  description: string;
  type: string | null;
  pillar: string | null;
  channel: string | null;
  niche: string | null;
  status: string;
  deliverable: string | null;
  output_files: string[];
  depends_on: string | null;
  owner: string | null;
  // Legacy compat fields
  key: string;
  section: string;
  skill: string | null;
  docPath: string | null;
  children?: Array<{ name: string; status: string; docPath: string }>;
}

export interface ContentCron {
  name: string;
  schedule: string;
  lastRun: string | null;
  status: string;
  ideasCount: number;
}

export interface ContentCreationState {
  hasProject: boolean;
  projectId: string | null;
  documents: ContentDocument[];
  niches: Array<{ slug: string; name: string }>;
  selectedNiche: string | null;
  crons: ContentCron[];
  ideaCounts: {
    total: number;
    new: number;
    approved: number;
    inProgress: number;
    published: number;
  };
}

export function useContentCreation(slug: string | null, niche?: string | null) {
  const result = useQuery<ContentCreationState>({
    queryKey: ["content-creation", slug, niche || "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ slug: slug! });
      if (niche) params.set("niche", niche);
      const res = await fetch(`/api/content-creation/state?${params}`);
      if (!res.ok) throw new Error("Failed to fetch content creation state");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  return result;
}
