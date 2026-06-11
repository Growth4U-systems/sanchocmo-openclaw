"use client";

/**
 * SetupTab (SAN-141) — full-page configuration checklist for Content Creation.
 *
 * Replaces the old Engine → Configuración sub-tab with a three-level layout:
 *   1. 🏛 Marca madre — shared docs (strategy-decisions, pillars, POV bank)
 *      rendered Foundation-style: chat / open / task per doc.
 *   2. 🌐 Global — approval dispatch + connections grouped by CAPABILITY
 *      (social publishing+metrics, blog CMS, SEO metrics) — providers are
 *      interchangeable slots, not hardcoded tools.
 *   3. One block per channel — strategy doc, antenna definitions, cadence.
 *
 * Every editor opens the SAME ConfigSheet sections (InputsTab embedded) the
 * Configuración pipeline used — no editor was rewritten, only relocated.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useContentCreation, type ContentDocument } from "@/hooks/useContentCreation";
import { useChannelLoops } from "@/hooks/useChannelLoops";
import { CHANNEL_EMOJI } from "@/components/content/ChannelLoopCard";
import { InputsTab } from "@/components/content/InputsTab";
import { ConfigSheet } from "@/components/content/config/ConfigSheet";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { PublishingSetupPanel } from "@/components/content/PublishingSetupPanel";
import { buildDocThread, buildTaskThread, type ThreadConfig } from "@/lib/chat-openers";
import type { ProviderInfo } from "@/lib/publishing/types";
import { cn } from "@/lib/utils";

type EditorSection = "dispatch-channel" | "news" | "profiles" | "keywords" | "paa" | "cadence";

const SECTION_LABELS: Record<EditorSection, string> = {
  "dispatch-channel": "Canal de envío",
  news: "News Prompts",
  profiles: "Perfiles a monitorizar",
  keywords: "Keywords SEO",
  paa: "People Also Ask",
  cadence: "Cadencia editorial",
};

const SECTION_ICONS: Record<EditorSection, string> = {
  "dispatch-channel": "#",
  news: "📰",
  profiles: "🕵️",
  keywords: "🔑",
  paa: "❓",
  cadence: "⏰",
};

/** Antenna definition editors per channel — blog listens to search demand,
 *  social channels listen to news + competitor moves. */
function antennaSectionsFor(channel: string): EditorSection[] {
  return channel === "blog" ? ["keywords", "paa"] : ["news", "profiles"];
}

const MOTHER_DOC_SKILLS: Array<{ skill: string; fallbackName: string; sub: string }> = [
  { skill: "content-strategy", fallbackName: "Content Strategy", sub: "Decisiones globales · informa Pillars y POV" },
  { skill: "content-pillars", fallbackName: "Content Pillars", sub: "3-5 temas · derivado de la estrategia" },
  { skill: "pov-bank-builder", fallbackName: "POV Bank", sub: "Opiniones de marca · alimenta a todos los writers" },
];

function isDone(status: string): boolean {
  return ["completed", "done", "approved"].includes((status || "").toLowerCase());
}

interface Props {
  slug: string;
  openChat: (slug: string, config: ThreadConfig) => void;
  /** Channel block to scroll into view on mount (from a card's ⚙️ Canal). */
  focusChannel?: string | null;
}

export function SetupTab({ slug, openChat, focusChannel }: Props) {
  const { data: creation } = useContentCreation(slug, null);
  const { data: loops } = useChannelLoops(slug);
  const [editorSection, setEditorSection] = useState<EditorSection | null>(null);
  const [docPath, setDocPath] = useState<string | null>(null);

  const dispatchQ = useQuery<{ ok: boolean; config: { transport?: string; channel_name?: string } | null }>({
    queryKey: ["dispatch-channel", slug],
    queryFn: async () => (await fetch(`/api/content-engine/dispatch-channel?slug=${slug}`)).json(),
    enabled: !!slug,
    staleTime: 30_000,
  });

  const providersQ = useQuery<{ providers: ProviderInfo[] }>({
    queryKey: ["publishing", "providers-all", slug],
    queryFn: async () => (await fetch(`/api/publishing/providers?slug=${slug}`)).json(),
    enabled: !!slug,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!focusChannel || !loops) return;
    const el = document.getElementById(`setup-${focusChannel}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusChannel, loops]);

  const documents = creation?.documents || [];
  const projectId = creation?.projectId || "";
  const motherDocs = MOTHER_DOC_SKILLS.map((m) => ({
    ...m,
    doc: documents.find((d) => (d.skill || "").toLowerCase() === m.skill || (d.skill || "").toLowerCase().startsWith(m.skill)),
  }));

  const channels = loops?.channels || [];
  const dispatchConfigured = !!dispatchQ.data?.config?.channel_name;
  const socialConnected = (providersQ.data?.providers || []).some((p) => p.configured);

  // Checklist progress: mother docs + dispatch + capability slots + one step
  // per channel (its strategy doc). GSC and blog CMS are honest "pending"
  // slots until their integrations land (SAN-141 F4).
  const checks: boolean[] = [
    ...motherDocs.map((m) => !!m.doc && isDone(m.doc.status)),
    dispatchConfigured,
    socialConnected,
    false, // blog CMS publisher (Alarife / WordPress / …) — F4
    false, // GSC — F4
    ...channels.filter((c) => c.active).map((c) => c.strategyDocExists),
  ];
  const done = checks.filter(Boolean).length;
  const pct = checks.length ? Math.round((done / checks.length) * 100) : 0;

  const openDocChat = (doc: ContentDocument) => {
    openChat(slug, buildTaskThread(slug, doc.id, doc.name, projectId, {
      taskSkill: doc.skill ?? undefined,
      taskStatus: doc.status,
      taskType: doc.type ?? undefined,
      ...(doc.pillar ? { pillar: doc.pillar } : {}),
    }));
  };

  const createChannelStrategy = (channel: string, label: string, strategyDoc: string | null) => {
    // The strategy doc is created in chat (content-strategy scoped to the
    // channel) — same pattern as every other doc-producing task.
    const cfg = buildDocThread(slug, {
      key: `channel-strategy-${channel}`,
      name: `Estrategia del canal ${label}`,
      skill: "content-strategy",
      channel,
      docPath: strategyDoc,
      status: "pending",
    }, projectId);
    cfg.initialMessage = [
      `Crea la estrategia del canal ${label} (${channel}) en ${strategyDoc || `content/strategy/${channel}-strategy.md`}.`,
      "Deriva de la marca madre (strategy-decisions.md + content-pillars.md + POV bank):",
      "hereda pilares, voz e ICP; especializa formato, mix searchable/shareable, cadencia, KPI norte y tono del canal.",
    ].join(" ");
    openChat(slug, cfg);
  };

  return (
    <div className="space-y-5">
      {/* Progress header */}
      <section className="border-[3px] border-ink rounded-lg bg-card p-4 flex items-center gap-4" style={{ boxShadow: "var(--pop-md)" }}>
        <div className="flex-1">
          <h2 className="font-heading text-lg text-ink mb-1.5">🔧 Setup de Content Creation — {done}/{checks.length} pasos</h2>
          <div className="h-3.5 border-2 border-ink rounded-full overflow-hidden bg-muted">
            <div
              className={cn("h-full transition-all", pct === 100 ? "bg-sage" : "bg-rust")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span className={cn("font-heading text-3xl", pct === 100 ? "text-sage" : "text-rust")}>{pct}%</span>
      </section>

      {/* 1 · Marca madre */}
      <section className="border-[3px] border-ink rounded-lg bg-card p-4" style={{ boxShadow: "var(--pop-sm)" }}>
        <h3 className="font-bold text-sm mb-3">🏛 Marca madre — documentos compartidos por todos los canales</h3>
        {motherDocs.map((m, i) => {
          const doc = m.doc;
          const docDone = !!doc && isDone(doc.status);
          const filePath = doc?.docPath || doc?.deliverable || null;
          return (
            <div key={m.skill} className="flex items-center gap-3 py-2.5 border-b border-dashed border-ink/15 last:border-0 flex-wrap">
              <span className={cn(
                "w-9 h-9 grid place-items-center font-bold text-sm border-2 border-ink rounded-lg flex-shrink-0",
                docDone ? "bg-yellow-400/80" : "bg-muted"
              )}>{i + 1}</span>
              <div className="flex-1 min-w-[200px]">
                <p className="font-bold text-sm flex items-center gap-1.5">
                  {doc?.name || m.fallbackName}
                  {docDone && <span className="w-4 h-4 grid place-items-center rounded-full bg-sage text-white text-[9px] border border-ink">✓</span>}
                </p>
                {filePath && (
                  <code className="text-[11px] border border-dashed border-ink rounded px-1.5 bg-muted/50">
                    {filePath.split("/").pop()}
                  </code>
                )}
                <p className="text-[11px] text-muted-foreground">{m.sub}</p>
              </div>
              <div className="flex gap-1.5 items-center">
                {doc && (
                  <>
                    <button
                      type="button"
                      onClick={() => openDocChat(doc)}
                      className="w-8 h-8 grid place-items-center border-2 border-ink rounded-lg bg-card hover:-translate-y-0.5 transition-all"
                      title="Chat sobre este documento"
                    >💬</button>
                    {projectId && (
                      <Link
                        href={`/dashboard/${slug}/tasks/${projectId}`}
                        className="w-8 h-8 grid place-items-center border-2 border-ink rounded-lg bg-card hover:-translate-y-0.5 transition-all no-underline"
                        title="Ver tarea"
                      >📋</Link>
                    )}
                  </>
                )}
                {docDone && filePath ? (
                  <button
                    type="button"
                    onClick={() => setDocPath(filePath.startsWith("brand/") ? filePath : `brand/${slug}/${filePath}`)}
                    className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide border-2 border-ink rounded-lg bg-rust text-white hover:-translate-y-0.5 hover:shadow-comic transition-all"
                  >Abrir →</button>
                ) : doc ? (
                  <button
                    type="button"
                    onClick={() => openDocChat(doc)}
                    className="px-3 py-1.5 text-xs font-bold border-2 border-ink rounded-lg bg-sage text-white hover:-translate-y-0.5 hover:shadow-comic transition-all"
                  >+ Crear con Sancho</button>
                ) : (
                  <span className="text-xs text-muted-foreground italic">crea el proyecto Content Engine primero</span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* 2 · Global — dispatch + conexiones por capacidad */}
      <section className="border-[3px] border-ink rounded-lg bg-card p-4" style={{ boxShadow: "var(--pop-sm)" }}>
        <h3 className="font-bold text-sm mb-3">🌐 Global — dispatch y conexiones por capacidad</h3>

        <div className="flex items-center gap-3 py-2.5 border-b border-dashed border-ink/15 flex-wrap">
          <span className={cn("w-7 h-7 grid place-items-center rounded-full border-2 border-ink text-xs font-bold", dispatchConfigured ? "bg-sage text-white" : "bg-muted")}>
            {dispatchConfigured ? "✓" : "○"}
          </span>
          <span className="font-bold text-sm flex-1 min-w-[160px]">📬 Dispatch de aprobaciones</span>
          <span className="text-xs text-muted-foreground">
            {dispatchQ.data?.config
              ? `${dispatchQ.data.config.transport || ""} · ${dispatchQ.data.config.channel_name || ""}`
              : "sin configurar"}
          </span>
          <button
            type="button"
            onClick={() => setEditorSection("dispatch-channel")}
            className="px-2.5 py-1 text-xs font-semibold border-2 border-ink rounded-lg bg-card hover:-translate-y-0.5 transition-all"
          >✏️ Editar</button>
        </div>

        <div className="py-2.5 border-b border-dashed border-ink/15">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <span className={cn("w-7 h-7 grid place-items-center rounded-full border-2 border-ink text-xs font-bold", socialConnected ? "bg-sage text-white" : "bg-muted")}>
              {socialConnected ? "✓" : "○"}
            </span>
            <span className="font-bold text-sm flex-1">📣 Publicación social + métricas</span>
            <span className="text-xs text-muted-foreground">slot por capacidad — el proveedor es intercambiable</span>
          </div>
          <div className="pl-10">
            <PublishingSetupPanel slug={slug} />
          </div>
        </div>

        <div className="flex items-center gap-3 py-2.5 border-b border-dashed border-ink/15 flex-wrap">
          <span className="w-7 h-7 grid place-items-center rounded-full border-2 border-ink text-xs font-bold bg-muted">○</span>
          <span className="font-bold text-sm flex-1 min-w-[160px]">📰 Publicación blog (CMS/API)</span>
          <span className="text-xs text-muted-foreground">
            sin conectar — los artículos se publican a mano · Alarife / WordPress / Webflow vía API (próximamente)
          </span>
        </div>

        <div className="flex items-center gap-3 py-2.5 flex-wrap">
          <span className="w-7 h-7 grid place-items-center rounded-full border-2 border-ink text-xs font-bold bg-muted">○</span>
          <span className="font-bold text-sm flex-1 min-w-[160px]">🔍 Métricas SEO (Search Console)</span>
          <span className="text-xs text-muted-foreground">
            sin conectar — las métricas del canal blog se muestran como &ldquo;pendiente&rdquo;, nunca inventadas
          </span>
        </div>
      </section>

      {/* 3 · Por canal */}
      {channels.map((ch) => {
        const emoji = CHANNEL_EMOJI[ch.channel] || "📄";
        const antSections = antennaSectionsFor(ch.channel);
        return (
          <section key={ch.channel} id={`setup-${ch.channel}`} className="border-[3px] border-ink rounded-lg bg-card p-4 scroll-mt-4" style={{ boxShadow: "var(--pop-sm)" }}>
            <h3 className="font-bold text-sm mb-3">
              {emoji} {ch.label}
              {!ch.active && <span className="ml-2 text-[11px] font-bold uppercase border-2 border-destructive text-destructive rounded px-1.5">no activado</span>}
            </h3>

            {/* Estrategia del canal */}
            <div className="flex items-center gap-3 py-2.5 border-b border-dashed border-ink/15 flex-wrap">
              <span className={cn("w-7 h-7 grid place-items-center rounded-full border-2 border-ink text-xs font-bold", ch.strategyDocExists ? "bg-sage text-white" : "bg-muted")}>
                {ch.strategyDocExists ? "✓" : "○"}
              </span>
              <div className="flex-1 min-w-[200px]">
                <span className="font-bold text-sm">📜 Estrategia del canal</span>
                <p className="text-[11px] text-muted-foreground">
                  derivada de la marca madre · <code>{(ch.strategyDoc || "").split("/").pop()}</code>
                </p>
              </div>
              {ch.strategyDocExists ? (
                <button
                  type="button"
                  onClick={() => ch.strategyDoc && setDocPath(`brand/${slug}/${ch.strategyDoc}`)}
                  className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide border-2 border-ink rounded-lg bg-rust text-white hover:-translate-y-0.5 hover:shadow-comic transition-all"
                >Abrir →</button>
              ) : (
                <button
                  type="button"
                  onClick={() => createChannelStrategy(ch.channel, ch.label, ch.strategyDoc)}
                  className="px-3 py-1.5 text-xs font-bold border-2 border-ink rounded-lg bg-sage text-white hover:-translate-y-0.5 hover:shadow-comic transition-all"
                >+ Crear con Sancho</button>
              )}
            </div>

            {/* Antenas del canal */}
            <div className="flex items-center gap-3 py-2.5 border-b border-dashed border-ink/15 flex-wrap">
              <span className="w-7 h-7 grid place-items-center rounded-full border-2 border-ink text-xs font-bold bg-sage text-white">✓</span>
              <div className="flex-1 min-w-[200px]">
                <span className="font-bold text-sm">📡 Definición de antenas</span>
                <p className="text-[11px] text-muted-foreground">
                  {ch.antennas.map((a) => a.baseName).join(" · ") || "sin antenas"}
                </p>
              </div>
              {antSections.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setEditorSection(s)}
                  className="px-2.5 py-1 text-xs font-semibold border-2 border-ink rounded-lg bg-card hover:-translate-y-0.5 transition-all"
                >{SECTION_ICONS[s]} {SECTION_LABELS[s]}</button>
              ))}
            </div>

            {/* Cadencia + KPI */}
            <div className="flex items-center gap-3 py-2.5 flex-wrap">
              <span className={cn("w-7 h-7 grid place-items-center rounded-full border-2 border-ink text-xs font-bold", ch.cadence.frequency ? "bg-sage text-white" : "bg-muted")}>
                {ch.cadence.frequency ? "✓" : "○"}
              </span>
              <div className="flex-1 min-w-[200px]">
                <span className="font-bold text-sm">🗓 Cadencia, modo y KPI norte</span>
                <p className="text-[11px] text-muted-foreground">
                  {[
                    ch.cadence.frequency || "sin cadencia",
                    ch.mode === "always-on" ? "always-on" : "programado",
                    ch.primaryKpi ? `KPI: ${ch.primaryKpi}` : "KPI sin definir",
                  ].join(" · ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditorSection("cadence")}
                className="px-2.5 py-1 text-xs font-semibold border-2 border-ink rounded-lg bg-card hover:-translate-y-0.5 transition-all"
              >✏️ Editar</button>
            </div>
          </section>
        );
      })}

      {/* Shared ConfigSheet — the SAME editors the Engine config pipeline used */}
      <ConfigSheet
        open={editorSection !== null}
        onOpenChange={(open) => !open && setEditorSection(null)}
        icon={editorSection ? SECTION_ICONS[editorSection] : undefined}
        title={editorSection ? SECTION_LABELS[editorSection] : ""}
        width="min(96vw, 1100px)"
      >
        {editorSection && (
          <InputsTab slug={slug} openChat={openChat} embedded={{ section: editorSection }} />
        )}
      </ConfigSheet>

      <DocSlideOver slug={slug} docPath={docPath} onClose={() => setDocPath(null)} />
    </div>
  );
}
