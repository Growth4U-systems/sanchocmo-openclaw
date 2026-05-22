/**
 * mc-chat error rewriter
 *
 * Classifies opaque runtime error strings (rate limits, missing auth, watchdog
 * aborts, etc.) and rewrites them into a clear Spanish summary while preserving
 * the original payload in a structured `errorDetail` for the UI modal.
 *
 * Provider-agnostic. Pure module — no I/O, no state, no logger.
 */

// Order matters: first match wins. `rate_limit` deliberately comes before
// `auth` so a chained "rate_limit | auth" failure is attributed to the root.
const CLASSIFIERS = [
  {
    category: "rate_limit",
    regex: /rate.?limit|usage limit|quota.*exceed(ed)?|\b429\b/i,
    header: "Rate limit alcanzado",
    hint: "Reintentá cuando se libere la cuota.",
  },
  {
    category: "context_overflow",
    regex: /context.{0,15}length|maximum.{0,15}token|too many token/i,
    header: "Contexto demasiado largo",
    hint: "Reducí el prompt o reiniciá el thread.",
  },
  {
    category: "model_unavailable",
    regex: /model.{0,10}(not found|unavailable|overloaded)|\b503\b/i,
    header: "Modelo no disponible",
    hint: "Intentá nuevamente o cambiá de modelo.",
  },
  {
    category: "auth",
    regex: /no api key|invalid api key|missing api key|\b401\b|unauthor(ised|ized)/i,
    header: "Credenciales no configuradas",
    hint: "Revisá el auth-profile del agente.",
  },
  {
    category: "network",
    regex: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|fetch failed|network.*(error|down)/i,
    header: "Error de red",
    hint: "Reintentá. Verificá conectividad del runtime.",
  },
  {
    // Exact bot-side abort placeholder emitted by the watchdog.
    // Emojis matter — keep regex literal, not /i flag-only.
    category: "watchdog_abort",
    regex: /^⚠️ 🛠️ .* \(agent\) failed$/,
    header: "Sesión sin progreso (timeout)",
    hint: "Reintentá. Si persiste, revisá rate limit.",
  },
];

function extractProvider(text) {
  // Common shapes:
  //   provider "openai-codex"
  //   from=codex/gpt-5.5    → openai-codex
  //   anthropic/claude-...  → anthropic
  const explicit = text.match(/provider\s+["']?([a-zA-Z0-9_-]+)["']?/i);
  if (explicit) return explicit[1];

  if (/\bcodex\/[a-zA-Z0-9.\-]+/i.test(text)) return "openai-codex";
  if (/\banthropic\/[a-zA-Z0-9.\-]+/i.test(text)) return "anthropic";
  if (/\bopenai\/[a-zA-Z0-9.\-]+/i.test(text)) return "openai";
  if (/\bbedrock\/[a-zA-Z0-9.\-]+/i.test(text)) return "bedrock";
  return undefined;
}

function extractAccount(text) {
  const m = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0] : undefined;
}

function extractModel(text) {
  const m = text.match(/\b(?:codex|openai|anthropic|bedrock)\/[a-zA-Z0-9.\-]+/);
  return m ? m[0] : undefined;
}

function buildContextLine(fields) {
  const parts = [];
  if (fields.provider) parts.push(`provider ${fields.provider}`);
  if (fields.account) parts.push(`cuenta ${fields.account}`);
  if (fields.model) parts.push(`modelo ${fields.model}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function buildText(header, contextLine, hint) {
  const lines = [`⚠️ **${header}**`];
  if (contextLine) lines.push(contextLine);
  if (hint) lines.push(hint);
  return lines.join("\n");
}

/**
 * Classify an upstream error string and produce a user-facing rewrite plus a
 * structured detail. If no classifier matches, returns the input unchanged with
 * `errorDetail: null`.
 *
 * @param {string|null|undefined} rawText
 * @returns {{ text: string, errorDetail: object|null }}
 */
export function classifyAndRewriteError(rawText) {
  if (rawText === null || rawText === undefined || rawText === "") {
    return { text: rawText ?? "", errorDetail: null };
  }
  if (typeof rawText !== "string") {
    return { text: String(rawText), errorDetail: null };
  }

  for (const c of CLASSIFIERS) {
    if (c.regex.test(rawText)) {
      const provider = extractProvider(rawText);
      const account = extractAccount(rawText);
      const model = extractModel(rawText);
      const contextLine = buildContextLine({ provider, account, model });
      const errorDetail = {
        category: c.category,
        raw: rawText,
        classifiedAt: Date.now(),
      };
      if (provider) errorDetail.provider = provider;
      if (account) errorDetail.account = account;
      if (model) errorDetail.model = model;
      return {
        text: buildText(c.header, contextLine, c.hint),
        errorDetail,
      };
    }
  }
  return { text: rawText, errorDetail: null };
}

/**
 * Merge a fresh detail with a prior detail from the same agent. Only marks
 * `correlatedWith` when categories differ (same category is not new info).
 * The merged `raw` keeps both payloads for the modal.
 *
 * @param {object} detail
 * @param {object} prior
 * @returns {object}
 */
export function mergeWithPriorCategory(detail, prior) {
  if (!prior || prior.category === detail.category) {
    return detail;
  }
  return {
    ...detail,
    correlatedWith: prior.category,
    raw: `${detail.raw}\n\n--- Última falla previa (${prior.category}) ---\n${prior.raw}`,
  };
}
