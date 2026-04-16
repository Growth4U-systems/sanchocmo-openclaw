/**
 * OutreachEmptyState — shared empty-state block for Outreach tabs.
 *
 * Shows the tab icon + title, a short description, and a bulleted list of
 * things the user can do in this tab. Rendered when the tab has no real
 * data to show yet (either because it's a new client or because the
 * feature hasn't been used).
 *
 * Every Outreach tab uses this as its fallback when its data is empty.
 */

"use client";

interface Props {
  icon: string;
  title: string;
  slug: string;
  description: string;
  /** Bullet list of "what you can do here" — shown below the description. */
  actions: string[];
}

export function OutreachPhase1Placeholder({
  icon,
  title,
  slug,
  description,
  actions,
}: Props) {
  return (
    <div className="rounded-xl border-[3px] border-ink bg-card shadow-comic-sm p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">{icon}</span>
        <div>
          <h2 className="font-heading text-xl text-navy">{title}</h2>
          <p className="text-xs text-muted-foreground">{slug}</p>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-foreground/80 leading-relaxed">{description}</p>

      {/* What you can do */}
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-4">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Qué puedes hacer aquí
        </p>
        <ul className="space-y-2">
          {actions.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground/70">
              <span className="text-rust flex-shrink-0 mt-0.5">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
