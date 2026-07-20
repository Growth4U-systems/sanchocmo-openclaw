import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../sales-engine-drilldown";

// .mts→.ts interop: named imports across the boundary fail under tsx, so unwrap
// the namespace's default (mirrors every other test in this repo).
const {
  channelMatchesBucket,
  contactChannel,
  contactDisplayName,
  parseSalesEngineBucket,
  parseSalesEngineStage,
  shapeLeadRow,
  shapeMeetingRow,
  shapeOpportunityRow,
} = (mod as unknown as { default: typeof mod }).default ?? mod;

test("contactChannel colapsa igual que el adapter de GHL (source → attribution → Unknown)", () => {
  // Explicit source always wins.
  assert.equal(
    contactChannel({ source: "Explee AutoGTM", attributions: [{ medium: "social" }] }),
    "Explee AutoGTM",
  );
  // First attribution: medium/utmSessionSource when both exist…
  assert.equal(
    contactChannel({
      source: "",
      attributions: [{ medium: "google", utmSessionSource: "cpc" }],
    }),
    "google/cpc",
  );
  // …medium alone otherwise, and only the FIRST attribution counts.
  assert.equal(
    contactChannel({
      attributions: [{ medium: "LinkedIn Outreach" }, { medium: "email" }],
    }),
    "LinkedIn Outreach",
  );
  // utmSessionSource without medium keeps the slash collapse ("/cpc").
  assert.equal(contactChannel({ attributions: [{ utmSessionSource: "cpc" }] }), "/cpc");
  // Nothing → honest Unknown, never an empty string.
  assert.equal(contactChannel({}), "Unknown");
  assert.equal(contactChannel(null), "Unknown");
});

test("channelMatchesBucket reutiliza el mapeo de buckets y null significa Total", () => {
  assert.equal(channelMatchesBucket("Explee AutoGTM", "email"), true);
  assert.equal(channelMatchesBucket("Explee AutoGTM", "web"), false);
  assert.equal(channelMatchesBucket("LinkedIn Outreach", "linkedin"), true);
  assert.equal(channelMatchesBucket("Unknown", "otros"), true);
  // Total column: no channel filter.
  assert.equal(channelMatchesBucket("whatever", null), true);
});

test("parseo de stage y bucket rechaza valores desconocidos", () => {
  assert.equal(parseSalesEngineStage("leads"), "leads");
  assert.equal(parseSalesEngineStage("won"), "won");
  assert.equal(parseSalesEngineStage("ganadas"), null);
  assert.equal(parseSalesEngineStage(undefined), null);

  assert.deepEqual(parseSalesEngineBucket("email"), { bucket: "email" });
  assert.deepEqual(parseSalesEngineBucket("total"), { bucket: null });
  assert.deepEqual(parseSalesEngineBucket(undefined), { bucket: null });
  assert.equal(parseSalesEngineBucket("madeup"), null);
});

test("las filas se moldean con el canal colapsado como origen", () => {
  const lead = shapeLeadRow({
    contactName: "Sofía Prueba",
    email: "sofia@example.com",
    companyName: "Ciencia Capilar",
    source: "Explee AutoGTM",
    dateAdded: "2026-07-20T09:15:00.000Z",
  });
  assert.deepEqual(lead, {
    name: "Sofía Prueba",
    email: "sofia@example.com",
    companyName: "Ciencia Capilar",
    source: "Explee AutoGTM",
    date: "2026-07-20T09:15:00.000Z",
  });

  // firstName/lastName fallback and missing fields degrade honestly.
  assert.equal(contactDisplayName({ firstName: "Ana", lastName: "Ucedo" }), "Ana Ucedo");
  assert.equal(contactDisplayName({}), "—");

  const meeting = shapeMeetingRow(
    { startTime: "2026-07-19T10:00:00.000Z", appointmentStatus: "confirmed" },
    { firstName: "Ana", email: "ana@example.com", source: "Reunión demo" },
  );
  assert.equal(meeting.status, "confirmed");
  assert.equal(meeting.source, "Reunión demo");
  assert.equal(meeting.date, "2026-07-19T10:00:00.000Z");
  // Deleted contact (join 404) → Unknown, matching the adapter.
  assert.equal(shapeMeetingRow({ startTime: null }, null).source, "Unknown");
  assert.equal(shapeMeetingRow({}, null).status, "scheduled");

  const opportunity = shapeOpportunityRow(
    { createdAt: "2026-07-18T08:00:00.000Z", monetaryValue: 1500, pipelineStageId: "stage-1" },
    { contactName: "Lead X", source: "google", attributions: [] },
    "Cualificado",
  );
  assert.equal(opportunity.pipelineStage, "Cualificado");
  assert.equal(opportunity.monetaryValue, 1500);
  // Without a resolvable stage name the raw id is still shown.
  assert.equal(
    shapeOpportunityRow({ pipelineStageId: "stage-9" }, null).pipelineStage,
    "stage-9",
  );
  assert.equal(shapeOpportunityRow({ monetaryValue: undefined }, null).monetaryValue, 0);
});
