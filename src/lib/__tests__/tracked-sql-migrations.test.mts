import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  MigrationSafetyError,
  migrationDatabaseUrlFromEnv,
  normalizeMigrationDatabaseConnection,
  prepareTrackedMigrations,
  runTrackedSqlMigrations,
  splitSqlStatements,
} from "../../../scripts/lib/tracked-sql-migrations.mjs";
import {
  classifyLegacyMigrationBundleFile,
  LEGACY_MIGRATION_BUNDLE_CLASS,
} from "../../../scripts/lib/classify-legacy-migration-bundle.mjs";

test("SQL splitting preserves quoted and dollar-quoted semicolons", () => {
  assert.deepEqual(
    splitSqlStatements(`
      -- prefix ;
      SELECT ';' AS "semi;colon";
      CREATE FUNCTION fixture() RETURNS void LANGUAGE plpgsql AS $body$
      BEGIN
        PERFORM ';';
      END
      $body$;
    `).map((statement) => statement.replace(/\s+/g, " ").trim()),
    [
      `-- prefix ; SELECT ';' AS "semi;colon"`,
      "CREATE FUNCTION fixture() RETURNS void LANGUAGE plpgsql AS $body$ BEGIN PERFORM ';'; END $body$",
    ],
  );
  assert.throws(
    () => splitSqlStatements("SELECT 'unterminated"),
    MigrationSafetyError,
  );
  assert.throws(
    () => splitSqlStatements("SELECT 1 /* outer /* nested */ outer */;"),
    /nested block comments are unsupported/i,
  );
  assert.throws(
    () => splitSqlStatements(String.raw`SELECT E'escaped\\'quote';`),
    /escape strings are unsupported/i,
  );
  assert.throws(
    () => splitSqlStatements(String.raw`SELECT 'server\\dependent';`),
    /backslash escapes are unsupported/i,
  );
});

test("dry-run validates immutable SQL without a database connection", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "migration-dry-"));
  const file = path.join(directory, "9000_fixture.sql");
  const messages: string[] = [];
  try {
    await fs.writeFile(file, "CREATE TABLE fixture (id integer);", "utf8");
    const result = await runTrackedSqlMigrations({
      descriptors: [
        {
          path: file,
          name: "test/9000_fixture.sql",
          inspectState: async () => "absent",
        },
      ],
      dryRun: true,
      logger: (message: string) => messages.push(message),
    });
    assert.equal(result[0].outcome, "validated");
    assert.match(result[0].sha256, /^[a-f0-9]{64}$/);
    assert.match(
      messages[0],
      /1 statement\(s\) validated \(sha256 [a-f0-9]{64}\)/,
    );
    await assert.rejects(
      runTrackedSqlMigrations({
        descriptors: [
          {
            path: file,
            name: "test/9000_fixture.sql",
            inspectState: async () => "absent",
          },
        ],
        dryRun: true,
        lockTimeoutMs: 0,
      }),
      /lockTimeoutMs must be an integer between/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("unsafe, destructive, and unverified files fail before database access", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "migration-safe-"));
  try {
    const transactionFile = path.join(directory, "transaction.sql");
    await fs.writeFile(transactionFile, "BEGIN; SELECT 1; COMMIT;", "utf8");
    await assert.rejects(
      prepareTrackedMigrations([
        {
          path: transactionFile,
          name: "test/transaction.sql",
          inspectState: async () => "absent",
        },
      ]),
      /runner owns the per-file transaction/,
    );

    const destructiveFile = path.join(directory, "destructive.sql");
    for (const sql of [
      "DROP TABLE fixture;",
      "DROP VIEW fixture;",
      "TRUNCATE fixture;",
      "ALTER TABLE fixture ADD COLUMN note text DEFAULT '--', DROP COLUMN doomed;",
      "ALTER TABLE fixture ADD COLUMN note text DEFAULT '/*', DROP COLUMN doomed, ADD COLUMN tail text DEFAULT '*/';",
    ]) {
      await fs.writeFile(destructiveFile, sql, "utf8");
      await assert.rejects(
        prepareTrackedMigrations([
          {
            path: destructiveFile,
            name: "test/destructive.sql",
            inspectState: async () => "absent",
          },
        ]),
        /destructive SQL is not allowlisted/,
      );
    }

    await fs.writeFile(
      destructiveFile,
      "DO $$ BEGIN EXECUTE 'DROP VIEW fixture'; END $$;",
      "utf8",
    );
    await assert.rejects(
      prepareTrackedMigrations([
        {
          path: destructiveFile,
          name: "test/procedural.sql",
          inspectState: async () => "absent",
        },
      ]),
      /procedural or dynamic SQL is forbidden/,
    );

    await fs.writeFile(
      destructiveFile,
      "COPY fixture (id) FROM STDIN;\n1\n\\.;",
      "utf8",
    );
    await assert.rejects(
      prepareTrackedMigrations([
        {
          path: destructiveFile,
          name: "test/copy-stdin.sql",
          inspectState: async () => "absent",
        },
      ]),
      /COPY FROM STDIN is unsupported/,
    );

    const unverifiedFile = path.join(directory, "unverified.sql");
    await fs.writeFile(unverifiedFile, "SELECT 1;", "utf8");
    await assert.rejects(
      prepareTrackedMigrations([
        { path: unverifiedFile, name: "test/unverified.sql" },
      ]),
      /database state verifier is required/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("legacy image migration bundles are classified without executing them", async () => {
  const fixtureDirectory = path.join(
    process.cwd(),
    "src/lib/__tests__/fixtures/migrations",
  );
  assert.equal(
    await classifyLegacyMigrationBundleFile(
      path.join(fixtureDirectory, "old-safe-package.json"),
    ),
    LEGACY_MIGRATION_BUNDLE_CLASS.SAFE,
  );
  const pinnedHistoricalFixture = JSON.parse(
    await fs.readFile(
      path.join(fixtureDirectory, "old-safe-package.json"),
      "utf8",
    ),
  );
  assert.equal(
    pinnedHistoricalFixture.scripts["db:migrate:deploy"],
    "node scripts/apply-sql-migration.mjs src/db/migrations/0006_mcp_audit_events.sql src/db/migrations/0007_feedback_insights.sql src/db/migrations/0008_comments_v2.sql src/db/migrations/0011_metric_snapshots.sql src/db/migrations/0012_metric_dashboards.sql src/db/migrations/0013_intelligence_engine.sql src/db/migrations/0014_metric_schedule_runs.sql src/db/migrations/0015_metric_semantic_layer.sql src/db/migrations/0017_task_route_proposals.sql",
  );
  assert.equal(
    await classifyLegacyMigrationBundleFile(
      path.join(fixtureDirectory, "old-unsafe-package.json"),
    ),
    LEGACY_MIGRATION_BUNDLE_CLASS.UNSAFE,
  );
  for (const fixture of [
    "old-unsafe-later-package.json",
    "old-ambiguous-package.json",
  ]) {
    assert.equal(
      await classifyLegacyMigrationBundleFile(
        path.join(fixtureDirectory, fixture),
      ),
      LEGACY_MIGRATION_BUNDLE_CLASS.UNSAFE,
    );
  }
});

test("the mounted migration secret is raw base64 and round-trips in the one-off shell", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "migration-secret-"),
  );
  const secretFile = path.join(directory, "database-url.b64");
  const databaseUrl = "postgresql://migration_user:fixture@db.example/sancho";
  try {
    await fs.writeFile(
      secretFile,
      `${Buffer.from(databaseUrl).toString("base64")}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    const decoded = execFileSync(
      "bash",
      ["-lc", 'base64 --decode < "$1"', "migration-secret", secretFile],
      { encoding: "utf8" },
    );
    assert.equal(decoded, databaseUrl);
    assert.equal((await fs.stat(secretFile)).mode & 0o777, 0o600);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("migration URL selection prefers direct endpoints and normalizes modern Neon URLs safely", () => {
  assert.equal(
    migrationDatabaseUrlFromEnv({
      DATABASE_URL: "postgres://runtime",
      DIRECT_DATABASE_URL: "postgres://direct",
      EXECUTION_MIGRATIONS_DATABASE_URL: "postgres://migration",
    }),
    "postgres://migration",
  );
  assert.equal(
    migrationDatabaseUrlFromEnv({
      DATABASE_URL: "postgres://runtime",
      DIRECT_DATABASE_URL: "postgres://direct",
    }),
    "postgres://direct",
  );

  const normalized = normalizeMigrationDatabaseConnection(
    "postgresql://user:secret@ep-example-pooler.eu.neon.tech/db?sslmode=require&SSLMODE=disable&channel_binding=require&CHANNEL_BINDING=prefer",
  );
  const parsed = new URL(normalized.databaseUrl);
  assert.equal(parsed.searchParams.has("channel_binding"), false);
  assert.equal(parsed.searchParams.has("CHANNEL_BINDING"), false);
  assert.equal(parsed.searchParams.has("SSLMODE"), false);
  assert.equal(parsed.searchParams.get("sslmode"), "verify-full");
  assert.deepEqual(normalized.postgresOptions, { ssl: "verify-full" });
  assert.equal(normalized.neon, true);
});

test("historical 0019–0020 bytes stay immutable across tracking adoption", async () => {
  for (const [file, sha256] of [
    [
      "0019_execution_control.sql",
      "5fd3fc2a551df698c52d3075722524be734013a3b9422898c0432772da474f81",
    ],
    [
      "0020_execution_tenant_scope.sql",
      "fa246c11854dd7ca319e07851b78d78a4a63ef02b96c04d2a7625a9be0cf892d",
    ],
  ]) {
    const bytes = await fs.readFile(
      path.join(process.cwd(), "src/db/migrations", file),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256);
  }
});

test("the runtime image contains the tracked runner and every imported migration module", async () => {
  const dockerfile = await fs.readFile(
    path.join(process.cwd(), "Dockerfile"),
    "utf8",
  );
  assert.match(
    dockerfile,
    /COPY scripts\/run-execution-control-migrations\.mjs \.\/scripts\/run-execution-control-migrations\.mjs/,
  );
  assert.match(dockerfile, /COPY scripts\/lib\/ \.\/scripts\/lib\//);
  assert.match(
    dockerfile,
    /COPY scripts\/migrate-local\.mjs \.\/scripts\/migrate-local\.mjs/,
  );
});

test("deploy workflows scope direct credentials and classify old image bundles", async () => {
  const compose = await fs.readFile(
    path.join(process.cwd(), "docker-compose.yml"),
    "utf8",
  );
  assert.doesNotMatch(
    compose,
    /- (?:EXECUTION_MIGRATIONS_DATABASE_URL|DIRECT_DATABASE_URL)=/,
  );

  for (const workflow of ["deploy-staging.yml", "deploy-prod.yml"]) {
    const source = await fs.readFile(
      path.join(process.cwd(), ".github/workflows", workflow),
      "utf8",
    );
    assert.match(
      source,
      /execution_migration_adopt_through:[\s\S]*?default: ""/,
    );
    assert.match(
      source,
      /--entrypoint test sanchocmo -f \/app\/mc-nextjs\/scripts\/run-execution-control-migrations\.mjs/,
    );
    assert.match(
      source,
      /npm run db:migrate:execution-control:adopt -- --through="\$EXECUTION_MIGRATION_ADOPT_THROUGH"/,
    );
    assert.equal(
      (source.match(/\|0033\) ;;/g) ?? []).length,
      2,
      `${workflow} validates the current migration head outside and inside the container`,
    );
    const payloadKeys = source.match(/KEYS = \[[^]*?\n\s*\]\n\s*out =/);
    assert.ok(payloadKeys, `${workflow} has a persistent payload key list`);
    assert.match(
      source,
      /SANCHO_BASE_URL:\s*\$\{\{\s*vars\.SANCHO_BASE_URL\s*\|\|\s*vars\.BASE_URL\s*\}\}/,
      `${workflow} derives one canonical Sancho control-plane origin`,
    );
    assert.match(
      payloadKeys[0],
      /"SANCHO_BASE_URL"/,
      `${workflow} persists the canonical Sancho control-plane origin`,
    );
    assert.doesNotMatch(
      payloadKeys[0],
      /EXECUTION_MIGRATIONS_DATABASE_URL|DIRECT_DATABASE_URL/,
    );
    assert.match(source, /chmod 600 '\$MIGRATION_ENV_REMOTE'/);
    assert.match(
      source,
      /--volume "\$MIGRATION_ENV_FILE:\/run\/secrets\/sancho_migration_url_b64:ro"/,
    );
    assert.match(
      source,
      /unset EXECUTION_MIGRATIONS_DATABASE_URL DIRECT_DATABASE_URL SANCHO_MIGRATION_DATABASE_URL_B64/,
    );
    assert.match(source, /print\(encoded\)/);
    assert.doesNotMatch(
      source,
      /print\(f["']SANCHO_MIGRATION_DATABASE_URL_B64=/,
    );
    assert.match(source, /trap cleanup_migration_artifacts EXIT/);
    assert.match(
      source,
      /ssh "\$VPS_USER@\$VPS_HOST" "rm -f -- '\$MIGRATION_ENV_REMOTE' '\$MIGRATION_CLASSIFIER_REMOTE'"/,
    );
    assert.ok(
      source.indexOf('case "$EXECUTION_MIGRATION_ADOPT_THROUGH" in') <
        source.indexOf(
          'scp -o StrictHostKeyChecking=no "$MIGRATION_ENV_LOCAL"',
        ),
    );
    const scpCommands = source.match(/^\s*scp [^\n]+$/gm) ?? [];
    assert.equal(scpCommands.length, 3);
    for (const command of scpCommands) {
      assert.match(command, /^\s*scp -o StrictHostKeyChecking=no /);
    }
    assert.match(source, /classify-legacy-migration-bundle\.mjs/);
    assert.match(source, /safe-pre-execution-control/);
    assert.match(source, /unsafe-execution-control-replay/);
    assert.match(source, /Adoption audit: actor=\$DEPLOY_ACTOR/);
    assert.match(source, /Completion evidence: adopted tracking rows/);
  }
});
