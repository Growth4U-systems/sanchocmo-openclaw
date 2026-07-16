import crypto from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { getAgentRunByIdAsync } from "@/lib/data/agent-runs";
import { loadClient } from "@/lib/data/clients";
import { authorizeChatAgentTurnRuntimeRequest } from "@/lib/runtime/chat-agent-turn-dispatch-authority";
import { getRuntime } from "@/lib/runtime";
import {
  authorizeRuntimeChatTurn,
  type RuntimeChatTurnAuthorityDependencies,
  type RuntimeChatTurnClaims,
} from "@/lib/runtime/chat-turn-authority";

const CLAIM_KEYS = new Set([
  "slug",
  "threadId",
  "text",
  "runtimeAuthorityText",
  "agent",
  "agentId",
  "skill",
  "skills",
  "primarySkill",
  "scope",
  "skillMode",
  "temporaryAgent",
  "controlDepth",
  "isAdmin",
  "senderRole",
  "readOnly",
  "userId",
  "userName",
  "source",
  "activeOutboundWorkflow",
  "threadName",
  "linkedTo",
  "docPath",
  "docKind",
  "attachments",
  "channelMode",
  "supportContext",
  "priorThreadMessages",
  "taskRouteProposal",
  "threadState",
  "controlBaseUrl",
]);

export interface ChatTurnAuthorityRouteDependencies extends RuntimeChatTurnAuthorityDependencies {
  sharedSecret(): string | undefined;
}

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

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

export function createChatTurnAuthorityHandler(
  dependencies: ChatTurnAuthorityRouteDependencies,
) {
  return async function chatTurnAuthorityHandler(
    req: NextApiRequest,
    res: NextApiResponse,
  ) {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const expectedSecret = dependencies.sharedSecret();
    if (!expectedSecret) {
      return res.status(503).json({ error: "chat_turn_authority_unavailable" });
    }
    if (!safeEqual(singleHeader(req, "x-mc-secret"), expectedSecret)) {
      return res.status(403).json({ error: "chat_turn_authority_invalid" });
    }
    const claims = plainRecord(req.body);
    if (!claims || Object.keys(claims).some((key) => !CLAIM_KEYS.has(key))) {
      return res.status(403).json({ error: "chat_turn_authority_invalid" });
    }
    try {
      const authority = await authorizeRuntimeChatTurn(
        {
          runId: singleHeader(req, "x-mission-control-run-id"),
          capability: singleHeader(req, "x-sancho-run-capability"),
          dispatchRunId: singleHeader(req, "x-sancho-dispatch-run-id"),
          dispatchLeaseToken: singleHeader(
            req,
            "x-sancho-dispatch-lease-token",
          ),
          claims: claims as RuntimeChatTurnClaims,
        },
        dependencies,
      );
      if (!authority) {
        return res.status(403).json({ error: "chat_turn_authority_invalid" });
      }
      return res.status(200).json({ ok: true, authority });
    } catch {
      return res.status(503).json({ error: "chat_turn_authority_unavailable" });
    }
  };
}

export default createChatTurnAuthorityHandler({
  sharedSecret: () => getRuntime().messaging.getSharedSecret?.(),
  resolveAgentRun: getAgentRunByIdAsync,
  authorizeDispatchLease: (input) =>
    authorizeChatAgentTurnRuntimeRequest(input),
  clientExists: (slug) => Boolean(loadClient(slug)),
});
