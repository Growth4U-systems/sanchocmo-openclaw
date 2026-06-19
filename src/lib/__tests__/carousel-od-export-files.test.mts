import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../carousel/render-od";
import type { OdProjectFile } from "../open-design/client";

const { selectFreshOdExportFiles } = (mod as unknown as { default: typeof mod }).default ?? mod;

function file(path: string, mtime?: number, type: OdProjectFile["type"] = "file"): OdProjectFile {
  return {
    name: path.split("/").pop() || path,
    path,
    type,
    mtime,
  };
}

test("selects only fresh OD export files and sorts PNG slides numerically", () => {
  const selected = selectFreshOdExportFiles({
    projectId: "project-1",
    templateId: "carousel",
    slideCount: 3,
    exportStartedAt: 1_000,
    files: [
      file("old/export.pdf", 100),
      file("old/slide-1.png", 100),
      file("fresh/slide-2.png", 1_010),
      file("fresh/slide-10-source.jpg", 1_010),
      file("fresh/slide-3.png", 1_010),
      file("fresh/export.pdf", 1_010),
      file("fresh/slide-1.png", 1_010),
      file("fresh/subdir", 1_010, "directory"),
    ],
  });

  assert.equal(selected.pdfFile?.path, "fresh/export.pdf");
  assert.deepEqual(selected.pngFiles.map((f) => f.path), [
    "fresh/slide-1.png",
    "fresh/slide-2.png",
    "fresh/slide-3.png",
  ]);
});

test("fails loud when an unknown-age PNG leaks into the current export set", () => {
  assert.throws(
    () =>
      selectFreshOdExportFiles({
        projectId: "project-1",
        templateId: "carousel",
        slideCount: 3,
        exportStartedAt: 1_000,
        files: [
          file("fresh/export.pdf", 1_010),
          file("fresh/slide-1.png", 1_010),
          file("fresh/slide-2.png", 1_010),
          file("fresh/slide-3.png", 1_010),
          file("template/thumbnail.png"),
        ],
      }),
    /OD export PNG count mismatch: expected exactly 3/,
  );
});

test("fails loud when a carousel export has no fresh PDF", () => {
  assert.throws(
    () =>
      selectFreshOdExportFiles({
        projectId: "project-1",
        templateId: "carousel",
        slideCount: 2,
        exportStartedAt: 1_000,
        files: [
          file("old/export.pdf", 100),
          file("fresh/slide-1.png", 1_010),
          file("fresh/slide-2.png", 1_010),
        ],
      }),
    /OD export PDF count mismatch: expected exactly 1/,
  );
});

test("single-image exports reject fresh PDFs", () => {
  assert.throws(
    () =>
      selectFreshOdExportFiles({
        projectId: "project-1",
        templateId: "single",
        slideCount: 1,
        exportStartedAt: 1_000,
        files: [file("fresh/export.pdf", 1_010), file("fresh/image.png", 1_010)],
      }),
    /OD export PDF count mismatch: expected exactly 0/,
  );
});
