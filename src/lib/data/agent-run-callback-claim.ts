/**
 * A terminal callback claim is a short distributed lease. Exact retries are
 * suppressed while the winner is processing; if that process dies with the
 * parent still active, the same fingerprint may recover after this interval.
 */
export const TERMINAL_CALLBACK_CLAIM_LEASE_MS = 60_000;

export function terminalCallbackClaimIsStale(
  updatedAt: string,
  now = Date.now(),
): boolean {
  const claimedAt = Date.parse(updatedAt);
  return (
    Number.isFinite(claimedAt) &&
    now - claimedAt >= TERMINAL_CALLBACK_CLAIM_LEASE_MS
  );
}
