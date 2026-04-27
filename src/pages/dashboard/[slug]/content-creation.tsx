import { useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useContentCreation } from "@/hooks/useContentCreation";
import { useOpenChat } from "@/hooks/useChat";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import { ContentDocsTab } from "@/components/content/ContentDocsTab";
import { InputsTab } from "@/components/content/InputsTab";
import { IdeaQueueTab } from "@/components/content/IdeaQueueTab";
import { CalendarTab } from "@/components/content/CalendarTab";
import { useProjects } from "@/hooks/useProjects";
import { buildDocThread, findTaskThreadForDoc } from "@/lib/chat-openers";

const TABS = [
  { key: "estrategia", label: "Estrategia", icon: "📋" },
  { key: "inputs", label: "Inputs", icon: "🔍" },
  { key: "ideas", label: "Ideas", icon: "💡" },
  { key: "calendar", label: "Calendar", icon: "📅" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Content Creation page — Phase 1 refactor (2026-04-14).
 *
 * The previous version had a confusing "All Niches" dropdown that mixed
 * client-global tasks (Strategy, LinkedIn setup, Calendar setup, Crons)
 * with per-niche tasks. Users couldn't tell which scope they were editing.
 *
 * Phase 1 fix: Separate the two scopes visually.
 *   - Client-global tasks (`niche === null`) → rendered in the new
 *     `StrategyBanner` above the tabs. Always visible, no niche filter.
 *   - Per-niche tasks → continue to flow through the existing tabs
 *     (StrategyDocs, Ideas, Calendar, ...), but the "All Niches" dropdown
 *     is gone. In later phases we add per-niche workspaces and a proper
 *     multi-niche tag system for ideas/pieces.
 *
 * The dropdown is removed entirely in this phase because the two scopes
 * now live on different parts of the page, so a selector makes no sense.
 */
export default function ContentCreationPage() {
  const slug = useSlugSync();
  const { data, isLoading } = useContentCreation(slug, null);
  const { data: projectsData } = useProjects(slug || null);
  const openChat = useOpenChat();
  const [activeTab, setActiveTab] = useState<TabKey>("estrategia");

  return (
    <DashboardLayout>
      <Head>
        <title>Content Creation — {slug} — Mission Control</title>
      </Head>

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-heading text-2xl text-navy">Content Creation</h1>
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
            onClick={() => setActiveTab(tab.key)}
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
      {!isLoading && slug && activeTab === "estrategia" && (
        <ContentDocsTab slug={slug} />
      )}
      {!isLoading && slug && activeTab === "inputs" && (
        <InputsTab slug={slug} openChat={openChat} />
      )}
      {!isLoading && slug && activeTab === "ideas" && (
        <IdeaQueueTab slug={slug} />
      )}
      {!isLoading && slug && data && activeTab === "calendar" && (
        <CalendarTab slug={slug} data={data} openChat={openChat} />
      )}
    </DashboardLayout>
  );
}
