function serializeEffect(effect) {
  return `:::sancho-effect\n${JSON.stringify({
    name: effect.name,
    arguments: effect.arguments,
  })}\n:::`;
}

/**
 * Turn-wide arbitration for OpenClaw's multipart delivery callback.
 *
 * Marker parsing happens per delivered part, while routing/intervention can be
 * emitted in another part. Keep an effect private until the whole turn drains
 * so a later control action can still win, matching the shared runtime parser.
 */
export function createRuntimeEffectTurnArbitrator() {
  let acceptedEffect = null;
  let controlActionObserved = false;

  return {
    observe({ effects = [], controlAction = false } = {}) {
      let blockedCount = 0;
      let acceptedCount = 0;
      if (controlAction) {
        controlActionObserved = true;
        if (acceptedEffect) {
          acceptedEffect = null;
          blockedCount += 1;
        }
      }
      if (controlActionObserved) {
        blockedCount += effects.length;
        return { acceptedCount, blockedCount };
      }
      for (const effect of effects) {
        if (acceptedEffect) {
          blockedCount += 1;
          continue;
        }
        acceptedEffect = effect;
        acceptedCount += 1;
      }
      return { acceptedCount, blockedCount };
    },

    appendToCallback(visibleText) {
      const text = typeof visibleText === "string" ? visibleText.trim() : "";
      if (!acceptedEffect || controlActionObserved) return text;
      return [text, serializeEffect(acceptedEffect)].filter(Boolean).join("\n\n");
    },

    hasPendingEffect() {
      return Boolean(acceptedEffect && !controlActionObserved);
    },
  };
}
