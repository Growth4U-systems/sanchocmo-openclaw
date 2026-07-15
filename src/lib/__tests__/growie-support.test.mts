import { test } from "node:test";
import assert from "node:assert/strict";

const {
  buildGrowieSupportContext,
  isGrowieSupportThreadId,
  supportPagePathFromReferrer,
} = await import("../support/growie");

test("recognises only canonical Growie support threads for the expected tenant", () => {
  assert.equal(isGrowieSupportThreadId("acme:support-growie-case-1", "acme"), true);
  assert.equal(isGrowieSupportThreadId("acme:support:growie-case-1", "acme"), true);
  assert.equal(isGrowieSupportThreadId("other:support-growie-case-1", "acme"), false);
  assert.equal(isGrowieSupportThreadId("acme:general", "acme"), false);
  assert.equal(isGrowieSupportThreadId("../acme:support-growie-case-1"), false);
});

test("support page evidence drops query values and malformed referrers", () => {
  assert.equal(
    supportPagePathFromReferrer("https://staging.sanchocmo.ai/dashboard/acme/tasks?token=secret#frag"),
    "/dashboard/acme/tasks",
  );
  assert.equal(supportPagePathFromReferrer("not a URL"), undefined);
});

test("builds a bounded deployed-context envelope", () => {
  assert.deepEqual(buildGrowieSupportContext({
    referrer: "https://staging.sanchocmo.ai/dashboard/acme/content",
    deployedCommit: "abc123",
    imageDigest: "sha256:def456",
    environment: "Staging",
  }), {
    pagePath: "/dashboard/acme/content",
    deployedCommit: "abc123",
    imageDigest: "sha256:def456",
    environment: "Staging",
  });
});
