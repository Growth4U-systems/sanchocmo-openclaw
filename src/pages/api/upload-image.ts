import type { NextApiRequest, NextApiResponse } from "next";
import { uploadImageAssets } from "@/lib/upload-image";
import { IncomingForm, type File } from "formidable";
import fs from "fs";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const form = new IncomingForm({ maxFileSize: 10 * 1024 * 1024 });

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

    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ];

    if (!file.mimetype || !allowedMimeTypes.includes(file.mimetype)) {
      return res
        .status(400)
        .json({ error: "Invalid file type. Only images allowed." });
    }

    const buffer = fs.readFileSync(file.filepath);
    const ext = file.originalFilename?.split(".").pop() || "png";
    const filename = `upload-${Date.now()}.${ext}`;

    const url = await uploadImageAssets(buffer, filename, file.mimetype);

    // Clean up temp file
    fs.unlinkSync(file.filepath);

    return res.json({ url });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ error: "Failed to process upload" });
  }
}
