/** Adapter: maps ContentCreationState → IdeasBoard props. */

import { useCallback } from "react";
import type { ContentCreationState } from "@/hooks/useContentCreation";
import type { ThreadConfig } from "@/lib/chat-openers";
import { IdeasBoard } from "./ideas-board";

interface Props {
  slug: string;
  data: ContentCreationState;
  openChat: (slug: string, config: ThreadConfig) => void;
}

// TODO: fetch full ideas list from /api/ideas?slug={slug}&type=content
// For now, pass empty array — the IdeasBoard shows EmptyState
export function IdeasTab({ slug, data: _data, openChat }: Props) {
  const handleOpenChat = useCallback(
    (ideaId: string) => {
      openChat(slug, {
        threadId: `${slug}:idea:${ideaId}`,
        threadName: `Idea: ${ideaId}`,
        skill: "sancho",
        skills: ["sancho", "seo-content", "content-atomizer"],
        agent: "dulcinea",
        linkedTo: `ideas/${ideaId}`,
        docPath: `brand/${slug}/ideas.json`,
        threadState: "continue",
      });
    },
    [slug, openChat]
  );

  const handleApprove = useCallback((ids: string[]) => {
    // TODO: POST /api/ideas/status with ids + status=approved
    console.log("Approve ideas:", ids);
  }, []);

  const handleReject = useCallback((ids: string[]) => {
    // TODO: POST /api/ideas/status with ids + status=rejected
    console.log("Reject ideas:", ids);
  }, []);

  return (
    <IdeasBoard
      slug={slug}
      ideas={[]} // TODO: wire to full ideas API
      onOpenChat={handleOpenChat}
      onApproveIdeas={handleApprove}
      onRejectIdeas={handleReject}
    />
  );
}
