import { appendDurableChatDelivery } from "@/lib/data/mc-chat-durable-delivery";
import type { ExecutionRun } from "@/lib/execution-control";
import {
  resolveMcChatExecutionOrigin,
  type McChatExecutionOriginDependencies,
  type ResolvedMcChatExecutionOrigin,
} from "@/lib/runtime/mc-chat-execution-origin";
import type { PartnershipsDiscoveryStatsV2 } from "./discovery-handler-v2";

export interface PartnershipsDiscoveryChatCompletionDependencies extends McChatExecutionOriginDependencies {
  resolveOrigin?(
    run: ExecutionRun,
  ): Promise<ResolvedMcChatExecutionOrigin | null>;
  appendDelivery?: typeof appendDurableChatDelivery;
}

function statsFromRun(run: ExecutionRun): PartnershipsDiscoveryStatsV2 | null {
  if (!run.output || typeof run.output !== "object") return null;
  const stats = (run.output as { stats?: unknown }).stats;
  return stats && typeof stats === "object"
    ? (stats as PartnershipsDiscoveryStatsV2)
    : null;
}

export function formatPartnershipsDiscoveryChatCompletion(
  run: ExecutionRun,
): string {
  if (run.status === "completed") {
    const stats = statsFromRun(run);
    if (stats) {
      const parts: string[] = [];
      if (stats.sourced > 0) {
        parts.push(
          `${stats.sourced} lista${stats.sourced === 1 ? "" : "s"} para outreach`,
        );
      }
      if (stats.disqualified > 0) {
        parts.push(
          `${stats.disqualified} por debajo del umbral de calidad (puedes recalificarlas a mano)`,
        );
      }
      if (stats.dropped > 0) {
        parts.push(`${stats.dropped} ya existían como leads y no se duplicaron`);
      }
      const found = stats.candidates || stats.inserted + stats.dropped;
      const summary = parts.length > 0 ? ` — ${parts.join(" · ")}` : "";
      return (
        `✅ Búsqueda completada: ${found} candidata${found === 1 ? "" : "s"} encontrada${found === 1 ? "" : "s"}${summary}. ` +
        `Las tienes en Outreach → Encuentra.`
      );
    }
    return "✅ Búsqueda de partners completada. Las candidatas están en Outreach → Encuentra.";
  }
  if (run.status === "cancelled") {
    return "La búsqueda de partners fue cancelada y no se publicaron resultados nuevos.";
  }
  if (run.status === "partial") {
    return "La búsqueda de partners terminó parcialmente. El Ledger conserva el diagnóstico y no se publicaron resultados incompletos.";
  }
  return "No se pudo completar la búsqueda de partners. La ejecución quedó registrada para diagnóstico.";
}

/** Terminal delivery is insert-only and therefore safe after projection crash. */
export async function deliverPartnershipsDiscoveryChatCompletion(
  run: ExecutionRun,
  dependencies: PartnershipsDiscoveryChatCompletionDependencies = {},
): Promise<void> {
  const origin = dependencies.resolveOrigin
    ? await dependencies.resolveOrigin(run)
    : await resolveMcChatExecutionOrigin(run, dependencies);
  if (!origin) return;
  (dependencies.appendDelivery ?? appendDurableChatDelivery)({
    threadId: origin.threadId,
    deliveryKey: `execution-terminal:partnerships.discovery:v2:${run.id}`,
    message: {
      role: "workflow",
      text: formatPartnershipsDiscoveryChatCompletion(run),
      agent: origin.agent,
    },
  });
}
