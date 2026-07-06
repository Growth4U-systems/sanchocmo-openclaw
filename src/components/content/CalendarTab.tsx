/** Adapter: maps ContentCreationState → ContentCalendar props. */

import { useCallback } from "react";
import type { ContentCreationState } from "@/hooks/useContentCreation";
import type { ThreadConfig } from "@/lib/chat-openers";
import { ContentCalendar } from "./content-calendar";

interface Props {
  slug: string;
  data: ContentCreationState;
  openChat: (slug: string, config: ThreadConfig) => void;
}

// TODO: fetch calendar items from /api/content-creation/calendar?slug={slug}
// For now, pass empty array — ContentCalendar shows empty week
export function CalendarTab({ slug, data: _data, openChat }: Props) {
  const handleOpenChat = useCallback(
    (itemId: string) => {
      openChat(slug, {
        threadId: `${slug}:calendar:${itemId}`,
        threadName: `Calendar: ${itemId}`,
        skill: "sancho",
        skills: ["sancho", "content-calendar"],
        agent: "dulcinea",
        linkedTo: `calendar/${itemId}`,
        docPath: `brand/${slug}/go-to-market/content-calendar.md`,
        threadState: "continue",
      });
    },
    [slug, openChat]
  );

  return (
    <ContentCalendar
      slug={slug}
      items={[]} // TODO: wire to calendar API
      onOpenChat={handleOpenChat}
    />
  );
}
