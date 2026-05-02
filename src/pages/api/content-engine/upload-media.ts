import type { NextApiRequest, NextApiResponse } from "next";
import { IncomingForm, type File } from "formidable";
import fs from "fs";
import { withErrorHandler } from "@/lib/api-middleware";
import { uploadToR2 } from "@/lib/upload-r2";
import { attachMediaToDraft, buildMediaKey } from "@/lib/publishing/media-helpers";
import { loadDraft } from "@/lib/data/drafts";

export const config = { api: { bodyParser: false } };

/**
 * POST /api/content-engine/upload-media (multipart)
 *   fields: slug, ideaId, channel
 *   file:   `file` — image binary
 *
 * Uploads to R2 under the brand/idea/channel namespace and appends the asset
 * to the draft's `media[]`. The existing `/api/upload-image` endpoint stays
 * for legacy/non-content uploads.
 */

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/svg+xml",
]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = new IncomingForm({ maxFileSize: 10 * 1024 * 1024 });
  const parsed = await new Promise<{
    fields: Record<string, string | string[] | undefined>;
    files: Record<string, File[]>;
  }>((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields: fields as Record<string, string | string[] | undefined>, files: files as Record<string, File[]> });
    });
  });

  const slug = pickField(parsed.fields.slug);
  const ideaId = pickField(parsed.fields.ideaId);
  const channel = pickField(parsed.fields.channel);
  if (!slug || !ideaId || !channel) {
    return res.status(400).json({ error: "Missing slug, ideaId or channel" });
  }
  if (!loadDraft(slug, ideaId, channel)) {
    return res.status(404).json({ error: "Draft not found" });
  }

  const file = parsed.files.file?.[0];
  if (!file) return res.status(400).json({ error: "No file provided" });
  if (!file.mimetype || !ALLOWED_MIME.has(file.mimetype)) {
    return res.status(400).json({ error: "Invalid file type. Only images allowed." });
  }

  const buffer = fs.readFileSync(file.filepath);
  const ext = file.originalFilename?.split(".").pop() || "png";
  const key = buildMediaKey(slug, ideaId, channel, ext);
  const publicUrl = await uploadToR2(buffer, key, file.mimetype);
  fs.unlinkSync(file.filepath);

  const draft = attachMediaToDraft(slug, ideaId, channel, {
    url: publicUrl,
    type: file.mimetype,
    source: "uploaded",
    created_at: new Date().toISOString(),
  });

  return res.status(200).json({ ok: true, url: publicUrl, draft });
}

function pickField(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default withErrorHandler(handler);
