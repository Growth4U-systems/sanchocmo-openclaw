/**
 * Fetch the markdown body of a single Open Design library item (skill,
 * design system, prompt template, craft guide) from the daemon via the
 * MC catch-all proxy. The proxy injects `Authorization: Bearer` and
 * spoofs `Origin: OD_WEB_URL` server-side, so the browser never sees
 * the token.
 *
 * Replaces the older `useOdFile` flow which read SKILL.md / DESIGN.md
 * from MC's local filesystem at `OD_REPO_PATH`. That worked when MC and
 * OD shared a checkout (laptop dev), but on the VPS deploy OD lives
 * inside a separate container and the repo path doesn't exist in MC.
 */

import { useQuery } from "@tanstack/react-query";

export type OdItemType =
  | "skill"
  | "design-system"
  | "prompt-template"
  | "craft-guide";

interface OdItemBodyResponse {
  id?: string;
  /** Markdown content (every per-item endpoint emits this). */
  body?: string;
}

function endpointFor(
  type: OdItemType,
  id: string,
  surface?: "image" | "video" | "audio" | string,
): string | null {
  switch (type) {
    case "skill":
      return `/api/open-design/skills/${encodeURIComponent(id)}`;
    case "design-system":
      return `/api/open-design/design-systems/${encodeURIComponent(id)}`;
    case "craft-guide":
      // Daemon route is `/api/craft/:id` (singular) — listing already
      // normalizes the tab name to `craft-guides` but the per-item read
      // hits the daemon endpoint as it is.
      return `/api/open-design/craft/${encodeURIComponent(id)}`;
    case "prompt-template":
      // Daemon needs the surface segment, e.g. /api/prompt-templates/image/<id>.
      if (!surface) return null;
      return `/api/open-design/prompt-templates/${encodeURIComponent(surface)}/${encodeURIComponent(id)}`;
    default:
      return null;
  }
}

export function useOdItemBody(
  type: OdItemType | null,
  id: string | null,
  surface?: "image" | "video" | "audio" | string,
) {
  const url = type && id ? endpointFor(type, id, surface) : null;
  return useQuery<OdItemBodyResponse>({
    queryKey: ["od-item-body", type, id, surface ?? null],
    queryFn: async () => {
      if (!url) throw new Error("missing type/id");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load OD item (HTTP ${res.status})`);
      return res.json();
    },
    enabled: !!url,
    staleTime: 60_000,
  });
}
