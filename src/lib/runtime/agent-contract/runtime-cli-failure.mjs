import { classifyAndRewriteError } from "./error-rewriter.mjs";

/**
 * Normalize non-zero CLI exits across portable runtime bridges.
 */
export function classifyRuntimeCliFailure(raw, options = {}) {
  const provider = typeof options.provider === "string" ? options.provider : "runtime";
  const runtimeLabel = typeof options.runtimeLabel === "string" ? options.runtimeLabel : provider;
  const fallbackRaw = `${runtimeLabel} exited with code ${options.exitCode ?? "unknown"}${options.signal ? ` (${options.signal})` : ""}`;
  const technicalRaw = typeof raw === "string" && raw.trim() ? raw.trim() : fallbackRaw;
  const classified = classifyAndRewriteError(technicalRaw);

  if (classified.errorDetail) {
    return {
      text: classified.text,
      errorDetail: {
        ...classified.errorDetail,
        provider: classified.errorDetail.provider || provider,
      },
    };
  }

  return {
    text: `${runtimeLabel} no pudo completar este turno.`,
    errorDetail: {
      category: "model_unavailable",
      raw: technicalRaw,
      provider,
      classifiedAt: Date.now(),
    },
  };
}
