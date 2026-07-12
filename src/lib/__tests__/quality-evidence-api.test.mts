import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-quality-api-"));
process.env.MC_WORKSPACE = tmp;
process.env.SANCHO_MCP_TOKEN = "quality-token";
process.env.SANCHO_MCP_TOKEN_ID = "quality-lab";
process.env.SANCHO_MCP_SCOPES = "quality:read";
process.env.SANCHO_MCP_CLIENTS = "alpha";
fs.writeFileSync(
  path.join(tmp, "clients.json"),
  JSON.stringify({
    clients: [
      { slug: "alpha", name: "Alpha", active: true },
      { slug: "beta", name: "Beta", active: true },
    ],
  }),
);

const agentRunsModule = await import("../data/agent-runs");
const agentRuns =
  (agentRunsModule as unknown as { default: typeof agentRunsModule }).default ??
  agentRunsModule;
const chatModule = await import("../data/mc-chat");
const chat =
  (chatModule as unknown as { default: typeof chatModule }).default ??
  chatModule;
const endpointModule = await import("../../pages/api/quality/evidence/[slug]");
const windowTo = new Date(Date.now() - 60_000);
const windowFrom = new Date(windowTo.getTime() - 24 * 60 * 60 * 1_000);
const runCreatedAt = new Date(windowTo.getTime() - 60 * 60 * 1_000);
const runFinishedAt = new Date(runCreatedAt.getTime() + 60_000);

interface MockResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  setHeader(name: string, value: string): void;
  status(code: number): MockResponse;
  json(body: unknown): MockResponse;
}

function response(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function invoke(slug: string, authorization = "Bearer quality-token") {
  const req = {
    method: "GET",
    query: {
      slug,
      from: windowFrom.toISOString(),
      to: windowTo.toISOString(),
      limit: "250",
    },
    headers: authorization ? { authorization } : {},
  };
  const res = response();
  await endpointModule.qualityEvidenceHandler(req as never, res as never);
  return res;
}

test("quality evidence endpoint enforces bearer scope and tenant allowlist", async () => {
  const alphaRun = agentRuns.createAgentRun({
    threadId: "alpha:task-1",
    runtime: "openclaw",
    taskId: "P01-T01",
    taskContract: {
      completion: "Output exists",
      expectedOutputs: [
        { path: "brand/alpha/output.md", source: "deliverable_file" },
      ],
    },
    input: {
      slug: "alpha",
      userText: "Create output",
      userId: "private-alpha-user",
      userName: "Private Alpha",
      attachments: [{ url: "https://private.example/input" }],
    },
    now: runCreatedAt,
  });
  agentRuns.markAgentRunCompleted(
    alphaRun.id,
    alphaRun.threadId,
    {
      text: "Done https://private.example/result",
    },
    runFinishedAt,
  );
  chat.saveThread(alphaRun.threadId, {
    messages: [
      { role: "user", text: "Create output", ts: runCreatedAt.getTime() },
      { role: "bot", text: "Done", ts: runFinishedAt.getTime() },
    ],
  });

  agentRuns.createAgentRun({
    threadId: "beta:task-1",
    runtime: "openclaw",
    input: { slug: "beta", userText: "Do not leak me" },
    now: new Date(runCreatedAt.getTime() + 30 * 60_000),
  });

  const ok = await invoke("alpha");
  assert.equal(ok.statusCode, 200);
  const envelope = ok.body as {
    schemaVersion: string;
    clientSlug: string;
    coverage: {
      retainedRuns: number;
      retainedEvents: number;
      limitations: string[];
    };
    redaction: { applied: boolean; version: string };
    page: {
      after: string | null;
      nextCursor: string | null;
      hasMore: boolean;
      limit: number;
    };
    items: Array<{ runId: string; evidenceState: string }>;
  };
  assert.equal(envelope.schemaVersion, "quality-evidence.v1");
  assert.equal(envelope.clientSlug, "alpha");
  assert.equal(envelope.page.limit, 250);
  assert.equal(envelope.redaction.applied, true);
  assert.equal(envelope.coverage.retainedRuns, 1);
  assert.equal(envelope.items[0].runId, alphaRun.id);
  assert.equal(envelope.items[0].evidenceState, "unverified_completion");
  assert.equal(JSON.stringify(envelope).includes("Do not leak me"), false);
  assert.equal(JSON.stringify(envelope).includes("private-alpha-user"), false);
  assert.equal(JSON.stringify(envelope).includes("Private Alpha"), false);
  assert.equal(JSON.stringify(envelope).includes("private.example"), false);
  assert.equal(ok.headers["cache-control"], "private, no-store");

  const forbiddenTenant = await invoke("beta");
  assert.equal(forbiddenTenant.statusCode, 403);

  const missingBearer = await invoke("alpha", "");
  assert.equal(missingBearer.statusCode, 401);

  const previousClients = process.env.SANCHO_MCP_CLIENTS;
  process.env.SANCHO_MCP_CLIENTS = "*";
  try {
    const wildcard = await invoke("alpha");
    assert.equal(wildcard.statusCode, 403);
  } finally {
    process.env.SANCHO_MCP_CLIENTS = previousClients;
  }

  const previousScopes = process.env.SANCHO_MCP_SCOPES;
  process.env.SANCHO_MCP_SCOPES = "tasks:read";
  try {
    const missingScope = await invoke("alpha");
    assert.equal(missingScope.statusCode, 403);
  } finally {
    process.env.SANCHO_MCP_SCOPES = previousScopes;
  }

  for (const wildcardScope of ["*", "quality:*"]) {
    process.env.SANCHO_MCP_SCOPES = wildcardScope;
    try {
      const wildcard = await invoke("alpha");
      assert.equal(wildcard.statusCode, 403);
    } finally {
      process.env.SANCHO_MCP_SCOPES = previousScopes;
    }
  }
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});
