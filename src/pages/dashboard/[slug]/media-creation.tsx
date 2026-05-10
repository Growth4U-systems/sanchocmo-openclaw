/**
 * Media Creation — sección dedicada al Design System del brand.
 * Filosofía 100% agentic: humano dirige por prompt vía chat con Maese Pedro 🎭,
 * Maese Pedro ejecuta vía Open Design.
 *
 * Tabs literales (3) — mismo estilo que Content Engine:
 *   1. Design System    — Visual Identity Hero (lee DESIGN.md)
 *   2. Assets           — todo lo de brand-book/visual-identity/ (estilo Brand Brain)
 *   3. Open Design Library — Skills, Design Systems, Prompt Templates, Craft Guides
 */

import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useOpenChat } from "@/hooks/useChat";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import {
  buildMediaAssetThread,
  buildVisualIdentityChatThread,
  buildOdGenerateThread,
} from "@/lib/chat-openers";
import { VisualIdentityHero } from "@/components/media-creation/VisualIdentityHero";
import { MyAssetsGrid } from "@/components/media-creation/MyAssetsGrid";
import { OpenDesignLibrary } from "@/components/media-creation/OpenDesignLibrary";
import type { OdSkill, OdDesignSystem, OdPromptTemplate } from "@/lib/open-design/types";
import type { BrandAsset } from "@/hooks/useBrandAssets";

const TABS = [
  { key: "design-system", label: "Design System", icon: "📐" },
  { key: "assets", label: "Assets", icon: "🗂️" },
  { key: "library", label: "Open Design Library", icon: "📚" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function MediaCreationPage() {
  const slug = useSlugSync();
  const router = useRouter();
  const openChat = useOpenChat();
  const [activeTab, setActiveTab] = useState<TabKey>("design-system");

  // Sync tab with URL query (?tab=...) so deep links + cross-tab nav work
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
        <title>Media Creation — {slug} — Mission Control</title>
      </Head>

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-heading text-2xl text-navy">Media Creation</h1>
        {slug && (
          <Link
            href={`/dashboard/${slug}/media-creation/editor`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] bg-transparent border border-[#E5E2DC] rounded-md text-[#7A7A7A] hover:bg-[#E5E2DC] hover:text-[#1A1A1A] transition-colors no-underline"
          >
            🎨 Abrir editor agentic
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
      {!slug && <p className="text-muted-foreground">Selecciona un brand.</p>}

      {slug && activeTab === "design-system" && (
        <VisualIdentityHero
          slug={slug}
          onRequestChange={(block) => openChat(slug, buildVisualIdentityChatThread(slug, block))}
        />
      )}

      {slug && activeTab === "assets" && (
        <MyAssetsGrid
          slug={slug}
          onRequestEdit={(asset: BrandAsset) =>
            openChat(slug, buildMediaAssetThread(slug, asset.relativePath, asset.name, asset.kind))
          }
        />
      )}

      {slug && activeTab === "library" && (
        <OpenDesignLibrary
          slug={slug}
          onUseSkill={(s: OdSkill) => openChat(slug, buildOdGenerateThread(slug, s.id, s.name ?? s.id))}
          onUseDesignSystem={(ds: OdDesignSystem) =>
            openChat(slug, buildOdGenerateThread(slug, "design-system-apply", `Apply ${ds.title ?? ds.name ?? ds.id}`, ds.id))
          }
          onUsePromptTemplate={(p: OdPromptTemplate) =>
            openChat(slug, buildOdGenerateThread(slug, p.id, p.title ?? p.name ?? p.id))
          }
        />
      )}
    </DashboardLayout>
  );
}
