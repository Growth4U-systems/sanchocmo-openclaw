export const DEFAULT_DOCS_ASSISTANT_MODEL = "nan/qwen3.6";

function configuredDocsAssistantModel(env) {
  const configured = typeof env?.SANCHO_DOCS_ASSISTANT_MODEL === "string"
    ? env.SANCHO_DOCS_ASSISTANT_MODEL.trim()
    : "";
  if (!configured) return DEFAULT_DOCS_ASSISTANT_MODEL;
  return /^[a-z0-9][a-z0-9._/-]{2,159}$/i.test(configured)
    ? configured
    : DEFAULT_DOCS_ASSISTANT_MODEL;
}

export function resolveTurnModelOverride({ readOnly, source, slug, userId }, env = process.env) {
  const isTrustedDocsReview = readOnly === true
    && source === "docs"
    && slug === "growth4u"
    && userId === "docs-assistant";
  return isTrustedDocsReview ? configuredDocsAssistantModel(env) : null;
}
