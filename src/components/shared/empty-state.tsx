/** Centered empty-state placeholder with optional action button. */

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: string;
  message: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      {icon && <span className="text-4xl mb-3">{icon}</span>}
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={cn(
            "mt-4 px-4 py-2 bg-rust text-white rounded-lg text-sm font-semibold",
            "hover:opacity-90 transition-opacity",
          )}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
