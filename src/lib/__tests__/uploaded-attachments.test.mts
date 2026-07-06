import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let workspace: string;
let mod: typeof import("../data/uploaded-attachments");

before(async () => {
  workspace = mkdtempSync(path.join(tmpdir(), "uploaded-attachments-"));
  process.env.MC_WORKSPACE = workspace;
  mod = await import("../data/uploaded-attachments");
});

after(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function writeThread(slug: string, name: string, data: unknown) {
  const file = path.join(workspace, "brand", slug, "chat", `${name}.json`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

test("buildUploadedAttachmentIndex indexes chat attachments without duplicating URLs", () => {
  writeThread("acme", "self-analysis", {
    messages: [
      {
        role: "user",
        text: "lee el archivo que te adjunto",
        ts: 1000,
        attachments: [
          {
            url: "https://pub.example.r2.dev/chat/file.pdf",
            filename: "Brief.pdf",
            mimeType: "application/pdf",
            size: 123,
          },
        ],
      },
      {
        role: "user",
        text: "mismo archivo otra vez",
        ts: 2000,
        attachments: [
          {
            url: "https://pub.example.r2.dev/chat/file.pdf",
            filename: "Brief.pdf",
            mimeType: "application/pdf",
            size: 123,
          },
        ],
      },
    ],
  });

  const index = mod.writeUploadedAttachmentIndex("acme");

  assert.equal(index.count, 1);
  assert.equal(index.items[0].filename, "Brief.pdf");
  assert.equal(index.items[0].mimeType, "application/pdf");
  assert.equal(index.items[0].references.length, 2);
  assert.equal(index.items[0].firstSeenAt, 1000);
  assert.equal(index.items[0].lastSeenAt, 2000);
  assert.match(index.items[0].references[0].threadFile, /brand\/acme\/chat\/self-analysis\.json$/);
});

test("syncUploadedAttachmentIndexForThread handles canonicalized thread ids", () => {
  writeThread("beta", "task-a-b", {
    messages: [
      {
        role: "user",
        ts: 3000,
        attachments: [{ url: "https://pub.example.r2.dev/chat/data.csv", filename: "Data.csv", type: "text/csv" }],
      },
    ],
  });

  const index = mod.syncUploadedAttachmentIndexForThread("beta:task:a:b");

  assert.equal(index?.count, 1);
  assert.equal(index?.indexPath, "brand/beta/attachments/index.json");
});
