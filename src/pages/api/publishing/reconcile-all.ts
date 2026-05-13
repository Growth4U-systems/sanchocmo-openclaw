import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { reconcileScheduledDrafts, type ReconcileResult } from "@/lib/publishing/reconciliation";

/**
 * POST /api/publishing/reconcile-all
 *
 * Sweeps `scheduled` drafts for EVERY brand under the workspace and asks
 * each provider whether they actually went live. Designed to run from a
 * 10-min cron so a scheduled post can't get stuck on "scheduled" just
 * because nobody opened the Calendar tab after Metricool published it.
 *
 * Per-brand work is delegated to `reconcileScheduledDrafts(slug)` (the same
 * helper the per-brand endpoint uses) — this endpoint is the iterator.
 * Errors on one brand never short-circuit the others.
 *
 * Response: { ok, brands_scanned, reconciled_total, by_brand: [...], errors: [...] }
 */

interface BrandReport extends ReconcileResult {
  slug: string;
}

interface ReconcileAllResponse {
  ok: true;
  brands_scanned: number;
  reconciled_total: number;
  metrics_refreshed_total: number;
  by_brand: BrandReport[];
  errors: Array<{ slug: string; error: string }>;
}

function listBrandSlugs(): string[] {
  const root = path.join(BASE, "brand");
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // Only iterate brands that have a `projects/` dir — others are inert
    // workspaces (e.g. a `default/` placeholder) that have no schedulable
    // content and would just waste cycles.
    if (!fs.existsSync(path.join(root, entry.name, "projects"))) continue;
    out.push(entry.name);
  }
  return out;
}

async function handler(req: NextApiRequest, res: NextApiResponse<ReconcileAllResponse | { error: string }>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slugs = listBrandSlugs();
  const by_brand: BrandReport[] = [];
  const errors: Array<{ slug: string; error: string }> = [];
  let reconciled_total = 0;
  let metrics_refreshed_total = 0;

  for (const slug of slugs) {
    try {
      const result = await reconcileScheduledDrafts(slug);
      by_brand.push({ slug, ...result });
      reconciled_total += result.reconciled.length;
      metrics_refreshed_total += result.metrics_refreshed;
    } catch (e) {
      errors.push({ slug, error: (e as Error).message });
    }
  }

  return res.status(200).json({
    ok: true,
    brands_scanned: slugs.length,
    reconciled_total,
    metrics_refreshed_total,
    by_brand,
    errors,
  });
}

export default withErrorHandler(handler);
