import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "sancho-admitted-dispatch-"),
);
process.env.MC_WORKSPACE = workspace;
fs.writeFileSync(
  path.join(workspace, "clients.json"),
  JSON.stringify({ adminToken: "internal-admin-token", clients: [] }),
  "utf8",
);

const { dispatchAdmittedChatTurn } = await import(
  "@/lib/chat/control-plane-dispatch"
);

test("server producers use browser admission auth instead of runtime transport auth", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const result = await dispatchAdmittedChatTurn(
    {
      slug: "demo",
      threadId: "demo:general",
      text: "Run the admitted turn",
      agent: "sancho",
      isAdmin: true,
      senderRole: "admin",
      idempotencyKey: "fixture:one",
    },
    {
      baseUrl: "http://mission-control.test/",
      headers: {
        Authorization: "Bearer attacker-controlled",
        "X-Sancho-Internal-Dispatch": "0",
        "X-MC-Secret": "must-not-cross-the-boundary",
      },
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(
          JSON.stringify({ ok: true, runId: "run_one", chatId: "demo:general" }),
          { status: 200 },
        );
      }) as typeof fetch,
    },
  );

  assert.equal(capturedUrl, "http://mission-control.test/api/chat/send");
  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer internal-admin-token");
  assert.equal(headers["X-Sancho-Internal-Dispatch"], "1");
  assert.equal(headers["X-MC-Secret"], undefined);
  assert.equal(capturedInit?.redirect, "error");
  assert.equal(
    (JSON.parse(String(capturedInit?.body)) as { idempotencyKey?: unknown })
      .idempotencyKey,
    "fixture:one",
  );
  assert.equal(result.ok, true);
  assert.equal(result.runId, "run_one");
});
