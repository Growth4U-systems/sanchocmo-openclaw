/**
 * feedback-card.ts — Pure helpers to build the chat summary card posted after a
 * feedback-triage run (option C: chat-first awareness). Kept pure + separate so
 * it's unit-tested and the ingest endpoint stays thin.
 */

import type { InsightCategory } from "@/lib/feedback-insights";

export interface CategoryCounts {
  skill: number;
  client: number;
  form: number;
  other: number;
  total: number;
}

export function summarizeInsightCounts(
  insights: { category: InsightCategory }[],
): CategoryCounts {
  const counts: CategoryCounts = { skill: 0, client: 0, form: 0, other: 0, total: insights.length };
  for (const i of insights) counts[i.category]++;
  return counts;
}

/**
 * Markdown card for the chat thread: per-category counts + a deep-link to the
 * Mejoras panel. Categories with 0 items are omitted. The link is dropped when
 * no `reviewUrl` is available (chat only linkifies absolute http(s) URLs).
 */
export function buildFeedbackCardMessage(
  docPath: string,
  counts: CategoryCounts,
  reviewUrl: string,
): string {
  const name = docPath.split("/").pop() || docPath;
  const parts: string[] = [];
  if (counts.skill) parts.push(`🛠️ ${counts.skill} skill`);
  if (counts.client) parts.push(`👤 ${counts.client} cliente`);
  if (counts.form) parts.push(`📝 ${counts.form} formulario`);
  if (counts.other) parts.push(`🤷 ${counts.other} otros`);
  const breakdown = parts.length ? ` — ${parts.join(" · ")}` : "";
  const link = reviewUrl ? `\n👉 [Revisar en Mejoras](${reviewUrl})` : "";
  return `🛡️ **Feedback analizado** en \`${name}\`: ${counts.total} sugerencia(s)${breakdown}.${link}`;
}
