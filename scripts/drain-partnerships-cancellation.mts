import { PostgresExecutionControlRepository } from "@/lib/execution-control";
import { drainPartnershipsDiscoveryCancellation } from "@/lib/partnerships/discovery-durable-worker";
import { DISCOVERY_EXECUTION_OPERATION } from "@/lib/partnerships/discovery-execution-policy";
import {
  parsePartnershipsCancellationDrainArgs,
  partnershipsCancellationDrainReport,
} from "./lib/partnerships-cancellation-drain.mts";

function writeStdoutLine(value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(value)}\n`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function main(): Promise<void> {
  const { tenantKey, runId, apply } = parsePartnershipsCancellationDrainArgs(
    process.argv.slice(2),
  );
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const repository = new PostgresExecutionControlRepository();
  const scope = {
    tenantKey,
    operation: DISCOVERY_EXECUTION_OPERATION,
    mode: "canary" as const,
  };
  const before = await repository.getRunByIdForScope({ ...scope, runId });
  if (!before) throw new Error("exact scoped run was not found");

  if (!apply) {
    await writeStdoutLine(
      partnershipsCancellationDrainReport({
        dryRun: true,
        runId,
        status: before.status,
        handlerVersion: before.metadata.executionHandlerVersion ?? null,
        cancellationRequested: Boolean(before.cancelRequestId),
        cancellationAcknowledged: Boolean(before.cancelAcknowledgedAt),
      }),
    );
    return;
  }

  const outcome = await drainPartnershipsDiscoveryCancellation(
    tenantKey,
    runId,
    {
      repository,
      workerId: `operator-cancel-${runId.slice(-12)}`,
    },
  );
  const after = await repository.getRunByIdForScope({ ...scope, runId });
  if (!after || after.status !== "cancelled") {
    throw new Error(`cancellation is not terminal (${outcome.kind})`);
  }
  await writeStdoutLine(
    partnershipsCancellationDrainReport({
      dryRun: false,
      runId,
      status: after.status,
      handlerVersion: after.metadata.executionHandlerVersion ?? null,
      cancellationRequested: Boolean(after.cancelRequestId),
      cancellationAcknowledged: Boolean(after.cancelAcknowledgedAt),
      executionOutcome: outcome.kind,
    }),
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(
      `Partnerships cancellation drain refused: ${
        error instanceof Error ? error.message : "unknown error"
      }\n`,
      () => process.exit(1),
    );
  },
);
