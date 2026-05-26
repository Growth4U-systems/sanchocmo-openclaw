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

interface DaemonPromptTemplate {
  id?: string;
  title?: string;
  surface?: string;
  category?: string;
  summary?: string;
  /** JSON string with the actual generation prompt + slot defaults. */
  prompt?: string;
  source?: { author?: string; repo?: string; license?: string; url?: string };
  model?: string;
  aspect?: string;
  previewImageUrl?: string;
}

/**
 * The prompt-template daemon route emits `{ promptTemplate: {...} }` with
 * the actual prompt in `.prompt` (a stringified JSON) plus metadata; there
 * is no `body` field. Synthesize a markdown body so the same slide-over
 * renderer handles every item type uniformly.
 */
function promptTemplateToBody(tpl: DaemonPromptTemplate): string {
  const sections: string[] = [];
  if (tpl.title) sections.push(`# ${tpl.title}`);
  const meta = [
    tpl.surface && `**Surface:** ${tpl.surface}`,
    tpl.category && `**Category:** ${tpl.category}`,
    tpl.model && `**Model:** ${tpl.model}`,
    tpl.aspect && `**Aspect:** ${tpl.aspect}`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (meta) sections.push(meta);
  if (tpl.summary) sections.push(tpl.summary);
  if (tpl.previewImageUrl) {
    sections.push(`![preview](${tpl.previewImageUrl})`);
  }
  if (tpl.prompt) {
    sections.push("## Prompt template", "```json", tpl.prompt, "```");
  }
  if (tpl.source) {
    const parts = [
      tpl.source.author && `por **${tpl.source.author}**`,
      tpl.source.repo && `[repo](https://github.com/${tpl.source.repo})`,
      tpl.source.license && `licencia ${tpl.source.license}`,
    ]
      .filter(Boolean)
      .join(" · ");
    if (parts) sections.push(`---\n_Source: ${parts}_`);
  }
  return sections.join("\n\n");
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
      const payload = (await res.json()) as Record<string, unknown> & {
        body?: string;
        promptTemplate?: DaemonPromptTemplate;
      };
      // Skills / design-systems / craft return a flat object with `body`.
      // Prompt-templates wrap the resource as `{ promptTemplate: {...} }`
      // and ship the prompt JSON in `.prompt` instead — synthesize a body
      // so the slide-over renders the same way for every type.
      if (typeof payload.body === "string") return { id: payload.id as string, body: payload.body };
      if (payload.promptTemplate) {
        return {
          id: payload.promptTemplate.id,
          body: promptTemplateToBody(payload.promptTemplate),
        };
      }
      return payload as OdItemBodyResponse;
    },
    enabled: !!url,
    staleTime: 60_000,
  });
}
