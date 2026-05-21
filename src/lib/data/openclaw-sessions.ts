import fs from "fs";
import { agentSessionsFile } from "./openclaw-paths";

/**
 * "Is this cron currently running?" — derived from the agent session store.
 *
 * The openclaw cron runner does NOT emit a `started` event in cron-runs.jsonl,
 * only `finished`. The signal we have is the per-agent session store at
 * <OPENCLAW_HOME>/.openclaw/agents/<agent>/sessions/sessions.json, where each
 * cron job has one entry keyed `agent:<agent>:cron:<jobId>` and its
 * `updatedAt` is touched on every agent message during a run. After the run
 * finishes, no further touches happen.
 *
 * So the heuristic for "currently running":
 *   (a) `updatedAt` is recent (within freshnessMs of now), AND
 *   (b) `updatedAt` is *newer* than the last completed run's end time
 *       (jobs-state.json `lastRunAtMs + lastDurationMs`). Without (b) we
 *       can't distinguish a session just after the last finished run from
 *       a session in the middle of a new run.
 *
 * `startedAtMs` is a best-effort lower bound. Without an explicit start
 * timestamp anywhere readable, we use either:
 *   - `lastRunAtMs + lastDurationMs` (when the previous run ended), bumped
 *     up to `now - freshnessMs` so we don't report a fake-huge duration when
 *     the previous run was hours ago, OR
 *   - `updatedAt - 30s` as a fallback when no previous run is known.
 *
 * Duration math in the UI should treat this as "running for at least X" not
 * "exactly X". Good enough for a live badge.
 */
interface SessionEntry {
  sessionId?: string;
  updatedAt?: number;
  [key: string]: unknown;
}

export interface RunningCron {
  jobId: string;
  sessionId: string | null;
  startedAtMs: number;
  lastTouchMs: number;
}

export interface JobEndedAt {
  lastRunAtMs?: number;
  lastDurationMs?: number;
}

// 600s instead of 90s because openclaw only writes `updatedAt` near the start
// of a cron session (right after sessionStartedAt) and does not bump it across
// long agent steps. Observed in prod: News/Competitor Monitor sessions touch
// `updatedAt` once at T+10s but the run continues for ~4 min — at 90s the
// "running" badge silently disappeared for most of the run.
//
// The `updatedAt <= lastEnd + 1` guard below still excludes finished runs as
// soon as jobs-state.json records the end, so widening the window does not
// keep finished crons "stuck" running — it only covers the gap between the
// first session touch and the next jobs-state write.
const DEFAULT_FRESHNESS_MS = 600_000;
const SESSION_KEY_RE = /^agent:[^:]+:cron:([0-9a-f-]+)$/;

export function loadAgentSessions(agent = "sancho"): Record<string, SessionEntry> {
  const file = agentSessionsFile(agent);
  if (!fs.existsSync(file)) return {};
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getRunningCronJobs(
  jobsEndedAt: Record<string, JobEndedAt>,
  opts: { agent?: string; freshnessMs?: number; now?: number } = {}
): Map<string, RunningCron> {
  const agent = opts.agent ?? "sancho";
  const now = opts.now ?? Date.now();
  const freshness = opts.freshnessMs ?? DEFAULT_FRESHNESS_MS;
  const sessions = loadAgentSessions(agent);
  const running = new Map<string, RunningCron>();

  for (const [key, entry] of Object.entries(sessions)) {
    const m = key.match(SESSION_KEY_RE);
    if (!m) continue;
    const jobId = m[1];
    const updatedAt = entry.updatedAt;
    if (typeof updatedAt !== "number") continue;
    if (now - updatedAt > freshness) continue;

    const prev = jobsEndedAt[jobId];
    const lastEnd = (prev?.lastRunAtMs ?? 0) + (prev?.lastDurationMs ?? 0);
    if (lastEnd > 0 && updatedAt <= lastEnd + 1) continue;

    // Lower bound for the in-flight run's start. If we have a previous end,
    // the new run started after it. Cap at `now - freshnessMs` to avoid
    // reporting hour-old durations when the previous run was distant.
    const flooredStart = Math.max(lastEnd, now - freshness, updatedAt - 30_000);
    running.set(jobId, {
      jobId,
      sessionId: typeof entry.sessionId === "string" ? entry.sessionId : null,
      startedAtMs: flooredStart,
      lastTouchMs: updatedAt,
    });
  }

  return running;
}
