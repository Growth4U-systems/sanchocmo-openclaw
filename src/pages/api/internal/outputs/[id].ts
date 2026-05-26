import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler, withMethod } from "@/lib/api-middleware";
import { getOutputDetail, withInternalAuth } from "@/lib/sancho-internal-api";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Missing id" });
  }

  const output = getOutputDetail(id);
  if (!output) {
    return res.status(404).json({ error: "Output not found" });
  }

  res.status(200).json(output);
}

export default withErrorHandler(withInternalAuth(withMethod(["GET"], handler)));
