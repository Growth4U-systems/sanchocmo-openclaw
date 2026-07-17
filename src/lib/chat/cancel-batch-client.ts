import { CHAT_EXTERNAL_EXECUTION_PARENT_SCAN_LIMIT } from "./external-execution-contract";

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,255}$/;
export const CHAT_CANCEL_BATCH_LIMIT =
  CHAT_EXTERNAL_EXECUTION_PARENT_SCAN_LIMIT + 1;

interface CancellationResponsePayload extends Record<string, unknown> {
  ok?: boolean;
  cancellationPending?: boolean;
  alreadyStopped?: boolean;
  error?: string;
}

export interface ChatCancellationOutcome {
  runId: string;
  ok: boolean;
  status: number;
  cancellationPending: boolean;
  alreadyStopped: boolean;
  error?: string;
}

export interface ChatCancellationBatchResult {
  threadId: string;
  outcomes: ChatCancellationOutcome[];
  requestedCount: number;
  cancelledCount: number;
  failedCount: number;
  partial: boolean;
  cancellationPending: boolean;
}

export class ChatCancellationBatchError extends Error {
  readonly result: ChatCancellationBatchResult;

  constructor(result: ChatCancellationBatchResult) {
    super("No se pudo detener ninguna de las ejecuciones activas.");
    this.name = "ChatCancellationBatchError";
    this.result = result;
  }
}

/**
 * Merge the current chat turn with every server-projected durable parent. The
 * server still validates each opaque ID against the authenticated thread.
 */
export function chatCancellationRunIds(
  activeRunId: string | null | undefined,
  durableParentRunIds: readonly string[],
): string[] {
  const requested = [
    ...(activeRunId === null || activeRunId === undefined
      ? []
      : [activeRunId]),
    ...durableParentRunIds,
  ];
  if (
    requested.some(
      (value) => typeof value !== "string" || !SAFE_RUN_ID.test(value),
    )
  ) {
    throw new Error("Invalid chat cancellation target");
  }
  const unique = [...new Set(requested)];
  if (unique.length > CHAT_CANCEL_BATCH_LIMIT) {
    throw new Error("Too many chat cancellation targets");
  }
  return unique;
}

function responsePayload(value: unknown): CancellationResponsePayload {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as CancellationResponsePayload)
    : {};
}

export async function requestChatCancellationBatch(
  input: {
    slug: string;
    threadId: string;
    runIds: readonly string[];
    agent?: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<ChatCancellationBatchResult> {
  const runIds = chatCancellationRunIds(undefined, input.runIds);
  if (runIds.length === 0) {
    throw new Error("No active chat execution to cancel");
  }

  const outcomes = await Promise.all(
    runIds.map(async (runId): Promise<ChatCancellationOutcome> => {
      try {
        const response = await fetchImpl("/api/chat/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: input.slug,
            threadId: input.threadId,
            runId,
            ...(input.agent ? { agent: input.agent } : {}),
          }),
        });
        const payload = responsePayload(
          await response.json().catch(() => null),
        );
        const ok = response.ok && payload.ok !== false;
        return {
          runId,
          ok,
          status: response.status,
          cancellationPending:
            ok && payload.cancellationPending === true,
          alreadyStopped: ok && payload.alreadyStopped === true,
          ...(!ok
            ? {
                error:
                  typeof payload.error === "string"
                    ? payload.error
                    : "Cancellation request failed",
              }
            : {}),
        };
      } catch {
        return {
          runId,
          ok: false,
          status: 0,
          cancellationPending: false,
          alreadyStopped: false,
          error: "Cancellation request failed",
        };
      }
    }),
  );
  const cancelledCount = outcomes.filter((outcome) => outcome.ok).length;
  const failedCount = outcomes.length - cancelledCount;
  const result: ChatCancellationBatchResult = {
    threadId: input.threadId,
    outcomes,
    requestedCount: outcomes.length,
    cancelledCount,
    failedCount,
    partial: cancelledCount > 0 && failedCount > 0,
    cancellationPending: outcomes.some(
      (outcome) => outcome.ok && outcome.cancellationPending,
    ),
  };
  if (cancelledCount === 0) throw new ChatCancellationBatchError(result);
  return result;
}
