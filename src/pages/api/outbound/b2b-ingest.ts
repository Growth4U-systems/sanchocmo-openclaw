import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import {
  b2bIngestErrorResponse,
  ingestB2BContacts,
} from "@/lib/partnerships/b2b-ingest";
import { resolveYalcConfig } from "@/lib/yalc/client";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  try {
    const result = await ingestB2BContacts(resolveYalcConfig(slug), req.body || {});
    return res.status(201).json(result);
  } catch (err) {
    const out = b2bIngestErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
