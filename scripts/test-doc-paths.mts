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

fs.rmSync(tmp, { recursive: true, force: true });
console.log("doc path tests passed");
