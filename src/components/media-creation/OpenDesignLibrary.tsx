/**
 * Open Design Library — contenedor con 4 sub-tabs literales (sin sub-views inventadas):
 * Skills, Design Systems, Prompt Templates, Craft Guides.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SkillsList } from "./SkillsList";
import { DesignSystemsGrid } from "./DesignSystemsGrid";
import { PromptTemplatesGallery } from "./PromptTemplatesGallery";
import { CraftGuidesList } from "./CraftGuidesList";
import type { OdSkill, OdDesignSystem, OdPromptTemplate } from "@/lib/open-design/types";

interface Props {
  slug: string;
  onUseSkill: (skill: OdSkill) => void;
  onUseDesignSystem: (ds: OdDesignSystem) => void;
  onUsePromptTemplate: (prompt: OdPromptTemplate) => void;
}

const TABS = [
  { id: "skills", label: "Skills", icon: "🛠️" },
  { id: "design-systems", label: "Design Systems", icon: "🎨" },
  { id: "prompt-templates", label: "Prompt Templates", icon: "✨" },
  { id: "craft-guides", label: "Craft Guides", icon: "📐" },
] as const;

type TabId = typeof TABS[number]["id"];

export function OpenDesignLibrary({ slug, onUseSkill, onUseDesignSystem, onUsePromptTemplate }: Props) {
  const [tab, setTab] = useState<TabId>("skills");

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Catálogo upstream de{" "}
        <a href="https://github.com/nexu-io/open-design" target="_blank" rel="noopener noreferrer" className="text-rust hover:underline">
          Open Design
        </a>
        . Apache-2.0. <code className="bg-muted px-1.5 py-0.5 rounded">git pull</code> en{" "}
        <code className="bg-muted px-1.5 py-0.5 rounded">/Users/ragi/open-design</code> para recibir mejoras.
      </p>

      <div className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all whitespace-nowrap flex items-center gap-1.5",
              tab === t.id
                ? "bg-rust text-white border-rust"
                : "border-border hover:border-rust",
            )}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "skills" && <SkillsList slug={slug} onUse={onUseSkill} />}
        {tab === "design-systems" && <DesignSystemsGrid slug={slug} onUse={onUseDesignSystem} />}
        {tab === "prompt-templates" && <PromptTemplatesGallery slug={slug} onUse={onUsePromptTemplate} />}
        {tab === "craft-guides" && <CraftGuidesList />}
      </div>
    </div>
  );
}
