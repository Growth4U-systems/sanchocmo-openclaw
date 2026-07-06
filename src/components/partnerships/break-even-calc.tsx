/**
 * Calc break-even interactiva (SAN-80) — rellena el hueco "Ola 2" del drawer
 * del partner (SAN-78). Paridad de comportamiento con drawer-partner.html:
 * deal editable (posts × formato · precio total · estructura fijo/mixto ·
 * CPA variable · CAC objetivo · multiplicador de incentivo) recalculando EN
 * VIVO con el motor real de calc-creator-core (SAN-75b). El mismo cálculo
 * que la skill negotiation-assist y la tool MCP `yalc_breakeven`.
 */

"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { CreatorModelConfig } from "@/lib/calc-creator-core";
import { negotiationBreakEven } from "@/lib/partnerships/negotiation";
import { formatIntEs } from "@/lib/partnerships/stage-mapping";
import type { PartnershipLead } from "@/lib/partnerships/types";

const FORMATS = [
  { key: "reel", label: "Reel" },
  { key: "post", label: "Post" },
  { key: "story", label: "Story" },
  { key: "video", label: "Vídeo largo" },
  { key: "carrusel", label: "Carrusel" },
] as const;

const MULTIPLIERS = [
  { value: 1, label: "×1 (sin código)" },
  { value: 1.5, label: "×1.5 (código descuento)" },
  { value: 2, label: "×2 (bono bienvenida)" },
  { value: 3, label: "×3 (bono + sorteo)" },
] as const;

const VERDICT_STYLES: Record<string, string> = {
  green: "border-sage/60 bg-sage/10 text-sage",
  amber: "border-amber-400/60 bg-amber-100 text-amber-900",
  red: "border-destructive/50 bg-destructive/10 text-destructive",
};

export function BreakEvenCalc({
  lead,
  config,
}: {
  lead: PartnershipLead;
  /** Config efectiva del modelo (SAN-76): reach/CTR/funnel/CAC de Settings. */
  config?: CreatorModelConfig;
}) {
  const defaultCac = config?.breakEven.defaultTargetCacEur ?? 80;
  const [posts, setPosts] = useState(3);
  const [format, setFormat] = useState<string>("reel");
  const [fee, setFee] = useState<number>(
    typeof lead.offeredPrice === "number" && lead.offeredPrice > 0
      ? lead.offeredPrice
      : 3500,
  );
  const [structure, setStructure] = useState<"fijo" | "mixto">("fijo");
  const [variableCpa, setVariableCpa] = useState(10);
  // null = sin tocar → sigue el CAC objetivo de la config (referencia a Metrics).
  const [cac, setCac] = useState<number | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const effectiveCac = cac ?? defaultCac;

  const result = useMemo(() => {
    try {
      return negotiationBreakEven({
        feeEur: Number.isFinite(fee) ? Math.max(0, fee) : 0,
        followers: lead.followers,
        engagementRatePct: lead.engagementRate,
        posts: Number.isFinite(posts) ? Math.max(1, posts) : 1,
        format,
        structure,
        variableCpaEur:
          structure === "mixto" ? Math.max(0, variableCpa) : undefined,
        targetCacEur: Number.isFinite(effectiveCac)
          ? Math.max(1, effectiveCac)
          : defaultCac,
        incentiveMultiplier: multiplier,
        config,
      });
    } catch {
      return null;
    }
  }, [
    lead.followers,
    lead.engagementRate,
    posts,
    format,
    fee,
    structure,
    variableCpa,
    effectiveCac,
    defaultCac,
    multiplier,
    config,
  ]);

  const inputCls =
    "w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-rust focus:outline-none";
  const labelCls =
    "flex items-center gap-2 text-xs font-semibold text-muted-foreground";

  return (
    <section
      className="rounded-xl border border-border bg-card p-4"
      data-testid="breakeven-calc"
    >
      <h3 className="text-sm font-semibold text-foreground">
        🧮 Break-even de negociación
      </h3>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Le damos la vuelta: cuántas conversiones debe producir el deal para
        salir rentable a tu CAC objetivo.
      </p>

      {/* Deal editable */}
      <div
        className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2"
        data-testid="breakeven-controls"
      >
        <label className={labelCls}>
          Posts
          <input
            type="number"
            min={1}
            value={posts}
            onChange={(e) => setPosts(parseInt(e.target.value, 10) || 1)}
            className={cn(inputCls, "w-16")}
            data-testid="be-posts"
          />
        </label>
        <label className={labelCls}>
          Formato
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className={cn(inputCls, "w-auto")}
            data-testid="be-format"
          >
            {FORMATS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Precio 💶
          <input
            type="number"
            min={0}
            step={50}
            value={fee}
            onChange={(e) => setFee(parseFloat(e.target.value) || 0)}
            className={inputCls}
            data-testid="be-fee"
          />
        </label>
        <label className={labelCls}>
          Estructura
          <select
            value={structure}
            onChange={(e) =>
              setStructure(e.target.value === "mixto" ? "mixto" : "fijo")
            }
            className={cn(inputCls, "w-auto")}
            data-testid="be-structure"
          >
            <option value="fijo">Solo fijo</option>
            <option value="mixto">Fijo + variable</option>
          </select>
        </label>
        {structure === "mixto" && (
          <label className={labelCls}>
            CPA var. €
            <input
              type="number"
              min={0}
              value={variableCpa}
              onChange={(e) => setVariableCpa(parseFloat(e.target.value) || 0)}
              className={cn(inputCls, "w-16")}
              data-testid="be-cpa"
            />
          </label>
        )}
        <label
          className={labelCls}
          title="Default: CAC objetivo de Settings (referenciado de Metrics)"
        >
          CAC obj. €
          <input
            type="number"
            min={1}
            value={effectiveCac}
            onChange={(e) => setCac(parseFloat(e.target.value) || defaultCac)}
            className={cn(inputCls, "w-16")}
            data-testid="be-cac"
          />
        </label>
        <label className={labelCls}>
          Incentivo 🎁
          <select
            value={String(multiplier)}
            onChange={(e) => setMultiplier(parseFloat(e.target.value) || 1)}
            className={cn(inputCls, "w-auto")}
            data-testid="be-mult"
          >
            {MULTIPLIERS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!result ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Faltan seguidores del creator para estimar lo alcanzable.
        </p>
      ) : (
        <>
          {/* Métricas */}
          <div
            className="mt-4 grid grid-cols-3 gap-3"
            data-testid="breakeven-cells"
          >
            <div className="rounded-lg border border-border bg-background p-3 text-center">
              <div
                className="font-heading text-2xl font-semibold leading-none text-navy"
                data-testid="be-necesarias"
              >
                {Number.isFinite(result.necesarias)
                  ? formatIntEs(result.necesarias)
                  : "∞"}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                conversiones necesarias
                <br />({result.formulaNecesarias})
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background p-3 text-center">
              <div
                className="font-heading text-2xl font-semibold leading-none text-navy"
                data-testid="be-alcanzable"
              >
                ~{formatIntEs(result.alcanzable)}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                alcanzables estimadas
                <br />
                (×{result.deal.incentiveMultiplier} incentivo)
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background p-3 text-center">
              <div
                className="font-heading text-2xl font-semibold leading-none text-navy"
                data-testid="be-ratio"
              >
                {result.ratio === Infinity
                  ? "∞"
                  : `${Math.round(result.ratio * 100)}%`}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                cobertura del break-even
              </div>
            </div>
          </div>

          {/* Veredicto */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-sm font-semibold",
                VERDICT_STYLES[result.veredictoColor],
              )}
              data-testid="be-verdict"
            >
              {result.veredictoColor === "green" && "✅ "}
              {result.veredictoColor === "amber" && "⚠️ "}
              {result.veredictoColor === "red" && "⛔ "}
              {result.veredictoLabel}
            </span>
            <span className="text-xs text-muted-foreground">
              {result.frase}
            </span>
          </div>

          <p
            className="mt-2 text-[11px] text-muted-foreground"
            data-testid="be-modelo"
          >
            {result.modelo}
          </p>

          {/* Contraoferta */}
          {result.contraofertaEur !== null && result.contraofertaEur > 0 && (
            <div
              className="mt-3 rounded-md border border-yellow-300/60 bg-yellow-50/60 px-3 py-2 text-sm text-yellow-900"
              data-testid="be-contraoferta"
            >
              💡 Contraoferta sugerida:{" "}
              <b>{formatIntEs(result.contraofertaEur)}€</b>
              {" — "}
              {result.contraofertaNota}
            </div>
          )}
        </>
      )}
    </section>
  );
}
