import type { NextApiRequest, NextApiResponse } from "next";
import { IncomingForm, type File } from "formidable";
import fs from "fs";
import {
  ALLOWED_EXTENSIONS,
  hasAllowedUploadSignature,
  R2ConfigError,
  uploadToR2,
  resolveUploadMime,
} from "@/lib/upload-r2";
import { canAccessSlug, compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { isValidTenantSlug } from "@/lib/thread-id";

export const config = {
  api: { bodyParser: false },
};

export async function uploadFileHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!isValidTenantSlug(slug)) {
    return res.status(400).json({ error: "Invalid slug" });
  }
  if (!canAccessSlug(req.ctx, slug)) return res.status(403).json({ error: "Forbidden" });

  const tempFiles: File[] = [];
  try {
    const form = new IncomingForm({
      maxFileSize: 20 * 1024 * 1024,
      maxFiles: 1,
      maxFields: 0,
      allowEmptyFiles: false,
      minFileSize: 1,
    });
    form.on("file", (_name, file) => tempFiles.push(file));

    const { files } = await new Promise<{
      fields: Record<string, unknown>;
      files: Record<string, File[]>;
    }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files: files as Record<string, File[]> });
      });
    });

    const file = files.file?.[0];
    if (!file) {
      cleanupFiles(files);
      return res.status(400).json({ error: "No file provided" });
    }

    // Browsers frequently send a generic/empty Content-Type for non-image
    // files (e.g. PDFs as application/octet-stream), so fall back to the file
    // extension and normalize to a canonical MIME type (SAN-117).
    const mimeType = resolveUploadMime(file.mimetype, file.originalFilename);
    if (!mimeType) {
      cleanupTempFile(file);
      return res.status(400).json({
        error: `File type not allowed: ${file.originalFilename || file.mimetype || "unknown"}. Allowed: images, PDF, XLSX, DOCX, CSV, TXT, MD`,
      });
    }

    const buffer = fs.readFileSync(file.filepath);
    if (!hasAllowedUploadSignature(buffer, mimeType)) {
      return res.status(400).json({ error: "File contents do not match the allowed type" });
    }
    const originalName = file.originalFilename || "file";
    const ext =
      Object.entries(ALLOWED_EXTENSIONS).find(([, allowedMime]) => allowedMime === mimeType)?.[0] ||
      "bin";
    const key = `chat/${encodeURIComponent(slug)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    let url: string;
    try {
      url = await uploadToR2(buffer, key, mimeType);
    } finally {
      cleanupTempFile(file);
    }

    return res.json({
      url,
      filename: originalName,
      mimeType,
      size: file.size || buffer.length,
    });
  } catch (error) {
    if (error instanceof R2ConfigError) {
      return res.status(503).json({
        error: error.message,
        storage: { ok: false, missing: error.missing },
      });
    }
    console.error("[upload-file] Error:", error);
    return res.status(500).json({ error: "Failed to upload file" });
  } finally {
    for (const file of tempFiles) cleanupTempFile(file);
  }
}

export default compose(withErrorHandler, withAuth)(uploadFileHandler);

function cleanupTempFile(file: File): void {
  try {
    fs.unlinkSync(file.filepath);
  } catch {
    // best-effort cleanup
  }
}

function cleanupFiles(files: Record<string, File[]>): void {
  for (const file of Object.values(files).flat()) cleanupTempFile(file);
}
