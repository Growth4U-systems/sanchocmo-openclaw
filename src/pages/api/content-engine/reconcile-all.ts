import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import {
  reconcileContentTasks,
  type ContentReconcileResult,
} from "@/lib/content/content-reconciliation";

/**
 * POST /api/content-engine/reconcile-all
 *
 * Runs the content reconciler for EVERY brand under the workspace. Designed
 * for the 15-min cron (mirror of /api/publishing/reconcile-all) so a content
 * task can't stay frozen in a stale phase just because the writer agent
 * forgot its phase-report curl and nobody opened the dashboard.
 *
 * Per-brand work is delegated to `reconcileContentTasks(slug)`; this endpoint
 * is the iterator. Errors on one brand never short-circuit the others.
 */

interface ReconcileAllResponse {
  ok: true;
  brands_scanned: number;
  promoted_total: number;
  desyncs_total: number;
  by_brand: ContentReconcileResult[];
  errors: Array<{ slug: string; error: string }>;
}

function listBrandSlugs(): string[] {
  const root = path.join(BASE, "brand");
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // Only brands with a projects/ dir can hold content tasks.
    if (!fs.existsSync(path.join(root, entry.name, "projects"))) continue;
    out.push(entry.name);
  }
  return out;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReconcileAllResponse | { error: string }>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slugs = listBrandSlugs();
  const by_brand: ContentReconcileResult[] = [];
  const errors: Array<{ slug: string; error: string }> = [];
  let promoted_total = 0;
  let desyncs_total = 0;

  for (const slug of slugs) {
    try {
      const result = await reconcileContentTasks(slug);
      by_brand.push(result);
      promoted_total += result.promoted.length;
      desyncs_total += result.desyncs.length;
    } catch (e) {
      errors.push({ slug, error: (e as Error).message });
    }
  }

  return res.status(200).json({
    ok: true,
    brands_scanned: slugs.length,
    promoted_total,
    desyncs_total,
    by_brand,
    errors,
  });
}

export default withErrorHandler(handler);
