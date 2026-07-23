import { createCallbackOutbox } from "../../../docker/runtimes/callback-outbox.mjs";

const RUNTIME_ID = "openclaw";
const TERMINAL_CALLBACK_ERROR_CODES = new Set([
  "terminal_callback_expired",
  "terminal_callback_persist_failed",
  "terminal_callback_record_invalid",
  "terminal_callback_stopped",
]);

export class TerminalCallbackDeliveryError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "TerminalCallbackDeliveryError";
    this.code = code;
  }
}

export function isTerminalCallbackDeliveryError(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      TERMINAL_CALLBACK_ERROR_CODES.has(value.code),
  );
}

/**
 * OpenClaw's durable terminal callback transport.
 *
 * enqueueTerminal() returns only after the callback record has been atomically
 * persisted. Its `delivery` promise settles when the shared outbox reports a
 * 2xx response (or rejects if the record expires/the transport is stopped).
 * Keeping persistence and acknowledgement separate lets callers mark the
 * response as locally owned immediately while still waiting for Mission
 * Control before completing the durable parent dispatch.
 */
export function createOpenClawCallbackDelivery(options = {}) {
  const waiters = new Map();
  const externalLogger =
    typeof options.logger === "function" ? options.logger : () => {};
  const { logger: _logger, ...outboxOptions } = options;

  function settle(callbackId, outcome) {
    if (typeof callbackId !== "string") return;
    const pending = waiters.get(callbackId);
    if (!pending) return;
    waiters.delete(callbackId);
    for (const waiter of pending) {
      if (outcome.ok) {
        waiter.resolve({ callbackId, status: outcome.status });
      } else {
        waiter.reject(outcome.error);
      }
    }
  }

  const outbox = createCallbackOutbox({
    ...outboxOptions,
    runtimeId: RUNTIME_ID,
    logger(event) {
      if (event?.event === "delivered") {
        settle(event.callbackId, {
          ok: true,
          status: event.status,
        });
      } else if (event?.event === "expired") {
        settle(event.callbackId, {
          ok: false,
          error: new TerminalCallbackDeliveryError(
            "terminal_callback_expired",
            "Durable terminal callback expired before acknowledgement",
          ),
        });
      } else if (event?.event === "pruned_invalid") {
        settle(event.callbackId, {
          ok: false,
          error: new TerminalCallbackDeliveryError(
            "terminal_callback_record_invalid",
            "Durable terminal callback record became unreadable",
          ),
        });
      }
      externalLogger(event);
    },
  });

  function waitForDelivery(callbackId) {
    let resolve;
    let reject;
    const delivery = new Promise((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    const pending = waiters.get(callbackId) || new Set();
    pending.add({ resolve, reject });
    waiters.set(callbackId, pending);
    return delivery;
  }

  function enqueueTerminal(input) {
    let queued;
    try {
      // The shared outbox performs its atomic write + fsync synchronously
      // before returning or scheduling the first network attempt.
      queued = outbox.enqueueTerminal(input);
    } catch (cause) {
      throw new TerminalCallbackDeliveryError(
        "terminal_callback_persist_failed",
        "Durable terminal callback could not be persisted",
        { cause },
      );
    }
    return {
      ...queued,
      delivery: waitForDelivery(queued.callbackId),
    };
  }

  function start() {
    outbox.start();
  }

  function stop() {
    outbox.stop();
    const error = new TerminalCallbackDeliveryError(
      "terminal_callback_stopped",
      "Durable terminal callback delivery stopped before acknowledgement",
    );
    for (const callbackId of [...waiters.keys()]) {
      settle(callbackId, { ok: false, error });
    }
  }

  return {
    directory: outbox.directory,
    enqueueTerminal,
    pendingCount: outbox.pendingCount,
    start,
    stop,
  };
}

let openClawCallbackDelivery;

export function initializeOpenClawCallbackDelivery(options = {}) {
  if (!openClawCallbackDelivery) {
    openClawCallbackDelivery = createOpenClawCallbackDelivery(options);
  }
  openClawCallbackDelivery.start();
  return openClawCallbackDelivery;
}

export function enqueueOpenClawTerminalCallback(input) {
  return initializeOpenClawCallbackDelivery().enqueueTerminal(input);
}
