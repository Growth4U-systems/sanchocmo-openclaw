/**
 * Human-friendly duration formatters used by the chat progress timeline.
 *
 * Two flavors:
 *   formatElapsed(ms)   — bare duration:   "23s" | "1m 23s" | "2h 02m"
 *   formatRelative(ms)  — historical age:  "recién" | "hace 23s" | "hace 1m 0s"
 *
 * The 5s cutoff for "recién" prevents the sealed-timeline jitter where an
 * event sealed at t=0 would render "hace 0s" before turning into "hace 1s",
 * which reads as a bug.
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";

  if (ms < MINUTE) {
    const seconds = Math.floor(ms / SECOND);
    return `${seconds}s`;
  }

  if (ms < HOUR) {
    const minutes = Math.floor(ms / MINUTE);
    const seconds = Math.floor((ms % MINUTE) / SECOND);
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(ms / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatRelative(deltaMs: number): string {
  if (!Number.isFinite(deltaMs) || deltaMs < 5 * SECOND) return "recién";
  return `hace ${formatElapsed(deltaMs)}`;
}
