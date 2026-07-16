import {
  executionOriginCutoverFailureMessage,
  verifyExecutionOriginCutover,
} from "../src/lib/runtime/execution-origin-cutover-gate";

const args = process.argv.slice(2);
const requireCheck = takeFlag(args, "--require");
if (args.length > 0) fail("Unknown argument; supported option: --require");

try {
  const result = await verifyExecutionOriginCutover({ requireCheck });
  if (result.checked) {
    process.stdout.write(
      "[execution-origin-cutover] ready: 0 unregistered non-terminal execution origins\n",
    );
  } else {
    process.stdout.write(
      "[execution-origin-cutover] skipped: every durable worker boot flag is off\n",
    );
  }
  process.exit(0);
} catch (error) {
  fail(executionOriginCutoverFailureMessage(error));
}

function takeFlag(values: string[], flag: string): boolean {
  const index = values.indexOf(flag);
  if (index < 0) return false;
  values.splice(index, 1);
  return true;
}

function fail(message: string): never {
  process.stderr.write(`[execution-origin-cutover] ${message}\n`);
  process.exit(1);
}
