import { runStagingCanaryPreflightCli } from "./lib/staging-canary-preflight-runner.mts";

process.exitCode = await runStagingCanaryPreflightCli({
  argv: process.argv.slice(2),
});
