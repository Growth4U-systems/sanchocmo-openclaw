import assert from "node:assert/strict";
import test from "node:test";
import {
  ChatCancellationBatchError,
  chatCancellationRunIds,
  requestChatCancellationBatch,
} from "../cancel-batch-client";

test("one Stop targets the active turn and every distinct durable parent", () => {
  assert.deepEqual(
    chatCancellationRunIds("run-active", [
      "run-parent-a",
      "run-active",
      "run-parent-b",
    ]),
    ["run-active", "run-parent-a", "run-parent-b"],
  );
  assert.throws(
    () => chatCancellationRunIds("run-active", ["../foreign-parent"]),
    /Invalid chat cancellation target/,
  );
});

test("batch cancellation reports partial acceptance explicitly", async () => {
  const requests: Array<{ runId: string; threadId: string }> = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      runId: string;
      threadId: string;
    };
    requests.push(body);
    if (body.runId === "run-parent-b") {
      return new Response(
        JSON.stringify({ error: "Agent run is no longer active in this thread" }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        ok: true,
        cancellationPending: body.runId === "run-active",
        alreadyStopped: body.runId === "run-parent-a",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  const result = await requestChatCancellationBatch(
    {
      slug: "hospital-capilar",
      threadId: "hospital-capilar:general",
      runIds: ["run-active", "run-parent-a", "run-parent-b"],
    },
    fetchImpl,
  );

  assert.deepEqual(
    requests.map(({ runId }) => runId),
    ["run-active", "run-parent-a", "run-parent-b"],
  );
  assert.ok(
    requests.every(
      ({ threadId }) => threadId === "hospital-capilar:general",
    ),
  );
  assert.equal(result.requestedCount, 3);
  assert.equal(result.cancelledCount, 2);
  assert.equal(result.failedCount, 1);
  assert.equal(result.partial, true);
  assert.equal(result.cancellationPending, true);
  assert.equal(result.outcomes[2]?.status, 409);
});

test("batch cancellation throws only when no server-validated target succeeds", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: "not active" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  await assert.rejects(
    requestChatCancellationBatch(
      {
        slug: "hospital-capilar",
        threadId: "hospital-capilar:general",
        runIds: ["run-parent-a", "run-parent-b"],
      },
      fetchImpl,
    ),
    (error: unknown) => {
      assert.ok(error instanceof ChatCancellationBatchError);
      assert.equal(error.result.failedCount, 2);
      assert.equal(error.result.partial, false);
      return true;
    },
  );
});
