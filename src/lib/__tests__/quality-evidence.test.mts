import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-quality-evidence-"));
process.env.MC_WORKSPACE = tmp;

const {
  buildQualityEvidencePage,
  buildTaskContractSnapshot,
  redactQualityString,
  redactQualityValue,
  resolveQualityEvidencePageRequest,
} = await import("../quality/evidence");
const { qualityOutputMatches } =
  await import("../quality/task-contract-snapshot");

const from = "2026-07-11T00:00:00.000Z";
const to = "2026-07-12T00:00:00.000Z";
const resolvePage = (
  input: Omit<Parameters<typeof resolveQualityEvidencePageRequest>[0], "now">,
) => resolveQualityEvidencePageRequest({ ...input, now: new Date(to) });

test("quality redaction drops identities and attachment URLs and scrubs secrets", () => {
  const value = redactQualityValue({
    userId: "user-123",
    userName: "Alice",
    attachments: [
      { url: "https://files.example/private", filename: "secret.pdf" },
    ],
    url: "https://example.com/private",
    token: "plain-secret-token",
    text: "Bearer abc123 https://example.com/x sk_test_123456789 sk-ant-api03_abcdefghijklmnopqrstuvwxyz xoxb-1234567890-abcdefghijkl AKIAABCDEFGHIJKLMNOP AIzaabcdefghijklmnopqrstuvwxyz client_secret=verysecretvalue alice@example.com +34612345678",
    nested: { apiKey: "key-value", safe: "visible" },
  });
  const serialized = JSON.stringify(value);

  assert.equal(serialized.includes("user-123"), false);
  assert.equal(serialized.includes("Alice"), false);
  assert.equal(serialized.includes("files.example"), false);
  assert.equal(serialized.includes("plain-secret-token"), false);
  assert.equal(serialized.includes("abc123"), false);
  assert.equal(serialized.includes("sk_test_123456789"), false);
  assert.equal(serialized.includes("sk-ant-api03"), false);
  assert.equal(serialized.includes("xoxb-"), false);
  assert.equal(serialized.includes("AKIAABCDEFGHIJKLMNOP"), false);
  assert.equal(serialized.includes("AIza"), false);
  assert.equal(serialized.includes("verysecretvalue"), false);
  assert.equal(serialized.includes("alice@example.com"), false);
  assert.equal(serialized.includes("+34612345678"), false);
  assert.match(serialized, /visible/);
  assert.match(redactQualityString("call 612345678"), /REDACTED_PHONE/);
});

test("task snapshot keeps completion contract and safe expected output refs", () => {
  const snapshot = buildTaskContractSnapshot(
    {
      id: "T01",
      name: "Generate report",
      type: "analysis",
      status: "in-progress",
      completion: "Report reviewed",
      done_criteria: "File exists and is readable",
      deliverable_file: "reports\\final.md",
      output_documents: [
        { path: "brand/acme/reports/evidence.json" },
        { path: "https://private.example/file" },
      ],
      output_files: ["brand/acme/reports/final.md", "reports/**/*.json"],
      documents: [{ path: "reports/appendix.md" }],
    },
    "acme",
  );

  assert.equal(snapshot?.completion, "Report reviewed");
  assert.equal(snapshot?.doneCriteria, "File exists and is readable");
  assert.deepEqual(snapshot?.expectedOutputs, [
    { path: "brand/acme/reports/evidence.json", source: "output_documents" },
    { path: "brand/acme/reports/final.md", source: "deliverable_file" },
    { path: "brand/acme/reports/**/*.json", source: "output_files" },
    { path: "brand/acme/reports/appendix.md", source: "documents" },
  ]);

  const fallback = buildTaskContractSnapshot(
    { id: "T02", type: "execution" },
    "acme",
  );
  assert.deepEqual(fallback?.expectedOutputs, [
    { path: "brand/acme/tasks/T02/output.md", source: "fallback" },
  ]);
  const invalidOnly = buildTaskContractSnapshot(
    {
      id: "T03",
      type: "execution",
      output_documents: [{ path: "https://private.example/not-an-output" }],
    },
    "acme",
  );
  assert.deepEqual(invalidOnly?.expectedOutputs, [
    { path: "brand/acme/tasks/T03/output.md", source: "fallback" },
  ]);
  assert.equal(
    qualityOutputMatches(
      "brand/acme/reports/**/*.{md,html}",
      "brand/acme/reports/weekly/final.html",
    ),
    true,
  );

  const blueprint = buildTaskContractSnapshot(
    {
      id: "T04",
      type: "execution",
      deliverable_file: "brand/acme/content/configs/setup.md",
      output_files: [
        "setup.md",
        "cadence-config.yml",
        "news-prompts/*.yml",
        "../../market-and-us/inputs/*.json",
        "content/configs/already-based.yml",
        "../../../beta/private.yml",
      ],
    },
    "acme",
  );
  assert.deepEqual(blueprint?.expectedOutputs, [
    { path: "brand/acme/content/configs/setup.md", source: "deliverable_file" },
    {
      path: "brand/acme/content/configs/cadence-config.yml",
      source: "output_files",
    },
    {
      path: "brand/acme/content/configs/news-prompts/*.yml",
      source: "output_files",
    },
    { path: "brand/acme/market-and-us/inputs/*.json", source: "output_files" },
    {
      path: "brand/acme/content/configs/already-based.yml",
      source: "output_files",
    },
  ]);

  const persistedContract = buildTaskContractSnapshot(
    {
      id: "T04",
      type: "execution",
      output_documents: [
        {
          path: "brand/acme/content/configs/setup.md",
          source: "deliverable_file",
        },
        { path: "brand/acme/cadence-config.yml", source: "output_files" },
        { path: "brand/acme/news-prompts/*.yml", source: "output_files" },
      ],
      output_files: ["setup.md", "cadence-config.yml", "news-prompts/*.yml"],
    },
    "acme",
  );
  assert.deepEqual(persistedContract?.expectedOutputs, [
    { path: "brand/acme/content/configs/setup.md", source: "deliverable_file" },
    {
      path: "brand/acme/content/configs/cadence-config.yml",
      source: "output_files",
    },
    {
      path: "brand/acme/content/configs/news-prompts/*.yml",
      source: "output_files",
    },
  ]);

  const directoryAnchor = buildTaskContractSnapshot(
    {
      id: "T05",
      type: "execution",
      deliverable_file: "brand/acme/content/configs/",
      output_files: ["child.yml"],
    },
    "acme",
  );
  assert.deepEqual(directoryAnchor?.expectedOutputs, [
    { path: "brand/acme/content/child.yml", source: "output_files" },
  ]);
});

test("pure exporter isolates tenant/window and exposes unverified completion plus corrective follow-up", () => {
  const page = resolvePage({ clientSlug: "acme", from, to, limit: 1 });
  const taskContract = buildTaskContractSnapshot({
    name: "Supported report",
    completion: "A report exists",
    deliverable_file: "brand/acme/report.md",
  });
  const runs = [
    {
      id: "run_1",
      threadId: "acme:task-1",
      runtime: "openclaw",
      agent: "sancho",
      skill: "reporting",
      status: "completed" as const,
      taskId: "P01-T01",
      taskContract,
      input: {
        slug: "acme",
        userText: "Create the report",
        userId: "private-user",
        userName: "Private Name",
        attachments: [{ url: "https://private.example/input" }],
      },
      output: {
        text: "Done. https://private.example/output",
        secret: "do-not-leak",
      },
      createdAt: "2026-07-11T10:00:00.000Z",
      startedAt: "2026-07-11T10:00:01.000Z",
      finishedAt: "2026-07-11T10:01:00.000Z",
      updatedAt: "2026-07-11T10:01:00.000Z",
    },
    {
      id: "run_1_followup",
      threadId: "acme:task-1",
      runtime: "openclaw",
      status: "queued" as const,
      input: { slug: "acme", userText: "Eso no funciona, inténtalo de nuevo" },
      createdAt: "2026-07-11T10:05:00.000Z",
      updatedAt: "2026-07-11T10:05:00.000Z",
    },
    {
      id: "run_2",
      threadId: "acme:task-2",
      runtime: "openclaw",
      status: "failed" as const,
      error: "Bearer private-runtime-token",
      input: { slug: "acme", userText: "Second task" },
      createdAt: "2026-07-11T11:00:00.000Z",
      finishedAt: "2026-07-11T11:01:00.000Z",
      updatedAt: "2026-07-11T11:01:00.000Z",
    },
    {
      id: "run_beta",
      threadId: "beta:task-1",
      runtime: "openclaw",
      status: "completed" as const,
      input: { slug: "beta", userText: "Other tenant" },
      createdAt: "2026-07-11T10:30:00.000Z",
      updatedAt: "2026-07-11T10:30:00.000Z",
    },
    {
      id: "run_old",
      threadId: "acme:old",
      runtime: "openclaw",
      status: "completed" as const,
      input: { slug: "acme", userText: "Old" },
      createdAt: "2026-07-10T10:00:00.000Z",
      updatedAt: "2026-07-10T10:00:00.000Z",
    },
  ];
  const events = [
    {
      id: "evt_1",
      runId: "run_1",
      threadId: "acme:task-1",
      type: "progress" as const,
      ts: "2026-07-11T10:00:30.000Z",
      data: {
        kind: "tool_call",
        label: "Fetch https://private.example",
        target: "token=secret-value",
      },
    },
    {
      id: "evt_2",
      runId: "run_2",
      threadId: "acme:task-2",
      type: "runtime_rejected" as const,
      ts: "2026-07-11T11:00:30.000Z",
      data: { errorDetail: { category: "auth", raw: "HTTP 403" } },
    },
  ];
  const first = buildQualityEvidencePage({
    clientSlug: "acme",
    page,
    runs,
    events,
  });
  assert.equal(first.items.length, 1);
  assert.equal(first.hasMore, true);
  assert.ok(first.nextCursor);
  const item = first.items[0];
  assert.equal(item.evidenceId, "quality:run_1");
  assert.deepEqual(item.request, { text: "Create the report" });
  assert.match(item.response.text, /REDACTED_URL/);
  assert.equal(item.artifacts[0].path, "brand/acme/report.md");
  assert.equal(item.followup?.signal, "possible_correction");
  assert.equal(item.followup?.text, "Eso no funciona, inténtalo de nuevo");
  assert.equal(item.evidenceState, "unverified_completion");
  assert.equal(item.evidence.unverifiedCompletionCandidate, true);
  assert.equal(JSON.stringify(item).includes("private-user"), false);
  assert.equal(JSON.stringify(item).includes("Private Name"), false);
  assert.equal(JSON.stringify(item).includes("private.example"), false);
  assert.equal(JSON.stringify(first).includes("Other tenant"), false);

  const secondPage = resolvePage({
    clientSlug: "acme",
    after: first.nextCursor!,
  });
  const second = buildQualityEvidencePage({
    clientSlug: "acme",
    page: secondPage,
    runs,
    events,
  });
  const repeated = buildQualityEvidencePage({
    clientSlug: "acme",
    page: secondPage,
    runs,
    events,
  });
  assert.deepEqual(second, repeated);
  assert.deepEqual(
    second.items.map((entry) => entry.runId),
    ["run_2"],
  );
  assert.equal(second.items[0].evidenceState, "technical_failure");
  assert.equal(second.items[0].response.errorCategory, "auth");
  assert.equal(second.hasMore, false);
});

test("cursor is bound to tenant and immutable window", () => {
  const page = resolvePage({ clientSlug: "acme", from, to, limit: 1 });
  const originalRuns = [
    {
      id: "run_1",
      threadId: "acme:a",
      runtime: "openclaw",
      status: "completed" as const,
      createdAt: "2026-07-11T10:00:00.000Z",
      finishedAt: "2026-07-11T10:05:00.000Z",
      updatedAt: "2026-07-11T10:00:00.000Z",
    },
    {
      id: "run_2",
      threadId: "acme:b",
      runtime: "openclaw",
      status: "completed" as const,
      createdAt: "2026-07-11T11:00:00.000Z",
      finishedAt: "2026-07-11T11:05:00.000Z",
      updatedAt: "2026-07-11T11:00:00.000Z",
    },
  ];
  const result = buildQualityEvidencePage({
    clientSlug: "acme",
    page,
    runs: originalRuns,
    events: [],
  });
  assert.ok(result.nextCursor);
  const replayPage = resolvePage({
    clientSlug: "acme",
    after: result.nextCursor!,
  });
  const replay = buildQualityEvidencePage({
    clientSlug: "acme",
    page: replayPage,
    runs: [
      ...originalRuns,
      {
        id: "run_added_after_snapshot",
        threadId: "acme:c",
        runtime: "openclaw",
        status: "completed" as const,
        createdAt: "2026-07-11T11:30:00.000Z",
        finishedAt: "2026-07-11T11:35:00.000Z",
        updatedAt: "2026-07-11T11:35:00.000Z",
      },
    ],
    events: [],
  });
  assert.deepEqual(
    replay.items.map((item) => item.runId),
    ["run_2"],
  );
  assert.throws(
    () => resolvePage({ clientSlug: "beta", after: result.nextCursor! }),
    /another client/,
  );
  assert.throws(
    () =>
      resolvePage({
        clientSlug: "acme",
        after: result.nextCursor!,
        from: "2026-07-11T01:00:00Z",
      }),
    /does not match/,
  );
});

test("future windows are rejected so cursor replay cannot gain newly terminal runs", () => {
  assert.throws(
    () =>
      resolveQualityEvidencePageRequest({
        clientSlug: "acme",
        from,
        to: "2026-07-12T00:00:00.001Z",
        now: new Date(to),
      }),
    /cannot be in the future/,
  );
});

test("mutable filesystem state alone can never verify an output", () => {
  const output = path.join(tmp, "brand", "acme", "reports", "final.md");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, "verified");
  const modified = new Date("2026-07-11T10:00:30.000Z");
  fs.utimesSync(output, modified, modified);
  const page = resolvePage({ clientSlug: "acme", from, to, limit: 10 });
  const result = buildQualityEvidencePage({
    clientSlug: "acme",
    page,
    runs: [
      {
        id: "run_verified",
        threadId: "acme:task-verified",
        runtime: "openclaw",
        status: "completed",
        taskId: "P01-T02",
        taskContract: {
          completion: "Report exists",
          expectedOutputs: [
            { path: "brand/acme/reports/final.md", source: "deliverable_file" },
          ],
        },
        input: { slug: "acme", userText: "Create verified report" },
        output: { text: "Done" },
        createdAt: "2026-07-11T10:00:00.000Z",
        finishedAt: "2026-07-11T10:01:00.000Z",
        updatedAt: "2026-07-11T10:01:00.000Z",
      },
    ],
    events: [],
  });
  assert.equal(result.items[0].artifacts[0].state, "unverified");
  assert.equal(result.items[0].evidence.taskCompletionVerified, false);
  assert.equal(result.items[0].evidence.verificationMethod, null);
  assert.equal(result.items[0].evidenceState, "unverified_completion");
});

test("artifact and task-contract paths are redacted before export", () => {
  const page = resolvePage({ clientSlug: "acme", from, to, limit: 10 });
  const result = buildQualityEvidencePage({
    clientSlug: "acme",
    page,
    runs: [
      {
        id: "run_path_pii",
        threadId: "acme:alice@example.com",
        runtime: "openclaw",
        status: "completed",
        taskId: "secret=verysecretvalue",
        taskContract: {
          expectedOutputs: [
            {
              path: "brand/acme/reports/alice@example.com/612345678.md",
              source: "deliverable_file",
            },
          ],
        },
        input: { slug: "acme", userText: "Create report" },
        output: { text: "Done" },
        createdAt: "2026-07-11T10:00:00.000Z",
        finishedAt: "2026-07-11T10:01:00.000Z",
        updatedAt: "2026-07-11T10:01:00.000Z",
      },
    ],
    events: [],
  });
  const serialized = JSON.stringify(result.items[0]);
  assert.doesNotMatch(
    serialized,
    /alice@example\.com|612345678|verysecretvalue/,
  );
  assert.match(serialized, /REDACTED_EMAIL/);
  assert.match(serialized, /REDACTED_PHONE/);
});

test("an immutable readback bound to matching file_write progress verifies the output", () => {
  const page = resolvePage({ clientSlug: "acme", from, to, limit: 10 });
  const progressTs = "2026-07-11T10:00:30.000Z";
  const readbackTs = "2026-07-11T10:00:45.000Z";
  const run = {
    id: "run_causal",
    threadId: "acme:task-causal",
    runtime: "openclaw",
    status: "completed" as const,
    taskId: "P01-T03",
    taskContract: {
      completion: "Reports exist",
      expectedOutputs: [
        { path: "brand/acme/reports/**/*.md", source: "output_files" as const },
      ],
    },
    input: { slug: "acme", userText: "Create report" },
    output: { text: "Done" },
    createdAt: "2026-07-11T10:00:00.000Z",
    finishedAt: "2026-07-11T10:01:00.000Z",
    updatedAt: "2026-07-11T10:01:00.000Z",
  };
  const progress = {
    id: "evt_progress",
    runId: run.id,
    threadId: run.threadId,
    type: "progress" as const,
    ts: progressTs,
    data: { kind: "file_write", target: "reports/weekly/final.md" },
  };
  const readback = {
    id: "evt_readback",
    runId: run.id,
    threadId: run.threadId,
    type: "artifact_readback" as const,
    ts: readbackTs,
    data: {
      version: 1,
      expectedPath: "brand/acme/reports/**/*.md",
      actualPath: "brand/acme/reports/weekly/final.md",
      source: "output_files",
      progressEventId: progress.id,
      progressTs,
      observedAt: readbackTs,
      byteLength: 42,
      modifiedAt: progressTs,
      sha256: "a".repeat(64),
    },
  };
  const result = buildQualityEvidencePage({
    clientSlug: "acme",
    page,
    runs: [run],
    events: [progress, readback],
  });
  assert.equal(result.items[0].artifacts[0].state, "verified");
  assert.equal(
    result.items[0].artifacts[0].readbacks[0].actualPath,
    "brand/acme/reports/weekly/final.md",
  );
  assert.equal(result.items[0].evidence.taskCompletionVerified, true);
  assert.equal(
    result.items[0].evidence.verificationMethod,
    "artifact_readback",
  );

  const forged = buildQualityEvidencePage({
    clientSlug: "acme",
    page,
    runs: [run],
    events: [readback],
  });
  assert.equal(forged.items[0].evidence.taskCompletionVerified, false);

  const staleReadback = {
    ...readback,
    data: { ...readback.data, modifiedAt: "2026-07-11T09:00:00.000Z" },
  };
  const stale = buildQualityEvidencePage({
    clientSlug: "acme",
    page,
    runs: [run],
    events: [progress, staleReadback],
  });
  assert.equal(stale.items[0].evidence.taskCompletionVerified, false);
});

test("replay uses terminal completion time, bounded events, and next-run follow-up", () => {
  const page = resolvePage({ clientSlug: "acme", from, to, limit: 10 });
  const completed = {
    id: "run_long",
    threadId: "acme:long",
    runtime: "openclaw",
    status: "completed" as const,
    input: { slug: "acme", userText: "start before window" },
    output: { text: "done" },
    createdAt: "2026-07-10T23:30:00.000Z",
    finishedAt: "2026-07-11T00:30:00.000Z",
    updatedAt: "2026-07-11T00:30:00.000Z",
  };
  const correction = {
    id: "run_correction",
    threadId: "acme:long",
    runtime: "openclaw",
    status: "running" as const,
    input: { slug: "acme", userText: "No era eso, inténtalo de nuevo" },
    createdAt: "2026-07-11T00:40:00.000Z",
    startedAt: "2026-07-11T00:40:01.000Z",
    updatedAt: "2026-07-11T00:40:01.000Z",
  };
  const afterWindow = {
    id: "run_after",
    threadId: "acme:after",
    runtime: "openclaw",
    status: "failed" as const,
    createdAt: "2026-07-11T23:59:00.000Z",
    finishedAt: "2026-07-12T00:01:00.000Z",
    updatedAt: "2026-07-12T00:01:00.000Z",
  };
  const active = {
    id: "run_active",
    threadId: "acme:active",
    runtime: "openclaw",
    status: "running" as const,
    createdAt: "2026-07-11T12:00:00.000Z",
    updatedAt: "2026-07-11T12:00:00.000Z",
  };
  const result = buildQualityEvidencePage({
    clientSlug: "acme",
    page,
    runs: [completed, correction, afterWindow, active],
    events: [
      {
        id: "late_error",
        runId: completed.id,
        threadId: completed.threadId,
        type: "failed",
        ts: "2026-07-12T00:00:01.000Z",
        data: { error: "must not enter replay" },
      },
    ],
  });

  assert.deepEqual(
    result.items.map((item) => item.runId),
    [completed.id],
  );
  assert.equal(result.items[0].errors.length, 0);
  assert.equal(result.items[0].followup?.signal, "possible_correction");
  assert.equal(
    result.items[0].followup?.text,
    "No era eso, inténtalo de nuevo",
  );
});

after(() => fs.rmSync(tmp, { recursive: true, force: true }));
