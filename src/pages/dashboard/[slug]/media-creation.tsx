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
import { useRouter } from "next/router";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useOpenChat } from "@/hooks/useChat";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TitleIcon } from "@/components/layout/title-icon";
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
  const [launching, setLaunching] = useState(false);

  const handleLaunchEditor = async () => {
    if (!slug || launching) return;
    setLaunching(true);
    try {
      const res = await fetch(
        `/api/open-design/launch-editor?slug=${encodeURIComponent(slug)}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `No se puede abrir el editor (HTTP ${res.status})`);
        return;
      }
      const { webUrl } = (await res.json()) as { webUrl: string };
      window.open(webUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(String(err instanceof Error ? err.message : err));
    } finally {
      setLaunching(false);
    }
  };

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
      <h1 className="font-heading text-2xl text-navy mb-1"><TitleIcon name="media" />Media Creation</h1>
      <p className="text-sm text-muted-foreground mb-6">{slug}</p>

      {/* Tabs + acción launch-editor */}
      <div className="flex gap-2 mb-6 overflow-x-auto items-center">
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
        {slug && (
          <button
            type="button"
            onClick={handleLaunchEditor}
            disabled={launching}
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border-2 border-border bg-white text-foreground hover:border-rust transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>🎨</span>
            {launching ? "Abriendo…" : "Abrir editor agentic"}
          </button>
        )}
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
