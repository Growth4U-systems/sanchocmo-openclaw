import { appendDurableChatDelivery } from "@/lib/data/mc-chat-durable-delivery";
import type { ExecutionRun } from "@/lib/execution-control";
import {
  resolveMcChatExecutionOrigin,
  type McChatExecutionOriginDependencies,
  type ResolvedMcChatExecutionOrigin,
} from "@/lib/runtime/mc-chat-execution-origin";
import type {
  LeadsSearchProjectedResultV2,
  LeadsSearchProjectionTerminalStatus,
} from "./search-projection";

export interface LeadsSearchChatCompletionInput {
  run: ExecutionRun;
  terminalStatus: LeadsSearchProjectionTerminalStatus;
  result: LeadsSearchProjectedResultV2 | null;
}

export interface LeadsSearchChatCompletionDependencies extends McChatExecutionOriginDependencies {
  resolveOrigin?(
    run: ExecutionRun,
  ): Promise<ResolvedMcChatExecutionOrigin | null>;
  appendDelivery?: typeof appendDurableChatDelivery;
}

export type LeadsSearchChatCompletionDeliverer = (
  input: LeadsSearchChatCompletionInput,
) => Promise<void>;

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeMarkdown(value: string): string {
  return oneLine(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

function completedMessage(result: LeadsSearchProjectedResultV2): string {
  if (result.candidates.length === 0) {
    return "✅ Búsqueda de leads completada.\n\nNo encontré contactos que coincidan con estos criterios.";
  }
  const lines = [
    `✅ Búsqueda de leads completada: ${result.returned} ${result.returned === 1 ? "contacto encontrado" : "contactos encontrados"}.`,
    "",
  ];
  result.candidates.forEach((candidate, index) => {
    const details = [candidate.title, candidate.organizationName]
      .filter((value): value is string => Boolean(value))
      .map(escapeMarkdown);
    lines.push(
      `${index + 1}. **${escapeMarkdown(candidate.name)}**${details.length ? ` — ${details.join(" · ")}` : ""}`,
    );
    if (candidate.linkedinUrl) {
      lines.push(`   LinkedIn: ${escapeMarkdown(candidate.linkedinUrl)}`);
    }
  });
  if (result.hasMore) {
    lines.push(
      "",
      "Hay más resultados disponibles para una búsqueda posterior.",
    );
  }
  return lines.join("\n");
}

export function formatLeadsSearchChatCompletion(
  input: Pick<LeadsSearchChatCompletionInput, "terminalStatus" | "result">,
): string {
  if (input.terminalStatus === "completed" && input.result) {
    return completedMessage(input.result);
  }
  if (input.terminalStatus === "cancelled") {
    return "La búsqueda de leads fue cancelada y no se publicaron resultados.";
  }
  if (input.terminalStatus === "partial") {
    return "La búsqueda de leads terminó parcialmente. No se publicaron resultados incompletos.";
  }
  return "No se pudo completar la búsqueda de leads. La ejecución quedó registrada para diagnóstico.";
}

/**
 * Deliver a terminal result without another model turn. The immutable sidecar
 * makes retry-after-crash safe; the terminal projection is ACKed only after
 * this function returns.
 */
export async function deliverLeadsSearchChatCompletion(
  input: LeadsSearchChatCompletionInput,
  dependencies: LeadsSearchChatCompletionDependencies = {},
): Promise<void> {
  const origin = dependencies.resolveOrigin
    ? await dependencies.resolveOrigin(input.run)
    : await resolveMcChatExecutionOrigin(input.run, dependencies);
  if (!origin) return;
  (dependencies.appendDelivery ?? appendDurableChatDelivery)({
    threadId: origin.threadId,
    deliveryKey: `execution-terminal:leads.search:v1:${input.run.id}`,
    message: {
      role: "workflow",
      text: formatLeadsSearchChatCompletion(input),
      agent: origin.agent,
    },
  });
}
