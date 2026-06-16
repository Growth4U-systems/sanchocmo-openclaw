import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * collectFoundationDocs reads the ASSEMBLED Brand Brain state (SAN-183 F5:
 * pillar status = its 1:1 task's status; foundation-state.json is dead) and
 * returns the completed pillars as YALC-container paths (/sancho-brands/...).
 * Voice pillars travel separately so YALC's synthesis treats them as voice
 * samples. The fixture seeds TASKS (the single source), not the legacy file.
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

  // Tasks = única fuente de status. Ids canónicos del binding del manifest.
  writeBrandFile(
    slug,
    "projects/P00-Company-Brief/project.json",
    JSON.stringify({ id: "P00-Company-Brief", name: "Company Brief" }),
  );
  writeBrandFile(
    slug,
    "projects/P00-Company-Brief/tasks.json",
    JSON.stringify([
      {
        id: "P00-CB-T01",
        name: "Kickoff",
        status: "completed",
        pillar: "company-brief",
        section: "company-brief",
        deliverable_file: `brand/${slug}/company-brief/company-brief.current.md`,
      },
    ]),
  );
  writeBrandFile(
    slug,
    "projects/P00-Full-Foundation/project.json",
    JSON.stringify({ id: "P00-Full-Foundation", name: "Full Foundation" }),
  );
  writeBrandFile(
    slug,
    "projects/P00-Full-Foundation/tasks.json",
    JSON.stringify([
      // completed + fichero presente → viaja a YALC
      {
        id: "P00-FUL-T05",
        name: "Niche Discovery",
        status: "completed",
        pillar: "niche-discovery",
        section: "go-to-market",
        deliverable_file: `brand/${slug}/go-to-market/ecps/segments.md`,
      },
      // completed pero el fichero NO existe en disco → se salta
      {
        id: "P00-FUL-T04",
        name: "Market Summary",
        status: "completed",
        pillar: "market-synthesis",
        section: "market-and-us",
        deliverable_file: `brand/${slug}/market-and-us/swot.md`,
      },
      // no completada → se salta
      {
        id: "P00-FUL-T06",
        name: "Positioning",
        status: "pending-review",
        pillar: "positioning",
        section: "go-to-market",
        deliverable_file: `brand/${slug}/go-to-market/positioning/one-pager.md`,
      },
      // brand-voice completada → viaja como voice, no como doc
      {
        id: "P00-FUL-T08",
        name: "Brand Voice",
        status: "completed",
        pillar: "brand-voice",
        section: "brand-book",
        deliverable_file: `brand/${slug}/brand-voice/current.md`,
      },
    ]),
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

test("brand without seeded foundation tasks returns empty", () => {
  const out = collectFoundationDocs("ghost-brand");
  assert.deepEqual(out, { docs: [] });
});
