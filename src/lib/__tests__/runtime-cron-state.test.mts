import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import * as openclawCronsModule from "../data/openclaw-crons";
import * as runtimeModule from "../runtime";

const runtime =
  (runtimeModule as unknown as { default: typeof runtimeModule }).default ?? runtimeModule;
const openclawCrons =
  (openclawCronsModule as unknown as { default: typeof openclawCronsModule }).default ??
  openclawCronsModule;

test("cron state helpers read from the selected runtime state paths", () => {
  const previousRuntime = process.env.SANCHO_RUNTIME;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFakeHome = process.env.SANCHO_FAKE_RUNTIME_HOME;
  const previousRuntimeConfigFile = process.env.SANCHO_RUNTIME_CONFIG_FILE;
  const previousOpenclawCronFile = process.env.OPENCLAW_CRON_FILE;
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-fake-cron-state-"));
  const runtimeConfigFile = path.join(fakeHome, "runtime-config.json");

  process.env.SANCHO_RUNTIME = "fake";
  process.env.NODE_ENV = "test";
  process.env.SANCHO_FAKE_RUNTIME_HOME = fakeHome;
  process.env.SANCHO_RUNTIME_CONFIG_FILE = runtimeConfigFile;
  delete process.env.OPENCLAW_CRON_FILE;
  runtime.resetRuntimeForTests();

  try {
    const cronDir = path.join(fakeHome, "cron");
    fs.mkdirSync(cronDir, { recursive: true });
    fs.writeFileSync(
      path.join(cronDir, "jobs.json"),
      JSON.stringify({
        jobs: [
          {
            id: "cron-fake",
            name: "Fake runtime cron",
            enabled: true,
            payload: { message: "hola", model: "fake-model" },
          },
        ],
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(cronDir, "jobs-state.json"),
      JSON.stringify({
        jobs: {
          "cron-fake": {
            state: {
              lastRunAtMs: 123,
              lastDurationMs: 45,
              lastRunStatus: "success",
            },
          },
        },
      }),
      "utf8",
    );

    assert.equal(runtime.getRuntime().id, "fake");
    assert.equal(openclawCrons.loadAllCrons()[0]?.id, "cron-fake");
    assert.equal(openclawCrons.loadJobsState()["cron-fake"]?.state?.lastRunAtMs, 123);
  } finally {
    runtime.resetRuntimeForTests();
    fs.rmSync(fakeHome, { recursive: true, force: true });
    if (previousRuntime === undefined) delete process.env.SANCHO_RUNTIME;
    else process.env.SANCHO_RUNTIME = previousRuntime;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousFakeHome === undefined) delete process.env.SANCHO_FAKE_RUNTIME_HOME;
    else process.env.SANCHO_FAKE_RUNTIME_HOME = previousFakeHome;
    if (previousRuntimeConfigFile === undefined) delete process.env.SANCHO_RUNTIME_CONFIG_FILE;
    else process.env.SANCHO_RUNTIME_CONFIG_FILE = previousRuntimeConfigFile;
    if (previousOpenclawCronFile === undefined) delete process.env.OPENCLAW_CRON_FILE;
    else process.env.OPENCLAW_CRON_FILE = previousOpenclawCronFile;
  }
});
