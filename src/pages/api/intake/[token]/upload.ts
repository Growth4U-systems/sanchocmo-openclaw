/**
 * POST /api/intake/:token/upload — Public intake file upload to R2 (SAN-17 v1.1).
 *
 * Token-authenticated (stateless HMAC, same as the submit route). Accepts a
 * multipart/form-data `file` field. Validates mime type against the shared
 * ALLOWED_MIME_TYPES list and caps file size at 20MB. Stores to R2 under
 * `intake/{slug}/{timestamp}-{random}.{ext}` and returns the attachment ref.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { IncomingForm, type File } from "formidable";
import fs from "fs";
import crypto from "crypto";
import { withErrorHandler } from "@/lib/api-middleware";
import { verifyIntakeToken } from "@/lib/intake-tokens";
import { uploadToR2, ALLOWED_MIME_TYPES } from "@/lib/upload-r2";
import { loadClient } from "@/lib/data/clients";

export const config = {
  api: { bodyParser: false },
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify intake token
  const { token } = req.query;
  const tokenStr = Array.isArray(token) ? token[0] : token;
  if (!tokenStr) {
    return res.status(403).json({ error: "Missing token" });
  }
  const payload = verifyIntakeToken(tokenStr);
  if (!payload) {
    return res.status(403).json({ error: "Invalid token" });
  }

  // Confirm the client exists and is active
  const client = loadClient(payload.slug);
  if (!client || client.active === false) {
    return res.status(403).json({ error: "Invalid token" });
  }

  // Parse multipart upload (20MB cap)
  const form = new IncomingForm({ maxFileSize: 20 * 1024 * 1024 });

  let files: Record<string, File[]>;
  try {
    const parsed = await new Promise<{
      fields: Record<string, unknown>;
      files: Record<string, File[]>;
    }>((resolve, reject) => {
      form.parse(req, (err, fields, parsedFiles) => {
        if (err) reject(err);
        else resolve({ fields, files: parsedFiles as Record<string, File[]> });
      });
    });
    files = parsed.files;
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : "Failed to parse upload",
    });
  }

  const file = files.file?.[0];
  if (!file) {
    return res.status(400).json({ error: "No file provided (field name: file)" });
  }

  // Validate mime type
  const mimeType = file.mimetype || "";
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return res.status(400).json({
      error: `File type not allowed: ${mimeType}. Allowed: images, PDF, XLSX, DOCX, CSV, TXT, MD`,
    });
  }

  // Build R2 key: intake/{slug}/{timestamp}-{randomHex}.{ext}
  const originalName = file.originalFilename || "file";
  const ext = originalName.includes(".") ? originalName.split(".").pop() || "bin" : "bin";
  const randomHex = crypto.randomBytes(4).toString("hex");
  const key = `intake/${payload.slug}/${Date.now()}-${randomHex}.${ext}`;

  // Read, upload, clean up
  const buffer = fs.readFileSync(file.filepath);
  const size = file.size || buffer.length;
  const url = await uploadToR2(buffer, key, mimeType);
  try {
    fs.unlinkSync(file.filepath);
  } catch {
    // best-effort cleanup
  }

  return res.status(200).json({
    url,
    filename: originalName,
    mimeType,
    size,
  });
}

export default withErrorHandler(handler);
