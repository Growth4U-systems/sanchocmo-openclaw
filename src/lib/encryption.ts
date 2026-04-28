import crypto from "crypto";

// AES-256-GCM (authenticated encryption — better than CBC: detects tampering).
// Format: <iv-hex>:<authTag-hex>:<ciphertext-hex>

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY not set");
  }
  // Accept either 64 hex chars (32 bytes) or 32 ASCII chars.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  if (raw.length === 32) {
    return Buffer.from(raw, "utf-8");
  }
  throw new Error(
    "ENCRYPTION_KEY must be 64 hex chars (recommended) or 32 ASCII chars"
  );
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(payload: string): string {
  const key = getKey();
  const [ivHex, authTagHex, encryptedHex] = payload.split(":");
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid encrypted payload format");
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf-8");
}

// HMAC-signed state for OAuth CSRF protection.
// Format: <slug>.<nonce>.<hmac>
export function signState(slug: string): string {
  const key = getKey();
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${slug}.${nonce}`;
  const sig = crypto.createHmac("sha256", key).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyState(state: string): { slug: string } | null {
  const key = getKey();
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [slug, nonce, sig] = parts;
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${slug}.${nonce}`)
    .digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { slug };
}
