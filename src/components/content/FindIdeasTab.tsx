/** Adapter: maps ContentCreationState → FindIdeas props. */

import { useCallback } from "react";
import type { ContentCreationState } from "@/hooks/useContentCreation";
import type { ThreadConfig } from "@/lib/chat-openers";
import { FindIdeas } from "./find-ideas";

interface Props {
  slug: string;
  data: ContentCreationState;
  openChat: (slug: string, config: ThreadConfig) => void;
}

export function FindIdeasTab({ slug, data, openChat }: Props) {
  const handleOpenChat = useCallback(
    (cronName: string) => {
      openChat(slug, {
        threadId: `${slug}:cron:${cronName}`,
        threadName: cronName,
        skill: "sancho",
        skills: ["sancho", "idea-generation"],
        linkedTo: `recurring-tasks/${cronName}`,
        docPath: null,
        threadState: "continue",
      });
    },
    [slug, openChat]
  );

  const handleExecuteCron = useCallback(
    (cronName: string) => {
      // TODO: POST /api/crons/execute with slug + cronName
      handleOpenChat(cronName);
    },
    [handleOpenChat]
  );

  return (
    <FindIdeas
      slug={slug}
      crons={data.crons}
      onOpenChat={handleOpenChat}
      onExecuteCron={handleExecuteCron}
    />
  );
}
