import { useQuery } from "@tanstack/react-query";

interface OdFileResponse {
  path: string;
  isDirectory: boolean;
  content?: string;
  size?: number;
  lastModified?: string;
  entries?: Array<{ name: string; isFile: boolean; isDirectory: boolean }>;
}

/** Lee un archivo del repo upstream de Open Design (SKILL.md, DESIGN.md, craft .md, etc.). */
export function useOdFile(filePath: string | null) {
  return useQuery<OdFileResponse>({
    queryKey: ["od-file", filePath],
    queryFn: async () => {
      if (!filePath) throw new Error("path required");
      const res = await fetch(`/api/open-design/file?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) throw new Error("Failed to load OD file");
      return res.json();
    },
    enabled: !!filePath,
    staleTime: 60_000,
  });
}
