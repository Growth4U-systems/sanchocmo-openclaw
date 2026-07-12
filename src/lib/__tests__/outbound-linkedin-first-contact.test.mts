import assert from "node:assert/strict";
import test from "node:test";
import { linkedInFirstContactCandidates } from "../outreach/linkedin-first-contact.ts";

test("initial LinkedIn contact includes only approved leads with a profile", () => {
  const leads = [
    { id: "ruth", lifecycleStatus: "Qualified", linkedinUrl: "https://linkedin.com/in/ruth" },
    { id: "abian", lifecycleStatus: "Sourced", linkedinUrl: "https://linkedin.com/in/abian" },
    { id: "david", lifecycleStatus: "Qualified", linkedinUrl: null },
    { id: "sent", lifecycleStatus: "Connect_Sent", linkedinUrl: "https://linkedin.com/in/sent" },
  ];

  assert.deepEqual(
    linkedInFirstContactCandidates(leads).map((lead) => lead.id),
    ["ruth"],
  );
});
