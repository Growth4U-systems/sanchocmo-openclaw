import type { NextApiRequest, NextApiResponse } from "next";
import { IncomingForm, type File } from "formidable";
import fs from "fs";
import { uploadToR2, ALLOWED_MIME_TYPES } from "@/lib/upload-r2";

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

    if (!file.mimetype || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return res.status(400).json({
        error: `File type not allowed: ${file.mimetype}. Allowed: images, PDF, XLSX, DOCX, CSV, TXT, MD`,
      });
    }

    const buffer = fs.readFileSync(file.filepath);
    const originalName = file.originalFilename || "file";
    const ext = originalName.split(".").pop() || "bin";
    const key = `chat/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const url = await uploadToR2(buffer, key, file.mimetype);

    // Clean up temp file
    fs.unlinkSync(file.filepath);

    return res.json({
      url,
      filename: originalName,
      mimeType: file.mimetype,
      size: file.size || buffer.length,
    });
  } catch (error) {
    console.error("[upload-file] Error:", error);
    return res.status(500).json({ error: "Failed to upload file" });
  }
}
