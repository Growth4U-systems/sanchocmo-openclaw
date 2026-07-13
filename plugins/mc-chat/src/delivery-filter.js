export function isModelFallbackNotice(text) {
  if (typeof text !== "string") return false;
  return /^\s*(?:\u21aa\ufe0f?\s*)?Model Fallback:\s*[^\r\n]+\s*$/i.test(text);
}
