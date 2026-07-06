/**
 * comments-ownership.ts — Track which comments the current browser posted (SAN-15).
 *
 * Anyone with the share URL can POST/PATCH/DELETE comments via the API.
 * To avoid showing Edit/Delete buttons indiscriminately, we mark comments
 * posted from this browser in localStorage. A different browser/device or
 * one whose storage was cleared simply won't see the buttons — comments
 * remain visible to everyone, just not editable from there.
 *
 * Storage:
 *   key:    sancho:my-comments
 *   value:  JSON array of comment ids (strings), unique, append-only
 *
 * All exported functions are SSR-safe (no-op when `window` is undefined).
 *
 * The optional `storage` parameter lets unit tests inject a stub.
 */

const KEY = "sancho:my-comments";

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function getStorage(provided?: StorageLike): StorageLike | null {
  if (provided) return provided;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Private mode / strict cookie blockers may throw on access.
    return null;
  }
}

function readArray(storage: StorageLike): string[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writeArray(storage: StorageLike, ids: string[]): void {
  try {
    storage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Quota exceeded or denied — silently drop.
  }
}

/** Record a comment id as posted from this browser. */
export function markCommentAsMine(id: string, storage?: StorageLike): void {
  if (!id) return;
  const s = getStorage(storage);
  if (!s) return;
  const current = readArray(s);
  if (current.includes(id)) return;
  current.push(id);
  writeArray(s, current);
}

/** Forget a comment id (used after delete). */
export function unmarkCommentAsMine(id: string, storage?: StorageLike): void {
  if (!id) return;
  const s = getStorage(storage);
  if (!s) return;
  const current = readArray(s);
  const next = current.filter((x) => x !== id);
  if (next.length === current.length) return;
  writeArray(s, next);
}

/** True if this browser posted a comment with this id. */
export function isMyComment(id: string, storage?: StorageLike): boolean {
  if (!id) return false;
  const s = getStorage(storage);
  if (!s) return false;
  return readArray(s).includes(id);
}

/** All comment ids posted from this browser. */
export function getMyCommentIds(storage?: StorageLike): string[] {
  const s = getStorage(storage);
  if (!s) return [];
  return readArray(s);
}

/** Wipe all owned-comment state. Useful for tests / "log out" flows. */
export function clearMyComments(storage?: StorageLike): void {
  const s = getStorage(storage);
  if (!s) return;
  s.removeItem(KEY);
}
