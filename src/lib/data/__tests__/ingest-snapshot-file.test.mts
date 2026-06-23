/**
 * ingestSnapshot (SAN-318): delegate a parsed daily snapshot to ingestDailySnapshot.
 * DB-independent — the real ingest is replaced by a fake via the `ingest` param.
 * CJS interop matches the repo pattern (import * + .default fallback).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../../../../scripts/ingest-metrics";

const { ingestSnapshot } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("delegates to ingestDailySnapshot with the daily payload + deleteStale", async () => {
  const calls: Array<{ slug: string; date: string; daily: unknown; opts: unknown }> = [];
  const fakeIngest = (async (slug: string, date: string, daily: unknown, opts: unknown) => {
    calls.push({ slug, date, daily, opts });
    return { ok: true, rows: 3, sources: ["ghl"], skipped: [], deleted: 1, storage: { configured: true } };
  }) as unknown as Parameters<typeof ingestSnapshot>[0]["ingest"];

  const daily = {
    slug: "growth4u",
    collectedAt: "2026-06-23T06:00:00.000Z",
    sources: { ghl: { status: "ok", metrics: [{ name: "appointments", value: 2 }] } },
  };

  const res = await ingestSnapshot({
    slug: "growth4u", date: "2026-06-23", daily, deleteStale: true, ingest: fakeIngest,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].slug, "growth4u");
  assert.equal(calls[0].date, "2026-06-23");
  assert.deepEqual(calls[0].daily, daily);
  assert.deepEqual(calls[0].opts, { deleteStale: true });
  assert.deepEqual(res, { rows: 3, deleted: 1, configured: true });
});

test("normalizes a missing `deleted` (not-configured result) to 0", async () => {
  const fakeIngest = (async () => ({
    ok: false, rows: 0, sources: [], skipped: [], storage: { configured: false },
  })) as unknown as Parameters<typeof ingestSnapshot>[0]["ingest"];

  const res = await ingestSnapshot({
    slug: "g", date: "2026-06-23",
    daily: { slug: "g", collectedAt: null, sources: {} },
    deleteStale: false, ingest: fakeIngest,
  });
  assert.deepEqual(res, { rows: 0, deleted: 0, configured: false });
});
