/**
 * thread-display-name.ts — Formatter for thread names in the chat sidebar.
 *
 * The raw thread name from `useThreadList` comes from the filesystem
 * (e.g. `task p01 t03` or `content system seekers content strategy`),
 * which isn't very readable. This helper enriches the name with the
 * canonical entity data when available:
 *
 *   - Task threads  → `Task P01-T03 · Unificar URL Booking`
 *   - Project       → `Proyecto P14 · Content Engine`
 *   - Pillar thread → `Market Analysis` (already clean)
 *   - General       → `General`
 *   - Idea/recurring/etc. → title-cased fallback
 */

import type { Project, Task } from "@/types";

interface ProjectWithTasks {
  project: Project;
  tasks: Task[];
}

interface ThreadInput {
  shortId: string;
  name: string;
}

/** Capitalize first letter of each word, respecting common acronyms. */
const DISPLAY_ACRONYMS = new Set([
  "ecp", "ecps", "icp", "icps", "seo", "sem", "crm", "kpi", "kpis",
  "roi", "roas", "ctr", "cpa", "cpc", "cpm", "tam", "sam", "som",
  "ai", "ml", "llm", "api", "apis", "ui", "ux", "b2b", "b2c",
  "ope", "swot", "tows", "usp", "cro", "bofu", "mofu", "tofu",
  "ga4", "gsc",
]);

function titleCaseWord(word: string): string {
  if (!word) return word;
  const lower = word.toLowerCase();
  if (DISPLAY_ACRONYMS.has(lower)) return word.toUpperCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function titleCase(text: string): string {
  return text
    .split(" ")
    .filter(Boolean)
    .map(titleCaseWord)
    .join(" ");
}

/**
 * Format a thread's display name given its shortId + raw name + optional
 * project/task data for enrichment.
 *
 * @param thread      The thread with `shortId` and raw `name`
 * @param projects    Cached projects data from `useProjects` (may be undefined
 *                    while loading — the helper falls back to the raw name)
 */
export function formatThreadDisplayName(
  thread: ThreadInput,
  projects?: ProjectWithTasks[]
): string {
  const { shortId, name } = thread;

  // Task threads: `task-{id}` or `task:{id}`
  if (/^task[-:]/i.test(shortId)) {
    // Iterate tasks in projects to find the match. Both shapes supported.
    if (projects) {
      for (const pw of projects) {
        for (const t of pw.tasks) {
          const lowerId = t.id.toLowerCase();
          if (shortId === `task-${lowerId}` || shortId === `task:${lowerId}`) {
            return `Task ${t.id} · ${t.name}`;
          }
        }
      }
    }
    // Fallback: strip "task-"/"task:" and title-case the ID chunk
    const rawId = shortId.replace(/^task[-:]/i, "");
    return `Task ${rawId.toUpperCase()}`;
  }

  // Project threads: `project-{id}` or `project:{id}`
  if (/^project[-:]/i.test(shortId)) {
    if (projects) {
      for (const pw of projects) {
        const lowerId = pw.project.id.toLowerCase();
        if (shortId === `project-${lowerId}` || shortId === `project:${lowerId}`) {
          return `Proyecto ${pw.project.id} · ${pw.project.name}`;
        }
      }
    }
    const rawId = shortId.replace(/^project[-:]/i, "");
    return `Proyecto ${rawId.toUpperCase()}`;
  }

  // Strategy threads: `strategy-{id}` or `strategy:{id}`
  if (/^strategy[-:]/i.test(shortId)) {
    const rawId = shortId.replace(/^strategy[-:]/i, "");
    return `Estrategia ${rawId.toUpperCase()}`;
  }

  // Recurring threads: `recurring-{id}` or `recurring:{id}`
  if (/^recurring[-:]/i.test(shortId)) {
    const rawId = shortId.replace(/^recurring[-:]/i, "");
    return `Recurring · ${titleCase(rawId.replace(/-/g, " "))}`;
  }

  // Idea threads: `idea-{id}` or `idea:{id}`
  if (/^idea[-:]/i.test(shortId)) {
    return "Idea"; // too many; short form is enough
  }

  // Skill threads: `skill-{id}` or `skill:{id}`
  if (/^skill[-:]/i.test(shortId)) {
    const rawId = shortId.replace(/^skill[-:]/i, "");
    return `Skill · ${titleCase(rawId.replace(/-/g, " "))}`;
  }

  // General or pillar thread — use the raw name with title case
  if (shortId === "general") return "General";
  return titleCase(name || shortId.replace(/-/g, " "));
}
