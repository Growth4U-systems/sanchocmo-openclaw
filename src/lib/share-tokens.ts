/**
 * share-tokens.ts — Stateless signed tokens for public document sharing.
 *
 * Architecture: HMAC-signed JSON payload encoded as `{base64url(payload)}.{base64url(signature)}`.
 * No DB lookup — verification is purely cryptographic. Tokens are bound to:
 *   - `slug` (which client's docs)
 *   - `docPath` (the specific file path, brand-relative)
 *   - `iat` (issued at — for audit/expiry policy if we add it later)
 *
 * Use cases:
 *   - "Copy public link" button on doc viewer → shareable URL for any third party
 *   - Embedded in emails / Slack / Notion etc. without requiring MC login
 *
 * Security model:
 *   - Tokens are unguessable (HMAC-SHA256 of payload)
 *   - Read-only — there is no write API on the share endpoint
 *   - No expiry by default (forever-shareable). If we need expiry, add `exp`
 *     to the payload and check it in `verifyShareToken`.
 *   - Revocation: the only revocation path today is to rotate the secret
 *     (which invalidates ALL existing share tokens). Per-token revocation
 *     would require a DB.
 *
 * Secret source: `MC_SHARE_SECRET` env var, falling back to `NEXTAUTH_SECRET`.
 * In dev a hardcoded fallback is used so the feature works out of the box.
 */

import crypto from "crypto";

const SECRET =
  process.env.MC_SHARE_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "mc-share-dev-fallback-secret-DO-NOT-USE-IN-PROD";

export interface SharePayload {
  /** Brand slug — `growth4u`, `example`, etc. */
  slug: string;
  /** Brand-relative doc path — e.g. `brand/growth4u/projects/.../foo.md` */
  docPath: string;
  /** Issued-at timestamp (ms since epoch). */
  iat: number;
}

function base64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf-8") : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(s: string): Buffer {
  const padding = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + padding;
  return Buffer.from(b64, "base64");
}

function hmac(payload: string): string {
  return base64url(crypto.createHmac("sha256", SECRET).update(payload).digest());
}

/** Sign a payload and return the share token string. */
export function signShareToken(input: { slug: string; docPath: string }): string {
  const payload: SharePayload = {
    slug: input.slug,
    docPath: input.docPath,
    iat: Date.now(),
  };
  const encoded = base64url(JSON.stringify(payload));
  const sig = hmac(encoded);
  return `${encoded}.${sig}`;
}

/**
 * Verify a share token. Returns the payload if valid, `null` otherwise.
 * Uses constant-time comparison to defeat timing attacks.
 */
export function verifyShareToken(token: string): SharePayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = hmac(encoded);
  // Constant-time compare.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const json = fromBase64url(encoded).toString("utf-8");
    const payload = JSON.parse(json) as SharePayload;
    if (
      typeof payload.slug !== "string" ||
      typeof payload.docPath !== "string" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }
    // Defense in depth: ensure docPath stays under brand/{slug}/ to prevent
    // path traversal even if the secret leaks.
    if (!payload.docPath.startsWith(`brand/${payload.slug}/`)) return null;
    if (payload.docPath.includes("..")) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Build the public share URL for a given token. Resolution order:
 *   1. Explicit `origin` argument (e.g., derived from request headers)
 *   2. `BASE_URL` — canonical app URL (documented in `.env.example`,
 *      set by entrypoint, single source for all deployment URLs)
 *   3. `NEXTAUTH_URL` — safety net (NextAuth always sets it; entrypoint
 *      also falls back from BASE_URL)
 *   4. Empty string — relative URL (only useful in dev with same-origin)
 */
export function buildShareUrl(token: string, origin?: string): string {
  const base =
    origin ||
    process.env.BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "";
  const path = `/share/${token}`;
  return base ? `${base.replace(/\/+$/, "")}${path}` : path;
}
