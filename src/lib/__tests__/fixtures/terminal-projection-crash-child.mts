import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "../../../db/drizzle.ts";
import { DurableExecutionRegistry } from "../../durable-execution/registry.ts";
import { DurableExecutionEngine } from "../../durable-execution/runtime.ts";
import { PostgresExecutionControlRepository } from "../../execution-control/postgres.ts";
import { createTerminalProjectionCrashHandler } from "./terminal-projection-crash-support.mts";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function emit(payload: unknown): Promise<void> {
  await new Promise<void>((resolve) => {
    process.stdout.write(`${JSON.stringify(payload)}\n`, resolve);
  });
}

const databaseUrl = requiredEnv("DATABASE_URL");
const operation = requiredEnv("PROJECTION_CRASH_OPERATION");
requiredEnv("PROJECTION_CRASH_RUN_ID");
const tenantKey = requiredEnv("PROJECTION_CRASH_TENANT");
const ledgerSchema = requiredEnv("PROJECTION_LEDGER_SCHEMA");
const schema = requiredEnv("PROJECTION_CRASH_SCHEMA");
const mode = requiredEnv("PROJECTION_CRASH_MODE");
const leaseMs = Number(requiredEnv("PROJECTION_CRASH_LEASE_MS"));

if (!/^san480_projection_[a-f0-9]{32}$/.test(schema)) {
  throw new Error("invalid projection crash schema");
}
if (!/^execution_projections_[a-f0-9]{32}$/.test(ledgerSchema)) {
  throw new Error("invalid projection ledger schema");
}
if (mode !== "crash" && mode !== "recover") {
  throw new Error("invalid projection crash mode");
}
if (!Number.isSafeInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 10_000) {
  throw new Error("invalid projection crash lease");
}

const sql = postgres(databaseUrl, {
  max: 4,
  onnotice: () => {},
  connection: {
    TimeZone: "Europe/Madrid",
    search_path: `${ledgerSchema},public`,
  },
});
const repository = new PostgresExecutionControlRepository(
  drizzle(sql) as unknown as Db,
);
const registry = new DurableExecutionRegistry().register(
  createTerminalProjectionCrashHandler({
    operation,
    projectTerminal: async (run, _command, context) => {
      await context.assertLease();
      await sql.unsafe(
        `INSERT INTO "${schema}"."sink" ("run_id") VALUES ($1) ON CONFLICT ("run_id") DO NOTHING`,
        [run.id],
      );
      if (mode === "crash") {
        await emit({ marker: "sink_committed", runId: run.id });
        setInterval(() => undefined, 1_000);
        await new Promise<never>(() => undefined);
      }
    },
  }),
);
const engine = new DurableExecutionEngine({
  repository,
  registry,
  scope: { tenantKey, operation, mode: "canary" },
  workerId: `projection-${mode}-${process.pid}`,
  leaseMs,
  maxAttempts: 3,
});

try {
  const outcome = await engine.processNextProjection();
  await emit({ marker: "completed", outcome });
  await sql.end();
} catch (error) {
  await emit({
    marker: "failed",
    error: error instanceof Error ? error.name : "UnknownError",
  });
  await sql.end();
  process.exitCode = 1;
}
