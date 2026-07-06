import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildAttachmentContextBlock,
  buildIndexedAttachmentContextBlock,
  findIndexedAttachmentMatches,
  shouldExtractAttachmentContent,
} from "../attachments.js";

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
  assert.ok(block.includes("El usuario adjunto 2 archivo(s)"));
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

  assert.ok(block.includes("El usuario adjunto 1 archivo(s)"));
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

test("shouldExtractAttachmentContent only triggers on explicit file-reading intent", () => {
  assert.equal(shouldExtractAttachmentContent("lee el archivo que te adjunto"), true);
  assert.equal(shouldExtractAttachmentContent("léelo"), true);
  assert.equal(shouldExtractAttachmentContent("analiza este PDF"), true);
  assert.equal(shouldExtractAttachmentContent("que dice la imagen?"), true);
  assert.equal(shouldExtractAttachmentContent("ves ese archivo?"), false);
  assert.equal(shouldExtractAttachmentContent("te dejo el archivo"), false);
  assert.equal(shouldExtractAttachmentContent("1783267395723-0helf0.pdf"), false);
  assert.equal(shouldExtractAttachmentContent("hola"), false);
});

test("findIndexedAttachmentMatches matches uploaded files by distinctive filename tokens", () => {
  const index = {
    items: [
      {
        filename: "Estrategia 2026-30_ North Star.pdf",
        url: "https://pub.example.r2.dev/north-star.pdf",
        mimeType: "application/pdf",
      },
      {
        filename: "Sobre Hulahoop Platform.pdf",
        url: "https://pub.example.r2.dev/platform.pdf",
        mimeType: "application/pdf",
      },
    ],
  };

  const matches = findIndexedAttachmentMatches(index, "Estrategia 2026-30_ North Star ese archivo, ya esta cargado");

  assert.equal(matches.length, 1);
  assert.equal(matches[0].filename, "Estrategia 2026-30_ North Star.pdf");
});

test("buildIndexedAttachmentContextBlock confirms indexed files without reading them", async () => {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "mc-chat-index-"));
  try {
    await fs.mkdir(path.join(workspaceDir, "brand", "hulahoop", "attachments"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, "brand", "hulahoop", "attachments", "index.json"),
      JSON.stringify({
        version: 1,
        slug: "hulahoop",
        count: 1,
        indexPath: "brand/hulahoop/attachments/index.json",
        items: [
          {
            filename: "Estrategia 2026-30_ North Star.pdf",
            url: "https://pub.example.r2.dev/north-star.pdf",
            mimeType: "application/pdf",
            size: 123,
            references: [{ threadId: "hulahoop:self-analysis", threadFile: "brand/hulahoop/chat/self-analysis.json" }],
          },
        ],
      }),
    );

    let downloaded = false;
    const block = await buildIndexedAttachmentContextBlock({
      slug: "hulahoop",
      text: "ves Estrategia 2026-30_ North Star?",
      workspaceDir,
      fetchAttachment: async () => {
        downloaded = true;
        throw new Error("must not download");
      },
    });

    assert.ok(block.includes("[Indexed Uploaded Files]"));
    assert.ok(block.includes("Archivo indexado 1: Estrategia 2026-30_ North Star.pdf"));
    assert.ok(block.includes("- read_status: not_requested"));
    assert.equal(block.includes("- extracted_text:"), false);
    assert.equal(downloaded, false);
  } finally {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
});

test("buildIndexedAttachmentContextBlock extracts indexed text files only on explicit read intent", async () => {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "mc-chat-index-read-"));
  try {
    await fs.mkdir(path.join(workspaceDir, "brand", "hulahoop", "attachments"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, "brand", "hulahoop", "attachments", "index.json"),
      JSON.stringify({
        version: 1,
        slug: "hulahoop",
        count: 1,
        indexPath: "brand/hulahoop/attachments/index.json",
        items: [
          {
            filename: "North Star notes.txt",
            url: "https://pub.example.r2.dev/north-star.txt",
            mimeType: "text/plain",
            size: 123,
            references: [],
          },
        ],
      }),
    );

    const block = await buildIndexedAttachmentContextBlock({
      slug: "hulahoop",
      text: "léelo: North Star notes",
      workspaceDir,
      extractContent: shouldExtractAttachmentContent("léelo"),
      fetchAttachment: async () => ({
        ok: true,
        buffer: Buffer.from("North Star 2030: crecer con foco.", "utf8"),
        contentType: "text/plain",
      }),
    });

    assert.ok(block.includes("- read_status: extracted"));
    assert.ok(block.includes("North Star 2030: crecer con foco."));
  } finally {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
});
