import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.MC_WORKSPACE = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-task-anchors-"));

const { requireTaskAnchors, TaskAnchorError } = await import("../task-create-helpers");

test("a generic execution task may be created without a skill", () => {
  assert.doesNotThrow(() => requireTaskAnchors({
    id: "P01-T01",
    name: "Coordinar campaña",
    type: "execution",
  }));
});

test("a document task may omit skill when its deliverable anchor is present", () => {
  assert.doesNotThrow(() => requireTaskAnchors({
    id: "P01-T02",
    name: "Research",
    type: "research",
    deliverable_file: "research/current.md",
  }));
});

test("document-producing tasks still require a deliverable anchor", () => {
  assert.throws(
    () => requireTaskAnchors({ id: "P01-T03", name: "Research", type: "research" }),
    (error: unknown) => {
      assert.ok(error instanceof TaskAnchorError);
      assert.deepEqual(error.missing, ["deliverable_file"]);
      return true;
    },
  );
});
