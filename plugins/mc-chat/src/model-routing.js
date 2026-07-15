export const DEFAULT_DOCS_ASSISTANT_MODEL = "nan/qwen3.6";
export const DEFAULT_GROWIE_SUPPORT_MODEL = "fireworks/accounts/fireworks/models/glm-5p2";

const MODEL_ID_RE = /^[a-z0-9][a-z0-9._/-]{2,159}$/i;

function configuredModel(value, fallback) {
  const configured = typeof value === "string" ? value.trim() : "";
  if (!configured) return fallback;
  return MODEL_ID_RE.test(configured) ? configured : fallback;
}

function configuredDocsAssistantModel(env) {
  return configuredModel(env?.SANCHO_DOCS_ASSISTANT_MODEL, DEFAULT_DOCS_ASSISTANT_MODEL);
}

function configuredGrowieSupportModel(env) {
  return configuredModel(env?.SANCHO_GROWIE_SUPPORT_MODEL, DEFAULT_GROWIE_SUPPORT_MODEL);
}

export function resolveTurnModelOverride(
  { readOnly, source, slug, userId, threadId, channelMode },
  env = process.env,
) {
  const isTrustedGrowieSupport = readOnly === true
    && source === "growie-support"
    && channelMode === "support-diagnostic"
    && typeof threadId === "string"
    && threadId.startsWith(`${slug}:support-growie-`);
  if (isTrustedGrowieSupport) return configuredGrowieSupportModel(env);

  const isTrustedDocsReview = readOnly === true
    && source === "docs"
    && slug === "growth4u"
    && userId === "docs-assistant";
  return isTrustedDocsReview ? configuredDocsAssistantModel(env) : null;
}

export function buildTurnReplyOptions({ modelOverride, source }) {
  if (!modelOverride) return {};
  if (source === "docs") return buildDocsReviewReplyOptions(modelOverride);
  return { modelOverride };
}

export function buildDocsReviewReplyOptions(modelOverride) {
  if (!modelOverride) return {};
  return {
    modelOverride,
    thinkingLevelOverride: "off",
    fastModeOverride: true,
    bootstrapContextMode: "lightweight",
    skillFilter: [],
    suppressToolErrorWarnings: true,
    suppressDefaultToolProgressMessages: true,
  };
}
