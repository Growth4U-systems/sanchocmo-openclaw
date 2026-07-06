import type { NextApiRequest, NextApiResponse } from "next";
import { polar } from "@/lib/polar";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

/**
 * POST /api/polar/checkout
 * Creates a Polar checkout session and returns the URL.
 * Body: { productId: string }
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

  const { productId } = req.body;
  if (!productId) {
    return res.status(400).json({ error: "Missing productId" });
  }

  try {
    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl: `${process.env.NEXTAUTH_URL}/success`,
      customerEmail: session.user.email,
      metadata: {
        userId: (session.user as { id?: string }).id || session.user.email,
      },
    });

    return res.json({ url: checkout.url });
  } catch (error) {
    console.error("Polar checkout error:", error);
    return res.status(500).json({ error: "Failed to create checkout" });
  }
}
