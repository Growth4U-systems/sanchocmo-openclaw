#!/usr/bin/env tsx

import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { collapseDuplicateBrandPrefix, normalizeBrandDocPath } = require("../src/lib/doc-paths.ts") as typeof import("../src/lib/doc-paths");
const { resolveWorkspaceDocPath } = require("../src/lib/server/doc-paths.ts") as typeof import("../src/lib/server/doc-paths");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-doc-paths-"));
fs.mkdirSync(path.join(tmp, "brand", "growth4u", "strategic-plan"), { recursive: true });
fs.writeFileSync(
  path.join(tmp, "brand", "growth4u", "strategic-plan", "strategic-plan.current.md"),
  "# Strategic Plan",
);

assert.equal(
  normalizeBrandDocPath("growth4u", "strategic-plan/current.md"),
  "brand/growth4u/strategic-plan/current.md",
);
assert.equal(
  normalizeBrandDocPath("growth4u", "brand/growth4u/strategic-plan/current.md"),
  "brand/growth4u/strategic-plan/current.md",
);
assert.equal(
  collapseDuplicateBrandPrefix("brand/growth4u/brand/growth4u/strategic-plan/current.md"),
  "brand/growth4u/strategic-plan/current.md",
);
assert.throws(
  () => normalizeBrandDocPath("growth4u", "brand/other/strategic-plan/current.md"),
  /different brand/,
);

const resolved = resolveWorkspaceDocPath(
  tmp,
  "brand/growth4u/strategic-plan/current.md",
  { slug: "growth4u", requireBrand: true },
);
assert.equal(resolved.exists, true);
assert.equal(resolved.usedFallback, true);
assert.equal(resolved.canonicalPath, "brand/growth4u/strategic-plan/strategic-plan.current.md");

const duplicated = resolveWorkspaceDocPath(
  tmp,
  "brand/growth4u/brand/growth4u/strategic-plan/current.md",
  { slug: "growth4u", requireBrand: true },
);
assert.equal(duplicated.canonicalPath, "brand/growth4u/strategic-plan/strategic-plan.current.md");

// SAN-103: bidirectional resolution. A request for the *named* canonical
// doc must fall back to a legacy bare `current.md` still on disk (live
// clients not yet data-migrated), so the repo-wide rename never 404s.
fs.mkdirSync(path.join(tmp, "brand", "growth4u", "market-and-us", "market"), { recursive: true });
fs.writeFileSync(
  path.join(tmp, "brand", "growth4u", "market-and-us", "market", "current.md"),
  "# Market (legacy name)",
);
const namedReqLegacyDisk = resolveWorkspaceDocPath(
  tmp,
  "brand/growth4u/market-and-us/market/market.current.md",
  { slug: "growth4u", requireBrand: true },
);
assert.equal(namedReqLegacyDisk.exists, true);
assert.equal(namedReqLegacyDisk.usedFallback, true);
assert.equal(
  namedReqLegacyDisk.canonicalPath,
  "brand/growth4u/market-and-us/market/current.md",
);

// A direct hit on the named file resolves without the fallback.
const namedDirect = resolveWorkspaceDocPath(
  tmp,
  "brand/growth4u/strategic-plan/strategic-plan.current.md",
  { slug: "growth4u", requireBrand: true },
);
assert.equal(namedDirect.exists, true);
assert.equal(namedDirect.usedFallback, false);
assert.equal(
  namedDirect.canonicalPath,
  "brand/growth4u/strategic-plan/strategic-plan.current.md",
);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("doc path tests passed");
