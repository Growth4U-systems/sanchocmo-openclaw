/**
 * SAN-328 · triggerDiscoveryRunner despacha el runner de discovery a Rocinante
 * vía el gateway (`/mc-chat/inbound`), best-effort.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-trigger-runner-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";
process.env.MC_CHAT_GATEWAY = "http://gw.test";
process.env.MC_CHAT_SECRET = "s3cr3t";

type Mod = typeof import("../trigger-runner");
let mod: Mod;

interface CapturedCall {
  url: string;
  init: RequestInit;
}
const calls: CapturedCall[] = [];
const realFetch = globalThis.fetch;

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) =>
    impl(String(url), init)) as unknown as typeof fetch;
}

before(async () => {
  fs.writeFileSync(
    path.join(tmp, "clients.json"),
    JSON.stringify({
      adminToken: "trigger-admin-token",
      clients: [{ slug: "monzo", name: "Monzo", active: true }],
    }),
  );
  stubFetch(async (url, init) => {
    calls.push({ url, init: init || {} });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  mod = await import("../trigger-runner");
});

after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("triggerDiscoveryRunner despacha al gateway con skill+agent del runner", async () => {
  const res = await mod.triggerDiscoveryRunner({
    slug: "monzo",
    searchId: "ds-20260625-9qpm",
    title: "Finanzas ES",
  });

  assert.equal(res.forwardedToGateway, true);
  assert.equal(res.threadId, "monzo:discovery-run-ds-20260625-9qpm");

  const call = calls.find((c) => c.url.endsWith("/api/chat/send"));
  assert.ok(call, "POST a /api/chat/send");
  assert.equal(call!.url, "http://127.0.0.1:3000/api/chat/send");
  const headers = call!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer trigger-admin-token");
  assert.equal(headers["X-MC-Secret"], undefined);
  assert.equal(headers["X-Sancho-Internal-Dispatch"], "1");

  const body = JSON.parse(String(call!.init.body));
  assert.equal(body.slug, "monzo");
  assert.equal(body.threadId, "monzo:discovery-run-ds-20260625-9qpm");
  assert.equal(body.skill, "discovery-search-runner");
  assert.deepEqual(body.skills, ["discovery-search-runner"]);
  assert.equal(body.agent, "rocinante");
  assert.equal(body.isAdmin, true);
  assert.match(body.text, /discovery-search-runner/);
  assert.match(body.text, /No uses fixtures ni datos demo/);
  assert.match(body.text, /ScrapeCreators no tiene créditos/);
});

test("triggerDiscoveryRunner es best-effort: gateway caído → forwardedToGateway=false", async () => {
  stubFetch(async () => {
    throw new Error("ECONNREFUSED");
  });
  const res = await mod.triggerDiscoveryRunner({ slug: "monzo", searchId: "ds-down" });
  assert.equal(res.forwardedToGateway, false);
  assert.match(res.error || "", /ECONNREFUSED/);
});
