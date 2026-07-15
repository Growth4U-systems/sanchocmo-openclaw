import fs from "fs";
import os from "os";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { parseEnvContent } from "@/lib/env-file";

export const REQUIRED_R2_VARS = [
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_UPLOAD_IMAGE_ACCESS_KEY_ID",
  "R2_UPLOAD_IMAGE_SECRET_ACCESS_KEY",
  "R2_UPLOAD_IMAGE_BUCKET_NAME",
  "R2_PUBLIC_URL",
] as const;

export type RequiredR2Var = (typeof REQUIRED_R2_VARS)[number];

const R2_CONFIG_INSTRUCTIONS =
  "Set these in ~/.openclaw/.env.local (next dev) or the active Sancho .env and restart the server.";

export class R2ConfigError extends Error {
  missing: RequiredR2Var[];

  constructor(missing: RequiredR2Var[]) {
    super(
      `Storage unavailable: missing ${missing.join(", ")}. ` +
      `${R2_CONFIG_INSTRUCTIONS} ` +
      `Without them upload-media / generate-image cannot persist images, ` +
      `which causes agents to fall back to writing 'localPath' into ` +
      `frontmatter.media — see _system/media-persistence-protocol.md.`,
    );
    this.name = "R2ConfigError";
    this.missing = missing;
  }
}

export function getMissingR2Env(options: { hydrate?: boolean } = {}): RequiredR2Var[] {
  if (options.hydrate !== false) hydrateR2EnvFromLocalFiles();
  return REQUIRED_R2_VARS.filter((k) => !process.env[k]);
}

export function assertR2Configured(options: { hydrate?: boolean } = {}): void {
  const missing = getMissingR2Env(options);
  if (missing.length > 0) {
    throw new R2ConfigError(missing);
  }
}

/** Public object base used to validate that agent-facing attachments are ours. */
export function getR2PublicUrl(): string | null {
  hydrateR2EnvFromLocalFiles();
  return process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "") || null;
}

let hydratedR2Env = false;

function hydrateR2EnvFromLocalFiles(): void {
  if (hydratedR2Env) return;
  hydratedR2Env = true;

  for (const envFile of getCandidateEnvFiles()) {
    let vars: Record<string, string>;
    try {
      vars = parseEnvContent(fs.readFileSync(envFile, "utf-8"));
    } catch {
      continue;
    }

    for (const key of REQUIRED_R2_VARS) {
      if (process.env[key] || !vars[key]) continue;
      process.env[key] = normalizeEnvValue(vars[key]);
    }
  }
}

function getCandidateEnvFiles(): string[] {
  const candidates = [
    path.join(process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw"), ".env.local"),
    path.join(process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw"), ".env"),
    path.join(os.homedir(), ".openclaw", ".env.local"),
    path.join(os.homedir(), ".openclaw", ".env"),
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
  ];
  return Array.from(new Set(candidates));
}

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

let _client: S3Client | null = null;
function r2(): S3Client {
  if (_client) return _client;
  assertR2Configured();
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_UPLOAD_IMAGE_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_UPLOAD_IMAGE_SECRET_ACCESS_KEY!,
    },
  });
  return _client;
}

/** Upload any file to R2 and return the public URL */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  assertR2Configured();
  await r2().send(
    new PutObjectCommand({
      Bucket: process.env.R2_UPLOAD_IMAGE_BUCKET_NAME!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

/** Allowed MIME types for chat file uploads */
export const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  // Documents
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  // Text
  "text/csv",
  "text/plain",
  "text/markdown",
]);

/**
 * Allowed file extensions → canonical MIME type.
 *
 * Browsers often send a generic or empty Content-Type for non-image files
 * (notably PDFs arriving as `application/octet-stream`), which made the strict
 * MIME allowlist reject perfectly valid files (SAN-117). We fall back to the
 * extension and normalize to the canonical MIME type below.
 */
export const ALLOWED_EXTENSIONS: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
};

/** Generic/opaque MIME types browsers emit when they can't classify a file. */
const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream", "application/x-download"]);

/**
 * Resolve the canonical, allowed MIME type for an uploaded file.
 *
 * Trusts the browser-declared MIME only when it is specific and allowed;
 * otherwise falls back to the file extension. Returns `null` when the file is
 * not allowed by either signal.
 */
export function resolveUploadMime(
  declaredMime: string | null | undefined,
  filename: string | null | undefined,
): string | null {
  if (declaredMime && !GENERIC_MIME_TYPES.has(declaredMime) && ALLOWED_MIME_TYPES.has(declaredMime)) {
    return declaredMime;
  }
  const ext = filename?.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS[ext] ?? null;
}

/** Cheap server-side signature check; malware scanning remains a separate gate. */
export function hasAllowedUploadSignature(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length === 0) return false;
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/gif") {
    const header = buffer.subarray(0, 6).toString("ascii");
    return header === "GIF87a" || header === "GIF89a";
  }
  if (mimeType === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF"
      && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (mimeType === "application/pdf") {
    return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
    const signature = `${buffer[2]}:${buffer[3]}`;
    return signature === "3:4" || signature === "5:6" || signature === "7:8";
  }
  if (["text/csv", "text/plain", "text/markdown"].includes(mimeType)) {
    return !buffer.subarray(0, Math.min(buffer.length, 8_192)).includes(0);
  }
  return false;
}

/** Human-readable accept string for file inputs */
export const ACCEPT_STRING =
  "image/jpeg,image/png,image/gif,image/webp,application/pdf,.xlsx,.docx,.csv,.txt,.md";
