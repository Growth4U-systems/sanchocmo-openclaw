import { useRouter } from "next/router";
import { useState } from "react";
import Head from "next/head";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";

type Range = "7d" | "30d" | "90d";

export default function MetricsPage() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const t = useTranslations("metrics");
  const [range, setRange] = useState<Range>("30d");

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ["metrics-plan", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/plan?slug=${slug}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  const { data: monitoring } = useQuery({
    queryKey: ["monitoring", slug],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring?slug=${slug}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  const modules = plan?.modules || plan?.metrics_modules || [];
  const healthScore = monitoring?.health_score;

  return (
    <DashboardLayout>
      <Head>
        <title>{t("title")} — {slug} — Mission Control</title>
      </Head>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl text-navy mb-1">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{slug}</p>
        </div>

        {/* Range selector */}
        <div className="flex gap-1 bg-card border-2 border-ink rounded-lg p-1">
          {(["7d", "30d", "90d"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-3 py-1 rounded text-xs font-semibold transition-all",
                range === r
                  ? "bg-rust text-white"
                  : "hover:bg-muted"
              )}
            >
              {t(`range.${r}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Health score card */}
      {healthScore && (
        <div className="rounded-lg border-[3px] border-ink bg-card p-5 shadow-comic mb-6">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center font-heading text-2xl text-white border-2 border-ink"
              style={{
                background: (healthScore.score || 0) >= 70
                  ? "var(--sage)"
                  : (healthScore.score || 0) >= 40
                    ? "var(--yellow)"
                    : "var(--red)",
              }}
            >
              {healthScore.score || "—"}
            </div>
            <div>
              <h2 className="font-semibold text-sm">Health Score</h2>
              <p className="text-xs text-muted-foreground">
                {healthScore.summary || "Score de salud del marketing"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Metrics modules */}
      {planLoading ? (
        <p className="text-muted-foreground">Cargando módulos de métricas...</p>
      ) : modules.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modules.map((mod: Record<string, unknown>, i: number) => (
            <div key={i} className="rounded-lg border-[3px] border-ink bg-card p-5 shadow-comic-sm">
              <h3 className="font-semibold text-sm mb-2">
                {String(mod.icon || "📊")} {String(mod.name || mod.title || `Module ${i + 1}`)}
              </h3>
              {mod.description ? (
                <p className="text-xs text-muted-foreground mb-3">
                  {String(mod.description)}
                </p>
              ) : null}
              {mod.kpis && Array.isArray(mod.kpis) ? (
                <div className="space-y-1">
                  {(mod.kpis as Record<string, unknown>[]).map((kpi, j) => (
                    <div key={j} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{String(kpi.name)}</span>
                      <span className="font-semibold">{String(kpi.value || "—")}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {mod.status ? (
                <div className="mt-3 pt-2 border-t border-border">
                  <span className={cn(
                    "text-xs font-semibold px-2 py-0.5 rounded",
                    mod.status === "connected" ? "bg-sage/20 text-sage" :
                      mod.status === "error" ? "bg-destructive/20 text-destructive" :
                        "bg-muted text-muted-foreground"
                  )}>
                    {String(mod.status)}
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border-[3px] border-ink bg-card p-8 shadow-comic text-center">
          <p className="text-muted-foreground">
            No hay módulos de métricas configurados para este cliente.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Rango seleccionado: {t(`range.${range}`)}
          </p>
        </div>
      )}

      {/* Next steps from monitoring */}
      {monitoring?.pending_recommendations && (
        <div className="mt-6 rounded-lg border-[3px] border-ink bg-card p-5 shadow-comic">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            {t("nextSteps")}
          </h2>
          <div className="space-y-2">
            {(Array.isArray(monitoring.pending_recommendations)
              ? monitoring.pending_recommendations
              : monitoring.pending_recommendations.recommendations || []
            ).slice(0, 5).map((rec: Record<string, unknown>, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-rust mt-0.5">→</span>
                <div>
                  <span className="font-medium">{String(rec.title)}</span>
                  {rec.rationale ? (
                    <p className="text-xs text-muted-foreground">{String(rec.rationale)}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
