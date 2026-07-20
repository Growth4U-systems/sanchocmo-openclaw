import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import { resolveWorkspaceDocPath } from "@/lib/server/doc-paths";
import { listThreadsForSlug } from "@/lib/data/mc-chat";
import {
  listAgentRunEventsAsync,
  listAgentRunsForThreadAsync,
} from "@/lib/data/agent-runs";
import {
  buildGrowieSupportDoc,
  growieDocPathFromPagePath,
  snapshotGrowieRecentRuns,
  snapshotGrowieRecentThreads,
  snapshotGrowieRunTrace,
  type GrowieSupportContext,
} from "./growie";

const RUNS_THREAD_FANOUT = 8;
const RUNS_PER_THREAD = 5;
const DOC_MAX_BYTES = 2_000_000;
const DOC_EXTENSIONS = new Set([".md", ".html", ".txt", ".json"]);

export type GrowieSupportDiagnostics = Pick<
  GrowieSupportContext,
  "recentThreads" | "recentRuns" | "lastRunTrace" | "activeDoc"
>;

/**
 * Assemble the read-only evidence bundle for a Growie support turn: the
 * tenant's recent Sancho threads, the agent runs behind them (agent_runs
 * covers every dispatch — durable-ledger runs and plain chat turns alike),
 * the event trail of the most diagnostic-relevant run, and the document the
 * user is looking at.
 *
 * Every section is best-effort: a failing source drops that section, never
 * the support message itself.
 */
export async function gatherGrowieSupportDiagnostics(input: {
  slug: string;
  pagePath?: string;
}): Promise<GrowieSupportDiagnostics> {
  const diagnostics: GrowieSupportDiagnostics = {};

  try {
    const recentThreads = snapshotGrowieRecentThreads(listThreadsForSlug(input.slug));
    if (recentThreads.length > 0) diagnostics.recentThreads = recentThreads;

    const runLists = await Promise.all(
      recentThreads.slice(0, RUNS_THREAD_FANOUT).map((thread) =>
        listAgentRunsForThreadAsync(thread.id, RUNS_PER_THREAD).catch(() => []),
      ),
    );
    const recentRuns = snapshotGrowieRecentRuns(runLists.flat());
    if (recentRuns.length > 0) diagnostics.recentRuns = recentRuns;

    const traceTarget = recentRuns.find((run) => run.status === "failed") ?? recentRuns[0];
    if (traceTarget) {
      try {
        const events = await listAgentRunEventsAsync(traceTarget.id);
        const trace = snapshotGrowieRunTrace(traceTarget.id, traceTarget.threadId, events);
        if (trace && trace.events.length > 0) diagnostics.lastRunTrace = trace;
      } catch {
        // Event history unavailable — the run summary above still stands.
      }
    }
  } catch {
    // Thread index unavailable — continue with whatever else can be gathered.
  }

  try {
    const docPath = growieDocPathFromPagePath(input.pagePath, input.slug);
    if (docPath) {
      const resolved = resolveWorkspaceDocPath(BASE, docPath, {
        slug: input.slug,
        requireBrand: true,
      });
      const ext = path.extname(resolved.absPath).toLowerCase();
      if (resolved.exists && DOC_EXTENSIONS.has(ext)) {
        const stat = fs.statSync(resolved.absPath);
        if (stat.size <= DOC_MAX_BYTES) {
          const doc = buildGrowieSupportDoc(
            resolved.canonicalPath,
            fs.readFileSync(resolved.absPath, "utf-8"),
          );
          if (doc) diagnostics.activeDoc = doc;
        }
      }
    }
  } catch {
    // Doc unreadable or out of tenant scope — skip the excerpt.
  }

  return diagnostics;
}
