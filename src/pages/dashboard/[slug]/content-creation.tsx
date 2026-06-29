import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useContentCreation } from "@/hooks/useContentCreation";
import { useOpenChat } from "@/hooks/useChat";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TitleIcon } from "@/components/layout/title-icon";
import { cn } from "@/lib/utils";
import { ChannelsTab } from "@/components/content/ChannelsTab";
import { SetupTab } from "@/components/content/SetupTab";
import { StrategyDocsTab } from "@/components/content/StrategyDocsTab";
import { IdeaQueueTab } from "@/components/content/IdeaQueueTab";
import { PostingCalendarTab } from "@/components/content/PostingCalendarTab";

// SAN-141: Canales is the home — one loop card per channel. Ideas/Calendar
// stay as-is and act as channel-filtered drill-downs. The old Engine tab is
// dissolved: its state lives in Canales, its configuration in Setup (⚙️).
const TABS = [
  { key: "channels", label: "Canales", icon: "📡" },
  { key: "ideas", label: "Ideas", icon: "💡" },
  { key: "calendar", label: "Calendar", icon: "📅" },
] as const;

type TabKey = (typeof TABS)[number]["key"] | "setup";

// Legacy deep-links (?tab=engine) land on the closest new surface.
const TAB_ALIASES: Record<string, TabKey> = { engine: "channels" };

export default function ContentCreationPage() {
  const slug = useSlugSync();
  const router = useRouter();
  const { data, isLoading, isError } = useContentCreation(slug, null);
  const openChat = useOpenChat();
  const [activeTab, setActiveTab] = useState<TabKey>("channels");

  // Sync tab with URL query (?tab=ideas&channel=linkedin) so deep links +
  // cross-tab nav work. `setup` is reachable via the ⚙️ button + URL only.
  useEffect(() => {
    const raw = typeof router.query.tab === "string" ? router.query.tab : "";
    const t = TAB_ALIASES[raw] || raw;
    if (t === "setup" || (TABS as readonly { key: string }[]).some((x) => x.key === t)) {
      setActiveTab(t as TabKey);
    }
  }, [router.query.tab]);

  const channelParam = typeof router.query.channel === "string" ? router.query.channel : null;
  const statusParam = typeof router.query.status === "string" ? router.query.status : null;
  const authorParam = typeof router.query.author === "string" ? router.query.author : null;
  const unassignedParam = router.query.unassigned === "1";

  const switchTab = (
    key: TabKey,
    channel?: string | null,
    status?: string | null,
    extra?: { author?: string; unassigned?: boolean },
  ) => {
    setActiveTab(key);
    const query: Record<string, string | string[] | undefined> = { ...router.query, tab: key };
    if (channel) query.channel = channel; else delete query.channel;
    if (status) query.status = status; else delete query.status;
    if (extra?.author) query.author = extra.author; else delete query.author;
    if (extra?.unassigned) query.unassigned = "1"; else delete query.unassigned;
    delete query.focus;
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  };

  const hasProject = data ? data.hasProject : true;
  const legacyStatePending = isLoading && !data && !isError;

  return (
    <DashboardLayout>
      <Head>
        <title>Content Creation — {slug} — Mission Control</title>
      </Head>

      {/* Header */}
      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
        <h1 className="font-heading text-2xl text-navy"><TitleIcon name="content" />Content Creation</h1>
        <div className="flex items-center gap-2">
          {data?.projectId && (
            <Link
              href={`/dashboard/${slug}/tasks/${data.projectId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] bg-transparent border border-[#E5E2DC] rounded-md text-[#7A7A7A] hover:bg-[#E5E2DC] hover:text-[#1A1A1A] transition-colors no-underline"
            >
              📁 Proyecto: {data.projectId}
            </Link>
          )}
          <button
            type="button"
            onClick={() => switchTab("setup")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all flex items-center gap-1.5",
              activeTab === "setup" ? "bg-rust text-white border-rust" : "border-border hover:border-rust"
            )}
          >
            ⚙️ Configuración
          </button>
        </div>
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
      {legacyStatePending && activeTab !== "channels" && activeTab !== "setup" && (
        <p className="text-muted-foreground">Cargando...</p>
      )}
      {slug && activeTab === "channels" && (
        <ChannelsTab slug={slug} openChat={openChat} onGo={(tab, channel, status, extra) => switchTab(tab, channel, status, extra)} />
      )}
      {slug && activeTab === "setup" && (
        <SetupTab slug={slug} openChat={openChat} focusChannel={channelParam} />
      )}
      {!legacyStatePending && slug && !hasProject && data && activeTab !== "channels" && activeTab !== "setup" && (
        <StrategyDocsTab slug={slug} data={data} openChat={openChat} />
      )}
      {!legacyStatePending && slug && hasProject && activeTab === "ideas" && (
        <IdeaQueueTab
          slug={slug}
          openChat={openChat}
          focusId={typeof router.query.focus === "string" ? router.query.focus : null}
          initialChannel={channelParam}
          initialStatus={statusParam}
          initialAuthor={authorParam}
          initialUnassigned={unassignedParam}
        />
      )}
      {!legacyStatePending && slug && hasProject && activeTab === "calendar" && (
        <PostingCalendarTab
          slug={slug}
          focusKey={typeof router.query.focus === "string" ? router.query.focus : null}
          channelFilter={channelParam}
        />
      )}
    </DashboardLayout>
  );
}
