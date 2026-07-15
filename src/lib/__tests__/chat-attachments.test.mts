import assert from "node:assert/strict";
import test from "node:test";
import {
  ChatAttachmentValidationError,
  MAX_CHAT_ATTACHMENT_BYTES,
  validateChatAttachments,
} from "../chat-attachments";

function withPublicUrl(run: () => void) {
  const previous = process.env.R2_PUBLIC_URL;
  process.env.R2_PUBLIC_URL = "https://files.sancho.test/assets";
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.R2_PUBLIC_URL;
    else process.env.R2_PUBLIC_URL = previous;
  }
}

test("accepts a tenant-scoped first-party attachment", () => {
  withPublicUrl(() => {
    const result = validateChatAttachments(
      [{
        url: "https://files.sancho.test/assets/chat/acme/file.pdf",
        filename: "brief.pdf",
        mimeType: "application/pdf",
        size: 1024,
      }],
      "acme",
    );
    assert.equal(result?.length, 1);
    assert.equal(result?.[0]?.filename, "brief.pdf");
  });
});

test("rejects external and cross-tenant URLs", () => {
  withPublicUrl(() => {
    for (const url of [
      "https://attacker.test/metadata",
      "https://files.sancho.test/assets/chat/other/file.pdf",
      "https://files.sancho.test/assets/chat/acme/file.pdf?redirect=1",
    ]) {
      assert.throws(
        () => validateChatAttachments(
          [{ url, filename: "brief.pdf", mimeType: "application/pdf", size: 1024 }],
          "acme",
        ),
        ChatAttachmentValidationError,
      );
    }
  });
});

test("rejects unsafe metadata and oversized files", () => {
  withPublicUrl(() => {
    assert.throws(
      () => validateChatAttachments(
        [{
          url: "https://files.sancho.test/assets/chat/acme/file.exe",
          filename: "../payload.exe",
          mimeType: "application/octet-stream",
          size: MAX_CHAT_ATTACHMENT_BYTES + 1,
        }],
        "acme",
      ),
      ChatAttachmentValidationError,
    );
  });
});
