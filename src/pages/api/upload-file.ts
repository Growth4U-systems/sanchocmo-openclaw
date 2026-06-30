import type { NextApiRequest, NextApiResponse } from "next";
import { IncomingForm, type File } from "formidable";
import fs from "fs";
import { uploadToR2, resolveUploadMime, classifyUploadError } from "@/lib/upload-r2";

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
      return res.status(400).json({ error: "No file provided" });
    }

    // Browsers frequently send a generic/empty Content-Type for non-image
    // files (e.g. PDFs as application/octet-stream), so fall back to the file
    // extension and normalize to a canonical MIME type (SAN-117).
    const mimeType = resolveUploadMime(file.mimetype, file.originalFilename);
    if (!mimeType) {
      return res.status(400).json({
        error: `File type not allowed: ${file.originalFilename || file.mimetype || "unknown"}. Allowed: images, PDF, XLSX, DOCX, CSV, TXT, MD`,
      });
    }

    const buffer = fs.readFileSync(file.filepath);
    const originalName = file.originalFilename || "file";
    const ext = originalName.split(".").pop() || "bin";
    const key = `chat/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const url = await uploadToR2(buffer, key, mimeType);

    // Clean up temp file
    fs.unlinkSync(file.filepath);

    return res.json({
      url,
      filename: originalName,
      mimeType,
      size: file.size || buffer.length,
    });
  } catch (error) {
    console.error("[upload-file] Error:", error);
    const { status, error: message } = classifyUploadError(error);
    return res.status(status).json({ error: message });
  }
}
