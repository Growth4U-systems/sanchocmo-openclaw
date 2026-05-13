/** Badge with icon + color by task type. */

import { cn } from "@/lib/utils";

const TYPE_MAP: Record<string, { icon: string; bg: string; text: string }> = {
  project: { icon: "📋", bg: "bg-rust/15", text: "text-rust" },
  content: { icon: "📝", bg: "bg-sage/15", text: "text-sage" },
  content_task: { icon: "✍️", bg: "bg-amber-500/15", text: "text-amber-700" },
  content_subtask: { icon: "✍️", bg: "bg-amber-500/15", text: "text-amber-700" },
  outreach: { icon: "📧", bg: "bg-navy/15", text: "text-navy" },
  foundation: { icon: "🏛️", bg: "bg-rust/15", text: "text-rust" },
  research: { icon: "🔬", bg: "bg-cyan-500/15", text: "text-cyan-600" },
  analysis: { icon: "📊", bg: "bg-purple-500/15", text: "text-purple-600" },
  execution: { icon: "⚡", bg: "bg-yellow-400/15", text: "text-yellow-700" },
  tool: { icon: "🔧", bg: "bg-slate-500/15", text: "text-slate-600" },
  media: { icon: "🎨", bg: "bg-pink-500/15", text: "text-pink-600" },
};

interface TaskTypeBadgeProps {
  type: string;
}

export function TaskTypeBadge({ type }: TaskTypeBadgeProps) {
  const normalized = type.toLowerCase();
  const meta = TYPE_MAP[normalized] ?? {
    icon: "📋",
    bg: "bg-muted",
    text: "text-muted-foreground",
  };
  const label = normalized === "content_task" || normalized === "content_subtask" ? "ContentTask" : type;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold",
        meta.bg,
        meta.text,
      )}
    >
      <span>{meta.icon}</span>
      {label}
    </span>
  );
}
