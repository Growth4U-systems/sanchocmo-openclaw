import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import postgres from "postgres";

// This contract is intentionally opt-in and never falls back to DATABASE_URL:
// callers must provide a disposable, migrated Postgres instance explicitly.
const databaseUrl = process.env.TASKS_INSERT_ONLY_TEST_DATABASE_URL;

test(
  "Postgres insert-only project creation is concurrent, immutable and marker-fenced",
  { skip: !databaseUrl, timeout: 30_000 },
  async () => {
    const workspace = `insert-only-${crypto.randomUUID()}`;
    const slug = "contract-tenant";
    const projectId = `P-Durable-${crypto.randomUUID().slice(0, 8)}`;
    const marker = `contract:postgres:${crypto.randomUUID()}`;
    const localWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), "sancho-insert-only-db-"),
    );
    process.env.DATABASE_URL = databaseUrl;
    process.env.MC_TASKS_BACKEND = "db";
    process.env.MC_TASKS_WORKSPACE = workspace;
    process.env.MC_WORKSPACE = localWorkspace;

    const sql = postgres(databaseUrl as string, {
      max: 10,
      onnotice: () => undefined,
    });
    let appClient:
      { end(options?: { timeout?: number }): Promise<void> } | undefined;
    try {
      const { getDb } = await import("@/db/drizzle");
      appClient = (
        getDb() as unknown as {
          $client?: { end(options?: { timeout?: number }): Promise<void> };
        }
      ).$client;
      const { ensureProjectInsertOnly } = await import("../tasks");
      const command = {
        id: projectId,
        name: "Original durable project",
        category: "outreach-campaign",
        status: "in-progress" as const,
        owner: "Sancho",
        description: "original durable description",
        seedFromTaskSet: "outreach-campaign",
        idempotencyMarker: marker,
      };

      const receipts = await Promise.all(
        Array.from({ length: 8 }, () => ensureProjectInsertOnly(slug, command)),
      );
      assert.equal(receipts.filter((receipt) => receipt.created).length, 1);

      const rows = await sql<
        Array<{
          id: string;
          parent_id: string | null;
          name: string;
          category: string | null;
          marker: string | null;
        }>
      >`
        SELECT
          "id",
          "parent_id",
          "name",
          "category",
          "legacy_extras"->>'durable_creation_key' AS "marker"
        FROM "tasks"
        WHERE "workspace_slug" = ${workspace}
          AND "brand_slug" = ${slug}
        ORDER BY "id"
      `;
      const projectRows = rows.filter((row) => row.parent_id === null);
      const childRows = rows.filter((row) => row.parent_id === projectId);
      assert.equal(projectRows.length, 1);
      assert.ok(childRows.length > 0);
      assert.equal(projectRows[0]?.category, command.category);
      assert.ok(rows.every((row) => row.marker === marker));

      await sql`
        UPDATE "tasks"
        SET "name" = 'Operator-owned title',
            "description" = 'operator mutation'
        WHERE "workspace_slug" = ${workspace}
          AND "brand_slug" = ${slug}
          AND "id" = ${projectId}
      `;
      const replay = await ensureProjectInsertOnly(slug, command);
      assert.equal(replay.created, false);
      assert.equal(replay.project.name, "Operator-owned title");
      assert.equal(replay.project.description, "operator mutation");

      await assert.rejects(
        ensureProjectInsertOnly(slug, {
          ...command,
          idempotencyMarker: `${marker}:other-owner`,
        }),
        /owned by another command/,
      );

      const removedChild = childRows[0];
      assert.ok(removedChild);
      await sql`
        DELETE FROM "tasks"
        WHERE "workspace_slug" = ${workspace}
          AND "brand_slug" = ${slug}
          AND "id" = ${removedChild.id}
      `;
      await ensureProjectInsertOnly(slug, command);
      const [{ count }] = await sql<Array<{ count: number }>>`
        SELECT count(*)::int AS "count"
        FROM "tasks"
        WHERE "workspace_slug" = ${workspace}
          AND "brand_slug" = ${slug}
          AND "parent_id" = ${projectId}
      `;
      assert.equal(count, childRows.length - 1);
    } finally {
      await sql`
        DELETE FROM "tasks"
        WHERE "workspace_slug" = ${workspace}
          AND "brand_slug" = ${slug}
      `.catch(() => undefined);
      await appClient?.end({ timeout: 5 }).catch(() => undefined);
      await sql.end({ timeout: 5 });
      fs.rmSync(localWorkspace, { recursive: true, force: true });
    }
  },
);
