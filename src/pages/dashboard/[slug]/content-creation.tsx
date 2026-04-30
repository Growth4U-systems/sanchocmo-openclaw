import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useContentCreation } from "@/hooks/useContentCreation";
import { useOpenChat } from "@/hooks/useChat";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import { EngineTab } from "@/components/content/EngineTab";
import { IdeaQueueTab } from "@/components/content/IdeaQueueTab";
import { CalendarTab } from "@/components/content/CalendarTab";

const TABS = [
  { key: "engine", label: "Engine", icon: "🔧" },
  { key: "ideas", label: "Ideas", icon: "💡" },
  { key: "calendar", label: "Calendar", icon: "📅" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ContentCreationPage() {
  const slug = useSlugSync();
  const router = useRouter();
  const { data, isLoading } = useContentCreation(slug, null);
  const openChat = useOpenChat();
  const [activeTab, setActiveTab] = useState<TabKey>("engine");

  // Sync tab with URL query (?tab=ideas etc.) so deep links + cross-tab nav work
  useEffect(() => {
    const t = router.query.tab;
    if (typeof t === "string" && (TABS as readonly { key: string }[]).some((x) => x.key === t)) {
      setActiveTab(t as TabKey);
    }
  }, [router.query.tab]);

  const switchTab = (key: TabKey) => {
    setActiveTab(key);
    router.replace({ pathname: router.pathname, query: { ...router.query, tab: key } }, undefined, { shallow: true });
  };

  return (
    <DashboardLayout>
      <Head>
        <title>Content Creation — {slug} — Mission Control</title>
      </Head>

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-heading text-2xl text-navy">Content Engine</h1>
        {data?.projectId && (
          <Link
            href={`/dashboard/${slug}/projects/${data.projectId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] bg-transparent border border-[#E5E2DC] rounded-md text-[#7A7A7A] hover:bg-[#E5E2DC] hover:text-[#1A1A1A] transition-colors no-underline"
          >
            📁 Proyecto: {data.projectId}
          </Link>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-6">{slug}</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all whitespace-nowrap flex items-center gap-1.5",
              activeTab === tab.key
                ? "bg-rust text-white border-rust"
                : "border-border hover:border-rust"
            )}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading && <p className="text-muted-foreground">Cargando...</p>}
      {!isLoading && slug && activeTab === "engine" && (
        <EngineTab slug={slug} openChat={openChat} />
      )}
      {!isLoading && slug && activeTab === "ideas" && (
        <IdeaQueueTab slug={slug} openChat={openChat} />
      )}
      {!isLoading && slug && data && activeTab === "calendar" && (
        <CalendarTab slug={slug} data={data} openChat={openChat} />
      )}
    </DashboardLayout>
  );
}
