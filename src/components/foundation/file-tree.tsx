/**
 * Foundation File Tree — ported from renderDocBrowserRoot().
 * Shows foundation sections grouped by category with pillar rows.
 */

"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { FoundationState, Section, Pillar } from "@/types";

// FF_PILLAR_MAP: Fast Foundation pillar names -> real pillar names
const FF_PILLAR_MAP: Record<string, string> = {
  "company-brief": "company-brief",
  "self-l1": "self-analysis",
  "market-l1": "market-analysis",
  "brand-voice-snapshot": "brand-voice",
  "niche-basic": "niche-discovery",
};

// Section display metadata — ordered as legacy
const SECTION_DEFS = [
  { key: "company-brief", icon: "\uD83D\uDCCB", label: "Company Brief" },
  { key: "market-and-us", icon: "\uD83D\uDCCA", label: "Market & Us" },
  { key: "go-to-market", icon: "\uD83C\uDFAF", label: "Go-To-Market" },
  { key: "brand-book", icon: "\uD83C\uDFA8", label: "Brand Book" },
  { key: "metrics-setup", icon: "\uD83D\uDCCF", label: "Metrics Setup" },
  { key: "strategic-plan", icon: "\uD83D\uDCCB", label: "Strategic Plan" },
] as const;

// Status display info — labels are i18n keys (foundation.*)
const STATUS_INFO: Record<string, { icon: string; cls: string; labelKey: string }> = {
  approved: { icon: "\u2705", cls: "done", labelKey: "approved" },
  done: { icon: "\u2705", cls: "done", labelKey: "completed" },
  "pending-review": { icon: "\uD83D\uDFE1", cls: "review", labelKey: "pendingReview" },
  "pending-approval": { icon: "\uD83D\uDFE1", cls: "review", labelKey: "pendingReview" },
  generated: { icon: "\uD83D\uDFE1", cls: "review", labelKey: "generated" },
  "in-progress": { icon: "\uD83D\uDD04", cls: "wip", labelKey: "inProgress" },
  draft: { icon: "\uD83D\uDD04", cls: "wip", labelKey: "draft" },
  "request-refresh": { icon: "\uD83D\uDD04", cls: "wip", labelKey: "refresh" },
  "not-started": { icon: "\u2B1C", cls: "todo", labelKey: "notStarted" },
};

const STATUS_BORDER: Record<string, string> = {
  done: "border-l-[3px] border-l-green-500",
  review: "border-l-[3px] border-l-yellow-400",
  wip: "border-l-[3px] border-l-blue-500",
  todo: "",
};

/** Build set of real pillar names completed by fast-foundation */
function ffDonePillars(sections: Record<string, Section>): Set<string> {
  const done = new Set<string>();
  const ff = sections["fast-foundation"];
  if (!ff) return done;
  const pillars = ff.pillars || {};
  for (const [ffName, pInfo] of Object.entries(pillars)) {
    if (["approved", "done"].includes(pInfo.status)) {
      done.add(FF_PILLAR_MAP[ffName] || ffName);
    }
  }
  return done;
}

/** Normalize status */
function normalizeStatus(raw: string, ffDone: Set<string>, pillarName: string): string {
  if (raw === "not-started" && ffDone.has(pillarName)) return "approved";
  if (raw === "done") return "approved";
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

interface FileTreeProps {
  slug: string;
  foundation: FoundationState;
  onSelectDoc: (sectionKey: string, pillarKey: string, pillar: Pillar) => void;
  onOpenChat: (pillarKey: string, docPath?: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function FileTree({ slug, foundation, onSelectDoc, onOpenChat }: FileTreeProps) {
  const t = useTranslations("foundation");
  const sections = foundation.sections || {};
  const ffDone = ffDonePillars(sections);
  const ffSection = sections["fast-foundation"]?.pillars || {};

  return (
    <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-4 py-2 bg-muted/30">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          Foundation
        </span>
      </div>

      {SECTION_DEFS.map((sec) => {
        const sectionData = sections[sec.key];
        if (!sectionData) {
          // Section not created yet
          return (
            <div
              key={sec.key}
              className="flex items-center gap-3 px-4 py-3 opacity-50"
            >
              <span className="text-base">{sec.icon}</span>
              <span className="text-sm font-medium">{"\u2B1C"} {sec.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {t("notCreated")}
              </span>
            </div>
          );
        }

        const pillars = sectionData.pillars || {};
        const pillarKeys = Object.keys(pillars);
        const requiredKeys = pillarKeys.filter((k) => !pillars[k].optional);
        const sectionApproved = requiredKeys.filter((k) => {
          const st = pillars[k].status;
          const eff = st === "not-started" && ffDone.has(k) ? "approved" : st;
          return ["approved", "done"].includes(eff);
        }).length;
        const sectionIcon =
          sectionApproved === requiredKeys.length && requiredKeys.length > 0
            ? "\u2705"
            : sectionApproved > 0
              ? "\u26A0\uFE0F"
              : "\u2B1C";

        return (
          <div key={sec.key}>
            {/* Section header */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/20">
              <span className="text-base">{sec.icon}</span>
              <span className="text-sm font-semibold">
                {sectionIcon} {sec.label}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {sectionApproved}/{requiredKeys.length} {t("completedCount")}
              </span>
            </div>

            {/* Pillar rows */}
            {pillarKeys.map((pName) => {
              const p = pillars[pName];
              const isOptional = !!p.optional;
              const raw = p.status || "not-started";
              const norm = normalizeStatus(raw, ffDone, pName);
              const si = STATUS_INFO[norm] || STATUS_INFO["not-started"];
              const name = displayName(pName);

              // Resolve doc URL
              let docUrl = p.output_file || "";
              if (!docUrl) {
                const ffKey = Object.entries(FF_PILLAR_MAP).find(([, v]) => v === pName);
                if (ffKey && ffSection[ffKey[0]]) {
                  docUrl = ffSection[ffKey[0]].output_file || "";
                }
              }
              const hasDoc = !!docUrl;

              return (
                <div
                  key={pName}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2 hover:bg-muted/30 transition-colors",
                    STATUS_BORDER[si.cls] || "",
                    isOptional && norm === "not-started" && "opacity-45",
                  )}
                >
                  <span className="text-sm">{si.icon}</span>
                  <span className="flex-1 text-sm font-medium">
                    {name}
                    {isOptional && (
                      <span className="text-[10px] text-muted-foreground font-normal ml-1">
                        ({t("optional")})
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">
                    {t(si.labelKey)}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 ml-2">
                    {hasDoc && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDoc(sec.key, pName, p);
                        }}
                        className="text-sm hover:scale-110 transition-transform p-0.5"
                        title="Ver documento"
                      >
                        {"\uD83D\uDCC4"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenChat(pName, docUrl || undefined);
                      }}
                      className="text-sm hover:scale-110 transition-transform p-0.5"
                      title="Chat con Sancho"
                    >
                      {"\uD83D\uDCAC"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Presentations row */}
      {foundation.presentations && foundation.presentations.length > 0 && (
        <>
          <div className="px-4 py-2 bg-muted/30 mt-0">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {t("others")}
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-default">
            <span className="text-base">{"\uD83C\uDFAC"}</span>
            <span className="text-sm font-medium">{t("presentations")}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {foundation.presentations.length} {t("files")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
