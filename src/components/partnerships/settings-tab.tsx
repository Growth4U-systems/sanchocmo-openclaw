/**
 * Outreach · Settings (SAN-76) — sustituye al placeholder del engranaje ⚙️.
 * Espejo de comportamiento de `mockups-partnerships/settings.html`, con el
 * estilo del producto real (tokens navy/rust/sage/ink + shadow-comic):
 *
 *  1. MODELO DE CREATORS (editable): tiers con ER benchmark editable inline +
 *     chips de verticals/formats (añadir/quitar).
 *  2. CUALIFICACIÓN DE CANDIDATOS (editable): segmented Auto/Manual/Hybrid +
 *     umbral de auto-descarte (oculto en Manual) + explicación de cada modo
 *     con link a los Descartados de la Lista. Aplica a búsquedas NUEVAS.
 *  3. CONVERSIÓN / FUNNEL (read-only): el funnel vive en Metrics — aquí solo
 *     se referencia (narrator + "Editar en Metrics →").
 *  4. CONEXIONES: providers reales del Cockpit (GET /api/yalc/providers) con
 *     estado y "Probar conexión" (healthchecks reales, POST providers/test).
 *
 * Guardado: banner flotante "cambios sin guardar" → PUT /api/yalc/model-config
 * con SOLO lo cambiado (PUT parcial; misma lógica que la tool MCP
 * `yalc_update_model_config` — paridad UI = chat = MCP).
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { CreatorModelConfig, QualificationMode, TierKey } from "@/lib/calc-creator-core";
import { NarratorCaption } from "./ui";
import { modelConfigQueryKey, useModelConfig, type ModelConfigPayload } from "./use-model-config";

// ── Draft editable (solo lo que Settings edita) ─────────────────────────────

interface SettingsDraft {
  erBenchmarks: Record<TierKey, number>;
  verticals: string[];
  formats: string[];
  mode: QualificationMode;
  threshold: number;
}

const TIER_ORDER: TierKey[] = ["nano", "micro", "mid", "macro"];

function draftFromConfig(config: CreatorModelConfig): SettingsDraft {
  const erBenchmarks = {} as Record<TierKey, number>;
  for (const tier of config.tiers) erBenchmarks[tier.key] = tier.erBenchmarkPct;
  return {
    erBenchmarks,
    verticals: [...config.verticals],
    formats: [...config.formats],
    mode: config.qualification.defaultMode,
    threshold: config.qualification.threshold,
  };
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/** PUT parcial: SOLO las secciones que cambiaron respecto al baseline. */
function buildPartial(baseline: SettingsDraft, draft: SettingsDraft): Record<string, unknown> {
  const partial: Record<string, unknown> = {};
  const tiers = TIER_ORDER.filter((key) => draft.erBenchmarks[key] !== baseline.erBenchmarks[key]).map(
    (key) => ({ key, erBenchmarkPct: draft.erBenchmarks[key] }),
  );
  if (tiers.length > 0) partial.tiers = tiers;
  if (!sameList(draft.verticals, baseline.verticals)) partial.verticals = draft.verticals;
  if (!sameList(draft.formats, baseline.formats)) partial.formats = draft.formats;
  const qualification: Record<string, unknown> = {};
  if (draft.mode !== baseline.mode) qualification.defaultMode = draft.mode;
  if (draft.threshold !== baseline.threshold) qualification.threshold = draft.threshold;
  if (Object.keys(qualification).length > 0) partial.qualification = qualification;
  return partial;
}

function fmtFollowers(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("es-ES")}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function tierRange(min: number, max: number | null): string {
  if (min <= 0) return max === null ? "todos" : `< ${fmtFollowers(max)}`;
  if (max === null) return `> ${fmtFollowers(min)}`;
  return `${fmtFollowers(min)} – ${fmtFollowers(max)}`;
}

// ── Panel shell (estructura de settings.html con tokens del producto) ───────

function Panel({
  emoji,
  title,
  subtitle,
  pill,
  tone = "warm",
  children,
  testid,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  pill: React.ReactNode;
  tone?: "warm" | "cool" | "aged";
  children: React.ReactNode;
  testid?: string;
}) {
  const headTone =
    tone === "cool" ? "bg-cyan-50" : tone === "aged" ? "bg-muted/60" : "bg-yellow-50";
  return (
    <section
      className="overflow-hidden rounded-xl border-2 border-ink bg-card shadow-comic-sm"
      data-testid={testid}
    >
      <header className={cn("flex flex-wrap items-center gap-3 border-b-2 border-ink px-5 py-3.5", headTone)}>
        <span className="grid h-10 w-10 place-items-center rounded-xl border-2 border-ink bg-background text-xl shadow-comic-sm" aria-hidden>
          {emoji}
        </span>
        <div>
          <h2 className="font-heading text-lg tracking-wide text-ink">{title}</h2>
          <p className="text-xs font-semibold text-muted-foreground">{subtitle}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">{pill}</div>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function EditablePill() {
  return (
    <span className="rounded-full border-2 border-ink bg-yellow-100 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink shadow-comic-sm">
      ✏️ Editable
    </span>
  );
}

// ── ER benchmark editable inline (er-cell del mockup) ────────────────────────

function ErCell({
  tier,
  value,
  onCommit,
}: {
  tier: TierKey;
  value: number;
  onCommit: (next: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit(apply: boolean) {
    if (apply) {
      const parsed = Number.parseFloat(text.replace(",", "."));
      if (Number.isFinite(parsed) && parsed > 0 && parsed < 100) {
        onCommit(Number(parsed.toFixed(1)));
      }
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => commit(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(true);
          if (event.key === "Escape") commit(false);
        }}
        className="w-24 rounded-md border-2 border-rust bg-yellow-50 px-2 py-1 text-center text-sm font-bold text-ink shadow-comic-sm focus:outline-none"
        data-testid={`er-input-${tier}`}
        aria-label={`ER benchmark del tier ${tier}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setText(value.toFixed(1));
        setEditing(true);
      }}
      title="Click para editar el ER benchmark"
      className="inline-flex min-w-[92px] items-center justify-center gap-1.5 rounded-md border-2 border-ink bg-background px-3 py-1 text-sm font-bold text-ink shadow-comic-sm transition-all hover:-translate-y-0.5 hover:bg-yellow-50"
      data-testid={`tier-er-${tier}`}
    >
      {value.toFixed(1)}% <span className="text-[11px] opacity-60" aria-hidden>✏️</span>
    </button>
  );
}

// ── Chips añadir/quitar (verticals + formats) ────────────────────────────────

function ChipRow({
  group,
  items,
  onChange,
  chipClass,
  placeholder,
}: {
  group: "vertical" | "format";
  items: string[];
  onChange: (next: string[]) => void;
  chipClass: string;
  placeholder: string;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");

  function commit(apply: boolean) {
    const value = text.trim();
    if (apply && value && !items.some((item) => item.toLowerCase() === value.toLowerCase())) {
      onChange([...items, value]);
    }
    setText("");
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`chips-${group}`}>
      {items.map((item) => (
        <span
          key={item}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border-2 border-ink py-0.5 pl-3 pr-1.5 text-[13px] font-bold text-ink shadow-comic-sm",
            chipClass,
          )}
          data-testid={`chip-${group}-${item}`}
        >
          {item}
          <button
            type="button"
            title="quitar"
            aria-label={`Quitar ${item}`}
            onClick={() => onChange(items.filter((other) => other !== item))}
            className="grid place-items-center rounded-full border border-ink bg-background text-[9px] font-black leading-none hover:bg-destructive hover:text-white"
            style={{ width: 18, height: 18 }}
          >
            ✕
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => commit(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit(true);
            if (event.key === "Escape") commit(false);
          }}
          placeholder={placeholder}
          className="w-44 rounded-full border-2 border-rust bg-yellow-50 px-3 py-0.5 text-[13px] font-bold text-ink shadow-comic-sm focus:outline-none"
          data-testid={`chip-input-${group}`}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border-2 border-dashed border-ink/60 bg-transparent px-3.5 py-0.5 text-[13px] font-bold text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-solid hover:bg-yellow-50 hover:text-ink"
          data-testid={`chip-add-${group}`}
        >
          + añadir
        </button>
      )}
    </div>
  );
}

// ── Cualificación: textos por modo (espejo de Q_DESCS del mockup) ───────────

function QualificationDescription({
  mode,
  threshold,
  onGoDiscarded,
}: {
  mode: QualificationMode;
  threshold: number;
  onGoDiscarded: () => void;
}) {
  const discardedLink = (
    <button
      type="button"
      onClick={onGoDiscarded}
      className="font-bold text-rust underline underline-offset-2 hover:text-rust/80"
      data-testid="link-descartados"
    >
      Contactos · Lista → filtro Stage &quot;🗑 Descartados&quot;
    </button>
  );

  return (
    <div
      className="mt-3.5 rounded-lg border-2 border-dashed border-ink/30 bg-background px-3.5 py-2.5 text-[13.5px] leading-relaxed text-foreground"
      data-testid="qmode-desc"
    >
      {mode === "auto" && (
        <>
          <b>Auto (B2B a volumen):</b> el pipeline cualifica solo por umbral de score, como hace
          Yalc hoy — los que pasan van directos a <code className="rounded bg-muted px-1">Qualified</code> y
          a la cola de contacto. Sin triaje humano.
        </>
      )}
      {mode === "manual" && (
        <>
          <b>Manual:</b> nada se cualifica solo. Todos los candidatos entran en <b>Discovered</b> con
          su score y el humano decide uno a uno quién pasa a Shortlist y quién se descarta.
        </>
      )}
      {mode === "hybrid" && (
        <>
          <b>Hybrid (recomendado para Partnerships):</b> el scoring descarta automáticamente el
          ruido obvio (score &lt; <span data-testid="umbral-echo">{threshold}</span> →{" "}
          <code className="rounded bg-muted px-1">Disqualified</code>, con nota &quot;auto&quot;); el resto entra
          en <b>Discovered</b> ya scoreado y <b>el humano decide</b> quién pasa a Shortlist. Los
          descartados —automáticos y manuales— se consultan en {discardedLink} y son recuperables.
        </>
      )}
      <p className="mt-2 text-[11.5px] italic text-muted-foreground">
        El modo y el umbral aplican a las búsquedas <b>nuevas</b> (cada campaña los congela al
        crearse — no se retro-aplican a las existentes).
      </p>
    </div>
  );
}

// ── Conexiones (providers reales del Cockpit) ────────────────────────────────

interface Provider {
  id: string;
  name?: string;
  description?: string;
  status?: "green" | "red" | "gray" | string;
  hasHealthProbe?: boolean;
}

function connDot(status?: string): string {
  if (status === "green") return "bg-sage";
  if (status === "red") return "bg-destructive";
  return "bg-muted-foreground/40";
}

function connMeta(provider: Provider): string {
  const base =
    provider.status === "green" ? "conectado" : provider.status === "red" ? "con errores" : "no conectado";
  return provider.description ? `${base} · ${provider.description}` : base;
}

function ConnectionsPanel({ slug }: { slug: string }) {
  const providersQuery = useQuery({
    queryKey: ["yalc", slug, "providers"],
    queryFn: async (): Promise<{ providers?: Provider[] }> => {
      const res = await fetch(`/api/yalc/providers?slug=${encodeURIComponent(slug)}`);
      const payload = (await res.json()) as { providers?: Provider[]; error?: string };
      if (!res.ok) throw new Error(payload?.error || `Request failed (${res.status})`);
      return payload;
    },
    enabled: !!slug,
  });
  const providers = providersQuery.data?.providers || [];

  const [testingId, setTestingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; detail: string }>>({});

  async function testProvider(provider: Provider) {
    setTestingId(provider.id);
    try {
      const res = await fetch(`/api/yalc/providers/test?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id }),
      });
      const payload = (await res.json()) as { ok?: boolean; detail?: string; error?: string };
      setResults((prev) => ({
        ...prev,
        [provider.id]: res.ok
          ? { ok: payload.ok !== false, detail: payload.detail || "Conexión OK" }
          : { ok: false, detail: payload.error || `HTTP ${res.status}` },
      }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [provider.id]: { ok: false, detail: err instanceof Error ? err.message : "Sin respuesta" },
      }));
    } finally {
      setTestingId(null);
    }
  }

  return (
    <Panel
      emoji="🔌"
      title="CONEXIONES"
      subtitle="providers del Cockpit · estado en vivo"
      tone="aged"
      pill={
        <span className="rounded-full border-2 border-ink bg-background px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink shadow-comic-sm">
          {providersQuery.isLoading ? "…" : `${providers.length} providers`}
        </span>
      }
      testid="panel-conexiones"
    >
      {providersQuery.error && (
        <p className="mb-3 rounded-lg border-2 border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">
          No se pudieron cargar los providers: {String((providersQuery.error as Error).message)}
        </p>
      )}
      <div className="space-y-2.5">
        {providers.map((provider) => {
          const result = results[provider.id];
          const testing = testingId === provider.id;
          return (
            <div
              key={provider.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-border bg-background px-3.5 py-2.5 transition-all hover:border-ink"
              data-testid={`conn-row-${provider.id}`}
            >
              <span className={cn("h-3 w-3 shrink-0 rounded-full border border-ink", connDot(provider.status))} aria-hidden />
              <div className="min-w-0">
                <div className="text-sm font-bold text-ink">{provider.name || provider.id}</div>
                <div className="truncate text-xs text-muted-foreground">{connMeta(provider)}</div>
                {result && (
                  <div
                    className={cn(
                      "mt-1 inline-block rounded border px-1.5 py-0.5 text-[11px] font-semibold",
                      result.ok
                        ? "border-sage/50 bg-sage/10 text-sage"
                        : "border-destructive/50 bg-destructive/10 text-destructive",
                    )}
                  >
                    {result.ok ? "✓" : "⚠"} {result.detail}
                  </div>
                )}
              </div>
              <div className="ml-auto">
                <button
                  type="button"
                  disabled={testing || provider.hasHealthProbe === false}
                  onClick={() => void testProvider(provider)}
                  title={
                    provider.hasHealthProbe === false
                      ? "Este provider no expone healthcheck"
                      : "Lanza el healthcheck real del provider"
                  }
                  className={cn(
                    "min-w-[140px] rounded-md border-2 border-ink bg-background px-3 py-1 text-[13px] font-bold text-ink shadow-comic-sm transition-all",
                    testing || provider.hasHealthProbe === false
                      ? "cursor-not-allowed opacity-60"
                      : "hover:-translate-y-0.5 hover:bg-yellow-50",
                  )}
                  data-testid={`test-conn-${provider.id}`}
                >
                  {testing ? "Probando…" : "Probar conexión"}
                </button>
              </div>
            </div>
          );
        })}
        {!providersQuery.isLoading && providers.length === 0 && !providersQuery.error && (
          <p className="py-2 text-sm text-muted-foreground">
            YALC no devolvió providers — revisa el Cockpit (Outreach · tipo B2B → Providers).
          </p>
        )}

        {/* Impact: tracking de afiliación — Fase 2 (SAN-82), espejo del mockup */}
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-border bg-muted/40 px-3.5 py-2.5 opacity-70"
          data-testid="conn-row-impact"
        >
          <span className="h-3 w-3 shrink-0 rounded-full border border-ink bg-muted-foreground/40" aria-hidden />
          <div>
            <div className="text-sm font-bold text-ink">Impact</div>
            <div className="text-xs text-muted-foreground">
              no conectado · tracking de afiliación y pagos variables
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <span className="-rotate-3 rounded border-2 border-rust px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rust">
              Fase 2
            </span>
            <button
              type="button"
              disabled
              className="min-w-[140px] cursor-not-allowed rounded-md border-2 border-border bg-background px-3 py-1 text-[13px] font-bold text-muted-foreground opacity-50"
            >
              Probar conexión
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ── Tab Settings completo ────────────────────────────────────────────────────

export function SettingsTab({
  slug,
  onGoDiscarded,
  onGoMetrics,
}: {
  slug: string;
  /** Navega a Contactos · Lista con el filtro Stage = Descartados. */
  onGoDiscarded: () => void;
  /** Navega al módulo Metrics (el funnel se edita allí). */
  onGoMetrics: () => void;
}) {
  const queryClient = useQueryClient();
  const configQuery = useModelConfig(slug);

  const [baseline, setBaseline] = useState<SettingsDraft | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = useMemo(
    () => Boolean(baseline && draft && Object.keys(buildPartial(baseline, draft)).length > 0),
    [baseline, draft],
  );

  // Sincroniza baseline/draft con el servidor (sin pisar ediciones en curso).
  const serverDraft = useMemo(
    () => (configQuery.data ? draftFromConfig(configQuery.data.config) : null),
    [configQuery.data],
  );
  useEffect(() => {
    if (!serverDraft) return;
    const hadPendingEdits =
      baseline && draft && Object.keys(buildPartial(baseline, draft)).length > 0;
    setBaseline(serverDraft);
    if (!hadPendingEdits) setDraft(serverDraft);
    // baseline/draft a propósito fuera de deps: solo re-sincroniza al cambiar el server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverDraft]);

  const saveMutation = useMutation({
    mutationFn: async (partial: Record<string, unknown>) => {
      const res = await fetch(`/api/yalc/model-config?slug=${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const payload = (await res.json()) as ModelConfigPayload & { error?: string };
      if (!res.ok) throw new Error(payload?.error || `Request failed (${res.status})`);
      return payload;
    },
    onSuccess: (payload) => {
      queryClient.setQueryData(modelConfigQueryKey(slug), payload);
      const next = draftFromConfig(payload.config);
      setBaseline(next);
      setDraft(next);
      setSavedFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSavedFlash(false), 2200);
    },
  });

  function update(mutator: (prev: SettingsDraft) => SettingsDraft) {
    setDraft((prev) => (prev ? mutator(prev) : prev));
  }

  if (configQuery.isLoading || !draft || !baseline) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground" data-testid="settings-loading">
        Cargando el modelo de creators…
      </p>
    );
  }

  const data = configQuery.data;
  const funnel = data?.config.breakEven;
  const yalcDown = data?.source === "defaults" && Boolean(data?.yalcError);

  return (
    <div className="space-y-5 pb-24" data-testid="settings-tab">
      {yalcDown && (
        <div className="rounded-lg border-2 border-yellow-500/60 bg-yellow-100 p-3 text-sm font-semibold text-ink" data-testid="yalc-down-banner">
          ⚠️ YALC no responde — viendo los defaults sembrados de calc-creator-core (solo lectura
          hasta que vuelva): {data?.yalcError}
        </div>
      )}

      {/* ════════ 1 · MODELO DE CREATORS ════════ */}
      <Panel
        emoji="📐"
        title="MODELO DE CREATORS"
        subtitle={`tiers, benchmarks y taxonomía del programa · ${slug}`}
        pill={<EditablePill />}
        testid="panel-modelo"
      >
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-ink text-left">
              {["Tier", "Rango de seguidores", "ER benchmark"].map((label) => (
                <th key={label} className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.config.tiers || []).map((tier) => (
              <tr key={tier.key} className="border-b border-dashed border-ink/20 last:border-0">
                <td className="px-2.5 py-2.5 font-heading text-base tracking-wide text-navy">
                  {tier.label.toUpperCase()}
                </td>
                <td className="px-2.5 py-2.5 text-[13px] text-muted-foreground">
                  {tierRange(tier.minFollowers, tier.maxFollowers)}
                </td>
                <td className="px-2.5 py-2.5">
                  <ErCell
                    tier={tier.key}
                    value={draft.erBenchmarks[tier.key]}
                    onCommit={(next) =>
                      update((prev) => ({
                        ...prev,
                        erBenchmarks: { ...prev.erBenchmarks, [tier.key]: next },
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2.5 font-serif text-xs italic text-muted-foreground">
          El ER benchmark por tier alimenta el componente &quot;ER vs tier&quot; del Quality Score (0–100).
          Click en un valor para editarlo.
        </p>

        <div className="mt-4 text-sm font-bold text-ink">🏷️ Verticals</div>
        <div className="mt-2">
          <ChipRow
            group="vertical"
            items={draft.verticals}
            onChange={(next) => update((prev) => ({ ...prev, verticals: next }))}
            chipClass="bg-sage/15"
            placeholder="nueva vertical…"
          />
        </div>

        <div className="mt-4 text-sm font-bold text-ink">🎬 Formats</div>
        <div className="mt-2">
          <ChipRow
            group="format"
            items={draft.formats}
            onChange={(next) => update((prev) => ({ ...prev, formats: next }))}
            chipClass="bg-cyan-50"
            placeholder="nuevo formato…"
          />
        </div>
      </Panel>

      {/* ════════ 1b · CUALIFICACIÓN DE CANDIDATOS ════════ */}
      <Panel
        emoji="🚦"
        title="CUALIFICACIÓN DE CANDIDATOS"
        subtitle="quién decide qué leads pasan de Sourced a Qualified (Shortlist) — por campaña"
        pill={<EditablePill />}
        testid="panel-cualificacion"
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="inline-flex overflow-hidden rounded-full border-2 border-ink bg-background shadow-comic-sm" data-testid="qmode-segmented">
            {(
              [
                { key: "auto" as const, label: "Auto" },
                { key: "manual" as const, label: "Manual" },
                { key: "hybrid" as const, label: "Hybrid" },
              ]
            ).map((option, index) => (
              <button
                key={option.key}
                type="button"
                onClick={() => update((prev) => ({ ...prev, mode: option.key }))}
                className={cn(
                  "px-4 py-1.5 text-[13px] font-bold transition-colors",
                  index === 1 && "border-x-2 border-ink",
                  draft.mode === option.key ? "bg-navy text-white" : "bg-background text-foreground hover:bg-muted",
                )}
                data-testid={`qmode-${option.key}`}
              >
                {option.label}
                {draft.mode === option.key && " ✓"}
              </button>
            ))}
          </div>

          {draft.mode !== "manual" && (
            <label className="flex items-center gap-2 text-sm font-bold text-ink" data-testid="umbral-wrap">
              auto-descarte si Quality Score &lt;
              <input
                type="number"
                min={0}
                max={100}
                value={draft.threshold}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  update((prev) => ({
                    ...prev,
                    threshold: Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : prev.threshold,
                  }));
                }}
                className="w-16 rounded-md border-2 border-ink bg-background px-2 py-1 text-sm font-bold text-ink shadow-comic-sm focus:border-rust focus:outline-none"
                data-testid="umbral-input"
              />
            </label>
          )}
        </div>

        <QualificationDescription mode={draft.mode} threshold={draft.threshold} onGoDiscarded={onGoDiscarded} />
      </Panel>

      {/* ════════ 2 · CONVERSIÓN / FUNNEL (read-only) ════════ */}
      <Panel
        emoji="🔻"
        title="CONVERSIÓN / FUNNEL"
        subtitle="valores de referencia para el break-even · solo lectura"
        tone="cool"
        pill={
          <span className="rounded-full border-2 border-border bg-muted px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            🔒 Read-only
          </span>
        }
        testid="panel-funnel"
      >
        <div className="mb-3.5">
          <NarratorCaption>el funnel vive en Metrics — aquí solo lo miramos…</NarratorCaption>
        </div>
        {funnel && (
          <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]" data-testid="funnel-readonly">
            {(
              [
                { value: `${funnel.clickToSignupPct}%`, label: "click → signup", rust: false },
                { value: `${funnel.signupToKycPct}%`, label: "signup → KYC", rust: false },
                { value: `${funnel.kycToFirstTxPct}%`, label: "KYC → first_tx", rust: false },
                { value: `${funnel.defaultTargetCacEur}€`, label: "CAC objetivo", rust: true },
              ] as const
            ).map((box, index) => (
              <div key={box.label} className="contents">
                {index > 0 && (
                  <span className="hidden place-items-center font-black text-ink sm:grid" aria-hidden>
                    ▶
                  </span>
                )}
                <div className="rounded-lg border-2 border-ink bg-background px-3 py-2.5 text-center shadow-comic-sm">
                  <div className={cn("font-heading text-2xl leading-none", box.rust ? "text-rust" : "text-navy")}>
                    {box.value}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-muted-foreground">{box.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">
            🔒 Estos valores se editan en <b>Metrics</b>; Outreach solo los referencia para calcular
            el break-even de cada deal.
          </span>
          <button
            type="button"
            onClick={onGoMetrics}
            className="ml-auto rounded-md border-2 border-ink bg-background px-3.5 py-1.5 text-sm font-bold text-ink shadow-comic-sm transition-transform hover:-translate-y-0.5"
            data-testid="editar-en-metrics"
          >
            Editar en Metrics →
          </button>
        </div>
      </Panel>

      {/* ════════ 3 · CONEXIONES ════════ */}
      <ConnectionsPanel slug={slug} />

      {/* ════════ Banner flotante: cambios sin guardar ════════ */}
      <div
        className={cn(
          "fixed bottom-5 left-1/2 z-[500] flex items-center gap-3.5 rounded-xl border-2 border-ink px-5 py-2.5 shadow-comic transition-all duration-300",
          savedFlash ? "bg-sage/20" : "bg-yellow-200",
          dirty || savedFlash || saveMutation.isPending
            ? "-translate-x-1/2 translate-y-0 opacity-100"
            : "pointer-events-none -translate-x-1/2 translate-y-24 opacity-0",
        )}
        data-testid="save-bar"
      >
        <span className="text-sm font-bold text-ink" data-testid="save-msg">
          {savedFlash
            ? "✓ Modelo guardado — aplica a búsquedas nuevas"
            : saveMutation.isPending
              ? "Guardando…"
              : "✏️ Cambios sin guardar en el modelo de creators"}
        </span>
        {saveMutation.error && !savedFlash && (
          <span className="text-xs font-semibold text-destructive">
            {String((saveMutation.error as Error).message)}
          </span>
        )}
        {!savedFlash && (
          <>
            <button
              type="button"
              onClick={() => setDraft(baseline)}
              disabled={saveMutation.isPending}
              className="text-[13px] font-bold text-muted-foreground underline underline-offset-2 hover:text-ink"
              data-testid="discard-btn"
            >
              descartar
            </button>
            <button
              type="button"
              disabled={saveMutation.isPending || !dirty || yalcDown}
              onClick={() => {
                if (!baseline || !draft) return;
                const partial = buildPartial(baseline, draft);
                if (Object.keys(partial).length === 0) return;
                saveMutation.mutate(partial);
              }}
              className={cn(
                "rounded-md border-2 border-ink bg-rust px-4 py-1.5 font-heading text-sm uppercase tracking-wider text-white shadow-comic-sm transition-transform",
                saveMutation.isPending || yalcDown ? "opacity-60" : "hover:-translate-y-0.5",
              )}
              data-testid="save-btn"
            >
              Guardar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
