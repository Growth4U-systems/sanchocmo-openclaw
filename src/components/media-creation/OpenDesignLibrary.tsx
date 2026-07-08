/**
 * Open Design Library — contenedor con 4 sub-tabs literales (sin sub-views inventadas):
 * Skills, Design Systems, Prompt Templates, Craft Guides.
 *
 * Open Design is an opt-in overlay. Before rendering the catalog we discriminate
 * three states off `/api/open-design/status` (SAN-415, mirror of YALC #420):
 *   - not configured        → calm "not activated" placeholder + CTA (no empty grids)
 *   - configured + daemon down → distinct "daemon caído" state with a restart hint
 *   - ok                    → the real Library UI
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SkillsList } from "./SkillsList";
import { DesignSystemsGrid } from "./DesignSystemsGrid";
import { PromptTemplatesGallery } from "./PromptTemplatesGallery";
import { CraftGuidesList } from "./CraftGuidesList";
import { useOpenDesignStatus } from "@/hooks/useOpenDesignStatus";
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
  const status = useOpenDesignStatus();

  // OD is an opt-in service. When it isn't wired up (or its daemon is down),
  // show a calm placeholder instead of empty grids / unreachable errors.
  if (status.data && !status.data.configured) {
    return <OdNotActivated onRecheck={() => status.refetch()} rechecking={status.isFetching} />;
  }
  if (status.data && status.data.configured && !status.data.healthy) {
    return (
      <OdDaemonDown
        daemonUrl={status.data.daemonUrl}
        onRecheck={() => status.refetch()}
        rechecking={status.isFetching}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Catálogo servido por el daemon de{" "}
        <a
          href="https://github.com/Growth4U-systems/open-design"
          target="_blank"
          rel="noopener noreferrer"
          className="text-rust hover:underline"
        >
          Open Design (fork Growth4U)
        </a>
        . Apache-2.0. Las mejoras llegan al hacer redeploy del container con el tag más reciente de{" "}
        <code className="bg-muted px-1.5 py-0.5 rounded">ghcr.io/growth4u-systems/od</code>.
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

function RecheckButton({ onRecheck, rechecking }: { onRecheck: () => void; rechecking: boolean }) {
  return (
    <button
      type="button"
      onClick={onRecheck}
      disabled={rechecking}
      className="mt-5 inline-flex items-center gap-2 rounded-lg border-2 border-border bg-white px-4 py-2 text-sm font-semibold text-foreground hover:border-rust disabled:opacity-50"
    >
      <span className={cn(rechecking && "animate-spin")}>🔄</span>
      {rechecking ? "Verificando…" : "Volver a verificar"}
    </button>
  );
}

/** State 1 — OD overlay not enabled. */
function OdNotActivated({ onRecheck, rechecking }: { onRecheck: () => void; rechecking: boolean }) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border-2 border-border bg-card p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-border bg-sage/20 text-2xl">
        🎨
      </div>
      <h2 className="font-heading text-xl text-navy">Open Design no está activado</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Open Design es el editor agentic de diseño (skills, design systems, prompt templates). Es un
        servicio opcional: cuando lo activás, esta biblioteca sirve el catálogo y podés abrir el
        editor desde acá.
      </p>
      <div className="mx-auto mt-5 max-w-md rounded-lg border-2 border-border bg-background p-4 text-left text-sm">
        <p className="font-semibold text-navy">Para activarlo:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            Reinstalá con Open Design (<code className="rounded bg-muted px-1">./sancho install --od</code>)
            o levantá el overlay{" "}
            <code className="rounded bg-muted px-1">docker-compose.od.yml</code>.
          </li>
          <li>
            Verificá que <code className="rounded bg-muted px-1">OD_DAEMON_URL</code> y{" "}
            <code className="rounded bg-muted px-1">OD_WEB_URL</code> (y{" "}
            <code className="rounded bg-muted px-1">OD_API_TOKEN</code> en modo hosted) estén en tu{" "}
            <code className="rounded bg-muted px-1">.env</code>.
          </li>
        </ol>
      </div>
      <RecheckButton onRecheck={onRecheck} rechecking={rechecking} />
    </div>
  );
}

/** State 2 — OD wired up but the daemon is unreachable. */
function OdDaemonDown({
  daemonUrl,
  onRecheck,
  rechecking,
}: {
  daemonUrl: string;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border-2 border-rust/40 bg-rust/5 p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-rust/50 bg-rust/10 text-2xl">
        ⚠️
      </div>
      <h2 className="font-heading text-xl text-navy">El daemon de Open Design está caído</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Open Design está configurado, pero su daemon no responde en{" "}
        <code className="rounded bg-muted px-1">{daemonUrl}</code>. La biblioteca y el editor
        agentic no están disponibles hasta que vuelva a estar arriba.
      </p>
      <div className="mx-auto mt-5 max-w-md rounded-lg border-2 border-border bg-background p-4 text-left text-sm">
        <p className="font-semibold text-navy">Para recuperarlo:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            Revisá el container:{" "}
            <code className="rounded bg-muted px-1">docker compose ps open-design</code>.
          </li>
          <li>
            Reinicialo:{" "}
            <code className="rounded bg-muted px-1">
              docker compose -f docker-compose.yml -f docker-compose.od.yml up -d open-design
            </code>
            .
          </li>
        </ol>
      </div>
      <RecheckButton onRecheck={onRecheck} rechecking={rechecking} />
    </div>
  );
}
