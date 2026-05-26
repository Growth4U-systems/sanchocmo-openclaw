import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const REQUIRED_R2_VARS = [
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_UPLOAD_IMAGE_ACCESS_KEY_ID",
  "R2_UPLOAD_IMAGE_SECRET_ACCESS_KEY",
  "R2_UPLOAD_IMAGE_BUCKET_NAME",
  "R2_PUBLIC_URL",
] as const;

function assertR2Configured(): void {
  const missing = REQUIRED_R2_VARS.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `R2 not configured: missing ${missing.join(", ")}. ` +
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

/** Human-readable accept string for file inputs */
export const ACCEPT_STRING =
  "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,.xlsx,.docx,.csv,.txt,.md";
