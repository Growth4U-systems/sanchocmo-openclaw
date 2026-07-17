import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import type { DiscoverySearchRecord } from "../discovery-types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-discovery-store-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";
process.env.PARTNERSHIPS_DISCOVERY_EXECUTION_V2 = "off";

type StoreModule = typeof import("../discovery-store");
let store: StoreModule;
let runHandler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;
let dispatchHandler: (
  req: NextApiRequest,
  res: NextApiResponse,
) => Promise<void>;
let archiveHandler: (
  req: NextApiRequest,
  res: NextApiResponse,
) => Promise<void>;

function search(
  id: string,
  overrides: Partial<DiscoverySearchRecord> = {},
): DiscoverySearchRecord {
  return {
    id,
    slug: "hospital-capilar",
    title: "Salud capilar",
    plan: {
      title: "Salud capilar",
      sectors: ["salud capilar"],
      networks: ["instagram"],
      tiers: ["micro"],
      targetVolume: 1,
    },
    campaignId: "campaign-security",
    projectId: null,
    taskId: null,
    threadId: null,
    runner: {
      status: "queued",
      mode: null,
      attempts: 0,
      queuedAt: "2026-07-16T10:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      error: null,
      stats: null,
    },
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:00.000Z",
    ...overrides,
  };
}

function responseCapture(): {
  response: NextApiResponse;
  read: () => { status: number; payload: unknown };
} {
  let status = 200;
  let payload: unknown;
  const response = {
    headersSent: false,
    setHeader() {},
    status(code: number) {
      status = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      this.headersSent = true;
      return this;
    },
  } as unknown as NextApiResponse;
  return { response, read: () => ({ status, payload }) };
}

function request(method: string, id: string): NextApiRequest {
  return {
    method,
    url: `/api/partnerships/searches/${encodeURIComponent(id)}?slug=hospital-capilar`,
    query: { slug: "hospital-capilar", id },
    headers: { "x-admin-token": "security-admin" },
    body: {},
  } as unknown as NextApiRequest;
}

before(async () => {
  fs.writeFileSync(
    path.join(tmp, "clients.json"),
    JSON.stringify({
      clients: [
        { slug: "hospital-capilar", name: "Hospital Capilar", active: true },
      ],
      adminToken: "security-admin",
    }),
  );
  store = await import("../discovery-store");
  runHandler = (await import("@/pages/api/partnerships/searches/[id]/run"))
    .default;
  dispatchHandler = (
    await import("@/pages/api/partnerships/searches/[id]/dispatch")
  ).default;
  archiveHandler = (
    await import("@/pages/api/partnerships/searches/[id]/index")
  ).default;
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("discovery store accepts only the closed supported ID families", () => {
  for (const id of ["ds-1", "search-1", "b2b-1"]) {
    const saved = store.saveSearch(search(id));
    assert.equal(store.getSearch("hospital-capilar", id)?.id, saved.id);
  }

  for (const id of [
    decodeURIComponent("%2e%2e%2foutside"),
    "nested/ds-1",
    String.raw`..\outside`,
    "/tmp/ds-absolute",
    "DS-uppercase",
    "unscoped-1",
  ]) {
    assert.throws(
      () => store.searchFile("hospital-capilar", id),
      (error: unknown) =>
        error instanceof store.DiscoveryStoreValidationError &&
        error.code === "invalid_search_id",
    );
  }
});

test("discovery store rejects tenant traversal before touching storage", () => {
  const outside = path.join(tmp, "outside-sentinel.json");
  fs.writeFileSync(outside, "unchanged");
  for (const slug of [
    "../other",
    "hospital/capilar",
    String.raw`hospital\capilar`,
  ]) {
    assert.throws(
      () => store.searchFile(slug, "ds-safe"),
      (error: unknown) =>
        error instanceof store.DiscoveryStoreValidationError &&
        error.code === "invalid_slug",
    );
  }
  assert.equal(fs.readFileSync(outside, "utf8"), "unchanged");
});

test("getSearch refuses a valid path whose JSON claims another tenant or ID", () => {
  const dir = store.searchesDir("hospital-capilar");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "ds-cross-tenant.json"),
    JSON.stringify(
      search("ds-other", {
        slug: "other-tenant",
      }),
    ),
  );

  assert.throws(
    () => store.getSearch("hospital-capilar", "ds-cross-tenant"),
    (error: unknown) =>
      error instanceof store.DiscoveryStoreValidationError &&
      error.code === "identity_mismatch",
  );
});

test("getSearch never follows a receipt symlink outside the tenant root", () => {
  const outside = path.join(tmp, "outside-receipt.json");
  fs.writeFileSync(outside, JSON.stringify(search("ds-symlink")));
  const link = store.searchFile("hospital-capilar", "ds-symlink");
  fs.symlinkSync(outside, link);
  assert.throws(
    () => store.getSearch("hospital-capilar", "ds-symlink"),
    (error: unknown) =>
      error instanceof store.DiscoveryStoreValidationError &&
      error.code === "unsafe_path",
  );
});

test("run, dispatch and archive reject decoded traversal IDs at HTTP boundary", async () => {
  const invalidIds = [
    decodeURIComponent("%2e%2e%2fother"),
    "nested/ds-1",
    String.raw`..\other`,
    "/tmp/ds-absolute",
  ];
  for (const [handler, method] of [
    [runHandler, "POST"],
    [dispatchHandler, "POST"],
    [archiveHandler, "DELETE"],
  ] as const) {
    for (const id of invalidIds) {
      const capture = responseCapture();
      await handler(request(method, id), capture.response);
      assert.equal(capture.read().status, 400, `${method} accepted ${id}`);
      assert.equal(
        (capture.read().payload as { code?: string }).code,
        "DISCOVERY_SEARCH_ID_INVALID",
      );
    }
  }
});

test("run, dispatch and archive fail closed on cross-identity JSON", async () => {
  for (const [handler, method] of [
    [runHandler, "POST"],
    [dispatchHandler, "POST"],
    [archiveHandler, "DELETE"],
  ] as const) {
    const capture = responseCapture();
    await handler(request(method, "ds-cross-tenant"), capture.response);
    assert.equal(capture.read().status, 409);
    assert.equal(
      (capture.read().payload as { code?: string }).code,
      "DISCOVERY_SEARCH_RECEIPT_INVALID",
    );
  }
});
