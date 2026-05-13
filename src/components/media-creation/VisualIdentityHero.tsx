/**
 * Visual Identity Hero — render bonito del DESIGN.md del brand activo.
 *
 * Lee `/api/visual-identity/[slug]` (que parsea DESIGN.md o cae a legacy tokens).
 * Cada bloque tiene "✨ Pídele a Maese Pedro" en hover → dispara prompt para crear task type=media.
 * No hay color pickers / sliders / drag-and-drop: filosofía 100% agentic.
 */

import { useState } from "react";
import { useVisualIdentity } from "@/hooks/useVisualIdentity";
import { cn } from "@/lib/utils";

interface Props {
  slug: string;
  onRequestChange: (block: string) => void;
}

function BlockHeader({ title, blockKey, onRequestChange }: { title: string; blockKey: string; onRequestChange: Props["onRequestChange"] }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="flex items-center justify-between mb-3"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <button
        onClick={() => onRequestChange(blockKey)}
        className={cn(
          "text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40",
          hover ? "opacity-100" : "opacity-0",
        )}
        title="Pídele a Maese Pedro"
        aria-label={`Pídele a Maese Pedro que cambie ${title}`}
      >
        {"💬"}
      </button>
    </div>
  );
}

export function VisualIdentityHero({ slug, onRequestChange }: Props) {
  const { data, isLoading, error } = useVisualIdentity(slug);

  if (isLoading) {
    return (
      <section className="bg-card rounded-xl border border-border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-32" />
          <div className="h-24 bg-muted rounded" />
          <div className="h-16 bg-muted rounded" />
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="bg-card rounded-xl border border-border p-6">
        <p className="text-sm text-red-600">Error cargando visual identity.</p>
      </section>
    );
  }

  if (data.source === "missing") {
    return (
      <section className="bg-card rounded-xl border border-border p-8 text-center">
        <div className="text-5xl mb-3">🎨</div>
        <h3 className="text-lg font-bold mb-2">Sin design system todavía</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Maese Pedro puede crear el DESIGN.md del brand. Ejecuta la skill <code className="text-xs bg-muted px-1.5 py-0.5 rounded">design-system</code> desde Foundation L5 o con un prompt aquí.
        </p>
        <button
          onClick={() => onRequestChange("design-system")}
          className="inline-flex items-center gap-1.5 bg-rust text-white px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90"
        >
          {"💬"} Crear DESIGN.md
        </button>
      </section>
    );
  }

  const parsed = data.parsed;
  const legacy = data.legacyTokens as
    | { brand?: string; colors?: Record<string, Record<string, { value?: string; use?: string }>>; typography?: { families?: Record<string, { family?: string }> } }
    | undefined;

  const brandName = parsed?.brandName ?? (typeof legacy?.brand === "string" ? legacy.brand : slug);
  const mood = parsed?.mood;

  // Resolver paleta unificada (DESIGN.md o legacy)
  const palette: { name: string; hex: string; use?: string }[] = [];
  if (parsed?.color.named) {
    for (const [name, hex] of Object.entries(parsed.color.named)) {
      palette.push({ name, hex });
    }
  }
  if (palette.length === 0 && legacy?.colors) {
    for (const groupKey of Object.keys(legacy.colors)) {
      const group = legacy.colors[groupKey];
      if (!group || typeof group !== "object") continue;
      for (const [name, val] of Object.entries(group)) {
        if (val && typeof val === "object" && "value" in val && typeof val.value === "string") {
          palette.push({ name, hex: val.value, use: val.use });
        }
      }
    }
  }

  // Tipografías
  const typoFamilies: { role: string; family?: string }[] = [];
  if (parsed?.typography.display?.family) typoFamilies.push({ role: "Display", family: parsed.typography.display.family });
  if (parsed?.typography.body?.family) typoFamilies.push({ role: "Body", family: parsed.typography.body.family });
  if (parsed?.typography.mono?.family) typoFamilies.push({ role: "Mono", family: parsed.typography.mono.family });
  if (typoFamilies.length === 0 && legacy?.typography?.families) {
    for (const [role, f] of Object.entries(legacy.typography.families)) {
      typoFamilies.push({ role: role.charAt(0).toUpperCase() + role.slice(1), family: f?.family });
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{brandName} Design System</h2>
          {mood && <p className="text-sm text-muted-foreground mt-1">Mood: {mood}</p>}
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          <div>Source: <code className="bg-muted px-1.5 py-0.5 rounded">{data.source}</code></div>
          {data.designMdPath && (
            <a
              href={`vscode://file${data.designMdPath}`}
              className="hover:text-rust"
              title="Abrir en VS Code"
            >
              {data.designMdPath}
            </a>
          )}
          {!data.designMdPath && data.legacyTokensPath && (
            <span title="Legacy — DESIGN.md aún no generado">{data.legacyTokensPath}</span>
          )}
        </div>
      </header>

      {/* Paleta */}
      <div className="bg-card rounded-xl border border-border p-5">
        <BlockHeader title="Paleta de colores" blockKey="palette" onRequestChange={onRequestChange} />
        {palette.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin colores definidos.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {palette.map((c) => (
              <div key={c.name + c.hex} className="rounded-lg border border-border overflow-hidden">
                <div className="h-16" style={{ backgroundColor: c.hex }} />
                <div className="p-2 bg-card">
                  <div className="text-xs font-semibold capitalize">{c.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{c.hex}</div>
                  {c.use && <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{c.use}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tipografías */}
      <div className="bg-card rounded-xl border border-border p-5">
        <BlockHeader title="Tipografías" blockKey="typography" onRequestChange={onRequestChange} />
        {typoFamilies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin tipografías definidas.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {typoFamilies.map((t) => (
              <div key={t.role} className="border border-border rounded-lg p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{t.role}</div>
                <div className="text-2xl font-bold" style={{ fontFamily: t.family ? `${t.family}, sans-serif` : undefined }}>
                  {t.family ?? "—"}
                </div>
                <div className="text-sm mt-2 text-muted-foreground" style={{ fontFamily: t.family ? `${t.family}, sans-serif` : undefined }}>
                  The quick brown fox jumps over the lazy dog
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logos */}
      <div className="bg-card rounded-xl border border-border p-5">
        <BlockHeader title="Logos" blockKey="logos" onRequestChange={onRequestChange} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border border-border rounded-lg p-6 bg-white flex items-center justify-center min-h-[120px]">
            {data.hasLogoLight && data.logoLightUrl ? (
              <img src={data.logoLightUrl} alt="Logo light" className="max-h-20" />
            ) : (
              <span className="text-xs text-muted-foreground">Logo light no disponible</span>
            )}
          </div>
          <div className="border border-border rounded-lg p-6 bg-slate-900 flex items-center justify-center min-h-[120px]">
            {data.hasLogoDark && data.logoDarkUrl ? (
              <img src={data.logoDarkUrl} alt="Logo dark" className="max-h-20" />
            ) : (
              <span className="text-xs text-slate-400">Logo dark no disponible</span>
            )}
          </div>
        </div>
      </div>

      {/* Layout / mood */}
      {parsed && (parsed.layout.maxWidth || parsed.layout.sectionSpacing) && (
        <div className="bg-card rounded-xl border border-border p-5">
          <BlockHeader title="Layout" blockKey="layout" onRequestChange={onRequestChange} />
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {parsed.layout.maxWidth && (<><dt className="text-muted-foreground">Max width</dt><dd className="font-mono text-xs">{parsed.layout.maxWidth}</dd></>)}
            {parsed.layout.grid && (<><dt className="text-muted-foreground">Grid</dt><dd className="font-mono text-xs">{parsed.layout.grid}</dd></>)}
            {parsed.layout.sectionSpacing && (<><dt className="text-muted-foreground">Section spacing</dt><dd className="font-mono text-xs">{parsed.layout.sectionSpacing}</dd></>)}
            {parsed.layout.contentPadding && (<><dt className="text-muted-foreground">Content padding</dt><dd className="font-mono text-xs">{parsed.layout.contentPadding}</dd></>)}
          </dl>
        </div>
      )}

      {/* Do's / Don'ts */}
      {parsed && (parsed.dosAndDonts.dos.length > 0 || parsed.dosAndDonts.donts.length > 0) && (
        <div className="bg-card rounded-xl border border-border p-5">
          <BlockHeader title="Do's & Don'ts" blockKey="illustration" onRequestChange={onRequestChange} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-bold text-emerald-700 mb-2">DO</h4>
              <ul className="space-y-1 text-sm">
                {parsed.dosAndDonts.dos.map((d, i) => (
                  <li key={i} className="flex gap-2"><span className="text-emerald-600">✓</span><span>{d}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold text-red-700 mb-2">DON'T</h4>
              <ul className="space-y-1 text-sm">
                {parsed.dosAndDonts.donts.map((d, i) => (
                  <li key={i} className="flex gap-2"><span className="text-red-600">✗</span><span>{d}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Social specs (Sancho extension) */}
      {parsed?.socialSpecs && (
        <div className="bg-card rounded-xl border border-border p-5">
          <BlockHeader title="Social specs por canal" blockKey="social" onRequestChange={onRequestChange} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {Object.entries(parsed.socialSpecs).map(([channel, spec]) => (
              <div key={channel} className="border border-border rounded-lg p-3">
                <div className="text-xs font-semibold capitalize">{channel}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{spec.width}×{spec.height}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
