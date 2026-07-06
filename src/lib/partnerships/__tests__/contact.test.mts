import test from "node:test";
import assert from "node:assert/strict";

import * as contactPreviewModule from "../contact-preview";

const contactPreviewLib =
  (contactPreviewModule as unknown as { default: typeof contactPreviewModule }).default ??
  contactPreviewModule;

const { contactDraftPreviewsFromResponse, contactGateDraftsFromResponse } =
  contactPreviewLib;

test("contactDraftPreviewsFromResponse extracts first rendered partner DM", () => {
  const previews = contactDraftPreviewsFromResponse([
    {
      leadId: "lead-1",
      displayName: "@gatorelato",
      handle: "@gatorelato",
      network: "instagram",
      steps: [
        {
          subject: "@gatorelato — Alfonso de Growth4U",
          body: "Hola @gatorelato,\n\nMensaje renderizado.",
          delayDays: 0,
        },
        {
          subject: "Re: @gatorelato",
          body: "Follow-up",
          delayDays: 3,
        },
      ],
    },
    { leadId: "lead-2", displayName: "@empty", steps: [] },
    null,
  ]);

  assert.deepEqual(previews, [
    {
      leadId: "lead-1",
      displayName: "@gatorelato",
      handle: "@gatorelato",
      network: "instagram",
      subject: "@gatorelato — Alfonso de Growth4U",
      body: "Hola @gatorelato,\n\nMensaje renderizado.",
      stepCount: 2,
    },
  ]);
});

test("contactDraftPreviewsFromResponse falls back to stable labels", () => {
  const previews = contactDraftPreviewsFromResponse([
    {
      leadId: "lead-1",
      email: "creator@example.com",
      steps: [{ body: "Body only", delayDays: 0 }],
    },
  ]);

  assert.equal(previews[0]?.displayName, "creator@example.com");
  assert.equal(previews[0]?.subject, null);
  assert.equal(previews[0]?.stepCount, 1);
});

test("contactGateDraftsFromResponse keeps full editable drafts for approval", () => {
  const drafts = contactGateDraftsFromResponse([
    {
      leadId: "lead-1",
      providerId: "instagram:123",
      displayName: "@gatorelato",
      handle: "@gatorelato",
      network: "instagram",
      email: null,
      steps: [
        {
          subject: "@gatorelato — Alfonso de Growth4U",
          body: "Primer DM",
          delayDays: 0,
        },
        {
          subject: "Re: @gatorelato",
          body: "Follow-up",
          delayDays: 3.2,
        },
      ],
    },
    { leadId: "empty", steps: [] },
  ]);

  assert.deepEqual(drafts, [
    {
      leadId: "lead-1",
      providerId: "instagram:123",
      displayName: "@gatorelato",
      handle: "@gatorelato",
      network: "instagram",
      email: null,
      steps: [
        {
          subject: "@gatorelato — Alfonso de Growth4U",
          body: "Primer DM",
          delayDays: 0,
        },
        {
          subject: "Re: @gatorelato",
          body: "Follow-up",
          delayDays: 3,
        },
      ],
    },
  ]);
});
