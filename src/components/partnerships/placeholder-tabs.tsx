/**
 * Placeholder de Outreach·Partnerships: Settings del modelo llega con SAN-76.
 * (Inbox y Plantillas ya son reales — SAN-80: inbox-tab.tsx / plantillas-tab.tsx.)
 */

"use client";

interface PlaceholderProps {
  onGoContactos?: () => void;
  onGoB2B?: () => void;
}

function PlaceholderShell({
  emoji,
  quote,
  title,
  body,
  bullets,
  action,
  issue,
}: {
  emoji: string;
  quote: string;
  title: string;
  body: string;
  bullets: string[];
  action?: { label: string; onClick: () => void };
  issue: string;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border-4 border-dashed border-border bg-card px-8 py-12 text-center shadow-comic-sm">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border-2 border-ink bg-background text-3xl shadow-comic-sm" aria-hidden>
        {emoji}
      </div>
      <div className="mt-4 inline-block -rotate-1 rounded border-2 border-ink bg-yellow-200 px-3 py-0.5 font-serif text-[13px] italic text-ink shadow-comic-sm">
        {quote}
      </div>
      <h2 className="mt-3 font-heading text-2xl tracking-wide text-navy">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
      <ul className="mx-auto mt-4 max-w-md space-y-1.5 rounded-lg border-2 border-border bg-background p-4 text-left text-sm text-muted-foreground">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <span className="text-sage" aria-hidden>▸</span>
            {bullet}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="rounded-md border-2 border-ink bg-rust px-4 py-2 text-sm font-bold text-white shadow-comic-sm transition-transform hover:-translate-y-0.5"
          >
            {action.label}
          </button>
        )}
        <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] font-bold text-muted-foreground">
          En construcción · {issue}
        </span>
      </div>
    </div>
  );
}

export function SettingsPlaceholder({ onGoB2B }: PlaceholderProps) {
  return (
    <PlaceholderShell
      emoji="⚙️"
      quote="«Los números del modelo, afinados como cuerdas de laúd.»"
      title="SETTINGS DE OUTREACH"
      body="Configuración del modelo de creators: hoy vive sembrada en calc-creator-core (tiers, ER benchmarks, verticals, formats, umbral de descarte) y SAN-76 la hace editable aquí."
      bullets={[
        "Tiers de seguidores y benchmarks de ER por tier (Nano · Micro · Mid · Macro).",
        "Modo de cualificación por campaña: auto · manual · hybrid (default Partnerships, umbral 40).",
        "Conexiones (providers de Yalc) y referencia al funnel de conversión en Metrics.",
      ]}
      action={onGoB2B ? { label: "Abrir providers (cockpit B2B)", onClick: onGoB2B } : undefined}
      issue="SAN-76"
    />
  );
}
