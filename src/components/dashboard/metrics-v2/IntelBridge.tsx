/**
 * Intelligence bridge (SAN-319) — the ⑧ slot on every surface.
 *
 * Generic + presentational: a locked preview of the signals Intelligence will
 * surface for this surface, plus a deep-link. Reused across surfaces and sub-tabs
 * (Discoverability SEO / AI, …). The real signals are wired when Intelligence lands.
 */
export function IntelBridge({
  surface,
  signals,
  href = "#intelligence",
}: {
  surface: string;
  signals: string[];
  href?: string;
}) {
  return (
    <section aria-label={`Señales de ${surface}`} className="mt-4 rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-sc-md border-2 border-ink bg-navy text-white">{"🔭"}</span>
          <div>
            <h4 className="font-heading text-[13px] font-bold text-navy">Señales de {surface} vía Intelligence</h4>
            <p className="text-[11px] text-[var(--sc-fg-muted)]">Aún sin montar.</p>
          </div>
        </div>
        <a href={href} className="shrink-0 rounded-sc-md border-2 border-ink bg-navy px-2.5 py-1 font-heading text-[12px] font-bold text-white shadow-pop-xs">{"🔭"} Abrir Intelligence →</a>
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-wide text-[var(--sc-fg-muted)]">Vista previa de lo que verás aquí</p>
      <ul className="mt-1 space-y-1.5 opacity-60">
        {signals.map((s, i) => (
          <li key={i} className="flex items-center justify-between gap-2 rounded-sc-md border border-border bg-[var(--sc-paper-3)] px-2.5 py-1.5 text-[12px]">
            <span>{s}</span>
            <span aria-hidden="true">{"🔒"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
