import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getSubscriptionDetails } from "@/lib/subscription";

/**
 * GET /api/polar/subscription
 * Returns current user's subscription details.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userId =
    (session.user as { id?: string }).id || session.user.email || "";
  const details = await getSubscriptionDetails(userId);
  return res.json(details);
}
