import { createHash, timingSafeEqual } from "node:crypto";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const RUNTIME_TRANSPORT_SECRET_DIGEST_FIELD =
  "runtimeTransportSecretSha256";

export type RuntimeTransportSecretAuthorization =
  | "authorized"
  | "forbidden"
  | "legacy_secret_missing";

export function runtimeTransportSecretSha256(
  secret: string | undefined,
): string | undefined {
  return secret
    ? createHash("sha256").update(secret, "utf8").digest("hex")
    : undefined;
}

function digestMatches(left: string, right: string): boolean {
  const actual = Buffer.from(left, "hex");
  const expected = Buffer.from(right, "hex");
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}

function rawSecretMatches(left: string, right: string): boolean {
  const actual = Buffer.from(left);
  const expected = Buffer.from(right);
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}

/**
 * Authorize transport against the immutable secret digest captured when the
 * run was admitted. Only runs that predate the field may consult the adapter's
 * current secret; a malformed persisted binding never downgrades to fallback.
 */
export function authorizeRuntimeTransportSecret(input: {
  suppliedSecret: unknown;
  runInput: Record<string, unknown>;
  resolveLegacySecret: () => string | undefined;
}): RuntimeTransportSecretAuthorization {
  const hasPersistedBinding = Object.prototype.hasOwnProperty.call(
    input.runInput,
    RUNTIME_TRANSPORT_SECRET_DIGEST_FIELD,
  );
  if (hasPersistedBinding) {
    const persisted = input.runInput[RUNTIME_TRANSPORT_SECRET_DIGEST_FIELD];
    if (
      typeof input.suppliedSecret !== "string" ||
      !input.suppliedSecret ||
      typeof persisted !== "string" ||
      !SHA256_PATTERN.test(persisted)
    ) {
      return "forbidden";
    }
    const suppliedDigest = runtimeTransportSecretSha256(input.suppliedSecret);
    return suppliedDigest && digestMatches(suppliedDigest, persisted)
      ? "authorized"
      : "forbidden";
  }

  const legacySecret = input.resolveLegacySecret();
  if (!legacySecret) return "legacy_secret_missing";
  return typeof input.suppliedSecret === "string" &&
    rawSecretMatches(input.suppliedSecret, legacySecret)
    ? "authorized"
    : "forbidden";
}
