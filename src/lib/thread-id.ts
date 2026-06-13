/**
 * Canonical thread id — the single source of truth for thread-id shape.
 *
 * The storage layer persists a thread under a filesystem-safe shortId: it
 * splits the id on the FIRST colon (`<slug>:<shortId>`) and sanitizes the
 * shortId by collapsing every remaining `:` to `-` and dropping any char
 * outside `[a-zA-Z0-9-_]` (see `mc-chat.threadFile()`). So a client id like
 * `acme:discovery:new-123` is stored — and listed back — as `acme:discovery-new-123`.
 *
 * If the client registers/selects the NON-canonical form, its id never matches
 * the one the server lists, so `useThreadList`'s dedup paints a phantom second
 * row and the active-row highlight breaks. Builders are free to mint readable
 * colon-shaped ids (`<slug>:task:<id>`); the canonical form is enforced at the
 * chat-store boundary so the whole client speaks the same id the server does.
 *
 * Root cause of the duplicate Partnerships discovery thread (SAN-193); applied
 * globally so EVERY namespaced thread (task/content/project/strategy/skill/…)
 * is immune to the same class of bug.
 *
 * `sanitizeShortId` MUST stay byte-for-byte identical to the sanitization in
 * `mc-chat.threadFile()` and `api/chat/mark-read.ts` — both import it here so
 * they cannot drift.
 */
export function sanitizeShortId(shortId: string): string {
  return shortId.replace(/:/g, "-").replace(/[^a-zA-Z0-9\-_]/g, "");
}

/**
 * Normalize a full `<slug>:<shortId>` thread id to the form the storage layer
 * persists and lists. Idempotent. Ids with no colon (or empty) are returned
 * unchanged.
 */
export function canonicalThreadId(threadId: string): string {
  const colon = threadId.indexOf(":");
  if (colon < 0) return threadId;
  const slug = threadId.slice(0, colon);
  const shortId = threadId.slice(colon + 1);
  return `${slug}:${sanitizeShortId(shortId)}`;
}
