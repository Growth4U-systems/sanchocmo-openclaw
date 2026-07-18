/**
 * transport-abort — detect + decide the one-shot retry for mid-turn transport
 * aborts (SAN-479).
 *
 * Some providers (GLM via Fireworks, notably) drop the streaming HTTP request
 * ~70s into a turn. The OpenClaw runtime surfaces it as a bare
 * "Request was aborted." error with reason=none and does NOT retry, so the
 * chat used to show that raw English literal and the user had to re-type the
 * message.
 *
 * The channel now retries the dispatch ONCE (same inbound message, same
 * session) after a short delay. Double-delivery safety: the buffered
 * dispatcher only surfaces reply content through the channel's `deliver`
 * callback — it buffers parts internally and nothing reaches the thread until
 * `deliver` posts it to the webhook (which sets `visibleReplyPosted` and
 * `markVisibleDelivery`). Therefore if neither flag observed a delivery, the
 * aborted attempt left NO trace in the thread and re-dispatching cannot
 * duplicate content. If ANY visible content was already posted (partial reply
 * before the abort), we do NOT retry — a second run could re-say what the
 * user already saw — and the classified error surfaces instead.
 */

export const TRANSPORT_ABORT_RETRY_DELAY_MS = 2_000;

const TRANSPORT_ABORT_RE = /request was aborted/i;

/** True when a raw runtime error is the provider-side mid-stream abort. */
export function isTransportAbortError(raw) {
  return typeof raw === "string" && TRANSPORT_ABORT_RE.test(raw);
}

/**
 * Decide whether the channel may re-dispatch the turn after a transport abort.
 *
 * @param {object} opts
 * @param {string} opts.raw - the raw runtime error text
 * @param {boolean} opts.retryUsed - the single retry was already spent
 * @param {boolean} opts.visibleReplyPosted - `deliver` already posted content to the thread
 * @param {boolean} opts.channelDeliveryObserved - content reached the thread via the channel path (hasRecentVisibleDelivery)
 * @param {string|null} opts.guardAbortMessage - non-null when the cost guard aborted this run on purpose
 * @param {boolean} opts.signalAborted - the turn's AbortController fired (user cancel / durable stop / guard)
 * @returns {boolean}
 */
export function shouldRetryTransportAbort({
  raw,
  retryUsed,
  visibleReplyPosted,
  channelDeliveryObserved,
  guardAbortMessage,
  signalAborted,
} = {}) {
  if (!isTransportAbortError(raw)) return false;
  // One retry, ever — a provider that aborts twice is unhealthy; surface it.
  if (retryUsed) return false;
  // A deliberate abort (user cancel, durable-worker stop, cost guard) must
  // never be "fixed" by silently re-running the turn.
  if (signalAborted) return false;
  if (guardAbortMessage) return false;
  // Double-delivery guard: only retry when NOTHING visible reached the thread
  // (see module docblock for the buffered-dispatcher contract this relies on).
  if (visibleReplyPosted) return false;
  if (channelDeliveryObserved) return false;
  return true;
}
