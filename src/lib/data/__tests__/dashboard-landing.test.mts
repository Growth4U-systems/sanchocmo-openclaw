import { test, before } from "node:test";
import assert from "node:assert/strict";

// Source modules are CJS under this tsx test runner; follow the repo
// convention of importing them dynamically (see client-access.test.mts).
type Mod = typeof import("../dashboard-landing");
let resolveDashboardLanding: Mod["resolveDashboardLanding"];

before(async () => {
  ({ resolveDashboardLanding } = await import("../dashboard-landing"));
});

test("admin lands on the global dashboard", () => {
  assert.deepEqual(resolveDashboardLanding({ role: "admin" }), {
    kind: "admin",
  });
  // admin wins even if a slug is present
  assert.deepEqual(
    resolveDashboardLanding({ role: "admin", clientSlug: "demo" }),
    { kind: "admin" }
  );
});

test("single-client user redirects to their client slug", () => {
  assert.deepEqual(
    resolveDashboardLanding({ role: "client", clientSlug: "demo" }),
    { kind: "redirect", slug: "demo" }
  );
});

test("multi-client collaborator redirects to their first allowed slug", () => {
  assert.deepEqual(
    resolveDashboardLanding({ role: "client", allowedSlugs: ["beta", "gamma"] }),
    { kind: "redirect", slug: "beta" }
  );
});

test("clientSlug takes precedence over allowedSlugs", () => {
  assert.deepEqual(
    resolveDashboardLanding({
      role: "client",
      clientSlug: "demo",
      allowedSlugs: ["beta"],
    }),
    { kind: "redirect", slug: "demo" }
  );
});

test("non-admin with no client resolves to no-client", () => {
  assert.deepEqual(resolveDashboardLanding({ role: "client" }), {
    kind: "no-client",
  });
  assert.deepEqual(
    resolveDashboardLanding({ role: "client", allowedSlugs: [] }),
    { kind: "no-client" }
  );
  assert.deepEqual(
    resolveDashboardLanding({ role: "client", clientSlug: null, allowedSlugs: null }),
    { kind: "no-client" }
  );
});

test("null token (unauthenticated) resolves to no-client", () => {
  // GSSP handles the !token redirect to sign-in before calling this; the fn
  // itself treats an absent role as a non-admin with no client.
  assert.deepEqual(resolveDashboardLanding(null), { kind: "no-client" });
});
