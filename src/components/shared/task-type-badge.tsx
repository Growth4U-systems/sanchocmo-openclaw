/** Badge with icon + color by task type. */

import { cn } from "@/lib/utils";

const TYPE_MAP: Record<string, { icon: string; bg: string; text: string }> = {
  content: { icon: "📝", bg: "bg-sage/15", text: "text-sage" },
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
  const meta = TYPE_MAP[type.toLowerCase()] ?? {
    icon: "📋",
    bg: "bg-muted",
    text: "text-muted-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold",
        meta.bg,
        meta.text,
      )}
    >
      <span>{meta.icon}</span>
      {type}
    </span>
  );
}
