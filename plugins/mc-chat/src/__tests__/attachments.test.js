import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttachmentContextBlock } from "../attachments.js";

test("buildAttachmentContextBlock formats arbitrary chat attachments for the agent prompt", () => {
  const block = buildAttachmentContextBlock([
    {
      url: "https://pub.example.r2.dev/chat/file.pdf",
      filename: "Brief.pdf",
      mimeType: "application/pdf",
      size: 12345,
    },
    {
      url: "https://pub.example.r2.dev/chat/image.png",
      filename: "Image.png",
      mimeType: "image/png",
      size: 67,
    },
  ]);

  assert.ok(block.startsWith("[User Attachments]"));
  assert.ok(block.includes("El usuario adjuntó 2 archivo(s)"));
  assert.ok(block.includes("Archivo 1: Brief.pdf"));
  assert.ok(block.includes("- mime_type: application/pdf"));
  assert.ok(block.includes("- size_bytes: 12345"));
  assert.ok(block.includes("Archivo 2: Image.png"));
  assert.ok(block.includes("- mime_type: image/png"));
  assert.ok(block.includes("No digas que no hay adjuntos"));
  assert.ok(block.endsWith("[/User Attachments]"));
});

test("buildAttachmentContextBlock ignores invalid attachments and normalizes generic fields", () => {
  const block = buildAttachmentContextBlock([
    { filename: "missing-url.pdf", mimeType: "application/pdf" },
    {
      url: "https://pub.example.r2.dev/chat/data.csv",
      filename: "Data\nExport.csv",
      type: "text/csv",
      size: "42",
    },
  ]);

  assert.ok(block.includes("El usuario adjuntó 1 archivo(s)"));
  assert.equal(block.includes("missing-url.pdf"), false);
  assert.ok(block.includes("Archivo 1: Data Export.csv"));
  assert.ok(block.includes("- mime_type: text/csv"));
  assert.ok(block.includes("- size_bytes: 42"));
});

test("buildAttachmentContextBlock returns empty string when there are no usable attachments", () => {
  assert.equal(buildAttachmentContextBlock(undefined), "");
  assert.equal(buildAttachmentContextBlock([]), "");
  assert.equal(buildAttachmentContextBlock([{ filename: "no-url.pdf" }]), "");
});
