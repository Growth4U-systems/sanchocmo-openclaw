const activeDispatches = new Map();

export function isStopCommand(text) {
  return typeof text === "string" && text.trim().toLowerCase() === "/stop";
}

export function hasActiveSessionDispatch(sessionKey) {
  return activeDispatches.has(sessionKey);
}

export function enqueueSessionDispatch(sessionKey, runner) {
  const key = typeof sessionKey === "string" && sessionKey.trim() ? sessionKey : "default";
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
      sessionKey: key,
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
