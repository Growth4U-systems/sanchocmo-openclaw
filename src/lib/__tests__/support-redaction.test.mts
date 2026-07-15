import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SUPPORT_REDACTION_POLICY_VERSION,
  SupportRedactionError,
  sanitizeSupportBundle,
} from "../support/redaction";

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

test("redacts secret fields, headers, assignments, private keys and known token formats", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz";
  // Assemble provider-shaped fixtures at runtime so repository push
  // protection never mistakes test data for a committed credential.
  const githubToken = ["github", "pat", "abcdefghijklmnopqrstuvwxyz"].join("_");
  const slackToken = ["xoxb", "1234567890", "abcdefghijklmnopqrstuvwxyz"].join("-");
  const awsAccessKey = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");
  const googleApiKey = ["AI", "za", "abcdefghijklmnopqrstuvwxyz1234567890"].join("");
  const privateKey = [
    "-----BEGIN PRIVATE KEY-----",
    "super-sensitive-key-material",
    "-----END PRIVATE KEY-----",
  ].join("\n");
  const result = sanitizeSupportBundle(
    {
      headers: {
        Authorization: "Bearer header-secret-value",
        Cookie: "session=browser-session-secret",
      },
      api_key: "field-api-key",
      nested: {
        password: "field-password",
        clientSecret: "field-client-secret",
        refreshToken: "field-refresh-token",
        privateKey: "field-private-key",
      },
      log: [
        "Authorization: Bearer inline-auth-value",
        "Cookie: sid=inline-cookie-value",
        "OPENAI_API_KEY=inline-api-key",
        "password: inline-password",
        githubToken,
        slackToken,
        awsAccessKey,
        googleApiKey,
        jwt,
        privateKey,
      ].join("\n"),
    },
    { destination: "model" },
  );

  const json = serialized(result.value);
  for (const secret of [
    "header-secret-value",
    "browser-session-secret",
    "field-api-key",
    "field-password",
    "field-client-secret",
    "field-refresh-token",
    "field-private-key",
    "inline-auth-value",
    "inline-cookie-value",
    "inline-api-key",
    "inline-password",
    githubToken,
    slackToken,
    awsAccessKey,
    googleApiKey,
    jwt,
    "super-sensitive-key-material",
  ]) {
    assert.equal(json.includes(secret), false, `leaked: ${secret}`);
  }
  assert.ok(result.metadata.counts.authorization >= 2);
  assert.ok(result.metadata.counts.cookie >= 2);
  assert.ok(result.metadata.counts.api_key >= 2);
  assert.ok(result.metadata.counts.password >= 2);
  assert.ok(result.metadata.counts.token >= 3);
  assert.ok(result.metadata.counts.private_key >= 2);
  assert.equal(result.metadata.applied, true);
  assert.equal(result.metadata.policyVersion, SUPPORT_REDACTION_POLICY_VERSION);
});

test("removes signed URL queries, URL credentials, sensitive query values and fragments", () => {
  const result = sanitizeSupportBundle(
    {
      signed:
        "https://bucket.example/report.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=user%2Fscope&X-Amz-Signature=deadbeef&filename=report.pdf",
      callback:
        "https://alice:hunter2@example.com/callback?token=oauth-secret&view=compact#access-secret",
      database:
        "postgres://dbuser:dbpassword@db.example/sancho?sslmode=require",
      safe: "https://example.com/docs?page=2",
      piiInUrl:
        "https://example.com/users/encoded%40example.com?contact=phone%2B34612345678",
    },
    { destination: "linear" },
  );

  const json = serialized(result.value);
  assert.equal(json.includes("deadbeef"), false);
  assert.equal(json.includes("user%2Fscope"), false);
  assert.equal(json.includes("oauth-secret"), false);
  assert.equal(json.includes("access-secret"), false);
  assert.equal(json.includes("alice"), false);
  assert.equal(json.includes("hunter2"), false);
  assert.equal(json.includes("dbuser"), false);
  assert.equal(json.includes("dbpassword"), false);
  assert.equal(json.includes("encoded%40example.com"), false);
  assert.equal(json.includes("34612345678"), false);
  assert.match(json, /REDACTED_SIGNED_QUERY/);
  assert.match(json, /view=compact/);
  assert.match(json, /https:\/\/example\.com\/docs\?page=2/);
  assert.equal(result.metadata.counts.signed_url, 1);
  assert.equal(result.metadata.counts.sensitive_query, 1);
  assert.equal(result.metadata.counts.url_credentials, 2);
  assert.equal(result.metadata.counts.url_fragment, 1);
  assert.ok(result.metadata.counts.email >= 1);
  assert.ok(result.metadata.counts.phone >= 1);
});

test("redacts contact PII for model, Linear and Slack but retains it internally", () => {
  const bundle = {
    message: "Contact Ana at ana@example.com or +34 612 345 678.",
    customerEmail: "structured@example.com",
    phoneNumber: 612345679,
    officeIp: "192.168.100.100",
    timestamp: "2026-07-15 12:34:56",
  };

  for (const destination of ["model", "linear", "slack"] as const) {
    const result = sanitizeSupportBundle(bundle, { destination });
    const json = serialized(result.value);
    assert.equal(json.includes("ana@example.com"), false);
    assert.equal(json.includes("612 345 678"), false);
    assert.equal(json.includes("structured@example.com"), false);
    assert.equal(json.includes("612345679"), false);
    assert.match(json, /REDACTED_EMAIL/);
    assert.match(json, /REDACTED_PHONE/);
    assert.match(json, /192\.168\.100\.100/);
    assert.match(json, /2026-07-15 12:34:56/);
    assert.equal(result.metadata.external, true);
    assert.equal(result.metadata.counts.email, 2);
    assert.equal(result.metadata.counts.phone, 2);
  }

  const internal = sanitizeSupportBundle(bundle, { destination: "internal" });
  const internalJson = serialized(internal.value);
  assert.match(internalJson, /ana@example\.com/);
  assert.match(internalJson, /612 345 678/);
  assert.match(internalJson, /structured@example\.com/);
  assert.match(internalJson, /612345679/);
  assert.equal(internal.metadata.external, false);
  assert.equal(internal.metadata.counts.email, 0);
  assert.equal(internal.metadata.counts.phone, 0);
});

test("preserves only bounded correlation ids and valid W3C traceparent values", () => {
  const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  const result = sanitizeSupportBundle(
    {
      correlationId: "support-case:SAN-471.run_01",
      request_id: "req-01",
      runId: "run_01:attempt-2",
      traceparent,
      nested: {
        traceId: "unsafe\nBearer secret-value",
        spanId: "x".repeat(129),
        "x-correlation-id": "safe-correlation.02",
        requestId: "github_pat_abcdefghijklmnopqrstuvwxyz",
        traceparent: "00-00000000000000000000000000000000-0000000000000000-01",
      },
    },
    { destination: "model" },
  );

  assert.deepEqual(result.value, {
    correlationId: "support-case:SAN-471.run_01",
    request_id: "req-01",
    runId: "run_01:attempt-2",
    traceparent,
    nested: {
      traceId: "[REDACTED_UNSAFE_CORRELATION_ID]",
      spanId: "[REDACTED_UNSAFE_CORRELATION_ID]",
      "x-correlation-id": "safe-correlation.02",
      requestId: "[REDACTED_UNSAFE_CORRELATION_ID]",
      traceparent: "[REDACTED_UNSAFE_CORRELATION_ID]",
    },
  });
  assert.equal(result.metadata.counts.unsafe_correlation_id, 4);
});

test("bounds strings, depth, arrays, object keys and the total serialized bundle", () => {
  const stringResult = sanitizeSupportBundle("x".repeat(200), {
    destination: "model",
    maxStringLength: 32,
  });
  assert.equal(typeof stringResult.value, "string");
  assert.equal((stringResult.value as string).length, 32);
  assert.match(stringResult.value as string, /\[TRUNCATED\]$/);
  assert.equal(stringResult.metadata.counts.string_truncated, 1);

  const arrayResult = sanitizeSupportBundle([1, 2, 3, 4], {
    destination: "model",
    maxArrayLength: 2,
  });
  assert.deepEqual(arrayResult.value, [1, 2]);
  assert.equal(arrayResult.metadata.counts.array_truncated, 1);

  const objectResult = sanitizeSupportBundle(
    { a: 1, b: 2, c: 3 },
    {
      destination: "model",
      maxObjectKeys: 2,
    },
  );
  assert.deepEqual(objectResult.value, { a: 1, b: 2 });
  assert.equal(objectResult.metadata.counts.object_truncated, 1);

  const depthResult = sanitizeSupportBundle(
    { level1: { level2: { level3: "never returned" } } },
    { destination: "model", maxDepth: 2 },
  );
  assert.deepEqual(depthResult.value, {
    level1: { level2: "[TRUNCATED_MAX_DEPTH]" },
  });
  assert.equal(depthResult.metadata.counts.depth_truncated, 1);

  const totalResult = sanitizeSupportBundle(
    { a: "x".repeat(32), b: "y".repeat(32), c: "z".repeat(32) },
    { destination: "model", maxStringLength: 32, maxTotalBytes: 64 },
  );
  assert.equal(totalResult.value, "[TRUNCATED_TOTAL_SIZE]");
  assert.equal(totalResult.metadata.counts.total_size_truncated, 1);
  assert.equal(totalResult.metadata.truncated, true);
  assert.ok(totalResult.metadata.outputBytes <= 64);

  const clamped = sanitizeSupportBundle(
    {},
    {
      destination: "model",
      maxDepth: 999,
    },
  );
  assert.equal(clamped.metadata.limits.maxDepth, 12);
});

test("detects cycles without treating repeated non-cyclic references as cycles", () => {
  const shared = { state: "visible" };
  const cyclic: Record<string, unknown> = {
    left: shared,
    right: shared,
  };
  cyclic.self = cyclic;

  const result = sanitizeSupportBundle(cyclic, { destination: "model" });
  assert.deepEqual(result.value, {
    left: { state: "visible" },
    right: { state: "visible" },
    self: "[REDACTED_CIRCULAR_REFERENCE]",
  });
  assert.equal(result.metadata.counts.cycle, 1);
});

test("does not invoke accessors and safely converts binary, non-finite and unsupported values", () => {
  let getterInvocations = 0;
  const input: Record<string, unknown> = {
    binary: Buffer.from("binary-secret"),
    nan: Number.NaN,
    infinity: Number.POSITIVE_INFINITY,
    fn: () => "not serialized",
    bigint: 123456789n,
  };
  Object.defineProperty(input, "dangerous", {
    enumerable: true,
    get() {
      getterInvocations += 1;
      throw new Error("getter-secret");
    },
  });

  const result = sanitizeSupportBundle(input, { destination: "model" });
  assert.equal(getterInvocations, 0);
  assert.deepEqual(result.value, {
    binary: "[REDACTED_BINARY]",
    nan: null,
    infinity: null,
    fn: "[REDACTED_UNSUPPORTED_VALUE]",
    bigint: "123456789",
    dangerous: "[REDACTED_ACCESSOR]",
  });
  assert.equal(result.metadata.counts.binary, 1);
  assert.equal(result.metadata.counts.non_finite, 2);
  assert.equal(result.metadata.counts.unsupported, 1);
  assert.equal(result.metadata.counts.accessor, 1);
});

test("sanitizes Error evidence and sensitive object keys without leaking them into metadata", () => {
  const error = new Error(
    "Request for dev@example.com failed with Bearer error-secret-value",
  );
  Object.assign(error, { token: "custom-error-token", status: 503 });
  const input: Record<string, unknown> = { error };
  Object.defineProperty(input, "owner@example.com", {
    enumerable: true,
    value: "support owner",
  });
  Object.defineProperty(input, "__proto__", {
    enumerable: true,
    value: "prototype payload",
  });
  Object.defineProperty(input, "[REDACTED_KEY_1]", {
    enumerable: true,
    value: "reserved marker payload",
  });

  const result = sanitizeSupportBundle(input, { destination: "slack" });
  const entireResult = serialized(result);
  assert.equal(entireResult.includes("dev@example.com"), false);
  assert.equal(entireResult.includes("error-secret-value"), false);
  assert.equal(entireResult.includes("custom-error-token"), false);
  assert.equal(entireResult.includes("owner@example.com"), false);
  assert.equal(entireResult.includes('"__proto__"'), false);
  assert.match(entireResult, /REDACTED_KEY_1/);
  assert.match(entireResult, /REDACTED_KEY_2/);
  assert.match(entireResult, /REDACTED_KEY_3/);
  assert.equal(result.metadata.counts.unsafe_key, 3);
});

test("fails closed for hostile objects and invalid policy instead of returning raw data", () => {
  const hostile = new Proxy(
    { secret: "must-not-escape" },
    {
      ownKeys() {
        throw new Error("must-not-escape");
      },
    },
  );

  assert.throws(
    () => sanitizeSupportBundle(hostile, { destination: "model" }),
    (error: unknown) => {
      assert.ok(error instanceof SupportRedactionError);
      assert.equal(error.code, "SANITIZATION_FAILED");
      assert.equal(error.message.includes("must-not-escape"), false);
      return true;
    },
  );
  assert.throws(
    () =>
      sanitizeSupportBundle(
        {},
        {
          destination: "unknown" as "model",
        },
      ),
    (error: unknown) =>
      error instanceof SupportRedactionError && error.code === "INVALID_POLICY",
  );
  assert.throws(
    () =>
      sanitizeSupportBundle(
        {},
        {
          destination: "model",
          maxStringLength: 2,
        },
      ),
    (error: unknown) =>
      error instanceof SupportRedactionError && error.code === "INVALID_POLICY",
  );
});

test("leaves an already safe bundle unchanged and reports no redaction", () => {
  const input = {
    status: "timeout",
    service: "mission-control",
    attempt: 2,
    retryable: true,
    details: null,
  };
  const result = sanitizeSupportBundle(input, { destination: "model" });

  assert.deepEqual(result.value, input);
  assert.equal(result.metadata.applied, false);
  assert.equal(result.metadata.totalRedactions, 0);
  assert.equal(result.metadata.truncated, false);
  assert.equal(
    result.metadata.outputBytes,
    Buffer.byteLength(JSON.stringify(input)),
  );
});
