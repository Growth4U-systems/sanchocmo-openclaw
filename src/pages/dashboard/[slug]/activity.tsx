"use client";

import Head from "next/head";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";
import { cn } from "@/lib/utils";

/**
 * /dashboard/[slug]/activity — per-client activity feed.
 * Reuses /api/activity with a slug filter; no admin-wide filters, just the
 * client's event stream. The broader cross-client view lives at
 * /dashboard/admin/activity.
 */

interface ActivityEvent {
  id: string;
  message: string;
  timestamp: string;
  time: string;
  level: "ok" | "error" | "warning";
  isCron: boolean;
}

function fmtDate(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("es-ES", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function ClientActivityPage() {
  const t = useTranslations();
  const router = useRouter();
  const slug = router.query.slug as string | undefined;

  const { data, isLoading } = useQuery<{ events: ActivityEvent[] }>({
    queryKey: ["client-activity", slug],
    queryFn: async () => {
      const res = await fetch(`/api/activity?slug=${slug}&limit=100`);
      if (!res.ok) return { events: [] };
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });

  if (!slug) return <DashboardLayout>{null}</DashboardLayout>;

  const events = data?.events || [];

  return (
    <DashboardLayout>
      <Head><title>📡 {slug} — Mission Control</title></Head>
      <h1 className="font-heading text-2xl text-navy mb-1">📡 {t("nav.activity")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{slug}</p>

      <ComicCard>
        {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {!isLoading && events.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>
        )}
        {!isLoading && events.length > 0 && (
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="py-2.5 flex items-start gap-3">
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 rounded-full flex-shrink-0",
                    e.level === "error" ? "bg-red-500" :
                      e.level === "warning" ? "bg-yellow-500" : "bg-green-500"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{e.message}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {e.isCron && "⏱ "}{fmtDate(e.timestamp)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ComicCard>
    </DashboardLayout>
  );
}
