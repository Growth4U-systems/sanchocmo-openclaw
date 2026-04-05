/** Scrollable list of activity events with colored status dots and timestamps. */

import { cn } from "@/lib/utils";

export interface ActivityItem {
  id: string;
  type: string; // 'cron' | 'task' | 'idea' | 'project' | 'system'
  title: string;
  description?: string;
  timestamp: string;
  client?: string;
  status?: "ok" | "error" | "warning";
}

const STATUS_DOT: Record<string, string> = {
  ok: "bg-sage",
  error: "bg-destructive",
  warning: "bg-yellow-400",
};

interface ActivityFeedProps {
  items: ActivityItem[];
  limit?: number;
}

export function ActivityFeed({ items, limit }: ActivityFeedProps) {
  const visible = limit ? items.slice(0, limit) : items;

  return (
    <div className="max-h-96 overflow-y-auto space-y-1">
      {visible.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-background transition-colors"
        >
          {/* Status dot */}
          <span
            className={cn(
              "mt-1.5 h-2.5 w-2.5 rounded-full shrink-0",
              STATUS_DOT[item.status ?? "ok"] ?? "bg-border",
            )}
          />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {item.title}
            </p>
            {item.description && (
              <p className="text-[11px] text-muted-foreground truncate">
                {item.description}
              </p>
            )}
            {item.client && (
              <span className="text-[10px] text-muted-foreground">
                {item.client}
              </span>
            )}
          </div>

          {/* Timestamp */}
          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
            {item.timestamp}
          </span>
        </div>
      ))}

      {visible.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No activity yet
        </p>
      )}
    </div>
  );
}
