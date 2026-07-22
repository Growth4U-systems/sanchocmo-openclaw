import { parseDelegateMarkers } from "./delegate-marker.mjs";
import { parseTaskRouteMarkers } from "./task-route-marker.mjs";
import { parseSanchoInterventionMarkers } from "./sancho-intervention-marker.mjs";
import { parseRuntimeEffectMarkers } from "./runtime-effect-marker.mjs";

/**
 * Runtime-neutral parser for the four-way control markers. It is used by the
 * Next control plane for runtimes that return a final response directly or via
 * `/api/chat/webhook`; OpenClaw's channel plugin applies the same rules at its
 * native delivery boundary.
 */
export function parseRuntimeControlReply(rawText, options = {}) {
  const respondingAgent = typeof options.respondingAgent === "string"
    ? options.respondingAgent.trim().toLowerCase()
    : "sancho";
  const temporaryAgent = options.temporaryAgent === true;
  let visibleText = typeof rawText === "string" ? rawText : "";
  let malformedCount = 0;
  let malformedEffectCount = 0;
  let blockedCount = 0;

  const parsedDelegate = parseDelegateMarkers(visibleText);
  visibleText = parsedDelegate.text;
  malformedCount += parsedDelegate.malformed.length;
  let delegations = respondingAgent === "sancho" && !temporaryAgent
    ? parsedDelegate.delegations
    : [];
  blockedCount += parsedDelegate.delegations.length - delegations.length;

  const parsedRoute = parseTaskRouteMarkers(visibleText);
  visibleText = parsedRoute.text;
  malformedCount += parsedRoute.malformed.length;
  let taskRoutes = temporaryAgent ? [] : parsedRoute.routes;
  blockedCount += parsedRoute.routes.length - taskRoutes.length;

  const parsedIntervention = parseSanchoInterventionMarkers(visibleText);
  visibleText = parsedIntervention.text;
  malformedCount += parsedIntervention.malformed.length;
  let interventions = respondingAgent !== "sancho" && !temporaryAgent
    ? parsedIntervention.interventions.slice(0, 1)
    : [];
  blockedCount += parsedIntervention.interventions.length - interventions.length;

  const parsedEffects = parseRuntimeEffectMarkers(visibleText);
  visibleText = parsedEffects.text;
  malformedEffectCount = parsedEffects.malformed.length;
  let effectRequests = [];
  const seenEffects = new Set();
  for (const effect of parsedEffects.effects) {
    // The durable execution origin intentionally allows one external command
    // per root turn. Keep the first valid envelope and fail closed on duplicate
    // or cross-tool fan-out.
    if (seenEffects.has(effect.name) || effectRequests.length >= 1) {
      blockedCount += 1;
      continue;
    }
    seenEffects.add(effect.name);
    effectRequests.push(effect);
  }

  // The reversible same-task option wins when the same response contradicts
  // itself. A temporary Sancho turn is never allowed to emit another action.
  if (temporaryAgent) {
    delegations = [];
    taskRoutes = [];
    interventions = [];
  } else if (interventions.length) {
    blockedCount += delegations.length + taskRoutes.length;
    delegations = [];
    taskRoutes = [];
  }

  // Moving to another task and starting an external effect in the current one
  // are contradictory terminal intents. Keep the reversible control action and
  // require the destination turn to admit its own effect.
  if (interventions.length || delegations.length || taskRoutes.length) {
    blockedCount += effectRequests.length;
    effectRequests = [];
  }

  const routeRequests = [
    ...delegations.map((item) => ({ ...item, routeSource: "delegate" })),
    ...taskRoutes.map((item) => ({
      ...item,
      agent: item.agent || respondingAgent,
      routeSource: "task-route",
    })),
  ];

  if (!visibleText) {
    if (interventions.length) {
      visibleText = "🛡️ Pido una intervención puntual de Sancho en esta misma tarea.";
    } else if (routeRequests.length) {
      visibleText = "🧭 Voy a ubicar la tarea correcta dentro de este grupo.";
    } else if (effectRequests.length) {
      visibleText = "He preparado la solicitud para la ejecución durable de Sancho.";
    }
  }

  const warnings = [];
  if (blockedCount > 0) {
    warnings.push(temporaryAgent
      ? "⚠️ La intervención temporal intentó encadenar otro cambio de tarea o agente. Bloqueé esa acción y mantuve el harness original."
      : "⚠️ Bloqueé una instrucción de control no autorizada o incompatible. No ejecuté ese cambio de tarea/agente.");
  }
  if (malformedCount > 0) {
    warnings.push("⚠️ El agente devolvió una instrucción de routing inválida. No cambié la tarea ni el agente por esa instrucción.");
  }
  if (malformedEffectCount > 0) {
    warnings.push("⚠️ El agente devolvió una solicitud de operación inválida. No inicié ningún efecto externo por esa instrucción.");
  }
  if (warnings.length) visibleText = [visibleText, ...warnings].filter(Boolean).join("\n\n");

  return {
    text: visibleText,
    intervention: interventions[0] || null,
    routeRequests,
    effectRequests,
    malformedCount: malformedCount + malformedEffectCount,
    blockedCount,
  };
}
