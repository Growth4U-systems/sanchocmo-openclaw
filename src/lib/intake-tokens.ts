/**
 * intake-tokens.ts — Stateless signed tokens for the public intake form (SAN-17).
 *
 * Same HMAC-SHA256 envelope as share-tokens.ts, but the payload is bound to a
 * client `slug` and a fixed `kind:"intake"` discriminator (so an intake token
 * can never be confused with a share token and vice versa). No DB lookup —
 * verification is purely cryptographic. No expiry in v1 (matches share-links).
 *
 * Secret source: MC_SHARE_SECRET → NEXTAUTH_SECRET → dev fallback.
 */

import crypto from "crypto";

const SECRET =
  process.env.MC_SHARE_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "mc-share-dev-fallback-secret-DO-NOT-USE-IN-PROD";

export interface IntakePayload {
  slug: string;
  kind: "intake";
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

/** Sign an intake token for a client slug. */
export function signIntakeToken(slug: string): string {
  const payload: IntakePayload = { slug, kind: "intake", iat: Date.now() };
  const encoded = base64url(JSON.stringify(payload));
  const sig = hmac(encoded);
  return `${encoded}.${sig}`;
}

/** Verify an intake token. Returns the payload if valid, else null. */
export function verifyIntakeToken(token: string): IntakePayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = hmac(encoded);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromBase64url(encoded).toString("utf-8")) as IntakePayload;
    if (
      typeof payload.slug !== "string" ||
      payload.kind !== "intake" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Build the public intake URL. Resolution order mirrors buildShareUrl. */
export function buildIntakeUrl(slug: string, origin?: string): string {
  const base = origin || process.env.BASE_URL || process.env.NEXTAUTH_URL || "";
  const path = `/intake/${signIntakeToken(slug)}`;
  return base ? `${base.replace(/\/+$/, "")}${path}` : path;
}
