import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAndRewriteError,
  mergeWithPriorCategory,
} from "../error-rewriter.js";

// Fixtures taken from real production logs of 2026-05-22.
const FIXTURE_RATE_LIMIT_CHAIN =
  'All models failed (2): codex/gpt-5.5: You\'ve reached your Codex subscription usage limit. ' +
  "Codex did not return a reset time for this limit. Run /codex account for current usage details. " +
  "(rate_limit) | openai/gpt-5.5: No API key found for provider \"openai-codex\". " +
  "Auth store: /root/.openclaw/.openclaw/agents/rocinante/agent/auth-profiles.json " +
  "(agentDir: /root/.openclaw/.openclaw/agents/rocinante/agent). Configure auth for this agent " +
  "(openclaw agents add <id>) or copy only portable static auth profiles from the main agentDir. (auth)";

const FIXTURE_RATE_LIMIT_WITH_RESET =
  "You've reached your Codex subscription usage limit. Next reset in 5 hours, May 22 at 1:44 PM UTC. " +
  "Run /codex account for current usage details.";

const FIXTURE_AUTH_ONLY =
  'No API key found for provider "openai-codex". Auth store: ' +
  "/root/.openclaw/.openclaw/agents/cervantes/agent/auth-profiles.json " +
  "(agentDir: /root/.openclaw/.openclaw/agents/cervantes/agent). Configure auth for this agent " +
  "(openclaw agents add <id>) or copy only portable static auth profiles from the main agentDir.";

const FIXTURE_WATCHDOG_ABORT =
  "⚠️ 🛠️ print lines 1-260 from skills/fast-foundation/SKILL.md (agent) failed";

const FIXTURE_MISSING_BRAND_CONTEXT =
  '⚠️ 🛠️ list files in ~/workspace-rocinante/skills/discovery-plan-builder/ → print text → ' +
  'list files in ~/workspace-rocinante/brand/ → print text → find files named "growth4u" in ' +
  "~/workspace-rocinante failed";

const FIXTURE_CONTEXT_OVERFLOW =
  "Error: This model's maximum context length is 200000 tokens. " +
  "However, your messages resulted in 215432 tokens. Please reduce the length of the messages.";

const FIXTURE_MODEL_UNAVAILABLE =
  "anthropic/claude-sonnet-4-6: The model is currently overloaded. (status=503)";

const FIXTURE_NETWORK =
  "FetchError: request to https://api.openai.com/v1/chat/completions failed, reason: ECONNREFUSED";

const FIXTURE_NORMAL_REPLY =
  "Hola! Acá tenés los 5 docs lite del Fast Foundation:\n" +
  "1. Company Brief — listo en brand/fellow-funders/company-brief/lite.md\n" +
  "2. Market intelligence — listo\n" +
  "¿Querés que avance con la siguiente fase?";

const FIXTURE_NORMAL_METRICS_PLAN_WITH_RATE_LIMITS =
  "Plan completo confirmado. Antes de ejecutar, te enseño exactamente qué voy a correr.\n\n" +
  "### Paso 2 — Backfill 11-may → 20-jun (40 días)\n" +
  "- **Riesgo medio:** consume rate-limits de APIs (Meta Ads y GA4 sobre todo). " +
  "Lo hago secuencial con pausa de 2s entre días, no en paralelo.";

const FIXTURE_NORMAL_METRICS_REPLY_WITH_QUOTA_EXAMPLE =
  "Pequeña aclaración primero: **el problema NO es saldo**. " +
  'El collector lleva 40 días sin ejecutarse — no es un fallo de API que diga "402 / quota exceeded".\n\n' +
  "| **Google Workspace** | `alfonso@growth4u.io` | Suscripción mensual. |\n\n" +
  "Cargar saldo a ciegas ahora mismo no resuelve nada porque el problema parece de scheduler.";

// -----------------------------------------------------------------------------
// classifyAndRewriteError
// -----------------------------------------------------------------------------

test("rate_limit: detects Codex usage limit and extracts provider+model", () => {
  const out = classifyAndRewriteError(FIXTURE_RATE_LIMIT_CHAIN);
  assert.equal(out.errorDetail.category, "rate_limit");
  assert.equal(out.errorDetail.provider, "openai-codex");
  assert.equal(out.errorDetail.model, "codex/gpt-5.5");
  assert.equal(out.errorDetail.raw, FIXTURE_RATE_LIMIT_CHAIN);
  assert.ok(out.text.startsWith("⚠️ **Rate limit alcanzado**"));
  assert.ok(out.text.includes("Reintentá"));
  // Raw must NOT be embedded in the rewritten text.
  assert.ok(!out.text.includes("Auth store:"));
});

test("rate_limit: even without provider in raw, still classifies", () => {
  const out = classifyAndRewriteError(FIXTURE_RATE_LIMIT_WITH_RESET);
  assert.equal(out.errorDetail.category, "rate_limit");
  assert.ok(out.text.startsWith("⚠️ **Rate limit alcanzado**"));
});

test("auth: detects missing API key and extracts provider", () => {
  const out = classifyAndRewriteError(FIXTURE_AUTH_ONLY);
  assert.equal(out.errorDetail.category, "auth");
  assert.equal(out.errorDetail.provider, "openai-codex");
  assert.ok(out.text.startsWith("⚠️ **Credenciales no configuradas**"));
});

test("watchdog_abort: detects exact bot-side abort message", () => {
  const out = classifyAndRewriteError(FIXTURE_WATCHDOG_ABORT);
  assert.equal(out.errorDetail.category, "watchdog_abort");
  assert.ok(out.text.startsWith("⚠️ **Sesión sin progreso"));
});

test("missing_context: explains missing brand/Foundation files instead of generic runtime failure", () => {
  const out = classifyAndRewriteError(FIXTURE_MISSING_BRAND_CONTEXT);
  assert.equal(out.errorDetail.category, "missing_context");
  assert.ok(out.text.startsWith("⚠️ **Falta contexto inicial del cliente**"));
  assert.ok(out.text.includes("No están generados"));
  assert.ok(out.text.includes("Foundation"));
  assert.ok(!out.text.includes("Sesión sin progreso"));
});

test("context_overflow: detects token limit errors", () => {
  const out = classifyAndRewriteError(FIXTURE_CONTEXT_OVERFLOW);
  assert.equal(out.errorDetail.category, "context_overflow");
  assert.ok(out.text.startsWith("⚠️ **Contexto demasiado largo**"));
});

test("invalid_thinking_signature: detects corrupted reasoning blocks", () => {
  const raw = "LLM request rejected: messages.25.content.58: Invalid signature in thinking block";
  const out = classifyAndRewriteError(raw);
  assert.equal(out.errorDetail.category, "invalid_thinking_signature");
  assert.ok(out.text.startsWith("⚠️ **Historial interno corrupto**"));
  assert.ok(out.text.includes("bloques internos"));
});

test("model_unavailable: detects overloaded/503 errors", () => {
  const out = classifyAndRewriteError(FIXTURE_MODEL_UNAVAILABLE);
  assert.equal(out.errorDetail.category, "model_unavailable");
  assert.equal(out.errorDetail.model, "anthropic/claude-sonnet-4-6");
  assert.ok(out.text.startsWith("⚠️ **Modelo no disponible**"));
});

test("network: detects connection errors", () => {
  const out = classifyAndRewriteError(FIXTURE_NETWORK);
  assert.equal(out.errorDetail.category, "network");
  assert.ok(out.text.startsWith("⚠️ **Error de red**"));
});

test("passthrough: normal bot reply is returned unchanged", () => {
  const out = classifyAndRewriteError(FIXTURE_NORMAL_REPLY);
  assert.equal(out.errorDetail, null);
  assert.equal(out.text, FIXTURE_NORMAL_REPLY);
});

test("passthrough: normal metric plan mentioning API rate-limits is not rewritten", () => {
  const out = classifyAndRewriteError(FIXTURE_NORMAL_METRICS_PLAN_WITH_RATE_LIMITS, {
    authMode: "apikey",
  });
  assert.equal(out.errorDetail, null);
  assert.equal(out.text, FIXTURE_NORMAL_METRICS_PLAN_WITH_RATE_LIMITS);
});

test("passthrough: normal explanation quoting quota exceeded is not rewritten or account-extracted", () => {
  const out = classifyAndRewriteError(FIXTURE_NORMAL_METRICS_REPLY_WITH_QUOTA_EXAMPLE, {
    authMode: "apikey",
  });
  assert.equal(out.errorDetail, null);
  assert.equal(out.text, FIXTURE_NORMAL_METRICS_REPLY_WITH_QUOTA_EXAMPLE);
});

test("passthrough: empty/null input returns input as-is with no detail", () => {
  assert.deepEqual(classifyAndRewriteError(""), { text: "", errorDetail: null });
  assert.deepEqual(classifyAndRewriteError(null), { text: "", errorDetail: null });
  assert.deepEqual(classifyAndRewriteError(undefined), { text: "", errorDetail: null });
});

test("context line: includes account when extractable", () => {
  const raw =
    "rate_limit on provider openai-codex for account accounts@growth4u.io model codex/gpt-5.5";
  const out = classifyAndRewriteError(raw);
  assert.equal(out.errorDetail.account, "accounts@growth4u.io");
  assert.ok(out.text.includes("accounts@growth4u.io"));
  assert.ok(out.text.includes("codex/gpt-5.5"));
});

test("classifier order: rate_limit wins over auth when both appear", () => {
  // The chain fixture contains both 'rate_limit' and 'auth' markers; rate_limit
  // is the root cause and should win.
  const out = classifyAndRewriteError(FIXTURE_RATE_LIMIT_CHAIN);
  assert.equal(out.errorDetail.category, "rate_limit");
});

// -----------------------------------------------------------------------------
// mergeWithPriorCategory
// -----------------------------------------------------------------------------

test("merge: watchdog_abort correlates with prior rate_limit", () => {
  const watchdog = classifyAndRewriteError(FIXTURE_WATCHDOG_ABORT).errorDetail;
  const prior = classifyAndRewriteError(FIXTURE_RATE_LIMIT_CHAIN).errorDetail;
  const merged = mergeWithPriorCategory(watchdog, prior);
  assert.equal(merged.category, "watchdog_abort");
  assert.equal(merged.correlatedWith, "rate_limit");
  // Merged raw should preserve both for the modal.
  assert.ok(merged.raw.includes(FIXTURE_WATCHDOG_ABORT));
  assert.ok(merged.raw.includes(FIXTURE_RATE_LIMIT_CHAIN));
});

test("merge: only merges when categories differ", () => {
  const a = classifyAndRewriteError(FIXTURE_RATE_LIMIT_CHAIN).errorDetail;
  const b = classifyAndRewriteError(FIXTURE_RATE_LIMIT_WITH_RESET).errorDetail;
  const merged = mergeWithPriorCategory(a, b);
  // Two rate_limits → no correlatedWith (same category is not new info)
  assert.equal(merged.correlatedWith, undefined);
});

// -----------------------------------------------------------------------------
// authMode-aware rate_limit messages
// -----------------------------------------------------------------------------

test("rate_limit + authMode=apikey: rewrites to API-key billing message", () => {
  const out = classifyAndRewriteError(FIXTURE_RATE_LIMIT_WITH_RESET, { authMode: "apikey" });
  assert.equal(out.errorDetail.category, "rate_limit");
  assert.equal(out.errorDetail.authMode, "apikey");
  assert.ok(
    out.text.startsWith("⚠️ **API key OpenAI sin cuota**"),
    `expected API-key header, got: ${out.text.split("\n")[0]}`,
  );
  assert.ok(out.text.includes("billing"));
  // Must NOT keep the misleading generic header
  assert.ok(!out.text.startsWith("⚠️ **Rate limit alcanzado**"));
});

test("rate_limit + authMode=chatgpt: rewrites to subscription message", () => {
  const out = classifyAndRewriteError(FIXTURE_RATE_LIMIT_CHAIN, { authMode: "chatgpt" });
  assert.equal(out.errorDetail.category, "rate_limit");
  assert.equal(out.errorDetail.authMode, "chatgpt");
  assert.ok(
    out.text.startsWith("⚠️ **Suscripción Codex topada**"),
    `expected subscription header, got: ${out.text.split("\n")[0]}`,
  );
});

test("rate_limit + no authMode: falls back to generic header (back-compat)", () => {
  const out = classifyAndRewriteError(FIXTURE_RATE_LIMIT_WITH_RESET);
  assert.equal(out.errorDetail.category, "rate_limit");
  assert.equal(out.errorDetail.authMode, undefined);
  assert.ok(out.text.startsWith("⚠️ **Rate limit alcanzado**"));
});

test("rate_limit + authMode=unknown: falls back to generic header", () => {
  const out = classifyAndRewriteError(FIXTURE_RATE_LIMIT_WITH_RESET, { authMode: "weird-future-mode" });
  assert.equal(out.errorDetail.authMode, "weird-future-mode");
  assert.ok(out.text.startsWith("⚠️ **Rate limit alcanzado**"));
});

test("authEmail: surfaces account when raw text has no email", () => {
  const out = classifyAndRewriteError(FIXTURE_RATE_LIMIT_WITH_RESET, {
    authMode: "chatgpt",
    authEmail: "accounts@growth4u.io",
  });
  assert.equal(out.errorDetail.account, "accounts@growth4u.io");
  assert.ok(out.text.includes("accounts@growth4u.io"));
});

test("authEmail: raw text email wins over opts.authEmail", () => {
  const raw = "rate_limit on provider openai-codex for account real@example.com model codex/gpt-5.5";
  const out = classifyAndRewriteError(raw, { authMode: "chatgpt", authEmail: "fallback@example.com" });
  assert.equal(out.errorDetail.account, "real@example.com");
});

test("non-rate_limit + authMode: auth-aware copy does not leak into other categories", () => {
  const out = classifyAndRewriteError(FIXTURE_CONTEXT_OVERFLOW, { authMode: "apikey" });
  assert.equal(out.errorDetail.category, "context_overflow");
  assert.ok(out.text.startsWith("⚠️ **Contexto demasiado largo**"));
});

test("insufficient_quota: detects raw OpenAI billing error directly", () => {
  const raw =
    'OpenAI API error: {"type":"insufficient_quota","code":"insufficient_quota","message":' +
    '"You exceeded your current quota, please check your plan and billing details."}';
  const out = classifyAndRewriteError(raw);
  assert.equal(out.errorDetail.category, "insufficient_quota");
  assert.ok(out.text.startsWith("⚠️ **API key OpenAI sin cuota**"));
});

// -----------------------------------------------------------------------------
// anthropic_billing — Claude subscription "out of extra usage" vs API-key
// -----------------------------------------------------------------------------

// Raw upstream message Anthropic returns when the Claude (Max) subscription has
// exhausted its extra-usage pool. Taken from staging failover logs 2026-06-15.
const FIXTURE_ANTHROPIC_EXTRA_USAGE =
  "You're out of extra usage. Add more at claude.ai/settings/usage and keep going.";

// Generic OpenClaw wrapper text actually delivered to the chat for any billing
// failover. Always says "API key" even when the agent runs on the subscription
// — the misleading message this classifier exists to fix.
const FIXTURE_OPENCLAW_BILLING_GENERIC =
  "⚠️ API provider returned a billing error — your API key has run out of credits " +
  "or has an insufficient balance. Check your provider's billing dashboard and top up " +
  "or switch to a different API key.";

test("anthropic_billing: raw extra-usage message → subscription wording", () => {
  const out = classifyAndRewriteError(FIXTURE_ANTHROPIC_EXTRA_USAGE);
  assert.equal(out.errorDetail.category, "anthropic_billing");
  assert.ok(out.text.startsWith("⚠️ **Suscripción Claude sin extra-usage**"));
  assert.ok(out.text.includes("claude.ai/settings/usage"));
});

test("anthropic_billing: generic wrapper + anthropicAuthMode=subscription → extra-usage wording", () => {
  const out = classifyAndRewriteError(FIXTURE_OPENCLAW_BILLING_GENERIC, {
    anthropicAuthMode: "subscription",
  });
  assert.equal(out.errorDetail.category, "anthropic_billing");
  assert.equal(out.errorDetail.anthropicAuthMode, "subscription");
  assert.ok(out.text.startsWith("⚠️ **Suscripción Claude sin extra-usage**"));
  assert.ok(out.text.includes("claude.ai/settings/usage"));
  assert.equal(out.errorDetail.provider, undefined);
  assert.ok(!out.text.includes("provider returned"));
  // Must NOT keep the misleading "switch your API key" advice.
  assert.ok(!/switch to a different api key/i.test(out.text));
  assert.ok(!out.text.includes("run out of credits"));
});

test("anthropic_billing: generic wrapper + anthropicAuthMode=api_key → API-key wording", () => {
  const out = classifyAndRewriteError(FIXTURE_OPENCLAW_BILLING_GENERIC, {
    anthropicAuthMode: "api_key",
  });
  assert.equal(out.errorDetail.category, "anthropic_billing");
  assert.ok(out.text.startsWith("⚠️ **API key Anthropic sin saldo**"));
  assert.ok(!out.text.includes("extra-usage"));
});

test("anthropic_billing: explicit extra-usage text overrides api_key mode (unambiguous)", () => {
  const out = classifyAndRewriteError(FIXTURE_ANTHROPIC_EXTRA_USAGE, {
    anthropicAuthMode: "api_key",
  });
  // The phrase is subscription-only; trust the text over the (stale) mode hint.
  assert.ok(out.text.startsWith("⚠️ **Suscripción Claude sin extra-usage**"));
});

test("anthropic_billing: generic wrapper + no mode → neutral billing header", () => {
  const out = classifyAndRewriteError(FIXTURE_OPENCLAW_BILLING_GENERIC);
  assert.equal(out.errorDetail.category, "anthropic_billing");
  assert.ok(out.text.startsWith("⚠️ **Saldo del proveedor agotado**"));
});

test("anthropic_billing: 'apikey' alias normalizes to api_key wording", () => {
  const out = classifyAndRewriteError(FIXTURE_OPENCLAW_BILLING_GENERIC, {
    anthropicAuthMode: "apikey",
  });
  assert.ok(out.text.startsWith("⚠️ **API key Anthropic sin saldo**"));
});

test("anthropic_billing: does not swallow OpenAI insufficient_quota", () => {
  const raw =
    'OpenAI API error: {"type":"insufficient_quota","message":"You exceeded your current quota, ' +
    'please check your plan and billing details."}';
  const out = classifyAndRewriteError(raw, { anthropicAuthMode: "subscription" });
  assert.equal(out.errorDetail.category, "insufficient_quota");
});
