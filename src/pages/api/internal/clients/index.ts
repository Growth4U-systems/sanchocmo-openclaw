import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler, withMethod } from "@/lib/api-middleware";
import {
  listInternalClients,
  withInternalAuth,
} from "@/lib/sancho-internal-api";

async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ clients: listInternalClients() });
}

export default withErrorHandler(withInternalAuth(withMethod(["GET"], handler)));
