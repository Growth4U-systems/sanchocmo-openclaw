import { markCancelled } from "@/lib/data/mc-chat";
import {
  getHttpRuntimeBaseUrl,
  getHttpRuntimeHealthPath,
  getHttpRuntimeInboundPath,
  getHttpRuntimeSecret,
  sendHttpRuntimeInbound,
  type HttpRuntimeConnectionConfig,
} from "@/lib/runtime/http-gateway";
import type {
  InboundMessage,
  SendInboundOptions,
  SendInboundResult,
} from "../../types";

export type HermesConnectionConfig = HttpRuntimeConnectionConfig;

export const MANAGED_HERMES_CONNECTION: HermesConnectionConfig = {
  baseUrlEnv: ["HERMES_GATEWAY_URL", "HERMES_BASE_URL", "HERMES_URL"],
  inboundPathEnv: ["HERMES_INBOUND_PATH"],
  healthPathEnv: ["HERMES_HEALTH_PATH"],
  // The managed bridge verifies HERMES_BRIDGE_SECRET first. Keep the adapter
  // on the same precedence so an unrelated OpenClaw MC_CHAT_SECRET cannot
  // make a healthy Hermes bridge reject every inbound turn with 403.
  secretEnv: [
    "HERMES_BRIDGE_SECRET",
    "HERMES_CHAT_SECRET",
    "HERMES_SHARED_SECRET",
    "MC_CHAT_SECRET",
  ],
  label: "Hermes managed",
};

export function getHermesBaseUrl(config = MANAGED_HERMES_CONNECTION): string | undefined {
  return getHttpRuntimeBaseUrl(config);
}

export function getHermesInboundPath(config = MANAGED_HERMES_CONNECTION): string {
  return getHttpRuntimeInboundPath(config);
}

export function getHermesHealthPath(config = MANAGED_HERMES_CONNECTION): string {
  return getHttpRuntimeHealthPath(config);
}

export function getHermesChatSecret(config = MANAGED_HERMES_CONNECTION): string | undefined {
  return getHttpRuntimeSecret(config);
}

export async function sendHermesInbound(
  message: InboundMessage,
  opts?: SendInboundOptions,
  config = MANAGED_HERMES_CONNECTION,
): Promise<SendInboundResult> {
  return sendHttpRuntimeInbound(message, opts, config);
}

export async function cancelHermesThread(threadId: string): Promise<void> {
  markCancelled(threadId);
}
