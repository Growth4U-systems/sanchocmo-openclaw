/**
 * attachments.ts — Pure validation/sanitization of client-supplied attachment
 * metadata posted with an intake submission (SAN-17 v1.1). The files themselves
 * are uploaded separately to R2; here we only sanitize the returned refs.
 */

export interface IntakeAttachment {
  url: string;
  filename: string;
  mimeType?: string;
  size?: number;
}

export const MAX_ATTACHMENTS = 15;
const MAX_FILENAME = 256;

/** Sanitize an unknown `attachments` value from a request body. Never throws. */
export function sanitizeAttachments(raw: unknown): IntakeAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: IntakeAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const url = typeof r.url === "string" ? r.url.trim() : "";
    const filename = typeof r.filename === "string" ? r.filename.trim() : "";
    // Only accept https URLs (R2 public URLs are https) — drop anything else.
    if (!/^https:\/\//i.test(url)) continue;
    if (!filename || filename.length > MAX_FILENAME) continue;
    const att: IntakeAttachment = { url, filename };
    if (typeof r.mimeType === "string" && r.mimeType) att.mimeType = r.mimeType.slice(0, 200);
    if (typeof r.size === "number" && Number.isFinite(r.size) && r.size >= 0) att.size = r.size;
    out.push(att);
    if (out.length >= MAX_ATTACHMENTS) break;
  }
  return out;
}
