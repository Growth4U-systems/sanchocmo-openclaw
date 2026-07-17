import assert from "node:assert/strict";
import test from "node:test";
import {
  ChatSendError,
  chatSendCommandFingerprint,
  chatSendErrorFromPayload,
  chatSendNetworkError,
  clearAcceptedChatDraft,
  clearAcceptedChatSendIntent,
  formatChatSendError,
  removeAcceptedChatFiles,
  resolveChatSendIntent,
  sameChatDraftSendIdentity,
  type ChatSendIntent,
} from "../chat-send-client";

test("one chat command keeps its idempotency key through retries and rotates after acceptance", () => {
  let sequence = 0;
  let current: ChatSendIntent | null = null;
  const commandFingerprint = chatSendCommandFingerprint({
    text: "Busca partners",
    threadId: "growth4u:general",
  });
  const start = () => {
    current = resolveChatSendIntent(
      current,
      commandFingerprint,
      () => `intent-${++sequence}`,
    );
    return current;
  };

  const first = start();
  // A network error or 503 does not clear the current intent.
  assert.equal(start().idempotencyKey, first.idempotencyKey);
  assert.equal(start().idempotencyKey, first.idempotencyKey);
  assert.equal(sequence, 1);

  current = clearAcceptedChatSendIntent(current, first.idempotencyKey);
  const nextAcceptedCommand = start();
  assert.equal(nextAcceptedCommand.idempotencyKey, "intent-2");
});

test("editing the command rotates its key and a stale success cannot clear it", () => {
  let sequence = 0;
  let current = resolveChatSendIntent(
    null,
    chatSendCommandFingerprint({ text: "Busca partners", limit: 10 }),
    () => `intent-${++sequence}`,
  );
  const firstKey = current.idempotencyKey;

  current = resolveChatSendIntent(
    current,
    chatSendCommandFingerprint({ limit: 20, text: "Busca partners" }),
    () => `intent-${++sequence}`,
  );
  assert.equal(current.idempotencyKey, "intent-2");
  assert.equal(
    clearAcceptedChatSendIntent(current, firstKey)?.idempotencyKey,
    "intent-2",
  );
});

test("command fingerprints ignore object key order but preserve command changes", () => {
  assert.equal(
    chatSendCommandFingerprint({
      threadId: "growth4u:general",
      attachments: [{ filename: "brief.pdf", size: 42 }],
    }),
    chatSendCommandFingerprint({
      attachments: [{ size: 42, filename: "brief.pdf" }],
      threadId: "growth4u:general",
    }),
  );
  assert.notEqual(
    chatSendCommandFingerprint({ text: "original" }),
    chatSendCommandFingerprint({ text: "editado" }),
  );
});

test("uploaded attachment receipts are reusable only for the same draft files", () => {
  const brief = { name: "brief.pdf" };
  const screenshot = { name: "captura.png" };
  const original = {
    threadId: "growth4u:general",
    text: "Revisa esto",
    files: [brief, screenshot],
  };

  assert.equal(
    sameChatDraftSendIdentity(original, {
      ...original,
      files: [brief, screenshot],
    }),
    true,
  );
  assert.equal(
    sameChatDraftSendIdentity(original, {
      ...original,
      files: [screenshot, brief],
    }),
    false,
  );
  assert.equal(
    sameChatDraftSendIdentity(original, {
      ...original,
      text: "Revisa esto con otro criterio",
    }),
    false,
  );
});

test("chat send errors preserve the server message and retryability contract", () => {
  const error = chatSendErrorFromPayload(
    {
      error: "No se pudo admitir el turno de forma durable",
      retryable: true,
    },
    503,
  );

  assert.ok(error instanceof ChatSendError);
  assert.equal(error.message, "No se pudo admitir el turno de forma durable");
  assert.equal(error.status, 503);
  assert.equal(error.retryable, true);
  assert.equal(
    formatChatSendError(error),
    "No se pudo admitir el turno de forma durable. Puedes reintentar: conservamos el texto y los adjuntos.",
  );
});

test("explicit non-retryable errors override an otherwise retryable HTTP status", () => {
  const error = chatSendErrorFromPayload(
    { message: "La solicitud no es válida", retryable: false },
    503,
  );
  assert.equal(error.message, "La solicitud no es válida");
  assert.equal(error.retryable, false);
  assert.equal(formatChatSendError(error), "La solicitud no es válida");
});

test("network failures are retryable without exposing browser-specific errors", () => {
  const cause = new TypeError("Failed to fetch");
  const error = chatSendNetworkError(cause);
  assert.equal(
    error.message,
    "No se pudo conectar con Sancho para enviar el mensaje.",
  );
  assert.equal(error.retryable, true);
  assert.equal(error.cause, cause);
});

test("successful cleanup cannot erase edits or files added while sending", () => {
  assert.equal(clearAcceptedChatDraft("texto enviado", "texto enviado"), "");
  assert.equal(
    clearAcceptedChatDraft("texto editado", "texto enviado"),
    "texto editado",
  );

  const sentFile = { name: "brief.pdf" };
  const laterFile = { name: "captura.png" };
  assert.deepEqual(removeAcceptedChatFiles([sentFile, laterFile], [sentFile]), [
    laterFile,
  ]);
});
