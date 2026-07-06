/** Channel badge with icon from PRJ_CH_ICON constants. */

import { cn } from "@/lib/utils";
import { PRJ_CH_ICON } from "@/lib/constants";

interface ChannelBadgeProps {
  channel: string;
}

export function ChannelBadge({ channel }: ChannelBadgeProps) {
  const icon = PRJ_CH_ICON[channel.toLowerCase()] ?? "📌";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-navy/10 text-navy font-medium",
      )}
    >
      <span>{icon}</span>
      {channel}
    </span>
  );
}
