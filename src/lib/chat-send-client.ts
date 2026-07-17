export class ChatSendError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    message: string,
    options: { retryable: boolean; status?: number; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "ChatSendError";
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

export interface ChatSendIntent {
  commandFingerprint: string;
  idempotencyKey: string;
}

export interface ChatDraftSendIdentity<FileRef> {
  threadId: string;
  text: string;
  files: readonly FileRef[];
}

function canonicalJson(value: unknown): string | undefined {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((entry) => canonicalJson(entry) ?? "null")
      .join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .flatMap((key) => {
        const encoded = canonicalJson(record[key]);
        return encoded === undefined
          ? []
          : [`${JSON.stringify(key)}:${encoded}`];
      })
      .join(",")}}`;
  }
  return undefined;
}

/**
 * Fingerprint exactly the command body whose idempotency key is being chosen.
 * Object keys are canonicalized so harmless metadata insertion-order changes
 * do not turn a retry into a second logical command.
 */
export function chatSendCommandFingerprint(command: unknown): string {
  const fingerprint = canonicalJson(command);
  if (fingerprint === undefined) {
    throw new Error("Chat send command is not JSON serializable");
  }
  return fingerprint;
}

/** Keep one key for one command until a successful HTTP admission clears it. */
export function resolveChatSendIntent(
  current: ChatSendIntent | null,
  commandFingerprint: string,
  createIdempotencyKey: () => string,
): ChatSendIntent {
  if (current?.commandFingerprint === commandFingerprint) return current;
  return {
    commandFingerprint,
    idempotencyKey: createIdempotencyKey(),
  };
}

/** A stale success must never clear a newer command that started concurrently. */
export function clearAcceptedChatSendIntent(
  current: ChatSendIntent | null,
  acceptedIdempotencyKey: string,
): ChatSendIntent | null {
  return current?.idempotencyKey === acceptedIdempotencyKey ? null : current;
}

/**
 * Uploaded attachments belong to the draft's logical command. Comparing file
 * references lets the sidebar reuse the first upload receipts on HTTP retry,
 * while an add/remove/replace operation starts a new command.
 */
export function sameChatDraftSendIdentity<FileRef>(
  left: ChatDraftSendIdentity<FileRef>,
  right: ChatDraftSendIdentity<FileRef>,
): boolean {
  return (
    left.threadId === right.threadId &&
    left.text === right.text &&
    left.files.length === right.files.length &&
    left.files.every((file, index) => file === right.files[index])
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function chatSendErrorFromPayload(
  payload: unknown,
  status: number,
): ChatSendError {
  const body = record(payload);
  const message =
    nonEmptyText(body?.error) ??
    nonEmptyText(body?.message) ??
    "No se pudo enviar el mensaje.";
  const retryable =
    typeof body?.retryable === "boolean"
      ? body.retryable
      : status === 408 || status === 429 || status >= 500;
  return new ChatSendError(message, { retryable, status });
}

export function chatSendNetworkError(cause: unknown): ChatSendError {
  if (cause instanceof ChatSendError) return cause;
  return new ChatSendError(
    "No se pudo conectar con Sancho para enviar el mensaje.",
    { retryable: true, cause },
  );
}

export function formatChatSendError(error: unknown): string {
  const normalized = chatSendNetworkError(error);
  if (!normalized.retryable) return normalized.message;
  const separator = /[.!?…]$/u.test(normalized.message) ? " " : ". ";
  return `${normalized.message}${separator}Puedes reintentar: conservamos el texto y los adjuntos.`;
}

/** Only clear the draft that the server actually accepted. */
export function clearAcceptedChatDraft(
  currentDraft: string,
  acceptedDraft: string,
): string {
  return currentDraft === acceptedDraft ? "" : currentDraft;
}

/** Preserve files added while a send was in flight. Identity is intentional. */
export function removeAcceptedChatFiles<T>(
  currentFiles: readonly T[],
  acceptedFiles: readonly T[],
): T[] {
  const accepted = new Set(acceptedFiles);
  return currentFiles.filter((file) => !accepted.has(file));
}
