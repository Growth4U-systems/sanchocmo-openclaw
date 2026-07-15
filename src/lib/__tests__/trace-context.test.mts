import { test } from "node:test";
import assert from "node:assert/strict";
import {
  childTraceContext,
  createTraceContext,
  getTraceContext,
  normalizeTraceId,
  parseTraceparent,
  traceContextFromHeaders,
  tracePropagationHeaders,
  withTraceContext,
} from "../trace-context";

test("trace context preserves a safe request id and emits valid W3C propagation", () => {
  const incoming = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  const context = traceContextFromHeaders({
    "x-request-id": "support-case-123",
    traceparent: incoming,
  });

  assert.equal(context.traceId, "support-case-123");
  assert.equal(context.w3cTraceId, "4bf92f3577b34da6a3ce929d0e0e4736");
  assert.equal(context.sampled, true);
  assert.notEqual(context.spanId, "00f067aa0ba902b7");
  assert.deepEqual(parseTraceparent(context.traceparent), {
    w3cTraceId: context.w3cTraceId,
    spanId: context.spanId,
    sampled: true,
  });
  assert.equal(tracePropagationHeaders(context)["X-Request-Id"], "support-case-123");
});

test("trace ids reject header/log injection and child spans retain correlation", () => {
  assert.equal(normalizeTraceId("trace-ok:1"), "trace-ok:1");
  assert.equal(normalizeTraceId("trace\r\ninjected: true"), undefined);
  assert.equal(normalizeTraceId("x".repeat(129)), undefined);
  assert.equal(parseTraceparent("00-00000000000000000000000000000000-0000000000000000-01"), null);

  const parent = createTraceContext({ traceId: "trace-parent" });
  const child = childTraceContext(parent);
  assert.equal(child.traceId, parent.traceId);
  assert.equal(child.w3cTraceId, parent.w3cTraceId);
  assert.notEqual(child.spanId, parent.spanId);
});

test("missing request headers still create a safe correlation context", () => {
  const context = traceContextFromHeaders(undefined);
  assert.match(context.traceId, /^[0-9a-f]{32}$/);
  assert.ok(parseTraceparent(context.traceparent));
});

test("trace context survives async boundaries", async () => {
  const context = createTraceContext({ traceId: "trace-async" });
  await withTraceContext(context, async () => {
    await Promise.resolve();
    assert.equal(getTraceContext()?.traceId, "trace-async");
  });
  assert.equal(getTraceContext(), undefined);
});
