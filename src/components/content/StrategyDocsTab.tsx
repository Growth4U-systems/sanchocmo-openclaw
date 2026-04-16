/** Adapter: maps ContentCreationState → StrategyDocs props. */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ContentCreationState } from "@/hooks/useContentCreation";
import { buildDocThread, type ThreadConfig } from "@/lib/chat-openers";
import { StrategyDocs } from "./strategy-docs";

interface Props {
  slug: string;
  data: ContentCreationState;
  openChat: (slug: string, config: ThreadConfig) => void;
}

export function StrategyDocsTab({ slug, data, openChat }: Props) {
  const queryClient = useQueryClient();

  const handleOpenChat = useCallback(
    (docKey: string, docPath?: string) => {
      // Look up the full doc and route through `buildDocThread`, which is
      // the single source of truth for content-doc → thread id mapping.
      // For docs with a `pillar` this delegates to `buildPillarThread` so
      // the thread id matches the one opened from the Foundation task
      // page (convergence invariant — see chat-openers.ts header).
      const doc = data.documents.find((d) => (d.key || d.id) === docKey);
      const config = buildDocThread(
        slug,
        {
          id: doc?.id || docKey,
          name: doc?.name || docKey,
          key: doc?.key || docKey,
          pillar: doc?.pillar,
          skill: doc?.skill,
          channel: doc?.channel,
          type: doc?.type,
          status: doc?.status,
          docPath: docPath || doc?.docPath,
          deliverable: doc?.deliverable,
        },
        data.projectId || undefined
      );
      openChat(slug, config);
    },
    [slug, openChat, data.documents, data.projectId]
  );

  const handleViewDoc = useCallback((docPath: string) => {
    // Use Foundation doc viewer which handles brand file rendering
    window.location.href = `/dashboard/${slug}/foundation?doc=${encodeURIComponent(docPath)}`;
  }, [slug]);

  const handleCreateProject = useCallback(
    async (nicheSlug: string) => {
      // 1. Create project via API
      try {
        const res = await fetch("/api/content-creation/create-project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            nicheSlug,
            nicheName: data.niches.find((n) => n.slug === nicheSlug)?.name || nicheSlug,
          }),
        });
        const result = await res.json();
        if (!res.ok && res.status !== 409) {
          console.error("[content-creation] Failed to create project:", result);
          return;
        }

        // 2. Invalidate query to refetch and exit empty state
        await queryClient.invalidateQueries({ queryKey: ["content-creation", slug] });

        // 3. Open chat with Sancho to validate against Strategic Plan
        openChat(slug, {
          threadId: `${slug}:content:${nicheSlug}`,
          threadName: `Content Engine — ${nicheSlug}`,
          skill: "sancho-manager",
          skills: ["sancho-manager", "strategic-plan", "content-strategy"],
          linkedTo: `projects/${result.projectSlug || ""}`,
          docPath: `brand/${slug}/strategic-plan/current.md`,
          threadState: "create",
          initialMessage: `He creado el proyecto ${result.projectId} (Content Engine) para el nicho "${nicheSlug}" con 6 tareas base. Revisa el Strategic Plan actual y valida que este proyecto tiene sentido para este cliente. Si hay que ajustar tareas (anadir canales, quitar pasos, cambiar prioridades), hazlo directamente en el tasks.json. Luego dime por donde empezamos.`,
        });
      } catch (err) {
        console.error("[content-creation] Error creating project:", err);
      }
    },
    [slug, data.niches, openChat, queryClient]
  );

  return (
    <StrategyDocs
      slug={slug}
      hasProject={data.hasProject}
      documents={data.documents}
      niches={data.niches}
      selectedNiche={data.selectedNiche}
      onCreateProject={handleCreateProject}
      onOpenChat={handleOpenChat}
      onViewDoc={handleViewDoc}
    />
  );
}
