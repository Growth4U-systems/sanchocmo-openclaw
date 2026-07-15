import { ALLOWED_MIME_TYPES, getR2PublicUrl } from "@/lib/upload-r2";

export const MAX_CHAT_ATTACHMENTS = 5;
export const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export interface ValidatedChatAttachment {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export class ChatAttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatAttachmentValidationError";
  }
}

/**
 * Chat agents may only receive URLs produced by Sancho's own tenant-scoped R2
 * uploader. This prevents a browser payload or prompt injection from turning
 * the runtime into an arbitrary URL fetcher.
 */
export function validateChatAttachments(
  input: unknown,
  slug: string,
): ValidatedChatAttachment[] | undefined {
  if (input === undefined || input === null) return undefined;
  if (!Array.isArray(input)) {
    throw new ChatAttachmentValidationError("attachments must be an array");
  }
  if (input.length === 0) return undefined;
  if (input.length > MAX_CHAT_ATTACHMENTS) {
    throw new ChatAttachmentValidationError(
      `A maximum of ${MAX_CHAT_ATTACHMENTS} attachments is allowed`,
    );
  }

  const publicUrl = getR2PublicUrl();
  if (!publicUrl) {
    throw new ChatAttachmentValidationError("First-party attachment storage is unavailable");
  }

  let base: URL;
  try {
    base = new URL(publicUrl);
  } catch {
    throw new ChatAttachmentValidationError("First-party attachment storage is misconfigured");
  }
  if (base.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new ChatAttachmentValidationError("First-party attachment storage must use HTTPS");
  }
  const basePath = base.pathname.replace(/\/+$/, "");
  const expectedPathPrefix = `${basePath}/chat/${encodeURIComponent(slug)}/`.replace(
    /^\/\//,
    "/",
  );

  return input.map((raw, index) => {
    if (!raw || typeof raw !== "object") {
      throw new ChatAttachmentValidationError(`Attachment ${index + 1} is invalid`);
    }
    const item = raw as Record<string, unknown>;
    const filename = cleanFilename(item.filename);
    const mimeType = typeof item.mimeType === "string" ? item.mimeType.trim() : "";
    const size = Number(item.size);
    let url: URL;
    try {
      url = new URL(typeof item.url === "string" ? item.url : "");
    } catch {
      throw new ChatAttachmentValidationError(`Attachment ${index + 1} has an invalid URL`);
    }

    if (
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith(expectedPathPrefix)
    ) {
      throw new ChatAttachmentValidationError(
        `Attachment ${index + 1} is not a first-party file for this client`,
      );
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new ChatAttachmentValidationError(`Attachment ${index + 1} has a disallowed type`);
    }
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_CHAT_ATTACHMENT_BYTES) {
      throw new ChatAttachmentValidationError(`Attachment ${index + 1} has an invalid size`);
    }

    return {
      url: url.toString(),
      filename,
      mimeType,
      size,
    };
  });
}

function cleanFilename(value: unknown): string {
  if (typeof value !== "string") {
    throw new ChatAttachmentValidationError("Attachment filename is required");
  }
  const filename = value.replace(/[\u0000-\u001f\u007f/\\]/g, " ").trim();
  if (!filename || filename.length > 255) {
    throw new ChatAttachmentValidationError("Attachment filename is invalid");
  }
  return filename;
}
