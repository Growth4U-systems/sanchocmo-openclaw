/**
 * Brand Brain File Tree.
 * - Search bar filters all documents inline.
 * - Single unified list: pillars first (with status badges + deep-dives + versions),
 *   followed by auxiliary doc folders (presentations, playbooks, campaigns, …).
 *   No outer "Foundation" / "Other Documents" accordions — every doc lives at the
 *   same conceptual level under Brand Brain.
 */

"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { statusLabel as statusText } from "@/lib/task-status";
import type { BrandBrainState, Section, Pillar } from "@/types";
import type { OtherDocGroup } from "@/hooks/useBrandBrain";

const FF_PILLAR_MAP: Record<string, string> = {
  // SAN-3 W4: the Kickoff writes a single `company-brief` pillar (the living
  // Company Brief). `fast-context` is the pre-W4 name for the same pillar, kept
  // so legacy clients still resolve to the Company Brief section.
  "fast-context": "company-brief",
  "company-brief": "company-brief",
};

const SECTION_DEFS = [
  { key: "company-brief", icon: "📋", label: "Company Brief" },
  { key: "site-audit", icon: "🔍", label: "Site Audit" },
  { key: "market-and-us", icon: "📊", label: "Market & Us" },
  { key: "go-to-market", icon: "🎯", label: "Go-To-Market" },
  { key: "brand-book", icon: "🎨", label: "Brand Book" },
  { key: "metrics-setup", icon: "📏", label: "Metrics Setup" },
  { key: "strategic-plan", icon: "📋", label: "Strategic Plan" },
] as const;

// SAN-192: el LABEL del badge sale de la fuente única (statusLabel, task-status.ts);
// aquí solo vive el mapeo status → clase visual (color del badge).
const STATUS_INFO: Record<string, { cls: string }> = {
  // Vocabulario canónico de task (SAN-183 F5)
  completed: { cls: "done" },
  todo: { cls: "todo" },
  blocked: { cls: "review" },
  cancelled: { cls: "todo" },
  "pending-review": { cls: "review" },
  "in-progress": { cls: "wip" },
  // Claves legacy (datos viejos en disco; el ensamblador ya emite canónico)
  approved: { cls: "done" },
  done: { cls: "done" },
  "pending-approval": { cls: "review" },
  generated: { cls: "review" },
  draft: { cls: "wip" },
  "request-refresh": { cls: "wip" },
  "not-started": { cls: "todo" },
};

const STATUS_BADGE: Record<string, string> = {
  done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800",
  review: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800",
  wip: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800",
  todo: "bg-muted/50 text-muted-foreground border border-border",
};

const FOLDER_ICONS: Record<string, string> = {
  presentations: "🎬",
  "outreach-playbook": "📨",
  "content-playbook": "✍️",
  pages: "🌐",
  "seo-audit": "🔍",
  campaigns: "📣",
  "brand-identity": "🎨",
  _root: "📄",
};

function relKey(p: string): string {
  return p.replace(/^brand\/[^/]+\//, "");
}

function CommentBadge({ n }: { n: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-yellow-200/50 dark:bg-yellow-300/20 px-1.5 py-0.5 text-[9px] font-bold text-yellow-900 dark:text-yellow-200"
      title={`${n} comentario(s) del cliente`}
    >
      💬 {n}
    </span>
  );
}

function ffDonePillars(sections: Record<string, Section>): Set<string> {
  const done = new Set<string>();
  const ff = sections["company-brief"];
  if (!ff) return done;
  for (const [ffName, pInfo] of Object.entries(ff.pillars || {})) {
    if (pInfo.status === "completed") {
      done.add(FF_PILLAR_MAP[ffName] || ffName);
    }
  }
  return done;
}

function normalizeStatus(raw: string, ffDone: Set<string>, pillarName: string): string {
  if (raw === "todo" && ffDone.has(pillarName)) return "completed";
  if (raw === "done" || raw === "approved") return "completed";
  if (raw === "draft") return "in-progress";
  if (raw === "pending-approval" || raw === "generated") return "pending-review";
  return raw;
}

function displayName(key: string): string {
  return key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function DownloadBtn({ docPath }: { docPath: string }) {
  return (
    <a
      href={`/api/docs/${docPath}?download=1`}
      download
      onClick={(e) => e.stopPropagation()}
      className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40 no-underline"
      title="Descargar"
    >
      {"⬇️"}
    </a>
  );
}

interface DocEntry { name: string; fullPath: string; kind?: "md" | "html"; hasHtml?: boolean }
interface SubfolderEntry { name: string; mainDoc: string; files: DocEntry[]; versions: DocEntry[] }
interface PillarExtra { subfolders: SubfolderEntry[]; versions: DocEntry[]; otherFiles: DocEntry[] }

/** Doc-type chip (SAN-149): tells md sources, HTML deliverables and md/html
 *  canonical pairs apart at a glance. */
function KindBadge({ kind, hasHtml }: { kind?: "md" | "html"; hasHtml?: boolean }) {
  if (!kind) return null;
  const label = hasHtml ? "MD + HTML" : kind.toUpperCase();
  const cls =
    kind === "html" || hasHtml
      ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800"
      : "bg-muted/40 text-muted-foreground border-border";
  return (
    <span className={`text-[8px] font-bold uppercase tracking-wide border rounded px-1 py-px flex-shrink-0 ${cls}`}
      title={hasHtml ? "Fuente markdown con documento HTML canónico generado" : kind === "html" ? "Documento HTML" : "Documento markdown"}>
      {label}
    </span>
  );
}

function VersionChips({ versions, onSelectOtherDoc }: { versions: DocEntry[]; onSelectOtherDoc: (p: string, n: string, parentPillar?: string) => void }) {
  return (
    <div className="ml-8 rounded-lg border border-border/50 overflow-hidden bg-muted/10">
      <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/30">
        Versiones
      </div>
      {versions.map((v) => (
        <div key={v.fullPath} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted/20 transition-colors">
          <span className="text-[11px] text-muted-foreground">{"🕓"}</span>
          <span className="flex-1 text-xs font-medium text-foreground/60">{v.name}</span>
          <div className="flex items-center gap-1">
            <DownloadBtn docPath={v.fullPath} />
            <button type="button" onClick={() => onSelectOtherDoc(v.fullPath, v.name)}
              className="text-xs hover:scale-110 transition-transform p-0.5 rounded hover:bg-muted/40" title="Ver">
              {"📄"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeepDiveRow({ sf, onSelectOtherDoc, parentPillar }: { sf: SubfolderEntry; onSelectOtherDoc: (p: string, n: string, parentPillar?: string) => void; parentPillar?: string }) {
  const [open, setOpen] = useState(false);
  const hasChildren = sf.versions.length > 0 || sf.files.length > 0;

  return (
    <div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted/20 transition-colors">
        {hasChildren ? (
          <button type="button" onClick={() => setOpen(!open)} className="bg-transparent border-none p-0 cursor-pointer flex-shrink-0">
            <span className={cn("text-[8px] text-muted-foreground transition-transform inline-block", open && "rotate-90")}>
              {"▶"}
            </span>
          </button>
        ) : (
          <span className="w-2 flex-shrink-0" />
        )}
        <span className="text-[11px]">{"📁"}</span>
        <span className="flex-1 text-xs font-medium text-foreground/70 flex items-center gap-1.5">
          {sf.name}
          {sf.versions.length > 0 && (
            <span className="text-[9px] text-muted-foreground">v{sf.versions.length}</span>
          )}
          {sf.files.length > 0 && (
            <span className="text-[9px] text-muted-foreground">{sf.files.length} docs</span>
          )}
        </span>
        <div className="flex items-center gap-0.5">
          <DownloadBtn docPath={sf.mainDoc} />
          <button type="button" onClick={() => onSelectOtherDoc(sf.mainDoc, sf.name, parentPillar)}
            className="text-xs hover:scale-110 transition-transform p-0.5 rounded hover:bg-muted/40" title="Ver">
            {"📄"}
          </button>
        </div>
      </div>

      {open && hasChildren && (
        <div className="pl-6 pb-1">
          {sf.files.map((f) => (
            <div key={f.fullPath} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/20 transition-colors">
              <span className="text-[10px] text-muted-foreground">{"📄"}</span>
              <span className="flex-1 text-[11px] font-medium text-foreground/60 flex items-center gap-1.5">{f.name}<KindBadge kind={f.kind} hasHtml={f.hasHtml} /></span>
              <div className="flex items-center gap-1">
                <DownloadBtn docPath={f.fullPath} />
                <button type="button" onClick={() => onSelectOtherDoc(f.fullPath, f.name, parentPillar)}
                  className="text-[10px] hover:scale-110 transition-transform p-0.5 rounded hover:bg-muted/40" title="Ver">
                  {"📄"}
                </button>
              </div>
            </div>
          ))}
          {sf.versions.map((v) => (
            <div key={v.fullPath} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/20 transition-colors">
              <span className="text-[10px] text-muted-foreground">{"🕓"}</span>
              <span className="flex-1 text-[11px] font-medium text-foreground/50">{v.name}</span>
              <div className="flex items-center gap-1">
                <DownloadBtn docPath={v.fullPath} />
                <button type="button" onClick={() => onSelectOtherDoc(v.fullPath, v.name, parentPillar)}
                  className="text-[10px] hover:scale-110 transition-transform p-0.5 rounded hover:bg-muted/40" title="Ver">
                  {"📄"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PillarRow({ slug, sectionKey, pillarKey, hasDoc, docUrl, name, isOptional, statusCls, statusLabel, onSelectDoc, onSelectOtherDoc, onOpenChat, onOpenTask, pillar, commentCount }: {
  slug: string; sectionKey: string; pillarKey: string; hasDoc: boolean; docUrl: string;
  name: string; isOptional: boolean; statusCls: string; statusLabel: string;
  onSelectDoc: (sectionKey: string, pillarKey: string, pillar: Pillar) => void;
  onSelectOtherDoc: (docPath: string, docName: string, parentPillar?: string) => void;
  onOpenChat: (pillarKey: string, docPath?: string) => void;
  onOpenTask?: (docPath: string) => void;
  pillar: Pillar;
  commentCount: (fp: string) => number;
}) {
  const t = useTranslations("brandBrain");
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState<PillarExtra | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    if (!open && extra === null && hasDoc) {
      setLoading(true);
      fetch(`/api/brand-brain/pillar-docs?slug=${slug}&section=${sectionKey}&pillar=${pillarKey}`)
        .then((r) => r.json())
        .then((data: PillarExtra & { ok: boolean }) => setExtra({
          subfolders: data.subfolders || [],
          versions: data.versions || [],
          otherFiles: data.otherFiles || [],
        }))
        .catch(() => setExtra({ subfolders: [], versions: [], otherFiles: [] }))
        .finally(() => setLoading(false));
    }
    setOpen(!open);
  };

  const hasExtra = extra ? (extra.subfolders.length > 0 || extra.versions.length > 0 || extra.otherFiles.length > 0) : null;
  const showToggle = hasDoc && (hasExtra === null || hasExtra);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors",
          isOptional && statusCls === "todo" && "opacity-45",
        )}
      >
        {showToggle ? (
          <button type="button" onClick={toggle} className="bg-transparent border-none p-0 cursor-pointer flex-shrink-0 ml-4">
            <span className={cn("text-[9px] text-muted-foreground transition-transform inline-block", open && "rotate-90")}>
              {"▶"}
            </span>
          </button>
        ) : (
          <span className="w-[9px] ml-4 flex-shrink-0" />
        )}

        <span className="flex-1 text-sm font-medium text-foreground/80 flex items-center gap-2">
          {name}
          {hasDoc && commentCount(docUrl) > 0 && <CommentBadge n={commentCount(docUrl)} />}
          {isOptional && (
            <span className="text-[10px] text-muted-foreground font-normal">({t("optional")})</span>
          )}
          {extra && extra.subfolders.length > 0 && (
            <span className="text-[10px] text-muted-foreground font-normal flex items-center gap-0.5">
              {extra.subfolders.length}{"📁"}
            </span>
          )}
          {extra && extra.versions.length > 0 && (
            <span className="text-[10px] text-muted-foreground font-normal">
              v{extra.versions.length}
            </span>
          )}
          {loading && <span className="text-[10px] text-muted-foreground animate-pulse">...</span>}
        </span>

        <span className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full hidden sm:inline-block", STATUS_BADGE[statusCls] || STATUS_BADGE.todo)}>
          {statusLabel}
        </span>

        <div className="flex items-center gap-1">
          {hasDoc && <DownloadBtn docPath={docUrl} />}
          {hasDoc && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onSelectDoc(sectionKey, pillarKey, pillar); }}
              className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40" title="Ver documento">
              {"📄"}
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpenChat(pillarKey, docUrl || undefined); }}
            className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40" title="Chat con Sancho">
            {"💬"}
          </button>
          {onOpenTask && docUrl && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onOpenTask(docUrl); }}
              className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40" title="Ir a tarea">
              📋
            </button>
          )}
        </div>
      </div>

      {open && extra && hasExtra && (
        <div className="pb-2 px-5">
          {extra.subfolders.length > 0 && (
            <div className="ml-8 mb-2 rounded-lg border border-border/50 overflow-hidden bg-muted/10">
              <div className="px-3 py-1 text-[9px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/30">
                Deep-dives
              </div>
              {extra.subfolders.map((sf) => (
                <DeepDiveRow key={sf.mainDoc} sf={sf} onSelectOtherDoc={onSelectOtherDoc} parentPillar={pillarKey} />
              ))}
            </div>
          )}

          {extra.otherFiles.length > 0 && (
            <div className="ml-8 mb-2 rounded-lg border border-border/50 overflow-hidden bg-muted/10">
              <div className="px-3 py-1 text-[9px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/30">
                Otros
              </div>
              {extra.otherFiles.map((f) => (
                <div key={f.fullPath} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted/20 transition-colors">
                  <span className="text-[11px] text-muted-foreground">{"📄"}</span>
                  <span className="flex-1 text-xs font-medium text-foreground/60 flex items-center gap-1.5">{f.name}<KindBadge kind={f.kind} hasHtml={f.hasHtml} />{commentCount(f.fullPath) > 0 && <CommentBadge n={commentCount(f.fullPath)} />}</span>
                  <div className="flex items-center gap-1">
                    <DownloadBtn docPath={f.fullPath} />
                    <button type="button" onClick={() => onSelectOtherDoc(f.fullPath, f.name, pillarKey)}
                      className="text-xs hover:scale-110 transition-transform p-0.5 rounded hover:bg-muted/40" title="Ver">
                      {"📄"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {extra.versions.length > 0 && (
            <VersionChips versions={extra.versions} onSelectOtherDoc={onSelectOtherDoc} />
          )}
        </div>
      )}
    </div>
  );
}

interface FileTreeProps {
  slug: string;
  foundation: BrandBrainState;
  otherDocs?: OtherDocGroup[];
  onSelectDoc: (sectionKey: string, pillarKey: string, pillar: Pillar) => void;
  onSelectOtherDoc: (docPath: string, docName: string, parentPillar?: string) => void;
  onOpenChat: (pillarKey: string, docPath?: string) => void;
  onOpenTask?: (docPath: string) => void;
  commentCounts?: Record<string, number>;
}

export function FileTree({ slug, foundation, otherDocs, onSelectDoc, onSelectOtherDoc, onOpenChat, onOpenTask, commentCounts }: FileTreeProps) {
  const t = useTranslations("brandBrain");
  const commentCount = (fp: string) => commentCounts?.[relKey(fp)] ?? 0;
  const sections = foundation.sections || {};
  const ffDone = ffDonePillars(sections);

  const [search, setSearch] = useState("");

  const q = search.toLowerCase().trim();

  const { filteredSections, filteredPresentations, filteredOtherDocs } = useMemo(() => {
    const filteredSections = SECTION_DEFS.map((sec) => {
      const sectionData = sections[sec.key];
      if (!sectionData) return { ...sec, sectionData: null, pillarKeys: [] as string[] };
      const pillarKeys = Object.keys(sectionData.pillars || {});
      const filtered = q
        ? pillarKeys.filter((k) => displayName(k).toLowerCase().includes(q) || sec.label.toLowerCase().includes(q))
        : pillarKeys;
      return { ...sec, sectionData, pillarKeys: filtered };
    }).filter((sec) => !q || sec.pillarKeys.length > 0 || sec.label.toLowerCase().includes(q));

    const presentations = foundation.presentations || [];
    const filteredPresentations = q
      ? presentations.filter((p) => p.name.toLowerCase().includes(q))
      : presentations;

    const filteredOtherDocs = (otherDocs || []).map((group) => {
      const docs = q
        ? group.docs.filter((d) => d.name.toLowerCase().includes(q) || group.label.toLowerCase().includes(q))
        : group.docs;
      return { ...group, docs };
    }).filter((g) => g.docs.length > 0);

    return { filteredSections, filteredPresentations, filteredOtherDocs };
  }, [q, sections, foundation.presentations, otherDocs]);

  const hasResults = filteredSections.length > 0 || filteredPresentations.length > 0 || filteredOtherDocs.length > 0;
  const noResults = q && !hasResults;

  return (
    <div className="space-y-4">
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
          {"🔍"}
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en Brand Brain..."
          className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-border bg-white dark:bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-rust/30 focus:border-rust transition-colors"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs bg-transparent border-none cursor-pointer"
          >
            {"✕"}
          </button>
        )}
      </div>

      {noResults && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No se encontraron documentos para &ldquo;{search}&rdquo;
        </p>
      )}

      {hasResults && (
        <div className="space-y-3">
          {filteredSections.map((sec) => {
            if (!sec.sectionData) {
              return (
                <div key={sec.key} className="rounded-xl border border-border bg-white dark:bg-card overflow-hidden opacity-50">
                  <div className="flex items-center gap-3 px-5 py-4">
                    <span className="text-xl">{sec.icon}</span>
                    <span className="text-base font-bold text-foreground">{sec.label}</span>
                    <span className={cn("ml-auto text-[11px] font-medium px-2.5 py-1 rounded-full", STATUS_BADGE.todo)}>
                      {t("notCreated")}
                    </span>
                  </div>
                </div>
              );
            }

            const pillars = sec.sectionData.pillars || {};
            const pillarKeys = sec.pillarKeys;
            const allPillarKeys = Object.keys(pillars);
            const requiredKeys = allPillarKeys.filter((k) => !pillars[k].optional);
            const sectionApproved = requiredKeys.filter((k) => {
              const st = pillars[k].status;
              const eff = st === "todo" && ffDone.has(k) ? "completed" : st;
              return eff === "completed";
            }).length;
            const allDone = sectionApproved === requiredKeys.length && requiredKeys.length > 0;
            const isSinglePillar = allPillarKeys.length === 1 && allPillarKeys[0] === sec.key;

            if (isSinglePillar && pillarKeys.length > 0) {
              const pName = pillarKeys[0];
              const p = pillars[pName];
              const raw = p.status || "todo";
              const norm = normalizeStatus(raw, ffDone, pName);
              const si = STATUS_INFO[norm] || STATUS_INFO["todo"];
              const docUrl = p.output_file || "";
              const hasDoc = !!docUrl;

              return (
                <div key={sec.key} className="rounded-xl border border-border bg-white dark:bg-card overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 hover:bg-muted/20 transition-colors">
                    <span className="text-xl">{sec.icon}</span>
                    <span className="flex-1 text-base font-bold text-foreground">{sec.label}</span>
                    <span className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full", STATUS_BADGE[si.cls] || STATUS_BADGE.todo)}>
                      {statusText(norm)}
                    </span>
                    <div className="flex items-center gap-1">
                      {hasDoc && <DownloadBtn docPath={docUrl} />}
                      {hasDoc && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onSelectDoc(sec.key, pName, p); }}
                          className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40" title="Ver documento">
                          {"📄"}
                        </button>
                      )}
                      <button type="button" onClick={(e) => { e.stopPropagation(); onOpenChat(pName, docUrl || undefined); }}
                        className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40" title="Chat con Sancho">
                        {"💬"}
                      </button>
                      {onOpenTask && docUrl && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onOpenTask(docUrl); }}
                          className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40" title="Ir a tarea">
                          📋
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            if (pillarKeys.length === 0) return null;

            return (
              <div key={sec.key} className="rounded-xl border border-border bg-white dark:bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60">
                  <span className="text-xl">{sec.icon}</span>
                  <span className="text-base font-bold text-foreground">{sec.label}</span>
                  <span className={cn("ml-auto text-[11px] font-medium px-2.5 py-1 rounded-full", allDone ? STATUS_BADGE.done : STATUS_BADGE.todo)}>
                    {sectionApproved}/{requiredKeys.length} {t("completedCount")}
                  </span>
                </div>
                <div className="divide-y divide-border/40">
                  {pillarKeys.map((pName) => {
                    const p = pillars[pName];
                    const isOptional = !!p.optional;
                    const raw = p.status || "todo";
                    const norm = normalizeStatus(raw, ffDone, pName);
                    const si = STATUS_INFO[norm] || STATUS_INFO["todo"];
                    const name = displayName(pName);
                    const docUrl = p.output_file || "";
                    const hasDoc = !!docUrl;

                    return (
                      <PillarRow
                        key={pName}
                        slug={slug}
                        sectionKey={sec.key}
                        pillarKey={pName}
                        hasDoc={hasDoc}
                        docUrl={docUrl}
                        name={name}
                        isOptional={isOptional}
                        statusCls={si.cls}
                        statusLabel={statusText(norm)}
                        onSelectDoc={onSelectDoc}
                        onSelectOtherDoc={onSelectOtherDoc}
                        onOpenChat={onOpenChat}
                        onOpenTask={onOpenTask}
                        pillar={p}
                        commentCount={commentCount}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filteredPresentations.length > 0 && (
            <div className="rounded-xl border border-border bg-white dark:bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60">
                <span className="text-xl">{"🎬"}</span>
                <span className="text-base font-bold text-foreground">{t("presentations")}</span>
                <span className={cn("ml-auto text-[11px] font-medium px-2.5 py-1 rounded-full", STATUS_BADGE.todo)}>
                  {filteredPresentations.length} {t("files")}
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {filteredPresentations.map((pres) => (
                  <div key={pres.file} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
                    <span className="flex-1 text-sm font-medium text-foreground/80 pl-8">{pres.name}</span>
                    <div className="flex items-center gap-1">
                      {pres.file && <DownloadBtn docPath={pres.file} />}
                      {pres.file && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onSelectOtherDoc(pres.file, pres.name); }}
                          className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40" title="Ver presentacion">
                          {"📄"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredOtherDocs.map((group) => {
            const icon = FOLDER_ICONS[group.folder] || "📁";

            if (group.docs.length === 1) {
              const doc = group.docs[0];
              const title = group.folder === "_root" ? doc.name : group.label;
              return (
                <div key={group.folder} className="rounded-xl border border-border bg-white dark:bg-card overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 hover:bg-muted/20 transition-colors">
                    <span className="text-xl">{icon}</span>
                    <span className="flex-1 text-base font-bold text-foreground flex items-center gap-2">{title}{commentCount(doc.fullPath) > 0 && <CommentBadge n={commentCount(doc.fullPath)} />}</span>
                    <div className="flex items-center gap-1">
                      <DownloadBtn docPath={doc.fullPath} />
                      <button type="button" onClick={() => onSelectOtherDoc(doc.fullPath, doc.name)}
                        className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40" title="Ver documento">
                        {"📄"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={group.folder} className="rounded-xl border border-border bg-white dark:bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60">
                  <span className="text-xl">{icon}</span>
                  <span className="text-base font-bold text-foreground">{group.label}</span>
                  <span className={cn("ml-auto text-[11px] font-medium px-2.5 py-1 rounded-full", STATUS_BADGE.todo)}>
                    {group.docs.length} {t("files")}
                  </span>
                </div>
                <div className="divide-y divide-border/40">
                  {group.docs.map((doc) => (
                    <div key={doc.fullPath} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
                      <span className="flex-1 text-sm font-medium text-foreground/80 pl-8 flex items-center gap-2">{doc.name}<KindBadge kind={doc.fullPath.endsWith(".html") ? "html" : "md"} hasHtml={doc.hasHtml} />{commentCount(doc.fullPath) > 0 && <CommentBadge n={commentCount(doc.fullPath)} />}</span>
                      <div className="flex items-center gap-1">
                        <DownloadBtn docPath={doc.fullPath} />
                        <button type="button" onClick={() => onSelectOtherDoc(doc.fullPath, doc.name)}
                          className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40" title="Ver documento">
                          {"📄"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
