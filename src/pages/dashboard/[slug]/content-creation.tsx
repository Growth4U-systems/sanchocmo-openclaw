import { useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useContentCreation } from "@/hooks/useContentCreation";
import { useOpenChat } from "@/hooks/useChat";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import { PillarsTab } from "@/components/content/PillarsTab";
import { StrategyDocsTab } from "@/components/content/StrategyDocsTab";
import { InputsTab } from "@/components/content/InputsTab";
import { IdeaQueueTab } from "@/components/content/IdeaQueueTab";
import { CalendarTab } from "@/components/content/CalendarTab";
import { StrategyBanner, type StrategyBannerTask } from "@/components/content/strategy-banner";
import { useProjects } from "@/hooks/useProjects";
import { buildDocThread, findTaskThreadForDoc } from "@/lib/chat-openers";

const TABS = [
  { key: "pillars", label: "Pillars", icon: "🏛️" },
  { key: "strategy", label: "Strategy", icon: "📋" },
  { key: "ideas-sources", label: "Inputs", icon: "🔍" },
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
  const [activeTab, setActiveTab] = useState<TabKey>("pillars");

  // Split documents into client-global (no niche) vs per-niche.
  // Rule: niche === null (or undefined) means the task applies to the whole
  // client, not to a specific niche. It belongs in the Strategy Banner.
  const { clientGlobalTasks, perNicheDocs } = useMemo(() => {
    const docs = data?.documents || [];
    const global: typeof docs = [];
    const perNiche: typeof docs = [];
    for (const d of docs) {
      if (d.niche === null || d.niche === undefined || d.niche === "") {
        global.push(d);
      } else {
        perNiche.push(d);
      }
    }
    return { clientGlobalTasks: global, perNicheDocs: perNiche };
  }, [data?.documents]);

  // Data passed into the tabs: strip out the client-global tasks so they
  // don't double-render (they're in the banner now).
  const tabData = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      documents: perNicheDocs,
      // selectedNiche is always null in Phase 1 — tabs see everything
      // per-niche, ungrouped. Phase 2 introduces per-niche workspaces.
      selectedNiche: null,
    };
  }, [data, perNicheDocs]);

  // Open the chat for a Strategy Banner task. Routes through `buildDocThread`,
  // which is the single source of truth for content-doc → thread id mapping
  // (see chat-openers.ts convergence invariant). For tasks with a pillar
  // this produces the same thread id as the Foundation task page at
  // `/projects/{pid}/tasks/{tid}`, so clicking the banner doesn't fork the
  // conversation history.
  const handleOpenChatForTask = (task: StrategyBannerTask) => {
    if (!slug) return;
    // Convergence: check if this doc belongs to a task first
    if (task.docPath) {
      const taskThread = findTaskThreadForDoc(slug, task.docPath, projectsData);
      if (taskThread) { openChat(slug, taskThread); return; }
    }
    const config = buildDocThread(
      slug,
      {
        id: task.id,
        name: task.name,
        key: task.key,
        pillar: task.pillar,
        status: task.status,
        docPath: task.docPath,
        deliverable: task.deliverable,
      },
      data?.projectId || undefined
    );
    openChat(slug, config);
  };

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

      {/* Strategy Banner — always visible, client-global tasks only */}
      {!isLoading && tabData && clientGlobalTasks.length > 0 && (
        <StrategyBanner
          tasks={clientGlobalTasks.map((t) => ({
            id: t.id,
            key: t.key || t.id,
            name: t.name,
            status: t.status,
            deliverable: t.deliverable,
            docPath: t.docPath,
            pillar: t.pillar,
          }))}
          onOpenChat={handleOpenChatForTask}
        />
      )}

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
      {!isLoading && slug && activeTab === "pillars" && (
        <PillarsTab slug={slug} />
      )}
      {!isLoading && tabData && activeTab === "strategy" && (
        <StrategyDocsTab slug={slug} data={tabData} openChat={openChat} />
      )}
      {!isLoading && slug && activeTab === "ideas-sources" && (
        <InputsTab slug={slug} />
      )}
      {!isLoading && slug && activeTab === "ideas" && (
        <IdeaQueueTab slug={slug} />
      )}
      {!isLoading && tabData && activeTab === "calendar" && (
        <CalendarTab slug={slug} data={tabData} openChat={openChat} />
      )}
    </DashboardLayout>
  );
}
