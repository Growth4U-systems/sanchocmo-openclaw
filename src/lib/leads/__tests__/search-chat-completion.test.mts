import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ExecutionRun } from "../../execution-control";
import type { ResolvedMcChatExecutionOrigin } from "../../runtime/mc-chat-execution-origin";
import type { LeadsSearchProjectedResultV2 } from "../search-projection";

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "sancho-leads-search-chat-completion-"),
);
process.env.MC_WORKSPACE = workspace;

const completionModule = await import("../search-chat-completion");
const completion =
  (completionModule as unknown as { default?: typeof completionModule })
    .default ?? completionModule;
const deliveryModule = await import("../../data/mc-chat-durable-delivery");
const delivery =
  (deliveryModule as unknown as { default?: typeof deliveryModule }).default ??
  deliveryModule;

const timestamp = "2026-07-16T12:00:00.000Z";

function run(overrides: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: "xrun-chat-completion-1",
    tenantKey: "hospital-capilar",
    idempotencyKey: "hospital-capilar:leads-search:request-1",
    aggregateType: "leads_search",
    aggregateId: "search-1",
    operation: "leads.search",
    mode: "canary",
    status: "completed",
    input: { query: "cirujanos capilares" },
    output: { rawProviderResponse: "must-never-be-published" },
    error: "Apollo Authorization: Bearer sk_test_ultrasecret",
    metadata: {},
    availableAt: timestamp,
    claimCount: 1,
    handlerAttempt: 1,
    createdAt: timestamp,
    startedAt: timestamp,
    finishedAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function result(
  overrides: Partial<LeadsSearchProjectedResultV2> = {},
): LeadsSearchProjectedResultV2 {
  return {
    provider: "apollo",
    candidates: [
      {
        providerId: "person-1",
        name: "Ada Lovelace",
        title: "VP Growth",
        linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
        organizationName: "Analytical Engines",
        organizationDomain: "analytical.example",
      },
    ],
    totalAvailable: 1,
    returned: 1,
    page: 1,
    nextPage: null,
    hasMore: false,
    ...overrides,
  };
}

function origin(): ResolvedMcChatExecutionOrigin {
  return {
    origin: {
      schemaVersion: 1,
      kind: "mc_chat_parent_run",
      parentAgentRunId: "run-parent-1",
    },
    parentRun: {
      id: "run-parent-1",
      threadId: "hospital-capilar:leads-search-1",
      runtime: "openclaw",
      agent: "sancho",
      status: "completed",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    tenantSlug: "hospital-capilar",
    threadId: "hospital-capilar:leads-search-1",
    agent: "sancho",
  };
}

function allFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { recursive: true, encoding: "utf8" })
    .map((entry) => path.join(directory, entry))
    .filter((entry) => fs.statSync(entry).isFile());
}

test("an execution without an origin does not append a chat delivery", async () => {
  let originLookups = 0;
  let appends = 0;
  await completion.deliverLeadsSearchChatCompletion(
    {
      run: run(),
      terminalStatus: "completed",
      result: result(),
    },
    {
      resolveOrigin: async () => {
        originLookups += 1;
        return null;
      },
      appendDelivery: () => {
        appends += 1;
        return { created: true, fingerprint: "a".repeat(64) };
      },
    },
  );

  assert.equal(originLookups, 1);
  assert.equal(appends, 0);
});

test("the terminal formatter escapes provider-controlled Markdown", () => {
  const text = completion.formatLeadsSearchChatCompletion({
    terminalStatus: "completed",
    result: result({
      candidates: [
        {
          providerId: "person-markdown",
          name: "Ada *Lovelace* [R&D]\n1. **Injected**",
          title: "VP_Growth",
          linkedinUrl:
            "https://www.linkedin.com/in/ada)[evil](https://evil.example)",
          organizationName: "Analytical (Engines) #1 | > quote",
        },
      ],
    }),
  });

  assert.match(text, /Ada \\\*Lovelace\\\* \\\[R&D\\\]/);
  assert.match(text, /VP\\_Growth/);
  assert.match(text, /Analytical \\\(Engines\\\) \\#1 \\\| \\> quote/);
  assert.match(text, /1\\\. \\\*\\\*Injected\\\*\\\*/);
  assert.doesNotMatch(text, /\n1\. \*\*Injected\*\*/);
  assert.doesNotMatch(text, /\[evil\]\(https:\/\/evil\.example\)/);
  assert.match(
    text,
    /LinkedIn: .*\\\[evil\\\]\\\(https:\/\/evil\\\.example\\\)/,
  );
});

test("an identical terminal delivery is idempotent and never publishes raw errors or secrets", async () => {
  const failedRun = run({
    id: "xrun-chat-completion-failed",
    status: "failed",
  });
  const input = {
    run: failedRun,
    terminalStatus: "failed" as const,
    result: null,
  };
  const dependencies = {
    resolveOrigin: async () => origin(),
  };

  const earliestDelivery = Date.now();
  await completion.deliverLeadsSearchChatCompletion(input, dependencies);
  await completion.deliverLeadsSearchChatCompletion(input, dependencies);
  const latestDelivery = Date.now();

  const messages = delivery.listDurableChatDeliveries(
    "hospital-capilar:leads-search-1",
  );
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, "workflow");
  assert.equal(
    messages[0].text,
    "No se pudo completar la búsqueda de leads. La ejecución quedó registrada para diagnóstico.",
  );
  assert.equal(messages[0].agent, "sancho");
  assert.equal(
    messages[0].deliveryKey,
    "execution-terminal:leads.search:v1:xrun-chat-completion-failed",
  );
  assert.ok(messages[0].ts >= earliestDelivery);
  assert.ok(messages[0].ts <= latestDelivery);

  const persisted = allFiles(workspace)
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  assert.doesNotMatch(persisted, /sk_test_ultrasecret/);
  assert.doesNotMatch(persisted, /Authorization: Bearer/);
  assert.doesNotMatch(persisted, /must-never-be-published/);
  assert.doesNotMatch(persisted, /rawProviderResponse/);
});
