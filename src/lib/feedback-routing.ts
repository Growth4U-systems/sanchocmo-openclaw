/**
 * feedback-routing.ts — Route an accepted feedback insight to its destination.
 *
 *   skill  → append an observation to _system/skill-execution-log.jsonl, the
 *            input of the existing Skill Self-Improvement Protocol
 *            (workspace-sancho/_system/skills/skill-improvement-protocol.md).
 *            The weekly cron rolls it into a skill-improvement proposal.
 *   client → append a preference block to brand/{slug}/client-preferences.md.
 *   form   → append to _system/onboarding-form-backlog.md.
 *   other  → no-op (just marked applied).
 *
 * The pure mapper `buildExecutionLogEntry` is unit-tested; the fs appenders are
 * thin and exercised manually / via the endpoint flow.
 */

import fs from "fs";
import path from "path";
import { BASE, brandDir } from "@/lib/data/paths";
import type { InsightRow } from "@/lib/feedback-insights";

export interface ExecutionLogEntry {
  timestamp: string;
  skill: string;
  session_key: string;
  trigger: string;
  outcome: string;
  quality: number;
  issues: string[];
  notes: string;
  improvement_hint: string;
}

/** Pure: map a skill-category insight to a skill-execution-log.jsonl entry. */
export function buildExecutionLogEntry(row: InsightRow): ExecutionLogEntry {
  const commentsNote = row.sourceCommentIds.length
    ? ` | comments: ${row.sourceCommentIds.join(",")}`
    : "";
  return {
    timestamp: row.createdAt.toISOString(),
    skill: row.skillId ?? "unknown",
    session_key: `feedback:${row.runId}`,
    trigger: `client feedback on ${row.docPath}`,
    outcome: "client-feedback",
    quality: 3,
    issues: [row.title],
    notes: `${row.detail}${commentsNote}`,
    improvement_hint: row.proposedChange ?? row.detail,
  };
}

function systemDir(): string {
  return path.join(BASE, "_system");
}

function appendLine(filePath: string, line: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, line.endsWith("\n") ? line : `${line}\n`, "utf-8");
}

/**
 * Route an accepted insight. Returns a `routedRef` (the file it landed in)
 * for audit. Best-effort: throws only on unexpected fs errors.
 */
export function routeAcceptedInsight(row: InsightRow): string {
  if (row.category === "skill") {
    const file = path.join(systemDir(), "skill-execution-log.jsonl");
    appendLine(file, JSON.stringify(buildExecutionLogEntry(row)));
    return "_system/skill-execution-log.jsonl";
  }
  if (row.category === "client") {
    const file = path.join(brandDir(row.slug), "client-preferences.md");
    const block = `\n## ${row.title}\n\n${row.detail}\n\n> Origen: feedback en ${row.docPath} (${row.createdAt.toISOString().slice(0, 10)})\n`;
    appendLine(file, block);
    return `brand/${row.slug}/client-preferences.md`;
  }
  if (row.category === "form") {
    const file = path.join(systemDir(), "onboarding-form-backlog.md");
    const block = `\n- [ ] **${row.title}** — ${row.detail} (cliente: ${row.slug}, doc: ${row.docPath})\n`;
    appendLine(file, block);
    return "_system/onboarding-form-backlog.md";
  }
  return "none";
}
