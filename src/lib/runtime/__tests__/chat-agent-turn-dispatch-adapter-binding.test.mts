import assert from "node:assert/strict";
import test from "node:test";
import type { AgentRun } from "@/lib/data/agent-runs";
import type { ExecutionRun } from "@/lib/execution-control";
import { prepareChatAgentTurnDispatch } from "@/lib/chat/agent-turn-durable";
import {
  chatAgentTurnDispatchBindingMatches,
  parseChatAgentTurnDispatchCommand,
} from "@/lib/runtime/chat-agent-turn-dispatch-authority";

const parentInput = {
  slug: "hospital-capilar",
  runtimeDispatchMode: "ledger-v1",
};

function parent(runtime: string): AgentRun {
  return {
    id: "parent-adapter-binding-1",
    threadId: "hospital-capilar:general",
    runtime,
    agent: "sancho",
    status: "running",
    input: parentInput,
    createdAt: "2026-07-17T12:00:00.000Z",
    updatedAt: "2026-07-17T12:00:00.000Z",
  };
}

function dispatch(parentRun: AgentRun): ExecutionRun {
  const prepared = prepareChatAgentTurnDispatch(parentRun, {
    env: {
      CHAT_AGENT_TURN_EXECUTION_V1: "canary",
      CHAT_AGENT_TURN_V1_SLUGS: "hospital-capilar",
      CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED: "1",
    },
  });
  return {
    ...prepared.createInput,
    id: "dispatch-adapter-binding-1",
    mode: "canary",
    status: "running",
    availableAt: "2026-07-17T12:00:00.000Z",
    claimCount: 1,
    handlerAttempt: 0,
    createdAt: "2026-07-17T12:00:00.000Z",
    updatedAt: "2026-07-17T12:00:00.000Z",
  };
}

test("the current chat worker binding is adapter-specific, outside generic conformance", () => {
  const currentAdapterParent = parent("openclaw");
  const currentDispatch = dispatch(currentAdapterParent);
  assert.equal(
    chatAgentTurnDispatchBindingMatches({
      parentRun: currentAdapterParent,
      dispatchRun: currentDispatch,
      command: parseChatAgentTurnDispatchCommand(currentDispatch),
    }),
    true,
  );

  const opaqueRuntimeParent = parent("scripted");
  const opaqueDispatch = dispatch(opaqueRuntimeParent);
  assert.equal(
    chatAgentTurnDispatchBindingMatches({
      parentRun: opaqueRuntimeParent,
      dispatchRun: opaqueDispatch,
      command: parseChatAgentTurnDispatchCommand(opaqueDispatch),
    }),
    false,
    "a different runtime needs its own authenticated worker identity and adapter binding",
  );
});
