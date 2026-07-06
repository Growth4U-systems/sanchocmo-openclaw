import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  // Stub: metrics chat requires mc-chat gateway integration
  return res.status(200).json({ ok: true, message: "Not yet implemented" });
}

export default compose(withErrorHandler, withAuth)(handler);
