import type { NextApiRequest, NextApiResponse } from "next";
import { IncomingForm, type File } from "formidable";
import fs from "fs";
import { R2ConfigError, uploadToR2, resolveUploadMime } from "@/lib/upload-r2";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const form = new IncomingForm({ maxFileSize: 20 * 1024 * 1024 }); // 20MB

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
    const originalName = file.originalFilename || "file";
    const ext = originalName.split(".").pop() || "bin";
    const key = `chat/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

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
  }
}

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
