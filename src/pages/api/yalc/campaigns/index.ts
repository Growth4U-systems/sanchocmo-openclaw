import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  try {
    const config = resolveYalcConfig(slug);
    if (req.method === "POST") {
      return res.status(201).json(
        await yalcFetch(config, "/api/campaigns", {
          method: "POST",
          body: req.body || {},
        }),
      );
    }
    // Forward YALC list filters — `type` ('B2B'|'Partnerships', SAN-77/78)
    // and `status` keep the selector Tipo server-side instead of client-only.
    const params = new URLSearchParams();
    for (const key of ["type", "status"] as const) {
      const value = req.query[key];
      const single = Array.isArray(value) ? value[0] : value;
      if (typeof single === "string" && single.trim()) params.set(key, single.trim());
    }
    const query = params.toString();
    return res.status(200).json(
      await yalcFetch(config, `/api/campaigns${query ? `?${query}` : ""}`),
    );
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
