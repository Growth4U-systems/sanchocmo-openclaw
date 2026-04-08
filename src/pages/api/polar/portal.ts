import type { NextApiRequest, NextApiResponse } from "next";
import { polar } from "@/lib/polar";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

/**
 * POST /api/polar/portal
 * Creates a Polar customer portal session and returns the URL.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const customers = await polar.customers.list({
      email: session.user.email,
    });

    const customer = customers.result.items[0];
    if (!customer) {
      return res.status(404).json({ error: "No customer found" });
    }

    const portalSession = await polar.customerSessions.create({
      customerId: customer.id,
    });

    return res.json({ url: portalSession.customerPortalUrl });
  } catch (error) {
    console.error("Polar portal error:", error);
    return res.status(500).json({ error: "Failed to create portal session" });
  }
}
