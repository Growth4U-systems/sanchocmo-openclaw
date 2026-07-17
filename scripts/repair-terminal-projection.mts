import { PostgresExecutionControlRepository } from "../src/lib/execution-control/postgres";
import {
  inspectOrResumeTerminalProjection,
  parseTerminalProjectionRepairArgs,
} from "./lib/terminal-projection-repair.mts";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const options = parseTerminalProjectionRepairArgs(process.argv.slice(2));
  const result = await inspectOrResumeTerminalProjection(
    new PostgresExecutionControlRepository(),
    options,
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!options.apply && result.kind === "ready") {
    process.stdout.write(
      "Dry run only. Re-run with --apply and an exact --confirm-run-id after the compatible projector is deployed.\n",
    );
  }
  if (result.kind !== "ready" && result.kind !== "resumed") {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Terminal projection repair refused: ${
      error instanceof Error ? error.message : "unknown error"
    }\n`,
  );
  process.exitCode = 1;
});
