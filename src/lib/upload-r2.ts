import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const REQUIRED_R2_VARS = [
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_UPLOAD_IMAGE_ACCESS_KEY_ID",
  "R2_UPLOAD_IMAGE_SECRET_ACCESS_KEY",
  "R2_UPLOAD_IMAGE_BUCKET_NAME",
  "R2_PUBLIC_URL",
] as const;

/** Stable prefix of the error assertR2Configured throws; matched by classifyUploadError. */
export const R2_NOT_CONFIGURED_PREFIX = "R2 not configured";

function assertR2Configured(): void {
  const missing = REQUIRED_R2_VARS.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `${R2_NOT_CONFIGURED_PREFIX}: missing ${missing.join(", ")}. ` +
      `Set these in ~/.openclaw/.env.local and restart 'next dev'. ` +
      `Without them upload-media / generate-image cannot persist images, ` +
      `which causes agents to fall back to writing 'localPath' into ` +
      `frontmatter.media — see _system/media-persistence-protocol.md.`,
    );
  }
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

/**
 * Map an upload failure to an HTTP status + user-facing message so the chat UI
 * shows a diagnosable error instead of an opaque one (SAN-305 / SAN-371):
 *   - missing R2 env → 503 + the actionable config message
 *   - file over cap  → 413 (formidable maxFileSize)
 *   - anything else  → 500 (generic; preserves prior behavior/monitoring)
 */
export function classifyUploadError(error: unknown): { status: number; error: string } {
  const message = error instanceof Error ? error.message : String(error);
  const httpCode = (error as { httpCode?: number } | null | undefined)?.httpCode;
  if (message.startsWith(R2_NOT_CONFIGURED_PREFIX)) {
    return { status: 503, error: message };
  }
  if (httpCode === 413 || /maxFileSize|maxTotalFileSize/i.test(message)) {
    return { status: 413, error: "El archivo supera el límite de 20 MB." };
  }
  return { status: 500, error: "Failed to upload file" };
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
