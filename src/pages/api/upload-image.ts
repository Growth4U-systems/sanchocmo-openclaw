import type { NextApiRequest, NextApiResponse } from "next";
import { uploadImageAssets } from "@/lib/upload-image";
import { hasAllowedUploadSignature, R2ConfigError } from "@/lib/upload-r2";
import { IncomingForm, type File } from "formidable";
import fs from "fs";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";

export const config = {
  api: { bodyParser: false },
};

export async function uploadImageHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const tempFiles: File[] = [];
  try {
    const form = new IncomingForm({
      maxFileSize: 10 * 1024 * 1024,
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

    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (!file.mimetype || !allowedMimeTypes.includes(file.mimetype)) {
      cleanupTempFile(file);
      return res
        .status(400)
        .json({ error: "Invalid file type. Only images allowed." });
    }

    const buffer = fs.readFileSync(file.filepath);
    if (!hasAllowedUploadSignature(buffer, file.mimetype)) {
      return res.status(400).json({ error: "Image contents do not match the allowed type" });
    }
    const ext = file.originalFilename?.split(".").pop() || "png";
    const filename = `upload-${Date.now()}.${ext}`;

    let url: string;
    try {
      url = await uploadImageAssets(buffer, filename, file.mimetype);
    } finally {
      cleanupTempFile(file);
    }

    return res.json({ url });
  } catch (error) {
    if (error instanceof R2ConfigError) {
      return res.status(503).json({
        error: error.message,
        storage: { ok: false, missing: error.missing },
      });
    }
    console.error("Upload error:", error);
    return res.status(500).json({ error: "Failed to process upload" });
  } finally {
    for (const file of tempFiles) cleanupTempFile(file);
  }
}

export default compose(withErrorHandler, withAuth)(uploadImageHandler);

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
