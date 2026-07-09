const DEFAULT_LIMITS = {
  enabled: true,
  maxPromptTokensAtStart: 140_000,
  maxInputTokensPerRun: 1_500_000,
  maxModelCallsPerRun: 24,
  maxToolCallsPerRun: 36,
  maxRiskyToolCallsPerRun: 10,
  maxRepeatedToolCallsPerRun: 3,
  maxSessionHistoryCallsPerRun: 1,
  tinyOutputTokens: 20,
  tinyOutputMinInputTokens: 30_000,
  maxTinyOutputStreak: 3,
  maxWallClockMs: 30 * 60 * 1000,
  cooldownMs: 5 * 60 * 1000,
};

function boolFromEnv(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return !/^(0|false|no|off)$/i.test(String(value).trim());
}

function intFromEnv(value, fallback, min = 1) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < min) return fallback;
  return n;
}

export function readCostGuardLimits(env = process.env) {
  return {
    enabled: boolFromEnv(env.MC_CHAT_COST_GUARD_ENABLED, DEFAULT_LIMITS.enabled),
    maxPromptTokensAtStart: intFromEnv(
      env.MC_CHAT_MAX_PROMPT_TOKENS_AT_START,
      DEFAULT_LIMITS.maxPromptTokensAtStart,
    ),
    maxInputTokensPerRun: intFromEnv(
      env.MC_CHAT_MAX_INPUT_TOKENS_PER_RUN,
      DEFAULT_LIMITS.maxInputTokensPerRun,
    ),
    maxModelCallsPerRun: intFromEnv(
      env.MC_CHAT_MAX_MODEL_CALLS_PER_RUN,
      DEFAULT_LIMITS.maxModelCallsPerRun,
    ),
    maxToolCallsPerRun: intFromEnv(
      env.MC_CHAT_MAX_TOOL_CALLS_PER_RUN,
      DEFAULT_LIMITS.maxToolCallsPerRun,
    ),
    maxRiskyToolCallsPerRun: intFromEnv(
      env.MC_CHAT_MAX_RISKY_TOOL_CALLS_PER_RUN,
      DEFAULT_LIMITS.maxRiskyToolCallsPerRun,
    ),
    maxRepeatedToolCallsPerRun: intFromEnv(
      env.MC_CHAT_MAX_REPEATED_TOOL_CALLS_PER_RUN,
      DEFAULT_LIMITS.maxRepeatedToolCallsPerRun,
    ),
    maxSessionHistoryCallsPerRun: intFromEnv(
      env.MC_CHAT_MAX_SESSION_HISTORY_CALLS_PER_RUN,
      DEFAULT_LIMITS.maxSessionHistoryCallsPerRun,
    ),
    tinyOutputTokens: intFromEnv(
      env.MC_CHAT_TINY_OUTPUT_TOKENS,
      DEFAULT_LIMITS.tinyOutputTokens,
      0,
    ),
    tinyOutputMinInputTokens: intFromEnv(
      env.MC_CHAT_TINY_OUTPUT_MIN_INPUT_TOKENS,
      DEFAULT_LIMITS.tinyOutputMinInputTokens,
    ),
    maxTinyOutputStreak: intFromEnv(
      env.MC_CHAT_MAX_TINY_OUTPUT_STREAK,
      DEFAULT_LIMITS.maxTinyOutputStreak,
    ),
    maxWallClockMs: intFromEnv(env.MC_CHAT_MAX_TURN_MS, DEFAULT_LIMITS.maxWallClockMs),
    cooldownMs: intFromEnv(env.MC_CHAT_COST_GUARD_COOLDOWN_MS, DEFAULT_LIMITS.cooldownMs),
  };
}

function textFromContent(content, depth = 0) {
  if (depth > 4 || content === undefined || content === null) return "";
  if (typeof content === "string") return content;
  if (typeof content === "number" || typeof content === "boolean") return String(content);
  if (Array.isArray(content)) return content.map((item) => textFromContent(item, depth + 1)).join("\n");
  if (typeof content !== "object") return "";

  const parts = [];
  for (const key of ["text", "content", "body", "message", "result", "output"]) {
    const value = content[key];
    if (value !== undefined && value !== null) parts.push(textFromContent(value, depth + 1));
  }
  return parts.filter(Boolean).join("\n");
}

export function estimateTokensForText(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

export function estimateBeforeAgentRunTokens(event) {
  let chars = 0;
  chars += typeof event?.systemPrompt === "string" ? event.systemPrompt.length : 0;
  chars += typeof event?.prompt === "string" ? event.prompt.length : 0;
  const messages = Array.isArray(event?.messages) ? event.messages : [];
  for (const message of messages) {
    chars += textFromContent(message).length;
  }
  return Math.ceil(chars / 4);
}

function contextKey(event, ctx) {
  return (
    ctx?.runId ||
    event?.runId ||
    ctx?.sessionKey ||
    event?.sessionKey ||
    event?.sessionId ||
    ctx?.jobId ||
    event?.callId ||
    "unknown"
  );
}

function sessionKey(event, ctx) {
  return ctx?.sessionKey || event?.sessionKey || event?.sessionId || ctx?.jobId || null;
}

function nowMs() {
  return Date.now();
}

function newState(key, ctx, startedAt = nowMs()) {
  return {
    key,
    sessionKey: ctx?.sessionKey || null,
    jobId: ctx?.jobId || null,
    startedAt,
    modelCalls: 0,
    toolCalls: 0,
    riskyToolCalls: 0,
    sessionHistoryCalls: 0,
    toolFingerprints: new Map(),
    inputTokens: 0,
    outputTokens: 0,
    tinyOutputStreak: 0,
    blocked: false,
    blockReason: null,
    abortController: null,
  };
}

function toolNameFromEvent(event) {
  return String(event?.name || event?.toolName || event?.tool?.name || event?.type || "").toLowerCase();
}

function toolInputFromEvent(event) {
  const input = event?.input || event?.arguments || event?.args || event?.params || {};
  return input && typeof input === "object" ? input : {};
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toolTarget(input) {
  return normalizeWhitespace(
    input.command ||
      input.path ||
      input.file_path ||
      input.url ||
      input.query ||
      input.pattern ||
      input.sessionKey ||
      input.sessionId ||
      "",
  );
}

function toolFingerprint(event) {
  const name = toolNameFromEvent(event);
  const input = toolInputFromEvent(event);
  return `${name}:${toolTarget(input).slice(0, 240)}`;
}

function riskyToolReason(event) {
  const name = toolNameFromEvent(event);
  const input = toolInputFromEvent(event);
  const command = normalizeWhitespace(input.command);
  const path = normalizeWhitespace(input.path || input.file_path);

  if (name === "sessions_history") return "lecturas de historial de sesión";
  if ((name === "read" || name === "file_read") && /\/\.openclaw\/.*\/sessions\//i.test(path)) {
    return "lecturas directas de transcripts de sesión";
  }
  if (name !== "exec" && name !== "bash" && name !== "shell") return null;

  if (/sessions_history|\/sessions\/|\.trajectory\.jsonl/i.test(command)) {
    return "lecturas de historial de sesión";
  }
  if (/\b(cat|tail|head)\b[^;\n]*(\*\.json|\*\.md|\*\.jsonl)/i.test(command)) {
    return "dumps masivos de archivos";
  }
  if (/\bfor\s+\w+\s+in\s+[^\n]*(\*\.json|\*\.md|\*\.jsonl)[^\n]*\bcat\b/i.test(command)) {
    return "dumps masivos de archivos";
  }
  if (/\b(find|grep|rg)\b[^;\n]*(\/root\/\.openclaw|\/app|~\/\.openclaw)/i.test(command)) {
    return "búsquedas amplias en el filesystem";
  }
  if (/\bgrep\s+-r/i.test(command)) return "búsquedas recursivas amplias";
  if (/\bfind\s+\/root\b/i.test(command)) return "búsquedas amplias en /root";

  return null;
}

function userMessage(reason) {
  return [
    "⚠️ **Ejecución detenida por presupuesto de seguridad**",
    reason,
    "He parado esta ejecución antes de que siguiera enviando contexto al modelo. Abre un hilo nuevo o reduce el alcance si necesitas continuar.",
  ].join("\n");
}

export function createCostGuard({ env = process.env, clock = nowMs } = {}) {
  const runs = new Map();
  const sessionCooldowns = new Map();

  function limits() {
    return readCostGuardLimits(env);
  }

  function getOrCreate(event, ctx, key = contextKey(event, ctx)) {
    const existing = runs.get(key);
    if (existing) return existing;
    const activeSession = sessionKey(event, ctx);
    if (activeSession) {
      const activeState = [...runs.values()].find((state) => state.sessionKey === activeSession);
      if (activeState) return activeState;
    }
    const state = newState(key, ctx, clock());
    runs.set(key, state);
    return state;
  }

  function cooldownFor(session) {
    if (!session) return null;
    const entry = sessionCooldowns.get(session);
    if (!entry) return null;
    if (entry.untilMs <= clock()) {
      sessionCooldowns.delete(session);
      return null;
    }
    return entry;
  }

  function markBlocked(state, reason, currentLimits = limits()) {
    if (!state.blocked) {
      state.blocked = true;
      state.blockReason = reason;
      if (state.sessionKey || state.jobId) {
        sessionCooldowns.set(state.sessionKey || state.jobId, {
          untilMs: clock() + currentLimits.cooldownMs,
          reason,
        });
      }
    }
    try {
      state.abortController?.abort?.(new Error(reason));
    } catch {
      try {
        state.abortController?.abort?.();
      } catch {}
    }
    return reason;
  }

  function registerActiveTurn({ runId, sessionKey: activeSessionKey, abortController, startedAt }) {
    const key = runId || activeSessionKey || `turn:${clock()}`;
    const state = getOrCreate({ runId, sessionKey: activeSessionKey }, { sessionKey: activeSessionKey }, key);
    state.sessionKey = activeSessionKey || state.sessionKey;
    state.startedAt = startedAt ?? state.startedAt;
    state.abortController = abortController || null;
    return state;
  }

  function clearActiveTurn(runId, activeSessionKey) {
    if (runId) runs.delete(runId);
    if (activeSessionKey) {
      for (const [key, state] of runs.entries()) {
        if (state.sessionKey === activeSessionKey && !state.blocked) runs.delete(key);
      }
    }
  }

  function abortRun(runId, activeSessionKey, reason) {
    const state =
      (runId && runs.get(runId)) ||
      [...runs.values()].find((s) => s.sessionKey === activeSessionKey) ||
      registerActiveTurn({ runId, sessionKey: activeSessionKey });
    markBlocked(state, reason);
    return userMessage(reason);
  }

  function beforeAgentRun(event, ctx = {}) {
    const currentLimits = limits();
    if (!currentLimits.enabled) return { outcome: "pass" };

    const session = sessionKey(event, ctx);
    const cooldown = cooldownFor(session);
    if (cooldown) {
      return {
        outcome: "block",
        category: "cost_guard",
        reason: cooldown.reason,
        message: userMessage(cooldown.reason),
      };
    }

    const estimatedTokens = estimateBeforeAgentRunTokens(event);
    if (estimatedTokens > currentLimits.maxPromptTokensAtStart) {
      const reason =
        `El prompt preparado ya pesa ~${estimatedTokens.toLocaleString("en-US")} tokens, por encima del límite ` +
        `${currentLimits.maxPromptTokensAtStart.toLocaleString("en-US")}.`;
      if (session) {
        sessionCooldowns.set(session, { untilMs: clock() + currentLimits.cooldownMs, reason });
      }
      return {
        outcome: "block",
        category: "cost_guard",
        reason,
        message: userMessage(reason),
      };
    }

    return { outcome: "pass" };
  }

  function modelCallStarted(event, ctx = {}) {
    const currentLimits = limits();
    if (!currentLimits.enabled) return;
    const state = getOrCreate(event, ctx);
    state.modelCalls += 1;
    if (state.modelCalls > currentLimits.maxModelCallsPerRun) {
      markBlocked(
        state,
        `La ejecución intentó ${state.modelCalls} llamadas al modelo en un mismo run.`,
        currentLimits,
      );
    }
    if (clock() - state.startedAt > currentLimits.maxWallClockMs) {
      markBlocked(state, "La ejecución superó el tiempo máximo permitido.", currentLimits);
    }
  }

  function llmOutput(event, ctx = {}) {
    const currentLimits = limits();
    if (!currentLimits.enabled) return;
    const state = getOrCreate(event, ctx);
    const usage = event?.usage && typeof event.usage === "object" ? event.usage : {};
    const input = Number(usage.input || usage.promptTokens || 0) || 0;
    const output = Number(usage.output || usage.completionTokens || 0) || 0;

    state.inputTokens += input;
    state.outputTokens += output;

    if (input >= currentLimits.tinyOutputMinInputTokens && output <= currentLimits.tinyOutputTokens) {
      state.tinyOutputStreak += 1;
    } else if (output > currentLimits.tinyOutputTokens) {
      state.tinyOutputStreak = 0;
    }

    if (state.inputTokens > currentLimits.maxInputTokensPerRun) {
      markBlocked(
        state,
        `La ejecución acumuló ${state.inputTokens.toLocaleString("en-US")} tokens de entrada en un solo run.`,
        currentLimits,
      );
    }
    if (state.tinyOutputStreak >= currentLimits.maxTinyOutputStreak) {
      markBlocked(
        state,
        `El modelo devolvió ${state.tinyOutputStreak} respuestas casi vacías seguidas con prompts grandes.`,
        currentLimits,
      );
    }
  }

  function beforeToolCall(event, ctx = {}) {
    const currentLimits = limits();
    if (!currentLimits.enabled) return undefined;
    const state = getOrCreate(event, ctx);

    if (state.blocked) {
      return { block: true, blockReason: state.blockReason || "Cost guard blocked this run" };
    }

    state.toolCalls += 1;

    const fingerprint = toolFingerprint(event);
    if (fingerprint !== ":") {
      const seen = (state.toolFingerprints.get(fingerprint) || 0) + 1;
      state.toolFingerprints.set(fingerprint, seen);
      if (seen > currentLimits.maxRepeatedToolCallsPerRun) {
        const reason = markBlocked(
          state,
          `La ejecución repitió ${seen} veces la misma llamada de herramienta (${fingerprint.slice(0, 120)}).`,
          currentLimits,
        );
        return { block: true, blockReason: reason };
      }
    }

    const riskReason = riskyToolReason(event);
    if (riskReason) {
      state.riskyToolCalls += 1;
      if (riskReason === "lecturas de historial de sesión") {
        state.sessionHistoryCalls += 1;
        if (state.sessionHistoryCalls > currentLimits.maxSessionHistoryCallsPerRun) {
          const reason = markBlocked(
            state,
            `La ejecución intentó leer historial de sesión ${state.sessionHistoryCalls} veces. Eso suele duplicar contexto caro.`,
            currentLimits,
          );
          return { block: true, blockReason: reason };
        }
      }
      if (state.riskyToolCalls > currentLimits.maxRiskyToolCallsPerRun) {
        const reason = markBlocked(
          state,
          `La ejecución acumuló ${state.riskyToolCalls} herramientas de riesgo (${riskReason}).`,
          currentLimits,
        );
        return { block: true, blockReason: reason };
      }
    }

    if (state.toolCalls > currentLimits.maxToolCallsPerRun) {
      const reason = markBlocked(
        state,
        `La ejecución intentó ${state.toolCalls} llamadas a herramientas en un mismo run.`,
        currentLimits,
      );
      return { block: true, blockReason: reason };
    }
    return undefined;
  }

  function agentEnd(_event, ctx = {}) {
    if (ctx?.runId) runs.delete(ctx.runId);
  }

  function abortMessageFor(runId, activeSessionKey) {
    const bySession = activeSessionKey
      ? [...runs.values()].find((s) => s.sessionKey === activeSessionKey && s.blocked)
      : null;
    const state = bySession || (runId && runs.get(runId)) || [...runs.values()].find((s) => s.sessionKey === activeSessionKey);
    return state?.blocked && state.blockReason ? userMessage(state.blockReason) : null;
  }

  return {
    limits,
    registerActiveTurn,
    clearActiveTurn,
    abortRun,
    beforeAgentRun,
    beforeToolCall,
    modelCallStarted,
    llmOutput,
    agentEnd,
    abortMessageFor,
    _state: { runs, sessionCooldowns },
  };
}

export const mcChatCostGuard = createCostGuard();
