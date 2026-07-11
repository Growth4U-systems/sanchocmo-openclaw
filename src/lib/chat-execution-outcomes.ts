const EMPTY_RUNTIME_REPLY = /runtime termin[oó] sin devolver respuesta visible|without (?:a )?visible (?:reply|response)/i;
const STOPPED = /^ejecuci[oó]n detenida\.?$/i;

interface ExecutionOutcomeMessage {
  role: string;
  text: string;
  ts?: number;
  errorDetail?: {
    category: string;
    raw: string;
    classifiedAt: number;
  };
}

/**
 * Old runtimes could append an error, an empty-reply fallback and a Stop ack
 * for the same turn. Render one terminal outcome until the next user message.
 */
export function collapseExecutionOutcomes<T extends ExecutionOutcomeMessage>(messages: readonly T[]): T[] {
  const visible: T[] = [];
  let terminalSeen = false;

  for (const message of messages) {
    if (message.role === "user") {
      terminalSeen = false;
      visible.push(message);
      continue;
    }

    const emptyRuntimeReply = EMPTY_RUNTIME_REPLY.test(message.text || "");
    const stopped = STOPPED.test((message.text || "").trim());
    const terminal = Boolean(message.errorDetail) || emptyRuntimeReply || stopped;
    if (terminal && terminalSeen) continue;

    if (emptyRuntimeReply && !message.errorDetail) {
      visible.push({
        ...message,
        errorDetail: {
          category: "model_unavailable",
          raw: message.text,
          classifiedAt: message.ts ?? Date.now(),
        },
      } as T);
    } else {
      visible.push(message);
    }
    if (terminal) terminalSeen = true;
  }

  return visible;
}
