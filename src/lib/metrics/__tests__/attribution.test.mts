/**
 * Attribution cross-source join (SAN-319 · PR7) — channel × Koibox citas.
 *
 * Pure logic, no DB. This is the ONE place sources cross: Paid/GA4 channel (visits,
 * spend) joined to Koibox citas, deduped by `koibox_appointment_id` (the truth-source
 * PK — GHL events inflate 1 cita → 100+, so we count unique appointment ids, never
 * raw events), then CPA per cita. Run: `npm run test:lib`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as attributionMod from "../attribution";

// `.ts` is CJS; named imports into this ESM `.mts` arrive under `default` (interop).
const { buildAttributionRows } =
  (attributionMod as unknown as { default: typeof attributionMod }).default ?? attributionMod;

test("buildAttributionRows: dedups citas by koibox_appointment_id", () => {
  const rows = buildAttributionRows(
    [{ channel: "Meta Ads", visits: 1000, spend: 500 }],
    [
      { appointmentId: "A1", channel: "Meta Ads" },
      { appointmentId: "A1", channel: "Meta Ads" }, // duplicate event → same cita
      { appointmentId: "A2", channel: "Meta Ads" },
    ],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].conversions, 2); // A1 + A2; the dup dropped (not 3)
  assert.equal(rows[0].cpa, 250); // 500 / 2 citas
  assert.ok(Math.abs(rows[0].convRate - 0.002) < 1e-9); // 2 / 1000
});

test("buildAttributionRows: CPA is non-finite when a channel has 0 citas", () => {
  const [row] = buildAttributionRows([{ channel: "Organic", visits: 500, spend: 0 }], []);
  assert.equal(row.conversions, 0);
  assert.equal(row.convRate, 0);
  assert.ok(!Number.isFinite(row.cpa)); // AttributionFunnel renders "—"
});

test("buildAttributionRows: citas land on their own channel only", () => {
  const rows = buildAttributionRows(
    [
      { channel: "Meta Ads", visits: 100, spend: 200 },
      { channel: "Organic", visits: 300, spend: 0 },
    ],
    [
      { appointmentId: "A1", channel: "Meta Ads" },
      { appointmentId: "A2", channel: "Organic" },
      { appointmentId: "", channel: "Meta Ads" }, // missing PK → ignored, not counted
    ],
  );
  const meta = rows.find((r) => r.channel === "Meta Ads");
  const org = rows.find((r) => r.channel === "Organic");
  assert.equal(meta?.conversions, 1);
  assert.equal(org?.conversions, 1);
  assert.equal(meta?.cpa, 200);
});
