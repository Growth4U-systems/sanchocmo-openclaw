import crypto from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { getRuntime } from "@/lib/runtime";
import {
  claimNextChatAgentTurn,
  completeChatAgentTurnRuntime,
  markChatAgentTurnRuntimeStarted,
  requeueChatAgentTurnRuntime,
  type ChatAgentTurnRemoteClaim,
} from "@/lib/chat/agent-turn-remote-worker";
import {
  authorizeChatAgentTurnRuntimeRequest,
  type ChatAgentTurnRuntimeAuthority,
} from "@/lib/runtime/chat-agent-turn-dispatch-authority";

const CLAIM_BODY_KEYS = new Set(["action", "workerId"]);
const CONTROL_BODY_KEYS = new Set(["action"]);
const REQUEUE_BODY_KEYS = new Set(["action", "reason"]);
const REQUEUE_REASONS = new Set([
  "runtime_session_busy",
  "runtime_dispatch_unavailable",
]);

type RequeueReason = "runtime_session_busy" | "runtime_dispatch_unavailable";

export interface ChatAgentTurnDispatchRouteDependencies {
  sharedSecret(): string | undefined;
  enabled(): boolean;
  claim(workerId: unknown): Promise<ChatAgentTurnRemoteClaim | null>;
  authorize(input: {
    parentAgentRunId: unknown;
    dispatchRunId: unknown;
    leaseToken: unknown;
    runtimeToolCapability: unknown;
    allowTerminalParent?: boolean;
    allowCancellationRequested?: boolean;
  }): Promise<ChatAgentTurnRuntimeAuthority | null>;
  markStarted(authority: ChatAgentTurnRuntimeAuthority): Promise<unknown>;
  complete(authority: ChatAgentTurnRuntimeAuthority): Promise<unknown>;
  requeue(
    authority: ChatAgentTurnRuntimeAuthority,
    reason: RequeueReason,
  ): Promise<unknown>;
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

function hasExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}

async function authorizeClaim(
  req: NextApiRequest,
  dependencies: ChatAgentTurnDispatchRouteDependencies,
  allowTerminalParent = false,
  allowCancellationRequested = false,
): Promise<ChatAgentTurnRuntimeAuthority | null> {
  return dependencies.authorize({
    parentAgentRunId: singleHeader(req, "x-mission-control-run-id"),
    dispatchRunId: singleHeader(req, "x-sancho-dispatch-run-id"),
    leaseToken: singleHeader(req, "x-sancho-dispatch-lease-token"),
    runtimeToolCapability: singleHeader(req, "x-sancho-run-capability"),
    allowTerminalParent,
    allowCancellationRequested,
  });
}

export function createChatAgentTurnDispatchHandler(
  dependencies: ChatAgentTurnDispatchRouteDependencies,
) {
  return async function chatAgentTurnDispatchHandler(
    req: NextApiRequest,
    res: NextApiResponse,
  ) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const expectedSecret = dependencies.sharedSecret();
    if (!expectedSecret || !dependencies.enabled()) {
      return res
        .status(503)
        .json({ error: "chat_agent_turn_worker_unavailable" });
    }
    if (!safeEqual(singleHeader(req, "x-mc-secret"), expectedSecret)) {
      return res.status(403).json({ error: "chat_agent_turn_worker_invalid" });
    }
    if (Object.keys(req.query).length > 0) {
      return res.status(400).json({ error: "chat_agent_turn_request_invalid" });
    }
    const body = plainRecord(req.body);
    if (!body || typeof body.action !== "string") {
      return res.status(400).json({ error: "chat_agent_turn_request_invalid" });
    }

    try {
      if (body.action === "claim") {
        if (!hasExactKeys(body, CLAIM_BODY_KEYS)) {
          return res
            .status(400)
            .json({ error: "chat_agent_turn_request_invalid" });
        }
        const claim = await dependencies.claim(body.workerId);
        return res.status(200).json({ ok: true, claim });
      }

      if (body.action === "requeue") {
        if (
          !hasExactKeys(body, REQUEUE_BODY_KEYS) ||
          typeof body.reason !== "string" ||
          !REQUEUE_REASONS.has(body.reason)
        ) {
          return res
            .status(400)
            .json({ error: "chat_agent_turn_request_invalid" });
        }
        const authority = await authorizeClaim(req, dependencies);
        if (!authority) {
          return res.status(409).json({ error: "chat_agent_turn_claim_lost" });
        }
        const requeued = await dependencies.requeue(
          authority,
          body.reason as RequeueReason,
        );
        if (!requeued) {
          return res.status(409).json({ error: "chat_agent_turn_claim_lost" });
        }
        return res.status(202).json({ ok: true, status: "queued" });
      }

      if (!hasExactKeys(body, CONTROL_BODY_KEYS)) {
        return res
          .status(400)
          .json({ error: "chat_agent_turn_request_invalid" });
      }
      if (body.action === "heartbeat") {
        // The final bot callback terminalizes the parent before OpenClaw has
        // necessarily finished its local teardown. Keep the exact dispatch
        // lease alive through that short interval; otherwise a heartbeat can
        // misread a successful terminal parent as a lost claim and abort it.
        const authority = await authorizeClaim(req, dependencies, true, true);
        if (!authority) {
          return res.status(409).json({ error: "chat_agent_turn_claim_lost" });
        }
        return res.status(200).json({
          ok: true,
          leaseExpiresAt: authority.lease.expiresAt,
          cancellationRequested: Boolean(
            authority.dispatchRun?.cancelRequestedAt,
          ),
        });
      }
      if (body.action === "started") {
        const authority = await authorizeClaim(req, dependencies);
        if (!authority) {
          return res.status(409).json({ error: "chat_agent_turn_claim_lost" });
        }
        const parent = await dependencies.markStarted(authority);
        if (!parent) {
          return res.status(409).json({ error: "chat_agent_turn_parent_lost" });
        }
        return res.status(200).json({ ok: true, status: "running" });
      }
      if (body.action === "complete") {
        const authority = await authorizeClaim(req, dependencies, true, true);
        if (!authority) {
          return res.status(409).json({ error: "chat_agent_turn_claim_lost" });
        }
        const completed = await dependencies.complete(authority);
        if (!completed) {
          return res.status(409).json({
            error: authority.dispatchRun?.cancelRequestedAt
              ? "chat_agent_turn_cancellation_pending"
              : "chat_agent_turn_parent_not_terminal",
          });
        }
        return res.status(200).json({ ok: true, status: "completed" });
      }
      return res.status(400).json({ error: "chat_agent_turn_request_invalid" });
    } catch {
      return res
        .status(503)
        .json({ error: "chat_agent_turn_worker_unavailable" });
    }
  };
}

export const config = {
  api: {
    bodyParser: { sizeLimit: "16kb" },
  },
};

export default createChatAgentTurnDispatchHandler({
  sharedSecret: () => getRuntime().messaging.getSharedSecret?.(),
  enabled: () => process.env.CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED === "1",
  claim: (workerId) => claimNextChatAgentTurn(workerId),
  authorize: (input) => authorizeChatAgentTurnRuntimeRequest(input),
  markStarted: (authority) => markChatAgentTurnRuntimeStarted(authority),
  complete: (authority) => completeChatAgentTurnRuntime(authority),
  requeue: (authority, reason) =>
    requeueChatAgentTurnRuntime(authority, reason),
});
