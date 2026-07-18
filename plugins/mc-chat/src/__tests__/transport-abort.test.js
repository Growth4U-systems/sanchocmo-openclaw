import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isTransportAbortError,
  shouldRetryTransportAbort,
  TRANSPORT_ABORT_RETRY_DELAY_MS,
} from "../transport-abort.js";
import { classifyAndRewriteError } from "../error-rewriter.js";

// Raw literal surfaced by the runtime when GLM/Fireworks drops the streaming
// request mid-turn (~71s), observed on staging 2026-07-18 (SAN-479).
const FIXTURE_TRANSPORT_ABORT = "Request was aborted.";

const FIXTURE_TRANSPORT_ABORT_CHAIN =
  "fireworks/accounts/fireworks/models/glm-5p2: Request was aborted. (reason=none)";

/** Baseline: every gate open → retry allowed. */
function retryableOpts(overrides = {}) {
  return {
    raw: FIXTURE_TRANSPORT_ABORT,
    retryUsed: false,
    visibleReplyPosted: false,
    channelDeliveryObserved: false,
    guardAbortMessage: null,
    signalAborted: false,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// isTransportAbortError
// -----------------------------------------------------------------------------

test("isTransportAbortError: matches the bare runtime literal", () => {
  assert.equal(isTransportAbortError(FIXTURE_TRANSPORT_ABORT), true);
});

test("isTransportAbortError: matches inside a provider chain, case-insensitive", () => {
  assert.equal(isTransportAbortError(FIXTURE_TRANSPORT_ABORT_CHAIN), true);
  assert.equal(isTransportAbortError("REQUEST WAS ABORTED"), true);
});

test("isTransportAbortError: ignores other errors and non-strings", () => {
  assert.equal(isTransportAbortError("rate limit exceeded"), false);
  assert.equal(isTransportAbortError("La ejecución superó el tiempo máximo permitido."), false);
  assert.equal(isTransportAbortError(null), false);
  assert.equal(isTransportAbortError(undefined), false);
  assert.equal(isTransportAbortError(42), false);
});

// -----------------------------------------------------------------------------
// shouldRetryTransportAbort — the double-delivery / deliberate-abort gates
// -----------------------------------------------------------------------------

test("shouldRetry: retries a clean first transport abort", () => {
  assert.equal(shouldRetryTransportAbort(retryableOpts()), true);
  assert.equal(
    shouldRetryTransportAbort(retryableOpts({ raw: FIXTURE_TRANSPORT_ABORT_CHAIN })),
    true,
  );
});

test("shouldRetry: never for a non-transport-abort error", () => {
  assert.equal(
    shouldRetryTransportAbort(retryableOpts({ raw: "ECONNREFUSED" })),
    false,
  );
});

test("shouldRetry: only once — retryUsed blocks a second retry", () => {
  assert.equal(shouldRetryTransportAbort(retryableOpts({ retryUsed: true })), false);
});

test("shouldRetry: NOT when partial content already reached the thread (double-delivery guard)", () => {
  assert.equal(
    shouldRetryTransportAbort(retryableOpts({ visibleReplyPosted: true })),
    false,
  );
  assert.equal(
    shouldRetryTransportAbort(retryableOpts({ channelDeliveryObserved: true })),
    false,
  );
});

test("shouldRetry: NOT when the cost guard aborted on purpose", () => {
  assert.equal(
    shouldRetryTransportAbort(
      retryableOpts({ guardAbortMessage: "La ejecución superó el tiempo máximo permitido." }),
    ),
    false,
  );
});

test("shouldRetry: NOT when the turn's AbortController fired (cancel / durable stop)", () => {
  assert.equal(shouldRetryTransportAbort(retryableOpts({ signalAborted: true })), false);
});

test("shouldRetry: safe on empty input", () => {
  assert.equal(shouldRetryTransportAbort(), false);
  assert.equal(shouldRetryTransportAbort({}), false);
});

test("retry delay is ~2s as agreed", () => {
  assert.equal(TRANSPORT_ABORT_RETRY_DELAY_MS, 2_000);
});

// -----------------------------------------------------------------------------
// error-rewriter transport_abort classifier — what the user sees when the
// retry ALSO fails (the first, retried abort surfaces nothing).
// -----------------------------------------------------------------------------

test("classifier: rewrites the raw literal into the human Spanish message", () => {
  const out = classifyAndRewriteError(FIXTURE_TRANSPORT_ABORT);
  assert.equal(out.errorDetail.category, "transport_abort");
  assert.ok(out.text.startsWith("⚠️ **Se cortó la conexión con el modelo**"));
  assert.ok(out.text.includes("volvé a enviar el mensaje"));
  assert.ok(!out.text.includes("Request was aborted"));
  assert.equal(out.errorDetail.raw, FIXTURE_TRANSPORT_ABORT);
});

test("classifier: provider chain keeps model context but shows the human message", () => {
  const out = classifyAndRewriteError(FIXTURE_TRANSPORT_ABORT_CHAIN);
  assert.equal(out.errorDetail.category, "transport_abort");
  assert.equal(out.errorDetail.provider, "fireworks");
  assert.ok(out.text.startsWith("⚠️ **Se cortó la conexión con el modelo**"));
});

test("classifier: earlier categories still win when both markers appear", () => {
  const out = classifyAndRewriteError(
    "rate limit exceeded — Request was aborted.",
  );
  assert.equal(out.errorDetail.category, "rate_limit");
});
