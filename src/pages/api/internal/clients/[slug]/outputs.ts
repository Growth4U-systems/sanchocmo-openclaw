import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler, withMethod } from "@/lib/api-middleware";
import {
  listClientOutputs,
  parseLimit,
  parseOutputStatus,
  withInternalAuth,
} from "@/lib/sancho-internal-api";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.query.slug;
  if (typeof slug !== "string") {
    return res.status(400).json({ error: "Missing slug" });
  }

  const statusQuery = req.query.status;
  const status = parseOutputStatus(statusQuery);
  if (statusQuery && !status) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const outputs = listClientOutputs(slug, {
    status,
    limit: parseLimit(req.query.limit),
  });

  res.status(200).json({ client: slug, outputs });
}

export default withErrorHandler(withInternalAuth(withMethod(["GET"], handler)));
