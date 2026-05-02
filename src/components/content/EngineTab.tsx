"use client";

import { useState } from "react";
import { useRouter } from "next/router";
import { ConfigurationPipeline } from "./ConfigurationPipeline";
import { EngineState } from "./EngineState";
import { CarouselSetupPanel } from "./CarouselSetupPanel";
import { ImageGenSetupPanel } from "./ImageGenSetupPanel";
import { InputsTab } from "./InputsTab";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ThreadConfig } from "@/lib/chat-openers";

interface Props {
  slug: string;
  openChat: (slug: string, config: ThreadConfig) => void;
}

type SubTab = "state" | "config";
type EditorSection = "dispatch-channel" | "news" | "profiles" | "keywords" | "paa" | "cadence";

const SECTION_LABELS: Record<EditorSection, string> = {
  "dispatch-channel": "Canal de envío",
  news: "News Prompts",
  profiles: "Perfiles a monitorizar",
  keywords: "Keywords SEO",
  paa: "People Also Ask",
  cadence: "Cadencia editorial",
};

export function EngineTab({ slug, openChat }: Props) {
  const [sub, setSub] = useState<SubTab>("state");

  return (
    <div>
      <EngineSubTabs active={sub} onChange={setSub} />
      {sub === "state" ? (
        <EngineState slug={slug} />
      ) : (
        <ConfigurationPanel slug={slug} openChat={openChat} />
      )}
    </div>
  );
}

function EngineSubTabs({ active, onChange }: { active: SubTab; onChange: (s: SubTab) => void }) {
  const tabs: { id: SubTab; label: string; icon: string }[] = [
    { id: "state", label: "Estado del motor", icon: "📡" },
    { id: "config", label: "Configuración", icon: "⚙️" },
  ];
  return (
    <div className="flex items-center gap-3 mb-5">
      <div
        className="flex p-1 rounded-sc-md border-2"
        style={{
          borderColor: "var(--sc-ink)",
          background: "var(--sc-paper-3)",
          boxShadow: "var(--pop-xs)",
        }}
      >
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className="font-heading font-bold text-[13px] px-4 py-2 rounded transition-all"
              style={{
                background: isActive ? "var(--sc-rust-500)" : "transparent",
                color: isActive ? "var(--sc-paper-3)" : "var(--sc-ink)",
                letterSpacing: "0.02em",
              }}
            >
              <span className="mr-2">{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>
      <span className="text-xs italic" style={{ color: "var(--sc-fg-muted)" }}>
        {active === "state"
          ? "cómo va el motor ahora mismo"
          : "la voz, los pillars, las antenas — modo avanzado"}
      </span>
    </div>
  );
}

function ConfigurationPanel({ slug, openChat }: Props) {
  const [editorSection, setEditorSection] = useState<EditorSection | null>(null);
  const router = useRouter();

  const handleOpenIdeas = () => {
    router.replace(
      { pathname: router.pathname, query: { ...router.query, tab: "ideas" } },
      undefined,
      { shallow: true }
    );
  };

  return (
    <div className="space-y-6">
      <ConfigurationPipeline
        slug={slug}
        openChat={openChat}
        onRequestEditor={setEditorSection}
        onOpenIdeas={handleOpenIdeas}
      />

      <ImageGenSetupPanel slug={slug} />
      <CarouselSetupPanel slug={slug} />

      <Sheet open={editorSection !== null} onOpenChange={(open) => !open && setEditorSection(null)}>
        <SheetContent
          className="!w-[min(96vw,1100px)] !max-w-[96vw] overflow-y-auto overflow-x-hidden"
          side="right"
        >
          <SheetHeader className="sticky top-0 z-10 bg-popover border-b">
            <SheetTitle>
              {editorSection ? SECTION_LABELS[editorSection] : ""}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {editorSection && (
              <InputsTab slug={slug} openChat={openChat} embedded={{ section: editorSection }} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
