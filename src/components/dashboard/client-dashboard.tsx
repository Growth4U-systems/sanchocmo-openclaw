"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ActivityBar } from "@/components/dashboard/activity-bar";
import { BrandColumn } from "@/components/dashboard/brand-column";
import { MetricsColumn } from "@/components/dashboard/metrics-column";
import { NextStepsColumn } from "@/components/dashboard/nextsteps-column";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { cn } from "@/lib/utils";

/**
 * 3-column client dashboard (Brand / Metrics / Next Steps).
 * Shared between `/dashboard/[slug]` and any host that needs to embed it.
 * Takes the slug as an explicit prop — no store lookup — so the URL is
 * the single source of truth for which client is shown.
 */
export function ClientDashboardV2({ slug }: { slug: string }) {
  const t = useTranslations("dashboard");
  const [activeTab, setActiveTab] = useState(0);
  const [docPath, setDocPath] = useState<string | null>(null);

  const tabs = [
    { emoji: "🏢", label: t("brandSnapshot") },
    { emoji: "📈", label: t("metricas") },
    { emoji: "🎯", label: t("nextSteps") },
  ];

  return (
    <div className="flex flex-col h-screen">
      <ActivityBar slug={slug} />

      {/* Mobile tab bar — visible < lg */}
      <div className="flex lg:hidden bg-card border-b-2 border-ink p-1">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActiveTab(i)}
            className={cn(
              "flex-1 px-3 py-2 rounded text-xs font-semibold transition-colors text-center",
              activeTab === i ? "bg-rust text-white" : "hover:bg-muted"
            )}
          >
            {tab.emoji} {tab.label}
          </button>
        ))}
      </div>

      {/* 3-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 flex-1 min-h-0 overflow-hidden">
        <div
          className={cn(
            "lg:border-r border-border bg-white dark:bg-card flex flex-col min-h-0",
            activeTab !== 0 && "hidden lg:flex"
          )}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
            <span className="text-xs font-bold">{"🏢"} {t("brandSnapshot")}</span>
            <Link
              href={`/dashboard/${slug}/foundation`}
              className="text-[10px] font-semibold text-rust hover:underline"
            >
              {t("brandSnapshot")} {"→"}
            </Link>
          </div>
          <div className="px-5 py-3 overflow-y-auto flex-1">
            <BrandColumn slug={slug} onOpenDoc={setDocPath} />
          </div>
        </div>

        <div
          className={cn(
            "lg:border-r border-border bg-white dark:bg-card flex flex-col min-h-0",
            activeTab !== 1 && "hidden lg:flex"
          )}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
            <span className="text-xs font-bold">{"📈"} {t("metricas")}</span>
            <Link
              href={`/dashboard/${slug}/metrics`}
              className="text-[10px] font-semibold text-rust hover:underline"
            >
              {t("title")} {"→"}
            </Link>
          </div>
          <div className="px-5 py-3 overflow-y-auto flex-1">
            <MetricsColumn slug={slug} />
          </div>
        </div>

        <div className={cn("bg-white dark:bg-card flex flex-col min-h-0", activeTab !== 2 && "hidden lg:flex")}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
            <span className="text-xs font-bold">{"🎯"} {t("nextSteps")}</span>
            <Link
              href={`/dashboard/${slug}/projects`}
              className="text-[10px] font-semibold text-rust hover:underline"
            >
              {t("nextSteps")} {"→"}
            </Link>
          </div>
          <div className="px-5 py-3 overflow-y-auto flex-1">
            <NextStepsColumn slug={slug} onOpenDoc={setDocPath} />
          </div>
        </div>
      </div>

      <DocSlideOver slug={slug} docPath={docPath} onClose={() => setDocPath(null)} />
    </div>
  );
}
