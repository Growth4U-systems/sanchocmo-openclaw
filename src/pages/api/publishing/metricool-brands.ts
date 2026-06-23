import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { fetchMetricoolBrands, type MetricoolBrand } from "@/lib/publishing/providers/metricool";

/**
 * GET /api/publishing/metricool-brands?slug=X
 *
 * Lists every Metricool brand the user can publish from (SAN-162). The operator
 * uses a brand's `id` (blogId) as a voice's `metricool_profile_id` when adding a
 * founder-led voice. Metricool is the only provider with multi-account today.
 */
interface BrandsResponse {
  ok: true;
  provider: "metricool";
  brands: MetricoolBrand[];
}

async function handler(req: NextApiRequest, res: NextApiResponse<BrandsResponse | { error: string }>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = (req.query.slug as string | undefined)?.trim();
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const result = await fetchMetricoolBrands(slug);
  if (!result.ok) return res.status(502).json({ error: result.error });

  return res.status(200).json({ ok: true, provider: "metricool", brands: result.brands });
}

export default withErrorHandler(handler);
