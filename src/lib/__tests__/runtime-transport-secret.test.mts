import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeRuntimeTransportSecret,
  runtimeTransportSecretSha256,
} from "../runtime/runtime-transport-secret";

test("a persisted transport digest survives secret rotation without consulting fallback", () => {
  let fallbackCalls = 0;
  const runInput = {
    runtimeTransportSecretSha256:
      runtimeTransportSecretSha256("secret-at-admission"),
  };
  const authorize = (suppliedSecret: string) =>
    authorizeRuntimeTransportSecret({
      suppliedSecret,
      runInput,
      resolveLegacySecret: () => {
        fallbackCalls += 1;
        return "secret-after-rotation";
      },
    });

  assert.equal(authorize("secret-after-rotation"), "forbidden");
  assert.equal(authorize("secret-at-admission"), "authorized");
  assert.equal(fallbackCalls, 0);
});

test("only a run with no binding may use the legacy adapter secret", () => {
  assert.equal(
    authorizeRuntimeTransportSecret({
      suppliedSecret: "legacy-secret",
      runInput: {},
      resolveLegacySecret: () => "legacy-secret",
    }),
    "authorized",
  );
  assert.equal(
    authorizeRuntimeTransportSecret({
      suppliedSecret: "legacy-secret",
      runInput: { runtimeTransportSecretSha256: "malformed" },
      resolveLegacySecret: () => "legacy-secret",
    }),
    "forbidden",
  );
  assert.equal(
    authorizeRuntimeTransportSecret({
      suppliedSecret: "anything",
      runInput: {},
      resolveLegacySecret: () => undefined,
    }),
    "legacy_secret_missing",
  );
});
