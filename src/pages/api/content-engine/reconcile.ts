import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  reconcileContentTasks,
  readReconcileState,
} from "@/lib/content/content-reconciliation";

/**
 * Content-pipeline reconciler endpoint (SAN-153).
 *
 * POST ?slug=X  → run the reconciler for the brand now (also what the
 *                 "Reconciliar ahora" button calls). Returns the full
 *                 ContentReconcileResult.
 * GET  ?slug=X  → last persisted run (reconcile-state.json) without running
 *                 anything — this is what the UI reads for desync badges and
 *                 the "última reconciliación: hace Xh" staleness hint. Never
 *                 computes on read (no self-healing GETs).
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug as string) || (req.body && req.body.slug);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    const state = readReconcileState(slug);
    if (!state) return res.status(200).json({ ok: true, never_ran: true });
    return res.status(200).json(state);
  }

  if (req.method === "POST") {
    const result = await reconcileContentTasks(slug);
    return res.status(200).json(result);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
