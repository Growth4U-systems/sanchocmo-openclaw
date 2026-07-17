import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { withErrorHandler } from "@/lib/api-middleware";
import { assembleContextPack } from "@/lib/data/context-pack";
import { getAgentRunByIdAsync } from "@/lib/data/agent-runs";
import { getRuntime } from "@/lib/runtime";
import { authorizeChatAgentTurnRuntimeRequest } from "@/lib/runtime/chat-agent-turn-dispatch-authority";
import { authorizeRuntimeRunRequest } from "@/lib/runtime/runtime-run-request-authority";

function singleHeader(req: NextApiRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? undefined : value;
}

function safeEqual(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const supplied = Buffer.from(left);
  const expected = Buffer.from(right);
  return (
    supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected)
  );
}

/**
 * POST /api/chat/context-pack  (SAN-246)
 *
 * Server-to-server endpoint consumed by the mc-chat gateway plugin to GROUND a
 * directly-dispatched specialist. The plugin presents the exact run
 * capability; slug and skill are derived from the persisted run.
 *
 * The shared secret authenticates transport only. Tenant and skill authority
 * come from the active run and its one-turn capability.
 */
export async function contextPackHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify shared secret (identical guard to /api/chat/webhook).
  const secret = getRuntime().messaging.getSharedSecret?.();
  if (!secret) {
    return res.status(503).json({ error: "MC_CHAT_SECRET not configured" });
  }
  if (!safeEqual(singleHeader(req, "x-mc-secret"), secret)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (
    req.body !== undefined &&
    req.body !== null &&
    (typeof req.body !== "object" ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length > 0)
  ) {
    return res.status(400).json({ error: "Context-pack body must be empty" });
  }
  const authority = await authorizeRuntimeRunRequest(
    {
      runId: singleHeader(req, "x-mission-control-run-id"),
      capability: singleHeader(req, "x-sancho-run-capability"),
      dispatchRunId: singleHeader(req, "x-sancho-dispatch-run-id"),
      dispatchLeaseToken: singleHeader(req, "x-sancho-dispatch-lease-token"),
    },
    {
      resolveAgentRun: getAgentRunByIdAsync,
      authorizeDispatchLease: (input) =>
        authorizeChatAgentTurnRuntimeRequest(input),
    },
  );
  if (!authority) {
    return res.status(403).json({ error: "Runtime run authority invalid" });
  }
  const persistedPrimarySkill = authority.input.primarySkill;
  const skillArg =
    typeof authority.run.skill === "string" && authority.run.skill.trim()
      ? authority.run.skill.trim().slice(0, 160)
      : typeof persistedPrimarySkill === "string" &&
          persistedPrimarySkill.trim()
        ? persistedPrimarySkill.trim().slice(0, 160)
        : null;
  const pack = assembleContextPack(authority.slug, skillArg);
  return res.status(200).json(pack);
}

export default withErrorHandler(contextPackHandler);
