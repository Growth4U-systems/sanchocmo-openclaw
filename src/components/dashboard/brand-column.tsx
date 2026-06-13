"use client";

import { useState } from "react";
import Link from "next/link";
import { useBrandBrain } from "@/hooks/useBrandBrain";
import { useProjects } from "@/hooks/useProjects";
import { useOpenChat } from "@/hooks/useChat";
import { buildPillarThread, findTaskThreadForDoc } from "@/lib/chat-openers";
import { ProgressBar } from "@/components/shared/progress-bar";
import { BrandSnapshot } from "@/components/shared/brand-snapshot";
import { cn } from "@/lib/utils";
import { statusLabel as statusText } from "@/lib/task-status";
import type { BrandBrainState, Section } from "@/types";

// ============================================================
// Brand Column — Faithful port of renderV2Foundation()
// ============================================================

// FF_PILLAR_MAP: Kickoff pillar names -> real pillar names. SAN-3 W4: the Kickoff
// writes a single `company-brief` pillar; `fast-context` is its pre-W4 alias.
const FF_PILLAR_MAP: Record<string, string> = {
  "fast-context": "company-brief",
  "company-brief": "company-brief",
};

// Sections excluded from foundation stats (meta-sections)
const EXCLUDED_SECTIONS = ["foundation-presentation"];

// Section display metadata
const SECTION_META = [
  { key: "company-brief", icon: "\uD83D\uDCCB", label: "Company Brief" },
  { key: "market-and-us", icon: "\uD83D\uDCCA", label: "Market & Us" },
  { key: "go-to-market", icon: "\uD83C\uDFAF", label: "Go-To-Market" },
  { key: "brand-book", icon: "\uD83D\uDCD6", label: "Brand Book" },
  { key: "metrics-setup", icon: "\uD83D\uDCCF", label: "Metricas" },
  { key: "strategic-plan", icon: "\uD83D\uDDFA\uFE0F", label: "Strategic Plan" },
] as const;

// Status display info \u2014 SAN-192: el texto (tooltip) sale de la fuente \u00FAnica
// (statusLabel, task-status.ts); aqu\u00ED solo el icono + la clase visual.
const STATUS_INFO: Record<string, { icon: string; cls: string }> = {
  // Vocabulario can\u00F3nico de task
  completed: { icon: "\u2705", cls: "done" },
  "pending-review": { icon: "\uD83D\uDFE1", cls: "review" },
  "in-progress": { icon: "\uD83D\uDD04", cls: "wip" },
  todo: { icon: "\u2B1C", cls: "todo" },
  blocked: { icon: "\u26D4", cls: "review" },
  cancelled: { icon: "\u2716\uFE0F", cls: "todo" },
  // Claves legacy (datos viejos en disco)
  approved: { icon: "\u2705", cls: "done" },
  done: { icon: "\u2705", cls: "done" },
  "pending-approval": { icon: "\uD83D\uDFE1", cls: "review" },
  generated: { icon: "\uD83D\uDFE1", cls: "review" },
  draft: { icon: "\uD83D\uDD04", cls: "wip" },
  "request-refresh": { icon: "\uD83D\uDD04", cls: "wip" },
  "not-started": { icon: "\u2B1C", cls: "todo" },
};

const STATUS_BORDER: Record<string, string> = {
  done: "border-l-[3px] border-l-green-500",
  review: "border-l-[3px] border-l-yellow-400",
  wip: "border-l-[3px] border-l-blue-500",
  todo: "",
};

/** Build set of real pillar names completed by the Kickoff (Company Brief). */
function ffDonePillars(sections: Record<string, Section>): Set<string> {
  const done = new Set<string>();
  const ff = sections["company-brief"];
  if (!ff) return done;
  const pillars = ff.pillars || {};
  for (const [ffName, pInfo] of Object.entries(pillars)) {
    if (pInfo.status === "completed") {
      done.add(FF_PILLAR_MAP[ffName] || ffName);
    }
  }
  return done;
}

/** Calculate foundation stats: approved / total (excluding meta-sections) */
function calcFoundationStats(foundation: BrandBrainState | undefined) {
  let approved = 0;
  let total = 0;
  if (!foundation?.sections) return { approved, total, pct: 0 };

  const ffDone = ffDonePillars(foundation.sections);
  for (const [secKey, secData] of Object.entries(foundation.sections)) {
    if (EXCLUDED_SECTIONS.includes(secKey)) continue;
    const pillars = secData.pillars || {};
    for (const [pName, pInfo] of Object.entries(pillars)) {
      if (pInfo.optional) continue;
      total++;
      const status = pInfo.status;
      const effective = status === "todo" && ffDone.has(pName) ? "completed" : status;
      if (effective === "completed") approved++;
    }
  }
  return { approved, total, pct: total > 0 ? Math.round((approved / total) * 100) : 0 };
}

/** Normalize status to a canonical form */
function normalizeStatus(raw: string, ffDone: Set<string>, pillarName: string): string {
  if (raw === "todo" && ffDone.has(pillarName)) return "completed";
  if (raw === "done" || raw === "approved") return "completed";
  if (raw === "draft") return "in-progress";
  if (raw === "pending-approval" || raw === "generated") return "pending-review";
  return raw;
}

/** Pretty-print pillar name */
function displayName(key: string): string {
  return key
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface BrandColumnProps {
  slug: string;
  onOpenDoc?: (docPath: string) => void;
}

export function BrandColumn({ slug, onOpenDoc }: BrandColumnProps) {
  const { data: foundation, isLoading } = useBrandBrain(slug);
  const { data: projectsData } = useProjects(slug || null);
  const openChat = useOpenChat();
  const [url, setUrl] = useState("");

  const handleAnalyze = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    // Pin the Company Brief doc so the Kickoff thread isn't "Sin documento asociado" (SAN-3 W4).
    const cbDoc = foundation?.sections?.["company-brief"]?.pillars?.["company-brief"]?.output_file;
    const config = buildPillarThread(slug, "company-brief", cbDoc || undefined);
    config.initialMessage = `Haz el Kickoff de esta empresa: ${trimmed}`;
    config.threadState = "create";
    openChat(slug, config);
    setUrl("");
  };

  if (isLoading) {
    return <div className="text-xs text-muted-foreground py-6 text-center">Cargando...</div>;
  }

  if (!foundation) {
    return (
      <div className="py-6 px-2">
        <p className="text-xs text-muted-foreground mb-2 text-center">
          Introduce la URL de la empresa para empezar.
        </p>
        <div className="flex gap-1.5">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            placeholder="https://empresa.com"
            className="flex-1 text-xs px-2 py-1.5 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-rust"
          />
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!url.trim()}
            className="text-xs px-3 py-1.5 bg-rust text-white rounded-md hover:bg-rust/90 transition-colors disabled:opacity-40"
          >
            Analizar
          </button>
        </div>
        <ShareIntakeRow slug={slug} />
        <Link href={`/dashboard/${slug}/brand-brain`} className="text-xs text-rust mt-3 inline-block">
          Brand Documents {"\u2192"}
        </Link>
      </div>
    );
  }

  const stats = calcFoundationStats(foundation);
  const bs = foundation.brand_summary;
  const sections = foundation.sections || {};
  const ffDone = ffDonePillars(sections);

  const hasSnapshotData =
    bs?.company_name || bs?.description || (bs?.competitors && bs.competitors.length > 0);

  // Count pending approvals
  let pendingCount = 0;
  for (const [secKey, secData] of Object.entries(sections)) {
    if (EXCLUDED_SECTIONS.includes(secKey)) continue;
    for (const [, p] of Object.entries(secData.pillars || {})) {
      if (["pending-review", "pending-approval", "generated"].includes(p.status)) {
        pendingCount++;
      }
    }
  }

  // SAN-3: keep the Kickoff URL launcher reachable while the Company Brief pillar
  // is still not-started. The `!foundation` early-return above only fires for a
  // brand with no foundation at all — but scaffolding (SAN-108) now always creates
  // one, which hid the "Analizar" box for every new client.
  const cbStatus = sections["company-brief"]?.pillars?.["company-brief"]?.status;
  const showKickoffLauncher = !cbStatus || cbStatus === "todo";

  return (
    <div className="space-y-0">
      {/* Kickoff launcher — visible while the Company Brief is not-started (SAN-3) */}
      {showKickoffLauncher && (
        <div className="pb-3 mb-3 border-b border-border/60">
          <p className="text-xs text-muted-foreground mb-2">
            Introduce la URL para arrancar el Kickoff, o pulsa ▶ en Company Brief para el modo conversacional.
          </p>
          <div className="flex gap-1.5">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              placeholder="https://empresa.com"
              className="flex-1 text-xs px-2 py-1.5 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-rust"
            />
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!url.trim()}
              className="text-xs px-3 py-1.5 bg-rust text-white rounded-md hover:bg-rust/90 transition-colors disabled:opacity-40"
            >
              Analizar
            </button>
          </div>
          <ShareIntakeRow slug={slug} />
        </div>
      )}

      {/* Brand Snapshot */}
      {hasSnapshotData && bs && (
        <div className="pb-3">
          <BrandSnapshot
            summary={{
              company_name: bs.company_name || displayName(slug),
              sector: bs.sector || "",
              description: bs.description || "",
              north_star: bs.north_star || "",
              icps: bs.icps || [],
              competitors: bs.competitors || [],
              positioning: bs.positioning || "",
            }}
            slug={slug}
            onOpenDoc={onOpenDoc}
          />
        </div>
      )}

      {/* Section overview if no brand_summary detail */}
      {!bs?.company_name && !bs?.north_star && (bs?.icps?.length ?? 0) === 0 && (
        <div className="pb-3">
          {SECTION_META.map((sec) => {
            const sd = sections[sec.key];
            if (!sd) return null;
            const pillars = sd.pillars || {};
            const pKeys = Object.keys(pillars);
            const requiredKeys = pKeys.filter((k) => !pillars[k].optional);
            const secDone = requiredKeys.filter((k) =>
              pillars[k].status === "completed"
            ).length;
            const icon =
              secDone === requiredKeys.length && requiredKeys.length > 0
                ? "\u2705"
                : secDone > 0
                  ? "\uD83D\uDD36"
                  : "\u2B1C";

            return (
              <Link
                key={sec.key}
                href={`/dashboard/${slug}/brand-brain`}
                className="flex items-center gap-1.5 py-1 text-xs hover:bg-muted/30 rounded px-1 transition-colors cursor-pointer"
              >
                <span>{icon}</span>
                <span className="flex-1">
                  {sec.icon} {sec.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {secDone}/{requiredKeys.length}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Foundation Depth */}
      <div className="mb-3 px-3 py-2.5 rounded-lg bg-muted/30 border border-border">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold text-foreground">
            {"\uD83C\uDFDB\uFE0F"} Foundation Depth
          </span>
          <span className="text-[11px] font-semibold" style={{
            color: stats.pct >= 80 ? "#16a34a" : stats.pct >= 40 ? "#ca8a04" : "#dc2626"
          }}>
            {stats.approved}/{stats.total} {"\u00B7"} {stats.pct}%
          </span>
        </div>
        <ProgressBar
          value={stats.approved}
          max={stats.total || 1}
          color={
            stats.pct >= 80
              ? "bg-green-500"
              : stats.pct >= 40
                ? "bg-yellow-400"
                : "bg-red-500"
          }
          height="md"
        />
      </div>

      {/* Full Foundation Pillar List */}
      <div className="border-t border-border pt-3">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          {"\uD83D\uDCCB"} Todos los Pilares
        </div>

        {SECTION_META.map((sec) => {
          const sectionData = sections[sec.key];
          if (!sectionData) return null;
          const pillars = sectionData.pillars || {};
          const pillarKeys = Object.keys(pillars);
          if (pillarKeys.length === 0) return null;

          const requiredKeys = pillarKeys.filter((k) => !pillars[k].optional);
          const secDone = requiredKeys.filter((k) => {
            const st = pillars[k].status;
            const eff = st === "todo" && ffDone.has(k) ? "completed" : st;
            return eff === "completed";
          }).length;

          return (
            <div key={sec.key}>
              {/* Section header */}
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground mt-2 mb-1">
                {sec.icon} {sec.label}
                <span className="text-[10px] font-normal text-muted-foreground">
                  {secDone}/{requiredKeys.length}
                </span>
              </div>

              {/* Pillar items */}
              {pillarKeys.map((pName) => {
                const p = pillars[pName];
                const isOptional = !!p.optional;
                const raw = p.status || "todo";
                const norm = normalizeStatus(raw, ffDone, pName);
                const si = STATUS_INFO[norm] || STATUS_INFO["todo"];
                const name = displayName(pName);

                const docUrl = p.output_file || "";
                const hasDoc = !!docUrl;

                const handleChat = () => {
                  // Convergence: check if this doc belongs to a task first
                  if (docUrl) {
                    const taskThread = findTaskThreadForDoc(slug, docUrl, projectsData);
                    if (taskThread) { openChat(slug, taskThread); return; }
                  }
                  const config = buildPillarThread(slug, pName, docUrl || undefined);
                  openChat(slug, config);
                };

                return (
                  <div
                    key={pName}
                    className={cn(
                      "flex items-center gap-2 my-0.5 py-1.5 px-2.5 bg-[#FAFAF8] border border-border rounded-md text-[11px] cursor-pointer hover:bg-muted/40 transition-colors",
                      STATUS_BORDER[si.cls] || "",
                      isOptional && norm === "not-started" && "opacity-45"
                    )}
                    title={statusText(norm)}
                  >
                    <span className="text-[13px]">{si.icon}</span>
                    <span className="flex-1 font-medium">
                      {name}
                      {isOptional && (
                        <span className="text-[9px] text-muted-foreground font-normal ml-1">
                          (opcional)
                        </span>
                      )}
                    </span>

                    {/* Actions */}
                    {norm === "not-started" ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleChat();
                        }}
                        className="text-[12px] hover:scale-110 transition-transform"
                        title="Iniciar"
                      >
                        {"\u25B6\uFE0F"}
                      </button>
                    ) : (
                      <>
                        {hasDoc && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenDoc) {
                                onOpenDoc(docUrl);
                              }
                            }}
                            className="text-[12px] hover:scale-110 transition-transform"
                            title="Ver documento"
                          >
                            {"\uD83D\uDCC4"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleChat();
                          }}
                          className="text-[12px] hover:scale-110 transition-transform"
                          title="Chat"
                        >
                          {"\uD83D\uDCAC"}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Pending approvals notice */}
      {pendingCount > 0 && (
        <Link
          href={`/dashboard/${slug}/brand-brain`}
          className="block mt-2.5 px-3 py-2 bg-[#FFF7ED] border border-[#FFD699] rounded-lg text-[11px] text-[#8B6914] hover:bg-[#FFF0DB] transition-colors"
        >
          {"\uD83D\uDFE1"} {pendingCount}{" "}
          {pendingCount === 1 ? "pilar pendiente" : "pilares pendientes"} de revision
        </Link>
      )}

      {/* Links */}
      <div className="mt-3 pb-2">
        <Link
          href={`/dashboard/${slug}/brand-brain`}
          className="text-xs text-muted-foreground hover:text-rust transition-colors"
        >
          {"\uD83D\uDCC2"} Documents
        </Link>
      </div>
    </div>
  );
}

/**
 * Share the public intake-form link with the client (SAN-17). Shown only in the
 * new-client kickoff launcher \u2014 mirrors the skill's "research vs send-form"
 * choice. Fetches the signed URL from the admin endpoint and copies it.
 */
function ShareIntakeRow({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const share = async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/intake-link/${slug}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error("Sin URL");
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo copiar");
    }
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">o env\u00EDale el formulario inicial:</span>
        <button
          type="button"
          onClick={share}
          className="text-xs px-2 py-1 border border-rust text-rust rounded-md hover:bg-rust/10 transition-colors"
          title="Copia un link p\u00FAblico del formulario para que lo rellene el cliente"
        >
          {copied ? "\u2713 Copiado" : "\uD83D\uDD17 Copiar link"}
        </button>
      </div>
      {err && <p className="text-[10px] text-destructive mt-1">{err}</p>}
    </div>
  );
}
