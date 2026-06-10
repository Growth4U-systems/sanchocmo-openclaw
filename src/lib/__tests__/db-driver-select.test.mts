import { test } from "node:test";
import assert from "node:assert/strict";

// Dynamic import + namespace access: matches the repo's tsx/CJS interop pattern
// (see src/lib/data/__tests__/*), under which static named imports can fail to
// link while the namespace still carries the exports.
const { selectDbDriver } = await import("../../db/driver-select");

test("Neon serverless URLs auto-detect to the neon driver (prod path unchanged)", () => {
  assert.equal(
    selectDbDriver("postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/mc?sslmode=require"),
    "neon",
  );
  // Pooler host
  assert.equal(
    selectDbDriver("postgres://u:p@ep-cool-pooler.eu-central-1.aws.neon.tech/db"),
    "neon",
  );
  // host-only, no path
  assert.equal(selectDbDriver("postgresql://u:p@host.neon.tech"), "neon");
});

test("bundled local Postgres and other vanilla PG hosts use the postgres driver", () => {
  // The wizard writes exactly this for COMPOSE_PROFILES=local-db
  assert.equal(
    selectDbDriver("postgres://sancho:secret@postgres:5432/sancho"),
    "postgres",
  );
  // A self-hosted / managed (non-Neon) Postgres
  assert.equal(
    selectDbDriver("postgresql://u:p@db.example.com:5432/app"),
    "postgres",
  );
  // localhost
  assert.equal(selectDbDriver("postgres://u:p@localhost:5432/x"), "postgres");
});

test("DATABASE_DRIVER override wins over host auto-detect", () => {
  // Force postgres even though the host looks like Neon
  assert.equal(
    selectDbDriver("postgresql://u:p@ep.neon.tech/db", "postgres"),
    "postgres",
  );
  // Force neon even though the host is vanilla
  assert.equal(
    selectDbDriver("postgres://u:p@postgres:5432/sancho", "neon"),
    "neon",
  );
  // Case / whitespace tolerant
  assert.equal(
    selectDbDriver("postgres://u:p@postgres:5432/sancho", "  NEON  "),
    "neon",
  );
});

test("an unrecognized override falls back to host auto-detect", () => {
  assert.equal(
    selectDbDriver("postgresql://u:p@x.neon.tech/db", "garbage"),
    "neon",
  );
  assert.equal(
    selectDbDriver("postgres://u:p@postgres:5432/db", ""),
    "postgres",
  );
});

test("a domain that merely contains 'neon.tech' as a non-suffix is NOT treated as Neon", () => {
  // e.g. someone hosts at neon.tech.evil.com — must not route to neon-http
  assert.equal(
    selectDbDriver("postgres://u:p@neon.tech.example.com:5432/db"),
    "postgres",
  );
});
