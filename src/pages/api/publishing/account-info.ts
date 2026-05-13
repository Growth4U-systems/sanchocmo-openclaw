import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { fetchAccountInfo, type AccountInfo } from "@/lib/publishing/providers/metricool";

/**
 * GET /api/publishing/account-info?slug=X
 *
 * Returns the connected Metricool brand + networks so MC can show "publishing
 * on {brand} · LinkedIn @company / X @handle / IG @handle" before the user
 * schedules. Today only Metricool is supported because it's the only provider
 * in the registry. When more providers land, switch on `provider` query param.
 */

interface AccountInfoResponse {
  ok: true;
  provider: "metricool";
  info: AccountInfo;
}

async function handler(req: NextApiRequest, res: NextApiResponse<AccountInfoResponse | { error: string }>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = (req.query.slug as string | undefined)?.trim();
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const result = await fetchAccountInfo(slug);
  if (!result.ok) return res.status(502).json({ error: result.error });

  return res.status(200).json({ ok: true, provider: "metricool", info: result.info });
}

export default withErrorHandler(handler);
