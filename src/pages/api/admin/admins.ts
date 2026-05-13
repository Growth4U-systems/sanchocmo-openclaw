import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { loadAdminEmails, addAdminEmail, removeAdminEmail } from "@/lib/data/admin-emails";

/**
 * /api/admin/admins
 *
 *   GET     → { ok, emails: string[] }
 *   POST    body { email }     → add to adminEmails
 *   DELETE  body { email }     → remove from adminEmails
 *
 * Admin only. Non-admins receive 403.
 *
 * Note: @growth4u.io accounts are always admin (see nextauth callback)
 * and are NOT stored in adminEmails — this endpoint only manages the
 * external allowlist.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, emails: loadAdminEmails() });
  }

  if (req.method === "POST") {
    const email = (req.body?.email as string | undefined)?.trim();
    if (!email) return res.status(400).json({ error: "Missing email" });
    const result = addAdminEmail(email);
    return res.status(result.ok ? 200 : 400).json(result);
  }

  if (req.method === "DELETE") {
    const email = (req.body?.email as string | undefined)?.trim();
    if (!email) return res.status(400).json({ error: "Missing email" });
    const result = removeAdminEmail(email);
    return res.status(result.ok ? 200 : 400).json(result);
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
