#!/usr/bin/env tsx

import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { collapseDuplicateBrandPrefix, normalizeBrandDocPath, htmlSiblingOf, mdSourceOf, isCanonicalPair } = require("../src/lib/doc-paths.ts") as typeof import("../src/lib/doc-paths");
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

// ── SAN-149: HTML-canonical sibling ─────────────────────────────────────

assert.equal(htmlSiblingOf("brand/growth4u/strategic-plan/current.md"), "brand/growth4u/strategic-plan/current.html");
assert.equal(htmlSiblingOf("brand/growth4u/x/x.current.md"), "brand/growth4u/x/x.current.html");
assert.equal(htmlSiblingOf("brand/growth4u/x/current.html"), null);
assert.equal(mdSourceOf("brand/growth4u/x/current.html"), "brand/growth4u/x/current.md");
assert.equal(mdSourceOf("brand/growth4u/x/current.md"), null);
assert.equal(isCanonicalPair("a/b/current.md", "a/b/current.html"), true);
assert.equal(isCanonicalPair("a/b/current.html", "a/b/current.md"), true);
assert.equal(isCanonicalPair("a/b/current.md", "a/b/other.html"), false);

// Sibling absent → htmlSibling null
const noSibling = resolveWorkspaceDocPath(
  tmp,
  "brand/growth4u/strategic-plan/strategic-plan.current.md",
  { slug: "growth4u", requireBrand: true },
);
assert.equal(noSibling.htmlSibling, null);

// Sibling present → htmlSibling points at it.
fs.writeFileSync(
  path.join(tmp, "brand", "growth4u", "strategic-plan", "strategic-plan.current.html"),
  "<!DOCTYPE html><html><body>plan</body></html>",
);
const withSibling = resolveWorkspaceDocPath(
  tmp,
  "brand/growth4u/strategic-plan/strategic-plan.current.md",
  { slug: "growth4u", requireBrand: true },
);
assert.equal(withSibling.htmlSibling, "brand/growth4u/strategic-plan/strategic-plan.current.html");

// Legacy-name request that falls back to the named .md also surfaces the
// named .html sibling (sibling is computed off the RESOLVED path).
const fallbackWithSibling = resolveWorkspaceDocPath(
  tmp,
  "brand/growth4u/strategic-plan/current.md",
  { slug: "growth4u", requireBrand: true },
);
assert.equal(fallbackWithSibling.usedFallback, true);
assert.equal(fallbackWithSibling.htmlSibling, "brand/growth4u/strategic-plan/strategic-plan.current.html");

// An .html doc itself never reports a sibling.
const htmlDoc = resolveWorkspaceDocPath(
  tmp,
  "brand/growth4u/strategic-plan/strategic-plan.current.html",
  { slug: "growth4u", requireBrand: true },
);
assert.equal(htmlDoc.htmlSibling, null);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("doc path tests passed");
