import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("production deploy applies every metrics schema migration in order", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  const command = pkg.scripts?.["db:migrate:deploy"] ?? "";
  const expected = [
    "0011_metric_snapshots.sql",
    "0012_metric_dashboards.sql",
    "0013_intelligence_engine.sql",
    "0014_metric_schedule_runs.sql",
    "0015_metric_semantic_layer.sql",
    "0016_metric_stage_rollups.sql",
    "0034_metric_source_run_date_basis.sql",
  ];

  let previous = -1;
  for (const migration of expected) {
    const index = command.indexOf(migration);
    assert.ok(index >= 0, `${migration} is missing from db:migrate:deploy`);
    assert.ok(index > previous, `${migration} is out of order in db:migrate:deploy`);
    previous = index;
  }
});
