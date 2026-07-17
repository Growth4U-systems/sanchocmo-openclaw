import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type {
  ClaimExecutionOriginCommandInput,
  ExecutionLeaseReceipt,
  ExecutionOriginCommandClaimReceipt,
  ExecutionOriginCommandClaimRepository,
  ExecutionRun,
  RenewExecutionRunLeaseInput,
} from "@/lib/execution-control";
import { ExecutionOriginCommandConflictError } from "@/lib/execution-control/types";
import { durableExecutionMcChatOrigin } from "@/lib/durable-execution/execution-origin";
import {
  authorizeRuntimeDispatchLease,
  runtimeDispatchLeaseCapability,
  type RuntimeDispatchLeaseContract,
  type RuntimeDispatchLeaseRepository,
} from "@/lib/runtime/dispatch-lease-authority";
import type { InboundMessage, SendInboundResult } from "@/lib/runtime/types";
import {
  ScriptedRuntimeToolAdapter,
  type ScriptedRuntimeTool,
  type ScriptedRuntimeToolAuthority,
  type ScriptedRuntimeToolResult,
} from "./fixtures/scripted-runtime-tool-harness";

const tenantKey = "hospital-capilar";
const parentRunId = "parent-runtime-conformance-1";
const dispatchRunId = "dispatch-runtime-conformance-1";
const leaseToken = `lease_${"l".repeat(48)}`;
const expiresAt = "2026-07-17T12:01:00.000Z";
const operation = "test.runtime.tool_dispatch";
const runtimeToolCapability = runtimeDispatchLeaseCapability({
  parentRunId,
  dispatchRunId,
  leaseToken,
});

interface OpaqueParent {
  id: string;
  status: string;
  tenantKey: string;
}

interface DispatchCommand {
  parentRunId: string;
  tenantKey: string;
}

const parent: OpaqueParent = {
  id: parentRunId,
  status: "running",
  tenantKey,
};

function dispatchRun(): ExecutionRun {
  return {
    id: dispatchRunId,
    tenantKey,
    idempotencyKey: "runtime-conformance-dispatch-v1",
    aggregateType: "agent_run",
    aggregateId: parentRunId,
    operation,
    mode: "canary",
    status: "running",
    input: { parentRunId, tenantKey },
    metadata: {},
    availableAt: "2026-07-17T12:00:00.000Z",
    claimCount: 1,
    handlerAttempt: 0,
    createdAt: "2026-07-17T12:00:00.000Z",
    updatedAt: "2026-07-17T12:00:00.000Z",
  };
}

function dispatchCommand(run: ExecutionRun): DispatchCommand {
  const input = run.input as Partial<DispatchCommand> | undefined;
  if (
    typeof input?.parentRunId !== "string" ||
    typeof input.tenantKey !== "string"
  ) {
    throw new Error("runtime_conformance_dispatch_command_invalid");
  }
  return { parentRunId: input.parentRunId, tenantKey: input.tenantKey };
}

function dispatchContract(): RuntimeDispatchLeaseContract<
  OpaqueParent,
  DispatchCommand
> {
  return {
    operation,
    mode: "canary",
    aggregateType: "agent_run",
    leaseMs: 60_000,
    resolveParentRun: async (id) => (id === parentRunId ? parent : null),
    parseCommand: dispatchCommand,
    bindingMatches: ({
      parentRun: resolvedParent,
      dispatchRun: persistedDispatch,
      command,
    }) =>
      command.parentRunId === resolvedParent.id &&
      command.tenantKey === resolvedParent.tenantKey &&
      persistedDispatch.tenantKey === resolvedParent.tenantKey,
  };
}

class InMemoryDispatchRepository implements RuntimeDispatchLeaseRepository {
  readonly renewals: RenewExecutionRunLeaseInput[] = [];
  readonly run = dispatchRun();

  async getRunById(id: string): Promise<ExecutionRun | null> {
    return id === this.run.id ? this.run : null;
  }

  async renewRunLease(
    input: RenewExecutionRunLeaseInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    this.renewals.push(input);
    if (
      input.tenantKey !== tenantKey ||
      input.operation !== operation ||
      input.mode !== "canary" ||
      input.runId !== dispatchRunId ||
      input.token !== leaseToken
    ) {
      return null;
    }
    return {
      run: this.run,
      token: leaseToken,
      expiresAt,
      recovered: false,
    };
  }
}

class InMemoryOriginCommandClaims implements ExecutionOriginCommandClaimRepository {
  private readonly claims = new Map<
    string,
    ExecutionOriginCommandClaimReceipt & { commandFingerprint: string }
  >();

  async claimExecutionOriginCommand(
    input: ClaimExecutionOriginCommandInput,
  ): Promise<ExecutionOriginCommandClaimReceipt> {
    const key = `${input.tenantKey}\u0000${input.origin.parentAgentRunId}`;
    const existing = this.claims.get(key);
    if (existing) {
      if (
        existing.operation !== input.operation ||
        existing.commandFingerprint !== input.commandFingerprint
      ) {
        throw new ExecutionOriginCommandConflictError();
      }
      return existing;
    }
    const claimed = {
      tenantKey: input.tenantKey,
      origin: input.origin,
      operation: input.operation,
      commandFingerprint: input.commandFingerprint,
      claimedAt: "2026-07-17T12:00:01.000Z",
    };
    this.claims.set(key, claimed);
    return claimed;
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function commandFingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

interface ProductReceipt {
  operation: string;
  runId: string;
  created: boolean;
  replayed: boolean;
}

class LedgerAdmissionTool implements ScriptedRuntimeTool {
  readonly admittedRuns = new Map<
    string,
    Omit<ProductReceipt, "created" | "replayed">
  >();
  readonly authorizedTuples: ScriptedRuntimeToolAuthority[] = [];
  productAdmissions = 0;

  constructor(
    readonly name: string,
    private readonly productOperation: string,
    private readonly dispatchRepository: RuntimeDispatchLeaseRepository,
    private readonly originCommands: ExecutionOriginCommandClaimRepository,
  ) {}

  async execute(
    input: unknown,
    context: {
      authority: ScriptedRuntimeToolAuthority;
      message: InboundMessage;
    },
  ): Promise<ScriptedRuntimeToolResult> {
    this.authorizedTuples.push(context.authority);
    const authority = await authorizeRuntimeDispatchLease(
      {
        parentRunId: context.authority.parentRunId,
        dispatchRunId: context.authority.dispatchRunId,
        leaseToken: context.authority.dispatchLeaseToken,
        capability: context.authority.runtimeToolCapability,
      },
      {
        repository: this.dispatchRepository,
        contract: dispatchContract(),
      },
    );
    if (!authority) {
      return { ok: false, status: 403, code: "runtime_tool_unauthorized" };
    }

    const fingerprint = commandFingerprint(input);
    try {
      await this.originCommands.claimExecutionOriginCommand({
        tenantKey: authority.dispatchRun.tenantKey,
        origin: durableExecutionMcChatOrigin(authority.parentRun.id),
        operation: this.productOperation,
        commandFingerprint: fingerprint,
      });
    } catch (error) {
      if (error instanceof ExecutionOriginCommandConflictError) {
        return { ok: false, status: 409, code: "execution_command_conflict" };
      }
      throw error;
    }

    const key = `${authority.parentRun.id}\u0000${this.productOperation}\u0000${fingerprint}`;
    const existing = this.admittedRuns.get(key);
    if (existing) {
      return {
        ok: true,
        status: 200,
        receipt: { ...existing, created: false, replayed: true },
      };
    }
    this.productAdmissions += 1;
    const receipt = {
      operation: this.productOperation,
      runId: `xrun-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
    };
    this.admittedRuns.set(key, receipt);
    return {
      ok: true,
      status: 202,
      receipt: { ...receipt, created: true, replayed: false },
    };
  }
}

const scripts: Record<string, { toolName: string; input: unknown }> = {
  "partners:hair": {
    toolName: "partnerships.discovery",
    input: {
      plan: {
        audience: "women",
        sector: "hair-care",
        country: "ES",
      },
    },
  },
  "partners:beauty": {
    toolName: "partnerships.discovery",
    input: {
      plan: { audience: "women", sector: "beauty", country: "ES" },
    },
  },
  "leads:marketing": {
    toolName: "leads.search",
    input: { criteria: { titles: ["Marketing Director"] }, limit: 3 },
  },
};

function envelope(text: string): InboundMessage {
  return {
    slug: tenantKey,
    threadId: `${tenantKey}:general`,
    text,
    userId: "mc-admin",
    userName: "Martin",
    agent: "sancho",
    missionControlRunId: parentRunId,
    runtimeToolCapability,
  };
}

const sendOptions = {
  headers: {
    "X-Sancho-Dispatch-Run-Id": dispatchRunId,
    "X-Sancho-Dispatch-Lease-Token": leaseToken,
  },
};

function resultBody(result: SendInboundResult): Record<string, unknown> {
  const value = JSON.parse(result.raw) as unknown;
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

test("a scripted runtime selects one tool and preserves authority, replay and conflict", async () => {
  const dispatchRepository = new InMemoryDispatchRepository();
  const originCommands = new InMemoryOriginCommandClaims();
  const partnerships = new LedgerAdmissionTool(
    "partnerships.discovery",
    "partnerships.discovery",
    dispatchRepository,
    originCommands,
  );
  const leads = new LedgerAdmissionTool(
    "leads.search",
    "leads.search",
    dispatchRepository,
    originCommands,
  );
  const adapter = new ScriptedRuntimeToolAdapter({
    tools: [leads, partnerships],
    select: (message, availableTools) => {
      const scripted = scripts[message.text];
      assert.ok(scripted, `missing script for ${message.text}`);
      assert.ok(availableTools.includes(scripted.toolName));
      return [scripted];
    },
  });

  const first = await adapter.messaging.sendInbound(
    envelope("partners:hair"),
    sendOptions,
  );
  const replay = await adapter.messaging.sendInbound(
    envelope("partners:hair"),
    sendOptions,
  );
  const argumentDrift = await adapter.messaging.sendInbound(
    envelope("partners:beauty"),
    sendOptions,
  );
  const otherTool = await adapter.messaging.sendInbound(
    envelope("leads:marketing"),
    sendOptions,
  );

  assert.equal(first.status, 202);
  assert.equal(replay.status, 200);
  assert.equal(argumentDrift.status, 409);
  assert.equal(otherTool.status, 409);
  const firstReceipt = resultBody(first).receipt as ProductReceipt;
  const replayReceipt = resultBody(replay).receipt as ProductReceipt;
  assert.equal(firstReceipt.created, true);
  assert.equal(firstReceipt.replayed, false);
  assert.equal(replayReceipt.created, false);
  assert.equal(replayReceipt.replayed, true);
  assert.equal(replayReceipt.runId, firstReceipt.runId);
  assert.equal(resultBody(argumentDrift).code, "execution_command_conflict");
  assert.equal(resultBody(otherTool).code, "execution_command_conflict");

  assert.deepEqual(
    adapter.invocations.map((invocation) => invocation.toolName),
    [
      "partnerships.discovery",
      "partnerships.discovery",
      "partnerships.discovery",
      "leads.search",
    ],
  );
  assert.equal(partnerships.productAdmissions, 1);
  assert.equal(partnerships.admittedRuns.size, 1);
  assert.equal(leads.productAdmissions, 0);
  assert.equal(leads.admittedRuns.size, 0);

  const expectedAuthority = {
    parentRunId,
    dispatchRunId,
    dispatchLeaseToken: leaseToken,
    runtimeToolCapability,
  };
  for (const invocation of adapter.invocations) {
    assert.deepEqual(invocation.authority, expectedAuthority);
  }
  assert.deepEqual(partnerships.authorizedTuples, [
    expectedAuthority,
    expectedAuthority,
    expectedAuthority,
  ]);
  assert.deepEqual(leads.authorizedTuples, [expectedAuthority]);
  assert.equal(dispatchRepository.renewals.length, 4);
  for (const renewal of dispatchRepository.renewals) {
    assert.deepEqual(renewal, {
      tenantKey,
      operation,
      mode: "canary",
      runId: dispatchRunId,
      token: leaseToken,
      leaseMs: 60_000,
    });
  }
});

test("zero or multiple scripted tool selections fail before tool execution", async (t) => {
  for (const [name, selected] of [
    ["zero", []],
    [
      "multiple",
      [
        { toolName: "fixture.first", input: {} },
        { toolName: "fixture.second", input: {} },
      ],
    ],
  ] as const) {
    await t.test(name, async () => {
      let executions = 0;
      const tool = (toolName: string): ScriptedRuntimeTool => ({
        name: toolName,
        async execute() {
          executions += 1;
          return { ok: true, status: 202 };
        },
      });
      const adapter = new ScriptedRuntimeToolAdapter({
        tools: [tool("fixture.first"), tool("fixture.second")],
        select: () => selected,
      });
      const result = await adapter.messaging.sendInbound(
        envelope("unused"),
        sendOptions,
      );
      assert.equal(result.status, 409);
      assert.equal(
        resultBody(result).code,
        "runtime_tool_selection_not_singular",
      );
      assert.equal(executions, 0);
      assert.equal(adapter.invocations.length, 0);
    });
  }
});

test("the generic runtime and lease harness contains no vendor adapter dependency", () => {
  const files = [
    "src/lib/__tests__/fixtures/scripted-runtime-tool-harness.ts",
    "src/lib/runtime/dispatch-lease-authority.ts",
  ];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(process.cwd(), relative), "utf8");
    assert.doesNotMatch(source, /openclaw|hermes/i, relative);
    assert.doesNotMatch(source, /runtime\/adapters\//i, relative);
  }
});
