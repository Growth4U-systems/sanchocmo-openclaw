import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * collectFoundationDocs reads a brand's foundation-state.json and returns the
 * approved pillars as YALC-container paths (/sancho-brands/...). Voice pillars
 * travel separately so YALC's synthesis can treat them as voice samples.
 *
 * MC_WORKSPACE must be set before importing the module: lib/data/paths.ts
 * resolves BASE at import time.
 */

let workspace: string;
let collectFoundationDocs: typeof import("../yalc/provision").collectFoundationDocs;

function writeBrandFile(slug: string, rel: string, content = "x") {
  const abs = path.join(workspace, "brand", slug, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

before(async () => {
  workspace = mkdtempSync(path.join(tmpdir(), "yalc-foundation-"));
  process.env.MC_WORKSPACE = workspace;
  ({ collectFoundationDocs } = await import("../yalc/provision"));

  const slug = "acme";
  writeBrandFile(slug, "company-brief/company-brief.current.md");
  writeBrandFile(slug, "brand-voice/current.md");
  writeBrandFile(slug, "go-to-market/ecps/segments.md");
  // NOTE: market-and-us/swot.md intentionally NOT written (missing on disk).

  writeBrandFile(
    slug,
    "foundation-state.json",
    JSON.stringify({
      version: "3.0",
      sections: {
        "fast-foundation": {
          status: "approved",
          pillars: {
            "company-brief": {
              status: "approved",
              output_file: `brand/${slug}/company-brief/company-brief.current.md`,
            },
            "brand-voice": {
              status: "approved",
              output_file: `brand/${slug}/brand-voice/current.md`,
            },
            ecps: {
              status: "completed",
              output_file: `brand/${slug}/go-to-market/ecps/segments.md`,
            },
            swot: {
              status: "approved",
              output_file: `brand/${slug}/market-and-us/swot.md`,
            },
            positioning: {
              status: "pending-review",
              output_file: `brand/${slug}/go-to-market/positioning/one-pager.md`,
            },
          },
        },
      },
    }),
  );
});

after(() => {
  rmSync(workspace, { recursive: true, force: true });
});

test("approved pillars map to /sancho-brands paths", () => {
  const out = collectFoundationDocs("acme");
  assert.ok(
    out.docs.includes("/sancho-brands/acme/company-brief/company-brief.current.md"),
    JSON.stringify(out),
  );
});

test("completed counts as approved-equivalent", () => {
  const out = collectFoundationDocs("acme");
  assert.ok(out.docs.includes("/sancho-brands/acme/go-to-market/ecps/segments.md"));
});

test("brand-voice pillar travels as voice, not as a doc", () => {
  const out = collectFoundationDocs("acme");
  assert.equal(out.voice, "/sancho-brands/acme/brand-voice/current.md");
  assert.ok(!out.docs.some((d) => d.includes("brand-voice")));
});

test("pillars whose output file is missing on disk are skipped", () => {
  const out = collectFoundationDocs("acme");
  assert.ok(!out.docs.some((d) => d.includes("swot")));
});

test("non-approved pillars are skipped", () => {
  const out = collectFoundationDocs("acme");
  assert.ok(!out.docs.some((d) => d.includes("positioning")));
});

test("brand without foundation-state.json returns empty", () => {
  const out = collectFoundationDocs("ghost-brand");
  assert.deepEqual(out, { docs: [] });
});
