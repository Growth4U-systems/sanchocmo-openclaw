// Legacy shim: canonical implementation lives at /api/brand-brain/state.
// Kept during rename transition; remove once external callers (LLM caches,
// docs, bookmarks) have migrated.
export { default } from "../brand-brain/state";
