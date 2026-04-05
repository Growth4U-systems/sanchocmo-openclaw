import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import Head from "next/head";
import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useFoundation, useUpdatePillarStatus } from "@/hooks/useFoundation";
// FOUNDATION_ORDER and FOUNDATION_COLORS available for future use
import type { PillarStatus, Section, Pillar } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_ICON: Record<string, string> = {
  "not-started": "⬜",
  "in-progress": "🔄",
  approved: "✅",
  "pending-review": "⏳",
  generated: "📝",
  "request-changes": "⚠️",
  "request-refresh": "🔃",
};

const STATUS_LABEL: Record<string, string> = {
  "not-started": "No iniciado",
  "in-progress": "En progreso",
  approved: "Aprobado",
  "pending-review": "Pendiente de revisión",
  generated: "Generado",
  "request-changes": "Requiere cambios",
  "request-refresh": "Actualización solicitada",
};

export default function FoundationPage() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const t = useTranslations("foundation");
  const { data: state, isLoading } = useFoundation(slug);
  const [selectedPillar, setSelectedPillar] = useState<{
    sectionKey: string;
    pillarKey: string;
    pillar: Pillar;
  } | null>(null);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">{t("title")}...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!state || !state.sections) {
    return (
      <DashboardLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">No foundation state found for {slug}</p>
        </div>
      </DashboardLayout>
    );
  }

  // Compute depth bar stats
  const allPillars = getAllPillars(state.sections);
  const total = allPillars.length;
  const approved = allPillars.filter((p) => p.status === "approved").length;
  const inProgress = allPillars.filter((p) =>
    ["in-progress", "pending-review", "generated"].includes(p.status)
  ).length;
  const notStarted = total - approved - inProgress;

  // Group sections by layer
  const layers = groupByLayer(state.sections);

  return (
    <DashboardLayout>
      <Head>
        <title>{t("title")} — {slug} — Mission Control</title>
      </Head>

      <h1 className="font-heading text-2xl text-navy mb-1">{t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>

      {/* Depth bar */}
      <div className="flex gap-1 mb-6 h-10 rounded-lg overflow-hidden border-2 border-ink">
        {approved > 0 && (
          <div
            className="flex items-center justify-center text-xs font-bold text-white"
            style={{ flex: approved, background: "var(--sage)" }}
          >
            ✅ {approved}
          </div>
        )}
        {inProgress > 0 && (
          <div
            className="flex items-center justify-center text-xs font-bold"
            style={{ flex: inProgress, background: "var(--yellow)", color: "#000" }}
          >
            🔄 {inProgress}
          </div>
        )}
        {notStarted > 0 && (
          <div
            className="flex items-center justify-center text-xs font-bold text-muted-foreground"
            style={{ flex: notStarted, background: "var(--border)" }}
          >
            ⬜ {notStarted}
          </div>
        )}
      </div>

      {/* Layers */}
      {Object.entries(layers)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([layer, sections]) => (
          <div key={layer} className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Layer {layer}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sections.map(([sectionKey, section]) =>
                Object.entries(section.pillars || {}).map(([pillarKey, pillar]) => (
                  <button
                    key={`${sectionKey}-${pillarKey}`}
                    onClick={() => setSelectedPillar({ sectionKey, pillarKey, pillar })}
                    className={cn(
                      "rounded-lg border-2 p-4 text-left transition-all hover:shadow-comic-sm",
                      pillar.status === "approved"
                        ? "border-sage bg-sage/10"
                        : pillar.status === "in-progress" || pillar.status === "generated"
                          ? "border-yellow bg-yellow/10"
                          : "border-border bg-card",
                      selectedPillar?.pillarKey === pillarKey &&
                        selectedPillar?.sectionKey === sectionKey &&
                        "ring-2 ring-rust"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{STATUS_ICON[pillar.status] || "⬜"}</span>
                      <span className="font-semibold text-sm capitalize">
                        {pillarKey.replace(/-/g, " ")}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {STATUS_LABEL[pillar.status] || pillar.status}
                    </div>
                    {pillar.output_file && (
                      <div className="text-[10px] text-muted-foreground mt-1 truncate">
                        📄 {pillar.output_file}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        ))}

      {/* Pillar detail panel */}
      {selectedPillar && (
        <PillarDetail
          slug={slug}
          sectionKey={selectedPillar.sectionKey}
          pillarKey={selectedPillar.pillarKey}
          pillar={selectedPillar.pillar}
          onClose={() => setSelectedPillar(null)}
        />
      )}
    </DashboardLayout>
  );
}

function PillarDetail({
  slug,
  sectionKey,
  pillarKey,
  pillar,
  onClose,
}: {
  slug: string;
  sectionKey: string;
  pillarKey: string;
  pillar: Pillar;
  onClose: () => void;
}) {
  const mutation = useUpdatePillarStatus();

  function handleStatusChange(newStatus: PillarStatus) {
    mutation.mutate({
      slug,
      section: sectionKey,
      pillar: pillarKey,
      status: newStatus,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border-l-[3px] border-ink h-full overflow-y-auto p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          ✕
        </button>

        <h2 className="font-heading text-xl text-navy mb-1 capitalize">
          {pillarKey.replace(/-/g, " ")}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Section: {sectionKey}
        </p>

        {/* Status */}
        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Estado
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg">{STATUS_ICON[pillar.status] || "⬜"}</span>
            <span className="font-medium">{STATUS_LABEL[pillar.status] || pillar.status}</span>
          </div>
        </div>

        {/* Status actions */}
        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Cambiar estado
          </div>
          <div className="flex flex-wrap gap-2">
            {(["approved", "in-progress", "not-started", "request-refresh"] as PillarStatus[]).map(
              (status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  disabled={pillar.status === status || mutation.isPending}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                    pillar.status === status
                      ? "bg-rust text-white border-rust"
                      : "border-border hover:border-rust"
                  )}
                >
                  {STATUS_ICON[status]} {STATUS_LABEL[status]}
                </button>
              )
            )}
          </div>
        </div>

        {/* Dependencies */}
        {pillar.requires && pillar.requires.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Requiere
            </div>
            <div className="flex flex-wrap gap-1">
              {pillar.requires.map((r) => (
                <span key={r} className="px-2 py-0.5 bg-muted rounded text-xs">
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Document link */}
        {pillar.output_file && (
          <div className="mb-4">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Documento
            </div>
            <a
              href={`/dashboard/${slug}/docs/${pillar.output_file}`}
              className="text-sm text-rust hover:underline"
            >
              📄 {pillar.output_file}
            </a>
          </div>
        )}

        {/* Timestamps */}
        <div className="text-xs text-muted-foreground space-y-1 mt-6 pt-4 border-t border-border">
          {pillar.completed_at && <p>Completado: {pillar.completed_at}</p>}
          {pillar.approved_at && <p>Aprobado: {pillar.approved_at}</p>}
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---

function getAllPillars(sections: Record<string, Section>) {
  const pillars: Pillar[] = [];
  for (const section of Object.values(sections)) {
    for (const pillar of Object.values(section.pillars || {})) {
      pillars.push(pillar);
    }
  }
  return pillars;
}

function groupByLayer(sections: Record<string, Section>) {
  const groups: Record<number, [string, Section][]> = {};
  for (const [key, section] of Object.entries(sections)) {
    const layer = section.layer || 0;
    if (!groups[layer]) groups[layer] = [];
    groups[layer].push([key, section]);
  }
  return groups;
}
