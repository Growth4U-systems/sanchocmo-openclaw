import { useQuery } from "@tanstack/react-query";
import type { ParsedDesignSystem } from "@/lib/open-design/design-md-parser";

export interface VisualIdentityResponse {
  slug: string;
  source: "design-md" | "legacy-tokens" | "missing";
  designMdPath?: string;
  legacyTokensPath?: string;
  parsed?: ParsedDesignSystem;
  legacyTokens?: Record<string, unknown>;
  hasLogoLight?: boolean;
  hasLogoDark?: boolean;
  logoLightUrl?: string;
  logoDarkUrl?: string;
}

/** Lee DESIGN.md del brand (con fallback a legacy design-tokens.json). */
export function useVisualIdentity(slug: string | null) {
  return useQuery<VisualIdentityResponse>({
    queryKey: ["visual-identity", slug],
    queryFn: async () => {
      const res = await fetch(`/api/visual-identity/${encodeURIComponent(slug as string)}`);
      if (!res.ok) throw new Error("Failed to load visual identity");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}
