import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHAT_AGENT_TURN_OPERATION,
  createChatAgentTurnHandlerV1,
  parseChatAgentTurnCommandV1,
  parseChatAgentTurnResultV1,
} from "../agent-turn-contract-v1";
import {
  agentRunInputFingerprint,
  commandForAgentRun,
  resolveChatAgentTurnPolicy,
} from "../agent-turn-durable";
import type { AgentRun } from "@/lib/data/agent-runs";

const parent: AgentRun = {
  id: "run_parent_1",
  threadId: "hospital-capilar:partners",
  traceId: "trace-parent-1",
  runtime: "openclaw",
  agent: "rocinante",
  skillMode: "auto",
  status: "queued",
  input: {
    slug: "hospital-capilar",
    threadId: "hospital-capilar:partners",
    text: "Busca partners",
    runtimeDispatchMode: "ledger-v1",
  },
  createdAt: "2026-07-16T10:00:00.000Z",
  updatedAt: "2026-07-16T10:00:00.000Z",
};

test("chat agent-turn command is closed and binds the immutable parent input", () => {
  const command = commandForAgentRun(parent);
  assert.deepEqual(command, {
    schemaVersion: 1,
    parentAgentRunId: parent.id,
    parentInputFingerprint: agentRunInputFingerprint(parent),
    slug: "hospital-capilar",
    threadId: parent.threadId,
    agent: "rocinante",
  });
  assert.throws(() =>
    parseChatAgentTurnCommandV1({ ...command, text: "must not persist" }),
  );
  assert.equal(createChatAgentTurnHandlerV1().operation, CHAT_AGENT_TURN_OPERATION);
});

test("parent input fingerprint is stable across object key order", () => {
  const left = agentRunInputFingerprint({ input: { a: 1, b: { c: 2 } } });
  const right = agentRunInputFingerprint({ input: { b: { c: 2 }, a: 1 } });
  assert.equal(left, right);
});

test("terminal result accepts only a final parent status", () => {
  assert.equal(
    parseChatAgentTurnResultV1({
      completionBoundary: "runtime_finished",
      parentAgentRunId: parent.id,
      parentStatus: "completed",
    }).parentStatus,
    "completed",
  );
  assert.throws(() =>
    parseChatAgentTurnResultV1({
      completionBoundary: "runtime_finished",
      parentAgentRunId: parent.id,
      parentStatus: "running",
    }),
  );
});

test("rollout requires exact canary, tenant allowlist and remote worker boot", () => {
  assert.deepEqual(
    resolveChatAgentTurnPolicy("hospital-capilar", {
      CHAT_AGENT_TURN_EXECUTION_V1: "canary",
      CHAT_AGENT_TURN_V1_SLUGS: "hospital-capilar",
      CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED: "1",
    }),
    { mode: "canary", enabled: true, reason: "enabled" },
  );
  assert.equal(
    resolveChatAgentTurnPolicy("hospital-capilar", {
      CHAT_AGENT_TURN_EXECUTION_V1: "canary",
      CHAT_AGENT_TURN_V1_SLUGS: "hospital-capilar",
    }).reason,
    "worker_disabled",
  );
  assert.equal(
    resolveChatAgentTurnPolicy("other", {
      CHAT_AGENT_TURN_EXECUTION_V1: "canary",
      CHAT_AGENT_TURN_V1_SLUGS: "hospital-capilar",
      CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED: "1",
    }).reason,
    "slug_not_allowlisted",
  );
});
