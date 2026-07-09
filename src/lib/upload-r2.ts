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
  "image/svg+xml",
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
  svg: "image/svg+xml",
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

/** Human-readable accept string for file inputs */
export const ACCEPT_STRING =
  "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,.xlsx,.docx,.csv,.txt,.md";
