/**
 * Feature flags for the unified outreach pipeline (SAN-349).
 *
 * The B2B motion (company-DB source → YALC Lead → sequence → send → learn) ships
 * behind a kill-switch that is **OFF by default**, so the live Partnerships flow
 * is never destabilised while B2B is being built out. Partnerships is unaffected
 * by this flag.
 *
 * Server-only (reads `process.env`). Do not import from client components.
 */

/** True only when `OUTREACH_B2B=on` is explicitly set. Default: disabled. */
export function isOutreachB2BEnabled(): boolean {
  return process.env.OUTREACH_B2B === "on";
}
