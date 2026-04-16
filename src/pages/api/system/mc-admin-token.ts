import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getAdminToken } from "@/lib/data/clients";

/**
 * GET /api/system/mc-admin-token
 * Returns the mc-server admin token for authenticated admin users.
 * Used by iframe-based pages (Atalaya) to build the correct admin URL.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  const token = getAdminToken();
  if (!token) {
    return res.status(500).json({ error: "Admin token not configured" });
  }

  res.status(200).json({ token });
}
