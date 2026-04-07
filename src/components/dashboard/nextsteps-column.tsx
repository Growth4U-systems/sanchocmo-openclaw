"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useFoundation } from "@/hooks/useFoundation";
import { useProjects } from "@/hooks/useProjects";
import { useOpenChat } from "@/hooks/useChat";
import { buildPillarThread, buildTaskThread, buildProjectThread } from "@/lib/chat-openers";
import { ProgressBar } from "@/components/shared/progress-bar";
import { cn } from "@/lib/utils";
import type { FoundationState, Section } from "@/types";

// ============================================================
// Next Steps Column — Faithful port of renderV2NextSteps()
// ============================================================

// Reuse FF logic from brand-column
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
      const status = pInfo.status;
      const effective = status === "not-started" && ffDone.has(pName) ? "approved" : status;
      if (["approved", "done"].includes(effective)) approved++;
    }
  }
  return { approved, total, pct: total > 0 ? Math.round((approved / total) * 100) : 0 };
}

function displayName(key: string): string {
  return key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface NextStepsColumnProps {
  slug: string;
  onOpenDoc?: (docPath: string) => void;
}

export function NextStepsColumn({ slug, onOpenDoc }: NextStepsColumnProps) {
  const { data: foundation } = useFoundation(slug);
  const { data: projectsData } = useProjects(slug);
  const openChat = useOpenChat();

  // Atalaya recommendations
  const { data: atalayaData } = useQuery({
    queryKey: ["recommendations", slug],
    queryFn: async () => {
      const res = await fetch(`/api/recommendations?slug=${slug}&status=pending`);
      if (!res.ok) return { recommendations: [] };
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  // Monitoring data for performance recs
  const { data: monData } = useQuery({
    queryKey: ["monitoring-recs", slug],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring?slug=${slug}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  const fStats = calcFoundationStats(foundation);
  const hasStrategicPlan =
    foundation?.sections?.["strategic-plan"] &&
    ["approved", "done"].includes(foundation.sections["strategic-plan"].status || "");
  const foundationComplete = hasStrategicPlan || fStats.pct >= 90;

  // --- Decisions ---
  const decisions: Array<{
    name: string;
    pillar: string | null;
    section?: string;
    status?: string;
    docUrl?: string;
    skill?: string;
    why: string;
  }> = [];

  if (foundation?.sections) {
    for (const [secKey, secData] of Object.entries(foundation.sections)) {
      if (EXCLUDED_SECTIONS.includes(secKey)) continue;
      for (const [pName, p] of Object.entries(secData.pillars || {})) {
        if (["pending-review", "pending-approval", "generated"].includes(p.status)) {
          decisions.push({
            name: displayName(pName),
            pillar: pName,
            section: secKey,
            status: p.status,
            docUrl: p.output_file || "",
            skill: p.skill || "",
            why: "Foundation . Esperando tu confirmacion",
          });
        }
      }
    }
  }

  // --- Performance recommendations ---
  const monRecs = monData?.pending_recommendations?.recommendations?.filter(
    (r: { status: string }) => r.status === "pending" || r.status === "active"
  ) || [];
  const topMonRecs = monRecs
    .filter((r: { priority: string }) => r.priority === "high" || r.priority === "medium")
    .slice(0, 4);

  // --- Atalaya recommendations ---
  const atalayaRecs = (atalayaData?.recommendations || []).filter(
    (r: { source?: string }) => !r.source?.startsWith("performance")
  );
  const topAtalaya = atalayaRecs
    .filter((r: { priority: string }) => r.priority === "high" || r.priority === "medium")
    .slice(0, 4);

  // --- Projects ---
  const allProjects = (projectsData || []).map((p: { project: unknown; tasks: unknown[] }) => ({
    ...(p.project as Record<string, unknown>),
    tasks: p.tasks || [],
  }));

  const activeProjects = allProjects.filter((p: Record<string, unknown>) => {
    if (["archived", "cancelled", "discarded"].includes(p.status as string)) return false;
    const tasks = (p.tasks as Array<{ status: string }>) || [];
    const done = tasks.filter((t) =>
      ["completed", "done", "discarded", "cancelled"].includes(t.status)
    ).length;
    if (done === tasks.length && tasks.length > 0) return false;
    return true;
  });

  return (
    <div>
      {/* Strategic Plan banner */}
      {hasStrategicPlan && (
        <button
          type="button"
          onClick={() => {
            const sp = foundation?.sections?.["strategic-plan"]?.pillars?.["strategic-plan"];
            const docPath = sp?.output_file;
            if (docPath && onOpenDoc) {
              onOpenDoc(docPath);
            }
          }}
          className="w-full flex items-center gap-3 p-3 mb-3 rounded-lg cursor-pointer bg-gradient-to-r from-rust/5 to-transparent border border-rust/30 hover:border-rust/50 transition-colors text-left"
        >
          <span className="text-xl">{"\uD83D\uDCCB"}</span>
          <div className="flex-1">
            <div className="text-xs font-bold">Strategic Plan</div>
            <div className="text-[10px] text-muted-foreground">
              {foundation?.sections?.["strategic-plan"]?.approved_at
                ? "Plan estrategico aprobado"
                : "Plan estrategico"}
            </div>
          </div>
          <span className="text-muted-foreground">{"\u2192"}</span>
        </button>
      )}

      {/* Foundation warning */}
      {foundation && fStats.pct < 100 && (
        <Link
          href={`/dashboard/${slug}/foundation`}
          className={cn(
            "block mb-3 px-3 py-2 rounded-lg text-[11px] cursor-pointer transition-colors",
            fStats.pct >= 40
              ? "bg-yellow-50 border border-yellow-300 text-yellow-800 hover:bg-yellow-100"
              : "bg-red-50 border border-red-300 text-red-700 hover:bg-red-100"
          )}
        >
          {fStats.pct >= 40 ? "\u26A0\uFE0F" : "\uD83D\uDEA8"} Foundation {fStats.pct}% completa{" "}
          {"\u2014"} {fStats.total - fStats.approved} pilares pendientes
        </Link>
      )}

      {/* Decisions section */}
      {decisions.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-bold text-foreground mb-2">
            {"\u2753"} Tu Decision
          </div>
          {decisions.map((d) => {
            const handleChat = () => {
              if (d.pillar) {
                const config = buildPillarThread(slug, d.pillar, d.docUrl || undefined);
                openChat(slug, config);
              }
            };
            return (
              <div
                key={d.pillar || d.name}
                className="flex items-center gap-2 my-0.5 py-1.5 px-2.5 bg-[#FAFAF8] border border-border border-l-[3px] border-l-yellow-400 rounded-md text-[11px] cursor-pointer"
              >
                <span className="text-[13px]">{"\uD83D\uDFE1"}</span>
                <span className="flex-1 font-medium">
                  {d.name}
                  <br />
                  <span className="text-[10px] text-muted-foreground font-normal">{d.why}</span>
                </span>
                {d.docUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`/api/docs/${d.docUrl}`, "_blank");
                    }}
                    className="text-[12px] hover:scale-110 transition-transform"
                    title="Ver documento"
                  >
                    {"\uD83D\uDCC4"}
                  </button>
                )}
                {d.pillar && (
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
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Performance Recommendations — with action buttons (matches legacy) */}
      {topMonRecs.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-bold text-foreground mb-2">
            {"\uD83D\uDCC8"} Recomendaciones
          </div>
          {topMonRecs.map((rec: { id: string; title: string; type: string; rationale?: string; description?: string; priority: string; linked_project?: string; linkedProject?: string }) => {
            const typeIcons: Record<string, string> = {
              optimize: "\uD83D\uDD27",
              investigate: "\uD83D\uDD0D",
              launch: "\uD83D\uDE80",
              pause: "\u23F8\uFE0F",
              escalate: "\u26A1",
            };
            const prioColor = rec.priority === "high" ? "#C45D35" : "#B8860B";
            const projRef = rec.linked_project || rec.linkedProject || "";

            const handleConvert = async (e: React.MouseEvent) => {
              e.stopPropagation();
              try {
                await fetch("/api/monitoring/recommendation-action", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ slug, recommendationId: rec.id, action: "convert" }),
                });
                window.location.reload();
              } catch { /* ignore */ }
            };

            const handleDismiss = async (e: React.MouseEvent) => {
              e.stopPropagation();
              try {
                await fetch("/api/monitoring/recommendation-action", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ slug, recommendationId: rec.id, action: "dismiss" }),
                });
                window.location.reload();
              } catch { /* ignore */ }
            };

            return (
              <div
                key={rec.id}
                className="my-0.5 p-2.5 bg-card border border-border rounded-md text-[11px]"
                style={{ borderLeftWidth: 3, borderLeftColor: prioColor }}
              >
                <div className="flex items-start gap-1.5">
                  <span className="text-[13px] shrink-0">{typeIcons[rec.type] || "\uD83D\uDCCC"}</span>
                  <div className="flex-1">
                    <div className="font-semibold mb-0.5">{rec.title}</div>
                    <div className="text-[10px] text-muted-foreground leading-snug mb-1.5">
                      {(rec.rationale || rec.description || "").slice(0, 100)}
                      {(rec.rationale || rec.description || "").length > 100 ? "..." : ""}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleConvert}
                        className="text-[9px] font-semibold text-white bg-[#4A5D23] border-none rounded px-2 py-0.5 cursor-pointer hover:opacity-90"
                      >
                        {"\u2192"} {projRef ? `Tarea en ${projRef}` : "Crear tarea"}
                      </button>
                      <button
                        type="button"
                        onClick={handleDismiss}
                        className="text-[9px] font-semibold text-muted-foreground bg-transparent border border-border rounded px-2 py-0.5 cursor-pointer hover:bg-muted"
                      >
                        Descartar
                      </button>
                      <span className="flex-1" />
                      <span
                        className="text-[8px] font-bold uppercase"
                        style={{ color: prioColor }}
                      >
                        {rec.priority}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {monRecs.length > topMonRecs.length && (
            <div className="text-center mt-1">
              <Link href={`/dashboard/${slug}/metrics`} className="text-[10px] text-rust">
                Ver las {monRecs.length} recomendaciones {"\u2192"}
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Projects section */}
      <div className="mb-4">
        <div className="text-[11px] font-bold text-foreground mb-2">
          {"\uD83D\uDCCB"} Proyectos
        </div>

        {activeProjects.length > 0 ? (
          activeProjects.map((p: Record<string, unknown>) => {
            const tasks = (p.tasks as Array<{ id: string; name: string; status: string; type?: string; pillar?: string; skill?: string }>) || [];
            const done = tasks.filter((t) => ["completed", "done"].includes(t.status)).length;
            const total = tasks.length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const isDone = done === total && total > 0;
            const statusIcon = isDone
              ? "\u2705"
              : (p.status as string) === "blocked"
                ? "\uD83D\uDD12"
                : (p.status as string) === "active"
                  ? "\uD83D\uDCE3"
                  : "\u23F8\uFE0F";
            const barColor = isDone
              ? "bg-green-500"
              : (p.status as string) === "blocked"
                ? "bg-gray-400"
                : (p.status as string) === "active"
                  ? "bg-blue-500"
                  : "bg-border";

            const nextTask = !isDone
              ? tasks.find((t) => !["completed", "done"].includes(t.status))
              : null;

            const handleProjectChat = () => {
              const config = buildProjectThread(slug, p.id as string, p.name as string, {
                strategy: p.strategy as string,
                status: p.status as string,
              });
              openChat(slug, config);
            };

            const handleTaskChat = (t: { id: string; name: string; type?: string; pillar?: string; skill?: string; status?: string }) => {
              const config = buildTaskThread(slug, t.id, t.name, p.id as string, {
                taskSkill: t.skill,
                taskType: t.type,
                taskStatus: t.status,
                pillar: t.pillar,
              });
              openChat(slug, config);
            };

            const projectUrl = `/dashboard/${slug}/projects/${p.id as string}`;

            return (
              <div
                key={p.id as string}
                className={cn(
                  "mb-2 p-2.5 bg-card border border-border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors",
                  isDone && "opacity-60"
                )}
                onClick={() => window.location.href = projectUrl}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px]">{statusIcon}</span>
                  <span className="flex-1 text-[11px] font-semibold truncate">
                    {p.name as string}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {done}/{total}
                  </span>
                </div>

                {total > 0 && (
                  <div className="mt-1.5">
                    <ProgressBar value={pct} color={barColor} height="sm" />
                  </div>
                )}

                {/* Next pending task inline */}
                {nextTask && (
                  <div className="flex items-center gap-2 mt-2 pl-5">
                    <span className="text-[10px] text-muted-foreground flex-1 truncate">
                      {nextTask.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = projectUrl;
                      }}
                      className="text-[11px] hover:scale-110 transition-transform"
                      title="Ver proyecto"
                    >
                      {"\u25B6\uFE0F"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTaskChat(nextTask);
                      }}
                      className="text-[11px] hover:scale-110 transition-transform"
                      title="Chat"
                    >
                      {"\uD83D\uDCAC"}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        ) : foundationComplete ? (
          <div className="text-[11px] text-muted-foreground py-2.5">
            Foundation completa. Pide a Sancho que genere el Strategic Plan para desbloquear
            proyectos.
          </div>
        ) : (
          <div className="bg-[#FFFAE6] border border-[#FFE380] rounded-lg p-3 text-[11px] text-[#5C4813] leading-relaxed">
            <strong>{"\u26A0\uFE0F"} Completa Foundation primero</strong>
            <br />
            Las estrategias se desbloquean con el Strategic Plan. Foundation actual: {fStats.pct}%.
          </div>
        )}
      </div>
    </div>
  );
}
