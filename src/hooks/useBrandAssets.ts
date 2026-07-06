import { useQuery } from "@tanstack/react-query";

export interface BrandAssetFile {
  name: string;
  relativePath: string;
  size: number;
}

export interface BrandAsset {
  id: string;
  kind: "template" | "mockup" | "logo" | "style-reference" | "export" | "design-md" | "tokens" | "preview" | "misc";
  name: string;
  path: string;
  relativePath: string;
  size?: number;
  modifiedAt?: string;
  meta?: Record<string, unknown>;
  /** For directory assets, the entry HTML to render in the preview iframe. */
  entryFile?: string;
  /** For directory assets, list of files inside. */
  files?: BrandAssetFile[];
}

export interface BrandAssetsResponse {
  slug: string;
  count: number;
  assets: BrandAsset[];
}

/** Lista todos los archivos visuales del brand (templates, mockups, logos, exports, DESIGN.md...). */
export function useBrandAssets(slug: string | null) {
  return useQuery<BrandAssetsResponse>({
    queryKey: ["brand-assets", slug],
    queryFn: async () => {
      const res = await fetch(`/api/brand-assets/${encodeURIComponent(slug as string)}`);
      if (!res.ok) throw new Error("Failed to load brand assets");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}
