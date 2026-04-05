/**
 * Foundation Page — faithful replica of legacy Mission Control doc browser.
 *
 * Two modes:
 * 1. Folder View (default): depth bar, warning banner, file tree grouped by section
 * 2. Doc View (when a pillar doc is selected): breadcrumbs, markdown viewer, status bar
 *
 * Ported from: renderFoundation(), renderDocBrowserRoot(), renderDocView(),
 * renderFoundationDepthBar(), renderFoundationWarning() in mission-control.html
 */

import { useRouter } from "next/router";
import Head from "next/head";
import { useState, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useFoundation } from "@/hooks/useFoundation";
import { useOpenChat } from "@/hooks/useChat";
import { buildPillarThread } from "@/lib/chat-openers";
import { DepthBar } from "@/components/foundation/depth-bar";
import { WarningsBanner } from "@/components/foundation/warnings-banner";
import { FileTree } from "@/components/foundation/file-tree";
import { DocViewer } from "@/components/foundation/doc-viewer";
import { StatusBar } from "@/components/foundation/status-bar";
import { EmptyState } from "@/components/shared/empty-state";
import type { FoundationState, Section, Pillar, PillarStatus } from "@/types";

// ============================================================
// Foundation stats calculation (same logic as brand-column.tsx)
// ============================================================

const FF_PILLAR_MAP: Record<string, string> = {
  "company-brief": "company-brief",
  "self-l1": "self-analysis",
  "market-l1": "market-analysis",
  "brand-voice-snapshot": "brand-voice",
  "niche-basic": "niche-discovery",
};

const EXCLUDED_SECTIONS = ["fast-foundation", "foundation-presentation"];

function ffDonePillars(sections: Record<string, Section>): Set<string> {
  const done = new Set<string>();
  const ff = sections["fast-foundation"];
  if (!ff) return done;
  for (const [ffName, pInfo] of Object.entries(ff.pillars || {})) {
    if (["approved", "done"].includes(pInfo.status)) {
      done.add(FF_PILLAR_MAP[ffName] || ffName);
    }
  }
  return done;
}

function calcFoundationStats(foundation: FoundationState | undefined) {
  let approved = 0;
  let total = 0;
  if (!foundation?.sections) return { approved, total, pct: 0 };

  const ffDone = ffDonePillars(foundation.sections);
  for (const [secKey, secData] of Object.entries(foundation.sections)) {
    if (EXCLUDED_SECTIONS.includes(secKey)) continue;
    for (const [pName, pInfo] of Object.entries(secData.pillars || {})) {
      if (pInfo.optional) continue;
      total++;
      const effective =
        pInfo.status === "not-started" && ffDone.has(pName) ? "approved" : pInfo.status;
      if (["approved", "done"].includes(effective)) approved++;
    }
  }
  return { approved, total, pct: total > 0 ? Math.round((approved / total) * 100) : 0 };
}

// ============================================================
// Selected doc state
// ============================================================

interface SelectedDoc {
  sectionKey: string;
  pillarKey: string;
  pillar: Pillar;
  docPath: string;
}

// ============================================================
// Page Component
// ============================================================

export default function FoundationPage() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const { data: foundation, isLoading } = useFoundation(slug);
  const openChat = useOpenChat();

  const [selectedDoc, setSelectedDoc] = useState<SelectedDoc | null>(null);

  // Handle selecting a doc from the file tree
  const handleSelectDoc = useCallback(
    (sectionKey: string, pillarKey: string, pillar: Pillar) => {
      const docPath = pillar.output_file;
      if (!docPath) return;
      setSelectedDoc({ sectionKey, pillarKey, pillar, docPath });
    },
    [],
  );

  // Handle opening chat for a pillar
  const handleOpenChat = useCallback(
    (pillarKey: string, docPath?: string) => {
      if (!slug) return;
      const config = buildPillarThread(slug, pillarKey, docPath);
      openChat(slug, config);
    },
    [slug, openChat],
  );

  // Handle going back to folder view
  const handleBack = useCallback(() => {
    setSelectedDoc(null);
  }, []);

  // Handle status change from status bar
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleStatusChange = useCallback((_newStatus: PillarStatus) => {
    // Status bar mutation already invalidates queries via useUpdatePillarStatus
    // Nothing extra needed here
  }, []);

  // --- Loading state ---
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Cargando Foundation...</p>
        </div>
      </DashboardLayout>
    );
  }

  // --- No data state ---
  if (!foundation || !foundation.sections) {
    return (
      <DashboardLayout>
        <Head>
          <title>Documents &mdash; {slug} &mdash; Mission Control</title>
        </Head>
        <EmptyState
          icon={"\uD83D\uDCC2"}
          message={`No se encontro foundation state para ${slug}`}
        />
      </DashboardLayout>
    );
  }

  const stats = calcFoundationStats(foundation);

  // ============================================================
  // MODE 2: Doc View
  // ============================================================
  if (selectedDoc) {
    return (
      <DashboardLayout>
        <Head>
          <title>
            {selectedDoc.pillarKey.replace(/-/g, " ")} &mdash; {slug} &mdash; Mission Control
          </title>
        </Head>

        <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
          {/* Doc viewer fills the space */}
          <div className="flex-1 overflow-hidden">
            <DocViewer slug={slug} docPath={selectedDoc.docPath} onBack={handleBack} />
          </div>

          {/* Status bar at the bottom */}
          <StatusBar
            slug={slug}
            section={selectedDoc.sectionKey}
            pillar={selectedDoc.pillarKey}
            status={selectedDoc.pillar.status}
            approvedAt={selectedDoc.pillar.approved_at}
            completedAt={selectedDoc.pillar.completed_at}
            onStatusChange={handleStatusChange}
          />
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // MODE 1: Folder View (default)
  // ============================================================
  return (
    <DashboardLayout>
      <Head>
        <title>Documents &mdash; {slug} &mdash; Mission Control</title>
      </Head>

      {/* Page title + breadcrumbs */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <h1 className="font-heading text-2xl text-navy m-0">
          {"\uD83D\uDCC2"} Documents
        </h1>
        <div className="text-sm text-muted-foreground flex items-center gap-1.5">
          <span className="text-rust font-bold">{slug}</span>
        </div>
      </div>

      {/* Foundation depth bar */}
      <DepthBar approved={stats.approved} total={stats.total} />

      {/* Warning banner if < 100% */}
      <WarningsBanner approved={stats.approved} total={stats.total} />

      {/* File tree */}
      <FileTree
        slug={slug}
        foundation={foundation}
        onSelectDoc={handleSelectDoc}
        onOpenChat={handleOpenChat}
      />
    </DashboardLayout>
  );
}
