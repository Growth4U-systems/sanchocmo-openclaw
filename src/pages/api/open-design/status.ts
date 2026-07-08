/**
 * GET /api/open-design/status → { configured, healthy }
 *
 * Ground truth for the Open Design Library's three-state UI (SAN-415, mirror of
 * the YALC overview `configured` flag from PR #420):
 *   - configured=false            → OD overlay not enabled → show a calm
 *                                    "not activated" placeholder + CTA.
 *   - configured=true, healthy=false → OD wired up but the daemon is down →
 *                                    show a distinct "daemon caído" state.
 *   - configured=true, healthy=true  → render the real Library UI.
 *
 * `healthy` is only probed when configured, so an install without OD never pays
 * for a pointless localhost round-trip that would always fail.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { isOdConfigured, odHealth, resolveOdConfig } from "@/lib/open-design/client";
import type { OdStatus } from "@/lib/open-design/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OdStatus | { error: string }>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const config = resolveOdConfig();
  const configured = isOdConfigured();

  if (!configured) {
    res.status(200).json({ configured: false, healthy: false, daemonUrl: config.daemonUrl });
    return;
  }

  let healthy = false;
  try {
    await odHealth(config);
    healthy = true;
  } catch {
    // OdDaemonOfflineError (unreachable) or a non-200 health response → daemon down.
    healthy = false;
  }

  res.status(200).json({ configured: true, healthy, daemonUrl: config.daemonUrl });
}
