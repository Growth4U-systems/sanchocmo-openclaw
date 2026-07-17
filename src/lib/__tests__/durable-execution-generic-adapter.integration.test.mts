import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "../../db/drizzle";
import {
  PostgresExecutionControlRepository,
  type ExecutionLeaseScope,
} from "@/lib/execution-control";
import { admitDurableExecutionV2 } from "@/lib/durable-execution/admission";
import type {
  DurableEffectDefinition,
  DurableExecutionHandlerV2,
} from "@/lib/durable-execution/effect-contract";
import type { DurableCapabilityPolicy } from "@/lib/durable-execution/effect-executor";
import type {
  DurableJsonBounds,
  DurableJsonContract,
} from "@/lib/durable-execution/json-contract";
import { DurableExecutionRegistry } from "@/lib/durable-execution/registry";
import type {
  DurableExecutionEngine,
  DurableExecutionOutcome,
} from "@/lib/durable-execution/runtime";

type DurableRuntimeModule = typeof import("@/lib/durable-execution/runtime");

const databaseUrl =
  process.env.DURABLE_EXECUTION_ACCEPTANCE_TEST_DATABASE_URL ??
  process.env.EXECUTION_CONTROL_LEASE_TEST_DATABASE_URL ??
  process.env.AGENT_RUNS_TEST_DATABASE_URL;

const migrations = [
  "0019_execution_control.sql",
  "0020_execution_tenant_scope.sql",
  "0021_execution_leases.sql",
  "0022_execution_command_fingerprint.sql",
  "0023_execution_drain.sql",
  "0024_execution_tenant_contract.sql",
  "0025_execution_effects.sql",
  "0026_execution_cancellation.sql",
  "0027_execution_terminal_projections.sql",
  "0028_execution_run_blocking.sql",
] as const;

function migrationStatements(name: string): string[] {
  return fs
    .readFileSync(path.join(process.cwd(), "src/db/migrations", name), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const bounds: DurableJsonBounds = {
  maxBytes: 2_048,
  maxDepth: 5,
  maxNodes: 32,
  maxStringBytes: 256,
  maxArrayItems: 8,
  maxObjectKeys: 8,
};

type SyntheticScenario = "accepted_response_lost" | "authoritative_replay";

interface SyntheticCommand {
  scenario: SyntheticScenario;
  value: string;
}

interface SyntheticReceipt {
  remoteId: string;
}

const commandContract: DurableJsonContract<SyntheticCommand> = {
  schemaVersion: 1,
  bounds,
  secrets: { mode: "reject" },
  parse(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid synthetic command");
    }
    const candidate = value as Record<string, unknown>;
    if (
      (candidate.scenario !== "accepted_response_lost" &&
        candidate.scenario !== "authoritative_replay") ||
      typeof candidate.value !== "string" ||
      Object.keys(candidate).some(
        (key) => key !== "scenario" && key !== "value",
      )
    ) {
      throw new Error("invalid synthetic command");
    }
    return {
      scenario: candidate.scenario,
      value: candidate.value,
    };
  },
};

const receiptContract: DurableJsonContract<SyntheticReceipt> = {
  schemaVersion: 1,
  bounds,
  secrets: { mode: "reject" },
  parse(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid synthetic receipt");
    }
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.remoteId !== "string" ||
      Object.keys(candidate).some((key) => key !== "remoteId")
    ) {
      throw new Error("invalid synthetic receipt");
    }
    return { remoteId: candidate.remoteId };
  },
};

const capabilityPolicy: DurableCapabilityPolicy = {
  mayAdmit: () => true,
  mayDrain: () => "allow",
};

const EFFECT_STEP = "remote.dispatch" as const;
const HANDLER_VERSION = 1;

function remoteReceipt(effectKey: string): SyntheticReceipt {
  return {
    remoteId: `remote-${crypto
      .createHash("sha256")
      .update(effectKey)
      .digest("hex")
      .slice(0, 16)}`,
  };
}

/**
 * Third, product-neutral adapter proving that the public durable APIs are the
 * extension point. It deliberately owns only command validation, remote I/O
 * semantics and terminal projection; Ledger mutation remains in the runtime.
 */
class SyntheticDurableAdapter {
  readonly registry = new DurableExecutionRegistry();
  readonly engine: DurableExecutionEngine;
  readonly invocationKeys: string[] = [];
  readonly reconciliationKeys: string[] = [];
  readonly projectionCalls: string[] = [];
  readonly projectedRuns = new Map<string, SyntheticReceipt>();
  private readonly remoteReceipts = new Map<string, SyntheticReceipt>();

  constructor(
    readonly repository: PostgresExecutionControlRepository,
    readonly scope: ExecutionLeaseScope,
    runtime: DurableRuntimeModule,
  ) {
    const effect: DurableEffectDefinition<SyntheticCommand, SyntheticReceipt> =
      {
        step: EFFECT_STEP,
        definitionVersion: 1,
        capability: "synthetic.remote.dispatch",
        payload: commandContract,
        receipt: receiptContract,
        safety: {
          kind: "reconcile_before_replay",
          delivery: "at_least_once_attempts",
          lookup: "by_effect_key",
          absenceMustBeAuthoritative: true,
        },
        retry: {
          maxAttempts: 2,
          baseDelayMs: 1_000,
          maxDelayMs: 1_000,
          jitter: "full",
        },
        timeoutMs: 1_000,
        invoke: async (command, context) => {
          this.invocationKeys.push(context.effectKey);
          const invocationCount = this.invocationKeys.filter(
            (key) => key === context.effectKey,
          ).length;
          const receipt = remoteReceipt(context.effectKey);

          if (invocationCount === 1) {
            if (command.scenario === "accepted_response_lost") {
              this.remoteReceipts.set(context.effectKey, receipt);
            }
            throw new Error("synthetic response lost after an unknown attempt");
          }

          this.remoteReceipts.set(context.effectKey, receipt);
          return receipt;
        },
        reconcile: async (_command, context) => {
          this.reconciliationKeys.push(context.effectKey);
          const receipt = this.remoteReceipts.get(context.effectKey);
          return receipt ? { kind: "found", receipt } : { kind: "not_found" };
        },
        classify: () => ({
          kind: "outcome_unknown",
          code: "synthetic_response_unknown",
        }),
      };
    const effects = { [EFFECT_STEP]: effect };
    const handler: DurableExecutionHandlerV2<
      SyntheticCommand,
      SyntheticCommand,
      SyntheticReceipt,
      typeof effects
    > = {
      contractVersion: 2,
      operation: scope.operation,
      version: HANDLER_VERSION,
      command: commandContract,
      checkpoint: commandContract,
      result: receiptContract,
      effects,
      execute: async (command, context) => ({
        output: await context.effect(EFFECT_STEP, command),
      }),
      classifyPureError: () => ({
        code: "synthetic_adapter_failed",
        retryable: false,
        message: "Synthetic adapter failed",
      }),
      projectTerminal: async (run, _command, context) => {
        await context.assertLease();
        const receipt = receiptContract.parse(run.output);
        this.projectionCalls.push(run.id);
        this.projectedRuns.set(run.id, receipt);
      },
    };

    this.registry.register(handler);
    this.engine = new runtime.DurableExecutionEngine({
      repository,
      effectRepository: repository,
      cancellationRepository: repository,
      projectionRepository: repository,
      capabilityPolicy,
      registry: this.registry,
      scope,
      workerId: "worker-synthetic-acceptance",
      leaseMs: 5_000,
      maxAttempts: 3,
      retryBaseMs: 1_000,
      retryMaximumMs: 1_000,
      projectionRetryBaseMs: 1_000,
      projectionRetryMaximumMs: 1_000,
      handlerTimeoutMs: 10_000,
      effectRandom: () => 0,
    });
  }

  admit(scenario: SyntheticScenario, identity: string) {
    return admitDurableExecutionV2({
      repository: this.repository,
      registry: this.registry,
      capabilityPolicy,
      scope: this.scope,
      handlerVersion: HANDLER_VERSION,
      aggregateType: "synthetic.fixture",
      aggregateId: identity,
      idempotencyKey: `synthetic:${identity}`,
      command: { scenario, value: identity },
      metadata: { adapter: "synthetic_acceptance" },
    });
  }

  async processAfterRetry(runId: string): Promise<DurableExecutionOutcome> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const outcome = await this.engine.processRun(runId);
      if (outcome.kind !== "idle") return outcome;
      await delay(50);
    }
    throw new Error("synthetic run did not become claimable");
  }
}

test(
  "a product-neutral adapter completes Ledger, effect recovery and terminal outbox through public APIs",
  { skip: !databaseUrl, timeout: 45_000 },
  async (t) => {
    const sql = postgres(databaseUrl as string, { max: 1, onnotice: () => {} });
    const schema = `durable_generic_${crypto.randomUUID().replaceAll("-", "")}`;
    const operation = `synthetic.acceptance.${crypto
      .randomUUID()
      .replaceAll("-", "")}`;
    const scope: ExecutionLeaseScope = {
      tenantKey: "tenant-synthetic",
      operation,
      mode: "canary",
    };

    try {
      await sql.unsafe(`CREATE SCHEMA "${schema}"`);
      await sql.unsafe(`SET search_path TO "${schema}", public`);
      for (const name of migrations) {
        for (const statement of migrationStatements(name)) {
          await sql.unsafe(statement);
        }
      }

      const repository = new PostgresExecutionControlRepository(
        drizzle(sql) as unknown as Db,
      );
      // Keep runtime loading inside the non-skipped acceptance body. This test
      // must not initialize process-global worker state in ordinary unit runs.
      const runtime = await import("@/lib/durable-execution/runtime");
      const adapter = new SyntheticDurableAdapter(repository, scope, runtime);

      async function verifyScenario(
        scenario: SyntheticScenario,
        expectedAttempts: number,
      ): Promise<void> {
        const identity = `${scenario}-${crypto.randomUUID()}`;
        const admitted = await adapter.admit(scenario, identity);
        assert.equal(admitted.created, true);
        assert.equal(admitted.run.status, "queued");
        assert.equal(admitted.run.metadata.authority, "execution_ledger_v2");

        const duplicate = await adapter.admit(scenario, identity);
        assert.equal(duplicate.created, false);
        assert.equal(duplicate.run.id, admitted.run.id);

        const first = await adapter.engine.processRun(admitted.run.id);
        assert.equal(first.kind, "requeued");

        const uncertain = await repository.getEffectForScope({
          ...scope,
          runId: admitted.run.id,
          stepKey: EFFECT_STEP,
        });
        assert.equal(uncertain?.status, "uncertain");
        assert.equal(uncertain?.attemptCount, 1);
        assert.equal(
          await repository.getTerminalProjectionForScope({
            ...scope,
            runId: admitted.run.id,
          }),
          null,
        );

        const completed = await adapter.processAfterRetry(admitted.run.id);
        assert.equal(completed.kind, "completed");

        const run = await repository.getRunByIdForScope({
          ...scope,
          runId: admitted.run.id,
        });
        const effect = await repository.getEffectForScope({
          ...scope,
          runId: admitted.run.id,
          stepKey: EFFECT_STEP,
        });
        const projection = await repository.getTerminalProjectionForScope({
          ...scope,
          runId: admitted.run.id,
        });
        const events = await repository.listEvents(admitted.run.id);
        const eventTypes = events.map((event) => event.type);
        const expectedEffectKey = runtime.durableExecutionEffectKey({
          operation,
          runId: admitted.run.id,
          handlerVersion: HANDLER_VERSION,
          step: EFFECT_STEP,
        });
        const invocationKeys = adapter.invocationKeys.filter(
          (key) => key === expectedEffectKey,
        );
        const reconciliationKeys = adapter.reconciliationKeys.filter(
          (key) => key === expectedEffectKey,
        );

        assert.equal(run?.status, "completed");
        assert.equal(run?.claimCount, 2);
        assert.equal(run?.handlerAttempt, 2);
        assert.deepEqual(run?.output, remoteReceipt(expectedEffectKey));
        assert.equal(effect?.status, "succeeded");
        assert.equal(effect?.effectKey, expectedEffectKey);
        assert.equal(effect?.attemptCount, expectedAttempts);
        assert.equal(effect?.reconcileCount, 1);
        assert.deepEqual(effect?.receipt, remoteReceipt(expectedEffectKey));
        assert.deepEqual(
          invocationKeys,
          Array(expectedAttempts).fill(expectedEffectKey),
        );
        assert.deepEqual(reconciliationKeys, [expectedEffectKey]);
        assert.equal(projection?.state, "succeeded");
        assert.equal(projection?.terminalStatus, "completed");
        assert.equal(projection?.claimCount, 1);
        assert.deepEqual(
          adapter.projectedRuns.get(admitted.run.id),
          remoteReceipt(expectedEffectKey),
        );
        assert.equal(
          adapter.projectionCalls.filter((runId) => runId === admitted.run.id)
            .length,
          1,
        );
        assert.equal(
          eventTypes.filter((type) => type === "run.claimed").length,
          2,
        );
        for (const type of [
          "run.created",
          "effect.prepared",
          "effect.uncertain",
          "effect.reconciled",
          `${operation}.completed`,
          "run.projection_succeeded",
        ]) {
          assert.ok(eventTypes.includes(type), `missing durable event ${type}`);
        }
        assert.ok(
          eventTypes.indexOf("effect.prepared") <
            eventTypes.indexOf("effect.uncertain"),
        );
        assert.ok(
          eventTypes.indexOf("effect.uncertain") <
            eventTypes.indexOf("effect.reconciled"),
        );
        if (expectedAttempts === 2) {
          assert.ok(eventTypes.includes("effect.succeeded"));
          assert.ok(
            eventTypes.indexOf("effect.reconciled") <
              eventTypes.indexOf("effect.succeeded"),
          );
          assert.ok(
            eventTypes.indexOf("effect.succeeded") <
              eventTypes.indexOf("run.projection_succeeded"),
          );
        } else {
          assert.equal(eventTypes.includes("effect.succeeded"), false);
          assert.ok(
            eventTypes.indexOf("effect.reconciled") <
              eventTypes.indexOf("run.projection_succeeded"),
          );
        }
      }

      await t.test(
        "an accepted call with a lost response is reconciled without replay",
        () => verifyScenario("accepted_response_lost", 1),
      );
      await t.test(
        "authoritative absence permits one replay with the exact same effect key",
        () => verifyScenario("authoritative_replay", 2),
      );
    } finally {
      await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  },
);
