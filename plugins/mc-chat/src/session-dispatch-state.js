const activeDispatches = new Map();

export function isStopCommand(text) {
  return typeof text === "string" && text.trim().toLowerCase() === "/stop";
}

export function semanticSessionFamilyKey(sessionKey) {
  const key = typeof sessionKey === "string" && sessionKey.trim() ? sessionKey.trim() : "default";
  const match = key.match(/^(agent:[^:]+:model:[^:]+:channel:mc-chat:[^:]+:)(.+)$/);
  if (!match) return key;
  const prefix = match[1];
  const thread = match[2];

  // Thread openers often suffix operational flows with timestamps or verify ids
  // (`discovery-new-178...`, `discovery-new-verify...`). They are the same
  // expensive specialist lane and should not run in parallel.
  const normalizedThread = thread.replace(/^(discovery-new)(?:-(?:verify)?[a-z0-9]{4,}|-\d{10,})$/i, "$1");
  return `${prefix}${normalizedThread}`;
}

function dispatchKeyFor(sessionKey, opts = {}) {
  if (typeof opts.familyKey === "string" && opts.familyKey.trim()) return opts.familyKey.trim();
  return typeof sessionKey === "string" && sessionKey.trim() ? sessionKey.trim() : "default";
}

export function hasActiveSessionDispatch(sessionKey, opts = {}) {
  return activeDispatches.has(dispatchKeyFor(sessionKey, opts));
}

/**
 * Acquire one semantic session lane without creating a process-local backlog.
 * The lane is installed before invoking the runner, so two same-family turns
 * cannot both cross the model-dispatch boundary in one event-loop turn.
 */
export function tryStartSessionDispatch(sessionKey, runner, opts = {}) {
  const key = dispatchKeyFor(sessionKey, opts);
  if (activeDispatches.has(key)) {
    return { started: false, dispatchKey: key };
  }
  const actualSessionKey = typeof sessionKey === "string" && sessionKey.trim()
    ? sessionKey.trim()
    : "default";
  const startedAt = Date.now();
  const entry = { promise: null, enqueuedAt: startedAt };
  activeDispatches.set(key, entry);
  let promise;
  try {
    promise = Promise.resolve(runner({
      sessionKey: actualSessionKey,
      dispatchKey: key,
      queued: false,
      enqueuedAt: startedAt,
      waitedMs: 0,
    }));
  } catch (error) {
    activeDispatches.delete(key);
    throw error;
  }
  entry.promise = promise;
  promise
    .finally(() => {
      if (activeDispatches.get(key) === entry) activeDispatches.delete(key);
    })
    .catch(() => {});
  return { started: true, dispatchKey: key, promise };
}

export function enqueueSessionDispatch(sessionKey, runner, opts = {}) {
  const key = dispatchKeyFor(sessionKey, opts);
  const actualSessionKey = typeof sessionKey === "string" && sessionKey.trim() ? sessionKey.trim() : "default";
  const previous = activeDispatches.get(key);
  const previousPromise = previous?.promise;
  const queued = Boolean(previousPromise);
  const enqueuedAt = Date.now();

  let entry;
  const promise = (async () => {
    if (previousPromise) {
      try {
        await previousPromise;
      } catch {
        // The next user turn should not be skipped because the previous one failed.
      }
    }
    return runner({
      sessionKey: actualSessionKey,
      dispatchKey: key,
      queued,
      enqueuedAt,
      waitedMs: Date.now() - enqueuedAt,
    });
  })();

  entry = { promise, enqueuedAt };
  activeDispatches.set(key, entry);
  promise
    .finally(() => {
      if (activeDispatches.get(key) === entry) activeDispatches.delete(key);
    })
    .catch(() => {});

  return { queued, promise };
}

export function resetSessionDispatchStateForTest() {
  activeDispatches.clear();
}
