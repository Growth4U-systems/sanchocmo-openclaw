import { isStopCommand } from "./session-dispatch-state.js";
import { runtimeRunStopAuthorityFor } from "./runtime-run-state.js";

const STOP_ACTION = "stop";

function requestedAgent(payload) {
  const agentId = typeof payload?.agentId === "string" ? payload.agentId : "";
  const agent = typeof payload?.agent === "string" ? payload.agent : "";
  return agentId && agentId === agent ? agent : null;
}

/**
 * Handle the narrow control-plane Stop rail before ordinary turn admission.
 *
 * Ordinary turns still require terminal + chat-turn authority. A Stop cannot
 * use that path because the control plane has already tombstoned the parent
 * and the original run id has already crossed inbound single-flight. Instead,
 * the authenticated transport supplies an explicit action header and this
 * function binds it to the exact process-local active run.
 */
export function processRuntimeStopControl({
  controlAction,
  payload,
  cancelRun,
}) {
  if (controlAction === undefined) return { handled: false };

  const agent = requestedAgent(payload);
  const validEnvelope =
    controlAction === STOP_ACTION &&
    payload?.runtimeControlAction === STOP_ACTION &&
    isStopCommand(payload?.text) &&
    isStopCommand(payload?.runtimeAuthorityText) &&
    payload?.isAdmin === true &&
    payload?.senderRole === undefined &&
    payload?.userId === "mc-admin" &&
    payload?.runtimeToolCapability === undefined &&
    payload?.runtimeTerminalCallbackGrant === undefined &&
    agent !== null;

  const stopAuthority = validEnvelope
    ? runtimeRunStopAuthorityFor({
        slug: payload?.slug,
        threadId: payload?.threadId,
        agent,
        missionControlRunId: payload?.missionControlRunId,
      })
    : null;
  if (!stopAuthority) {
    return {
      handled: true,
      status: 403,
      body: { error: "Invalid Mission Control stop authority" },
    };
  }

  const chatId = `channel:mc-chat:${payload.threadId}`;
  const cancelled = cancelRun(
    stopAuthority.sessionKey,
    "La ejecución fue detenida por el usuario.",
  );
  return {
    handled: true,
    status: 200,
    body: {
      ok: true,
      cancelled,
      chatId,
      finalText: cancelled
        ? "Ejecución detenida."
        : "No había ninguna ejecución activa que detener.",
      finalAgent: agent,
      message: cancelled ? "Active turn cancelled" : "No active turn found",
    },
  };
}
