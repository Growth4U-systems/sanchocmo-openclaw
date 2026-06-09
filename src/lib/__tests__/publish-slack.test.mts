import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-publish-slack-"));
process.env.MC_WORKSPACE = tmp;
process.env.SLACK_BOT_TOKEN = "xoxb-test-token"; // resolveSlackToken process.env fallback

type Mod = typeof import("../publish/slack");
let mod: Mod;

const calls: Array<{ url: string; body: any }> = [];
const origFetch = globalThis.fetch;

before(async () => {
  mod = await import("../publish/slack");
});
after(() => { globalThis.fetch = origFetch; });

beforeEach(() => {
  calls.length = 0;
  // Each postMessage returns a distinct ts so root/thread are distinguishable.
  let n = 0;
  globalThis.fetch = (async (url: any, opts: any) => {
    calls.push({ url: String(url), body: JSON.parse(opts.body) });
    n += 1;
    return { json: async () => ({ ok: true, ts: `ts-${n}` }) } as any;
  }) as any;
});

test("publish posts root then threaded body and returns ids", async () => {
  const t = new mod.SlackTransport();
  const res = await t.publish("alpha", { transport: "slack", channel: "C123" }, { title: "Root", body: "Detail" });
  assert.equal(res.ok, true);
  assert.equal(res.rootId, "ts-1");
  assert.equal(res.threadId, "ts-2");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.text, "Root");
  assert.equal(calls[0].body.thread_ts, undefined);
  assert.equal(calls[1].body.text, "Detail");
  assert.equal(calls[1].body.thread_ts, "ts-1"); // body threads under root
});

test("publish returns ok:false with error when root post fails", async () => {
  globalThis.fetch = (async () => ({ json: async () => ({ ok: false, error: "channel_not_found" }) })) as any;
  const t = new mod.SlackTransport();
  const res = await t.publish("alpha", { transport: "slack", channel: "Cbad" }, { title: "R", body: "B" });
  assert.equal(res.ok, false);
  assert.match(res.error || "", /channel_not_found/);
});

test("publish returns ok:false when no token resolvable", async () => {
  delete process.env.SLACK_BOT_TOKEN;
  const t = new mod.SlackTransport();
  const res = await t.publish("alpha", { transport: "slack", channel: "C1" }, { title: "R", body: "B" });
  assert.equal(res.ok, false);
  assert.match(res.error || "", /token/i);
  process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
});
