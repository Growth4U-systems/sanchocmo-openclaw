import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler, withMethod } from "@/lib/api-middleware";
import {
  getInternalClientStatus,
  withInternalAuth,
} from "@/lib/sancho-internal-api";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.query.slug;
  if (typeof slug !== "string") {
    return res.status(400).json({ error: "Missing slug" });
  }

  const status = getInternalClientStatus(slug);
  if (!status) {
    return res.status(404).json({ error: "Client not found" });
  }

  res.status(200).json(status);
}

export default withErrorHandler(withInternalAuth(withMethod(["GET"], handler)));
