/**
 * Runtime-neutral error rewriter.
 *
 * Classifies opaque runtime/provider error strings and rewrites them into clear
 * Spanish summaries while preserving the original payload in structured
 * `errorDetail` metadata for the UI modal.
 */

// Order matters: first match wins.
const CLASSIFIERS = [
  {
    category: "insufficient_quota",
    regex: /\binsufficient_quota\b|you (?:have )?exceeded your current quota|you have run out of credits/i,
    header: "API key OpenAI sin cuota",
    hint: "El proyecto OpenAI ligado al `OPENAI_API_KEY` se quedó sin saldo. Recargá billing o reemplazá la key.",
  },
  {
    category: "anthropic_billing",
    regex: /out of extra usage|claude\.ai\/settings\/usage|api provider returned a billing error|run out of credits or has an insufficient balance/i,
    header: "Saldo del proveedor agotado",
    hint: "Si es la suscripción de Claude, recargá *extra usage* en claude.ai/settings/usage; si es API key, recargá billing.",
  },
  {
    category: "rate_limit",
    regex: /\b(?:rate_limit|usage_limit)\b|\b429\b|you(?:'ve| have) reached your .{0,80}usage limit|codex subscription usage limit|rate limit exceeded/i,
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
    category: "invalid_thinking_signature",
    regex: /invalid signature in thinking block|thinkingSignature|messages\.\d+\.content\.\d+/i,
    header: "Historial interno corrupto",
    hint: "Sancho detectó bloques internos de razonamiento persistidos. El runtime los limpia antes de reintentar para conservar la memoria visible sin romper la request.",
  },
  {
    category: "model_unavailable",
    regex: /model.{0,10}(not found|unavailable|overloaded)|\b503\b/i,
    header: "Modelo no disponible",
    hint: "Intentá nuevamente o cambiá de modelo.",
  },
  {
    category: "session_concurrency",
    regex: /EmbeddedAttemptSessionTakeoverError|session file changed while embedded prompt lock was released/i,
    header: "Turno concurrente en el mismo hilo",
    hint: "Llegó otro mensaje mientras el runtime seguía escribiendo la misma sesión. El gateway serializa estos turnos para evitar que se pisen; reintentá si este turno quedó incompleto.",
  },
  {
    category: "cost_guard",
    regex: /presupuesto de seguridad|cost guard|demasiadas llamadas al modelo|demasiadas llamadas a herramientas|superó el tiempo máximo|respuestas casi vacías|tokens de entrada en un solo run/i,
    header: "No se completó la ejecución",
    hint: "El runtime detuvo este turno. Puedes continuar desde este mismo chat.",
  },
  {
    category: "auth",
    regex: /model login expired|re-auth with .*models auth login|auth login expired/i,
    header: "Sesión Codex caducada",
    hint: "El motor necesita reconectar la cuenta Codex. Reautenticá el provider desde Runtime/Motor y reintentá.",
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
    category: "watchdog_abort",
    regex: /^⚠️ 🛠️ .* \(agent\) failed$/,
    header: "Sesión sin progreso (timeout)",
    hint: "Reintentá. Si persiste, revisá rate limit.",
  },
];

function extractProvider(text) {
  const cliFlag = text.match(/--provider\s+([a-zA-Z0-9_-]+)/i);
  if (cliFlag) return cliFlag[1];

  const explicit = text.match(/provider\s+(?:["']([a-zA-Z0-9_-]+)["']|[:=]\s*["']?([a-zA-Z0-9_-]+)["']?)/i);
  if (explicit) return explicit[1] || explicit[2];

  if (/\bopenai-codex\b/i.test(text)) return "openai-codex";
  if (/\bcodex\/[a-zA-Z0-9.\-]+/i.test(text)) return "openai-codex";
  if (/\banthropic\/[a-zA-Z0-9.\-]+/i.test(text)) return "anthropic";
  if (/\bopenai\/[a-zA-Z0-9.\-]+/i.test(text)) return "openai";
  if (/\bfireworks\/[a-zA-Z0-9./\-]+/i.test(text)) return "fireworks";
  if (/\bbedrock\/[a-zA-Z0-9.\-]+/i.test(text)) return "bedrock";
  return undefined;
}

function extractAccount(text) {
  const m = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0] : undefined;
}

function extractModel(text) {
  const m = text.match(/\b(?:codex|openai|anthropic|fireworks|bedrock)\/[a-zA-Z0-9./\-]+/);
  return m ? m[0] : undefined;
}

function buildContextLine(fields) {
  const parts = [];
  if (fields.provider) parts.push(`provider ${fields.provider}`);
  if (fields.account) parts.push(`cuenta ${fields.account}`);
  if (fields.model) parts.push(`modelo ${fields.model}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const RATE_LIMIT_BY_AUTH_MODE = {
  apikey: {
    header: "API key OpenAI sin cuota",
    hint: "El proyecto OpenAI ligado al `OPENAI_API_KEY` se quedó sin saldo (Codex CLI lo reporta como \"subscription limit\" pero la auth real es apikey). Recargá billing o reemplazá la key.",
  },
  chatgpt: {
    header: "Suscripción Codex topada",
    hint: "El plan ChatGPT del agente alcanzó su límite de uso. Esperá al reset o conectá otra cuenta.",
  },
};

const ANTHROPIC_BILLING_BY_AUTH_MODE = {
  subscription: {
    header: "Suscripción Claude sin extra-usage",
    hint: "La suscripción de Claude agotó su saldo de *extra usage*. Recargá en claude.ai/settings/usage o esperá el reset de la ventana. (No es la API key.)",
  },
  api_key: {
    header: "API key Anthropic sin saldo",
    hint: "El `ANTHROPIC_API_KEY` se quedó sin créditos. Recargá billing o reemplazá la key.",
  },
};

function normalizeAnthropicAuthMode(mode) {
  if (typeof mode !== "string") return undefined;
  const m = mode.toLowerCase();
  if (m === "subscription") return "subscription";
  if (m === "api_key" || m === "apikey") return "api_key";
  return undefined;
}

function buildText(header, contextLine, hint) {
  const lines = [`⚠️ **${header}**`];
  if (contextLine) lines.push(contextLine);
  if (hint) lines.push(hint);
  return lines.join("\n");
}

/**
 * @param {string|null|undefined} rawText
 * @param {{ authMode?: string, authEmail?: string, anthropicAuthMode?: string }} [opts]
 * @returns {{ text: string, errorDetail: object|null }}
 */
export function classifyAndRewriteError(rawText, opts = {}) {
  if (rawText === null || rawText === undefined || rawText === "") {
    return { text: rawText ?? "", errorDetail: null };
  }
  if (typeof rawText !== "string") {
    return { text: String(rawText), errorDetail: null };
  }

  for (const c of CLASSIFIERS) {
    if (c.regex.test(rawText)) {
      const provider = extractProvider(rawText);
      const account = extractAccount(rawText) || (typeof opts.authEmail === "string" ? opts.authEmail : undefined);
      const model = extractModel(rawText);
      let { header, hint } = c;
      const authMode = typeof opts.authMode === "string" ? opts.authMode : undefined;
      if (c.category === "rate_limit" && authMode && RATE_LIMIT_BY_AUTH_MODE[authMode]) {
        ({ header, hint } = RATE_LIMIT_BY_AUTH_MODE[authMode]);
      }
      const anthropicAuthMode = normalizeAnthropicAuthMode(opts.anthropicAuthMode);
      if (c.category === "anthropic_billing") {
        const isExtraUsage = /out of extra usage|claude\.ai\/settings\/usage/i.test(rawText);
        if (isExtraUsage) {
          ({ header, hint } = ANTHROPIC_BILLING_BY_AUTH_MODE.subscription);
        } else if (anthropicAuthMode && ANTHROPIC_BILLING_BY_AUTH_MODE[anthropicAuthMode]) {
          ({ header, hint } = ANTHROPIC_BILLING_BY_AUTH_MODE[anthropicAuthMode]);
        }
      }
      const contextLine = buildContextLine({ provider, account, model });
      const errorDetail = {
        category: c.category,
        raw: rawText,
        classifiedAt: Date.now(),
      };
      if (provider) errorDetail.provider = provider;
      if (account) errorDetail.account = account;
      if (model) errorDetail.model = model;
      if (authMode) errorDetail.authMode = authMode;
      if (anthropicAuthMode) errorDetail.anthropicAuthMode = anthropicAuthMode;
      return {
        text: buildText(header, contextLine, hint),
        errorDetail,
      };
    }
  }
  return { text: rawText, errorDetail: null };
}

/**
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
