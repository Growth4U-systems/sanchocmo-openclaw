import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import postgres from "postgres";

export const TRACKING_SCHEMA = "sancho_internal";
export const TRACKING_TABLE = "sql_migrations";

// A repository-wide lock for this runner. Two signed int32 keys avoid relying
// on JavaScript bigint handling while still using PostgreSQL's namespaced
// advisory-lock form.
export const TRACKED_MIGRATION_ADVISORY_LOCK = Object.freeze({
  namespace: 1_397_631_047,
  key: 1_296_647_281,
});
export const TRACKED_MIGRATION_DEFAULT_LOCK_TIMEOUT_MS = 30_000;
export const TRACKED_MIGRATION_DEFAULT_STATEMENT_TIMEOUT_MS = 15 * 60_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export class MigrationSafetyError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "MigrationSafetyError";
  }
}

export function migrationDatabaseUrlFromEnv(environment = process.env) {
  for (const key of [
    "EXECUTION_MIGRATIONS_DATABASE_URL",
    "DIRECT_DATABASE_URL",
    "DATABASE_URL",
  ]) {
    const value = environment[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

export function normalizeMigrationDatabaseConnection(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new MigrationSafetyError("Migration database URL is invalid.");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new MigrationSafetyError(
      "Migration database URL must use postgres:// or postgresql://.",
    );
  }

  // postgres.js 3.x forwards channel_binding as a startup GUC, while modern
  // Neon URLs append channel_binding=require for libpq clients. PostgreSQL then
  // rejects the connection with 42704. Strip it only from the in-memory client
  // copy; never mutate or print the configured secret.
  const neon = /(^|\.)neon\.tech$/i.test(parsed.hostname);
  for (const key of [...parsed.searchParams.keys()]) {
    if (
      key.toLowerCase() === "channel_binding" ||
      (neon && key.toLowerCase() === "sslmode")
    ) {
      parsed.searchParams.delete(key);
    }
  }

  if (neon) parsed.searchParams.set("sslmode", "verify-full");
  return {
    databaseUrl: parsed.toString(),
    postgresOptions: neon ? { ssl: "verify-full" } : {},
    neon,
  };
}

/**
 * Read and validate a set of trusted SQL files before opening a database
 * connection. Each descriptor must provide an inspectState(transaction)
 * function returning "absent", "applied", or "partial". This makes adopting
 * an already-existing schema an explicit, verified operation instead of a
 * blind baseline.
 */
export async function prepareTrackedMigrations(descriptors, options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    throw new MigrationSafetyError("At least one migration is required.");
  }

  const prepared = [];
  const names = new Set();
  for (const descriptor of descriptors) {
    if (!descriptor || typeof descriptor !== "object") {
      throw new MigrationSafetyError("Invalid migration descriptor.");
    }

    const absolutePath = path.resolve(cwd, descriptor.path);
    const name = normalizeMigrationName(
      descriptor.name ?? path.relative(cwd, absolutePath),
    );
    if (names.has(name)) {
      throw new MigrationSafetyError(`Duplicate migration name: ${name}`);
    }
    names.add(name);

    if (typeof descriptor.inspectState !== "function") {
      throw new MigrationSafetyError(
        `${name}: a database state verifier is required; unverified migrations cannot be applied or adopted`,
      );
    }

    const sqlText = await fs.readFile(absolutePath, "utf8");
    const statements = splitSqlStatements(sqlText);
    if (statements.length === 0) {
      throw new MigrationSafetyError(`${name}: no SQL statements found`);
    }

    for (const statement of statements) {
      assertTransactionSafe(statement, name);
      assertDestructiveStatementAllowed(
        statement,
        name,
        descriptor.allowedDestructiveStatements ?? [],
      );
    }

    prepared.push({
      ...descriptor,
      absolutePath,
      name,
      sha256: createHash("sha256").update(sqlText, "utf8").digest("hex"),
      statements,
    });
  }

  return prepared;
}

/**
 * Apply or explicitly adopt tracked SQL migrations.
 *
 * - apply: only a verifier-confirmed absent migration may execute SQL.
 * - adopt: only a verifier-confirmed applied migration may be recorded, and
 *   no migration SQL is executed.
 * - dryRun: validates files, checksums, statement policy, and verifier
 *   presence without requiring database access.
 */
export async function runTrackedSqlMigrations(options) {
  const {
    descriptors,
    databaseUrl,
    cwd,
    dryRun = false,
    adopt = false,
    logger = defaultLogger,
    postgresOptions = {},
    client,
    lockTimeoutMs = TRACKED_MIGRATION_DEFAULT_LOCK_TIMEOUT_MS,
    statementTimeoutMs = TRACKED_MIGRATION_DEFAULT_STATEMENT_TIMEOUT_MS,
  } = options ?? {};

  const migrations = await prepareTrackedMigrations(descriptors, { cwd });
  const timeoutPolicy = normalizeMigrationTimeoutPolicy({
    lockTimeoutMs,
    statementTimeoutMs,
  });
  if (dryRun) {
    for (const migration of migrations) {
      logger(
        `${migration.name}: ${migration.statements.length} statement(s) validated (sha256 ${migration.sha256})`,
      );
    }
    return migrations.map((migration) => ({
      name: migration.name,
      sha256: migration.sha256,
      outcome: "validated",
    }));
  }

  if (
    !client &&
    (typeof databaseUrl !== "string" || databaseUrl.trim() === "")
  ) {
    throw new MigrationSafetyError(
      "EXECUTION_MIGRATIONS_DATABASE_URL, DIRECT_DATABASE_URL, or DATABASE_URL is required to apply or adopt tracked SQL migrations.",
    );
  }

  const ownsClient = !client;
  const normalizedConnection = client
    ? null
    : normalizeMigrationDatabaseConnection(databaseUrl);
  const sql =
    client ??
    postgres(normalizedConnection.databaseUrl, {
      max: 1,
      prepare: false,
      connect_timeout: 30,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      onnotice: () => {},
      ...postgresOptions,
      ...normalizedConnection.postgresOptions,
    });

  try {
    const preflight = await preflightMigrations(sql, migrations, {
      adopt,
      timeoutPolicy,
    });
    if (adopt) {
      const outcomes = await adoptMigrations(
        sql,
        migrations,
        preflight,
        timeoutPolicy,
      );
      for (const outcome of outcomes) {
        logger(`${outcome.name}: ${outcome.outcome}`);
      }
      return outcomes;
    }

    const outcomes = [];
    for (const migration of migrations) {
      const outcome = await applyMigration(sql, migration, timeoutPolicy);
      outcomes.push(outcome);
      logger(`${outcome.name}: ${outcome.outcome}`);
    }
    return outcomes;
  } catch (error) {
    if (error instanceof MigrationSafetyError) throw error;
    if (isDatabaseTimeout(error)) throw retryableMigrationTimeout(error);
    throw error;
  } finally {
    if (ownsClient) {
      await sql.end({ timeout: 5 }).catch(() => {});
    }
  }
}

async function preflightMigrations(sql, migrations, { adopt, timeoutPolicy }) {
  return sql.begin(async (transaction) => {
    await setMigrationSessionPolicy(transaction, timeoutPolicy);
    await acquireRunnerLock(transaction);
    const trackerExists = await trackingTableExists(transaction);
    const trackedRows = trackerExists
      ? await readTrackedRows(
          transaction,
          migrations.map(({ name }) => name),
        )
      : [];
    const trackedByName = new Map(
      trackedRows.map((row) => [row.name, row.sha256]),
    );

    // Check every known checksum before inspecting or executing any migration
    // DDL. A modified historical file is always a hard stop.
    for (const migration of migrations) {
      const trackedChecksum = trackedByName.get(migration.name);
      if (trackedChecksum && trackedChecksum !== migration.sha256) {
        throw checksumDriftError(migration, trackedChecksum);
      }
    }

    const states = new Map();
    for (const migration of migrations) {
      if (trackedByName.has(migration.name)) {
        states.set(migration.name, "tracked");
        continue;
      }
      const state = await inspectMigrationState(transaction, migration);
      states.set(migration.name, state);
      if (adopt && state !== "applied") {
        throw new MigrationSafetyError(
          `${migration.name}: adoption refused because the schema verifier reported ${state}; repair or apply the missing migration first`,
        );
      }
      if (!adopt && state === "applied") {
        throw new MigrationSafetyError(
          `${migration.name}: schema is already applied but untracked; run the explicit verified adoption command before deploying`,
        );
      }
      if (!adopt && state === "partial") {
        throw new MigrationSafetyError(
          `${migration.name}: schema is partially applied or does not match the verified contract; automatic apply is refused`,
        );
      }
    }

    // Bootstrap tracking only after the complete fail-closed preflight. Thus a
    // refused adoption or partial legacy schema does not mutate the database.
    if (!trackerExists && (adopt || [...states.values()].includes("absent"))) {
      await ensureTrackingTable(transaction);
    }
    return { states, trackerExists };
  });
}

async function applyMigration(sql, migration, timeoutPolicy) {
  try {
    return await sql.begin(async (transaction) => {
      await setMigrationSessionPolicy(transaction, timeoutPolicy);
      await acquireRunnerLock(transaction);
      const trackerExists = await trackingTableExists(transaction);
      if (!trackerExists) {
        // This should only be possible if an operator removed the tracking
        // table between preflight and apply. Recreate it under the same lock,
        // then still verify the database state before executing SQL.
        await ensureTrackingTable(transaction);
      }

      const tracked = await readTrackedRow(transaction, migration.name);
      if (tracked) {
        if (tracked.sha256 !== migration.sha256) {
          throw checksumDriftError(migration, tracked.sha256);
        }
        return migrationOutcome(migration, "skipped (already applied)");
      }

      const state = await inspectMigrationState(transaction, migration);
      if (state === "applied") {
        throw new MigrationSafetyError(
          `${migration.name}: schema became applied without a tracking record; explicit verified adoption is required`,
        );
      }
      if (state !== "absent") {
        throw new MigrationSafetyError(
          `${migration.name}: schema verifier reported ${state}; migration SQL was not executed`,
        );
      }

      for (const statement of migration.statements) {
        await transaction.unsafe(statement);
      }
      const postcondition = await inspectMigrationState(transaction, migration);
      if (postcondition !== "applied") {
        throw new MigrationSafetyError(
          `${migration.name}: post-migration verifier reported ${postcondition}; migration SQL and tracking were rolled back`,
        );
      }
      await insertTrackingRow(transaction, migration, "applied");
      return migrationOutcome(
        migration,
        `applied ${migration.statements.length} statement(s)`,
      );
    });
  } catch (error) {
    if (error instanceof MigrationSafetyError) throw error;
    if (isDatabaseTimeout(error)) throw retryableMigrationTimeout(error);
    throw new MigrationSafetyError(
      `${migration.name}: migration failed and its transaction was rolled back (${safeDatabaseError(error)})`,
      { cause: error },
    );
  }
}

async function adoptMigrations(sql, migrations, _preflight, timeoutPolicy) {
  try {
    return await sql.begin(async (transaction) => {
      await setMigrationSessionPolicy(transaction, timeoutPolicy);
      await acquireRunnerLock(transaction);
      if (!(await trackingTableExists(transaction))) {
        await ensureTrackingTable(transaction);
      }

      const outcomes = [];
      const pending = [];
      for (const migration of migrations) {
        const tracked = await readTrackedRow(transaction, migration.name);
        if (tracked) {
          if (tracked.sha256 !== migration.sha256) {
            throw checksumDriftError(migration, tracked.sha256);
          }
          outcomes.push(
            migrationOutcome(migration, "skipped (already tracked)"),
          );
          continue;
        }

        const state = await inspectMigrationState(transaction, migration);
        if (state !== "applied") {
          throw new MigrationSafetyError(
            `${migration.name}: adoption refused because the schema verifier reported ${state}`,
          );
        }
        pending.push(migration);
      }

      // Verify the complete requested set before writing any baseline rows.
      // This makes adoption of a prefix/set atomic and auditable.
      for (const migration of pending) {
        await insertTrackingRow(transaction, migration, "adopted");
        outcomes.push(
          migrationOutcome(migration, "adopted after schema verification"),
        );
      }
      return outcomes;
    });
  } catch (error) {
    if (error instanceof MigrationSafetyError) throw error;
    if (isDatabaseTimeout(error)) throw retryableMigrationTimeout(error);
    throw new MigrationSafetyError(
      `Migration adoption failed and no new tracking rows were committed (${safeDatabaseError(error)})`,
      { cause: error },
    );
  }
}

async function acquireRunnerLock(transaction) {
  await transaction`
    SELECT pg_catalog.pg_advisory_xact_lock(
      ${TRACKED_MIGRATION_ADVISORY_LOCK.namespace}::integer,
      ${TRACKED_MIGRATION_ADVISORY_LOCK.key}::integer
    )
  `;
}

async function setMigrationSessionPolicy(transaction, timeoutPolicy) {
  // Migration SQL intentionally uses the historical unqualified public table
  // names. Pin the namespace per transaction so role-level search_path settings
  // cannot make local and managed deployments write different schemas.
  // Leaving pg_catalog implicit gives it PostgreSQL's built-in precedence for
  // function/operator lookup while keeping public as the first (and only)
  // writable creation target. Explicit `public, pg_catalog` would let a public
  // function shadow built-ins; explicit `pg_catalog, public` targets the system
  // catalog for unqualified CREATE TABLE and is rejected.
  await transaction.unsafe("SET LOCAL search_path TO public");
  // A stuck deploy must not wait indefinitely behind another migration/schema
  // lock. Keep lock waits short while allowing the 0020 backfill and catalog
  // verification a separate, generous execution budget.
  await transaction.unsafe(
    `SET LOCAL lock_timeout TO '${timeoutPolicy.lockTimeoutMs}ms'`,
  );
  await transaction.unsafe(
    `SET LOCAL statement_timeout TO '${timeoutPolicy.statementTimeoutMs}ms'`,
  );
}

function normalizeMigrationTimeoutPolicy({
  lockTimeoutMs,
  statementTimeoutMs,
}) {
  return {
    lockTimeoutMs: boundedTimeout("lockTimeoutMs", lockTimeoutMs, 5 * 60_000),
    statementTimeoutMs: boundedTimeout(
      "statementTimeoutMs",
      statementTimeoutMs,
      60 * 60_000,
    ),
  };
}

function boundedTimeout(name, value, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new MigrationSafetyError(
      `${name} must be an integer between 1 and ${maximum} milliseconds`,
    );
  }
  return value;
}

function isDatabaseTimeout(error) {
  const code = error && typeof error === "object" ? error.code : undefined;
  return code === "55P03" || code === "57014";
}

function retryableMigrationTimeout(error) {
  return new MigrationSafetyError(
    "Retryable migration timeout: the bounded database wait expired; the active transaction was rolled back and the command can be retried safely.",
    { cause: error },
  );
}

async function trackingTableExists(transaction) {
  const [row] = await transaction`
    SELECT to_regclass(
      ${`${TRACKING_SCHEMA}.${TRACKING_TABLE}`}::text
    ) IS NOT NULL AS "exists"
  `;
  return row?.exists === true;
}

async function ensureTrackingTable(transaction) {
  await transaction.unsafe(`CREATE SCHEMA IF NOT EXISTS "${TRACKING_SCHEMA}"`);
  await transaction.unsafe(`
    CREATE TABLE IF NOT EXISTS "${TRACKING_SCHEMA}"."${TRACKING_TABLE}" (
      "name" text PRIMARY KEY,
      "sha256" text NOT NULL,
      "disposition" text NOT NULL,
      "recorded_at" timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT "sql_migrations_name_check"
        CHECK ("name" ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'),
      CONSTRAINT "sql_migrations_sha256_check"
        CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
      CONSTRAINT "sql_migrations_disposition_check"
        CHECK ("disposition" IN ('applied', 'adopted'))
    )
  `);
}

async function readTrackedRows(transaction, names) {
  if (names.length === 0) return [];
  return transaction`
    SELECT "name", "sha256"
    FROM "sancho_internal"."sql_migrations"
    WHERE "name" IN ${transaction(names)}
  `;
}

async function readTrackedRow(transaction, name) {
  const [row] = await transaction`
    SELECT "name", "sha256"
    FROM "sancho_internal"."sql_migrations"
    WHERE "name" = ${name}
    FOR UPDATE
  `;
  return row;
}

async function insertTrackingRow(transaction, migration, disposition) {
  await transaction`
    INSERT INTO "sancho_internal"."sql_migrations"
      ("name", "sha256", "disposition")
    VALUES (${migration.name}, ${migration.sha256}, ${disposition})
  `;
}

async function inspectMigrationState(transaction, migration) {
  const state = await migration.inspectState(transaction);
  if (!new Set(["absent", "applied", "partial"]).has(state)) {
    throw new MigrationSafetyError(
      `${migration.name}: state verifier returned an invalid result`,
    );
  }
  return state;
}

function migrationOutcome(migration, outcome) {
  return { name: migration.name, sha256: migration.sha256, outcome };
}

function checksumDriftError(migration, trackedChecksum) {
  const tracked = SHA256_PATTERN.test(trackedChecksum)
    ? trackedChecksum
    : "invalid-tracked-checksum";
  return new MigrationSafetyError(
    `${migration.name}: checksum drift detected (tracked ${tracked}, file ${migration.sha256}); historical migrations are immutable and no SQL was executed`,
  );
}

function normalizeMigrationName(value) {
  if (typeof value !== "string") {
    throw new MigrationSafetyError("Migration name must be a string.");
  }
  const normalized = value.split(path.sep).join("/").replace(/^\.\//, "");
  if (
    !SAFE_NAME_PATTERN.test(normalized) ||
    normalized.includes("//") ||
    normalized.split("/").includes("..") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new MigrationSafetyError(`Unsafe migration name: ${value}`);
  }
  return normalized;
}

export function splitSqlStatements(sqlText) {
  const statements = [];
  let current = "";
  let dollarQuote = null;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index];
    const next = sqlText[index + 1];

    if (inLineComment) {
      current += char;
      if (char === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      current += char;
      if (char === "/" && next === "*") {
        throw new MigrationSafetyError(
          "Nested block comments are unsupported by the tracked migration runner.",
        );
      }
      if (char === "*" && next === "/") {
        current += next;
        index += 1;
        inBlockComment = false;
      }
      continue;
    }
    if (dollarQuote) {
      if (sqlText.startsWith(dollarQuote, index)) {
        current += dollarQuote;
        index += dollarQuote.length - 1;
        dollarQuote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote && char === "-" && next === "-") {
      current += char + next;
      index += 1;
      inLineComment = true;
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote && char === "/" && next === "*") {
      current += char + next;
      index += 1;
      inBlockComment = true;
      continue;
    }
    if (!inDoubleQuote && char === "'") {
      if (!inSingleQuote && isPostgresEscapeStringPrefix(sqlText, index)) {
        throw new MigrationSafetyError(
          "PostgreSQL E-prefixed escape strings are unsupported by the tracked migration runner.",
        );
      }
      current += char;
      if (inSingleQuote && next === "'") {
        current += next;
        index += 1;
      } else {
        inSingleQuote = !inSingleQuote;
      }
      continue;
    }
    if (inSingleQuote && char === "\\") {
      throw new MigrationSafetyError(
        "SQL string backslash escapes are unsupported by the tracked migration runner.",
      );
    }
    if (!inSingleQuote && char === '"') {
      current += char;
      if (inDoubleQuote && next === '"') {
        current += next;
        index += 1;
      } else {
        inDoubleQuote = !inDoubleQuote;
      }
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote && char === "$") {
      const match = sqlText
        .slice(index)
        .match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarQuote = match[0];
        current += dollarQuote;
        index += dollarQuote.length - 1;
        continue;
      }
    }
    if (!inSingleQuote && !inDoubleQuote && char === ";") {
      pushStatement(statements, current);
      current = "";
      continue;
    }
    current += char;
  }

  if (inSingleQuote || inDoubleQuote || inBlockComment || dollarQuote) {
    throw new MigrationSafetyError("Unterminated SQL quote or comment.");
  }
  pushStatement(statements, current);
  return statements;
}

function pushStatement(statements, value) {
  const statement = value.trim();
  if (statement) statements.push(statement);
}

function isPostgresEscapeStringPrefix(sqlText, quoteIndex) {
  const prefixIndex = quoteIndex - 1;
  if (prefixIndex < 0 || !/[eE]/.test(sqlText[prefixIndex])) return false;
  const beforePrefix = sqlText[prefixIndex - 1];
  return beforePrefix === undefined || !/[A-Za-z0-9_$]/.test(beforePrefix);
}

function assertTransactionSafe(statement, name) {
  const normalized = normalizeSqlKeywords(statement);
  if (
    /^(begin|start\s+transaction|commit|rollback|savepoint|release\s+savepoint)\b/.test(
      normalized,
    )
  ) {
    throw new MigrationSafetyError(
      `${name}: transaction-control SQL is forbidden; the runner owns the per-file transaction`,
    );
  }
  if (/\bcreate\s+(unique\s+)?index\s+concurrently\b/.test(normalized)) {
    throw new MigrationSafetyError(
      `${name}: CREATE INDEX CONCURRENTLY cannot run inside the required per-file transaction`,
    );
  }
  if (/^(vacuum|cluster\b|reindex\b)/.test(normalized)) {
    throw new MigrationSafetyError(
      `${name}: non-transactional SQL is forbidden by the tracked migration runner`,
    );
  }
  if (/^copy\b[\s\S]*\bfrom\s+stdin\b/.test(normalized)) {
    throw new MigrationSafetyError(
      `${name}: COPY FROM STDIN is unsupported by the tracked migration runner`,
    );
  }
  if (
    /^(do\b|call\b|create\s+(or\s+replace\s+)?(function|procedure)\b)/.test(
      normalized,
    ) ||
    /\bcopy\b[\s\S]*\bprogram\b/.test(normalized)
  ) {
    throw new MigrationSafetyError(
      `${name}: procedural or dynamic SQL is forbidden by the tracked migration runner`,
    );
  }
}

function assertDestructiveStatementAllowed(statement, name, allowlist) {
  const normalized = normalizeSql(statement);
  const keywords = normalizeSqlKeywords(statement);
  const destructive = /\bdrop\b|\btruncate\b/.test(keywords);
  if (!destructive) return;

  const allowed = allowlist.some((entry) => {
    if (entry instanceof RegExp) return entry.test(normalized);
    if (typeof entry === "function") return entry(normalized);
    return entry === normalized;
  });
  if (!allowed) {
    throw new MigrationSafetyError(
      `${name}: destructive SQL is not allowlisted for this immutable migration`,
    );
  }
}

function normalizeSql(statement) {
  return stripSqlComments(statement).trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeSqlKeywords(statement) {
  const source = stripSqlComments(statement);
  let result = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let dollarQuote = null;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (dollarQuote) {
      if (source.startsWith(dollarQuote, index)) {
        result += " ".repeat(dollarQuote.length);
        index += dollarQuote.length - 1;
        dollarQuote = null;
      } else {
        result += " ";
      }
      continue;
    }
    if (inSingleQuote) {
      result += " ";
      if (char === "'" && next === "'") {
        result += " ";
        index += 1;
      } else if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }
    if (inDoubleQuote) {
      result += " ";
      if (char === '"' && next === '"') {
        result += " ";
        index += 1;
      } else if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      result += " ";
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      result += " ";
      continue;
    }
    if (char === "$") {
      const match = source
        .slice(index)
        .match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarQuote = match[0];
        result += " ".repeat(dollarQuote.length);
        index += dollarQuote.length - 1;
        continue;
      }
    }
    result += char;
  }
  return result.trim().replace(/\s+/g, " ").toLowerCase();
}

function stripSqlComments(statement) {
  let result = "";
  let dollarQuote = null;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < statement.length; index += 1) {
    const char = statement[index];
    const next = statement[index + 1];
    if (inLineComment) {
      if (char === "\n") {
        result += char;
        inLineComment = false;
      } else {
        result += " ";
      }
      continue;
    }
    if (inBlockComment) {
      result += char === "\n" ? "\n" : " ";
      if (char === "*" && next === "/") {
        result += " ";
        index += 1;
        inBlockComment = false;
      }
      continue;
    }
    if (dollarQuote) {
      if (statement.startsWith(dollarQuote, index)) {
        result += dollarQuote;
        index += dollarQuote.length - 1;
        dollarQuote = null;
      } else {
        result += char;
      }
      continue;
    }
    if (inSingleQuote) {
      result += char;
      if (char === "'" && next === "'") {
        result += next;
        index += 1;
      } else if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }
    if (inDoubleQuote) {
      result += char;
      if (char === '"' && next === '"') {
        result += next;
        index += 1;
      } else if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }
    if (char === "-" && next === "-") {
      result += "  ";
      index += 1;
      inLineComment = true;
      continue;
    }
    if (char === "/" && next === "*") {
      result += "  ";
      index += 1;
      inBlockComment = true;
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      result += char;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      result += char;
      continue;
    }
    if (char === "$") {
      const match = statement
        .slice(index)
        .match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarQuote = match[0];
        result += dollarQuote;
        index += dollarQuote.length - 1;
        continue;
      }
    }
    result += char;
  }
  return result;
}

function safeDatabaseError(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .split("\n", 1)[0]
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url-redacted]")
    .slice(0, 300);
}

function defaultLogger(message) {
  console.log(message);
}
