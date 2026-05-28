import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { loadUsers, setUserAccess, removeUser, type UserRole } from "@/lib/data/users";
import { getAdminDomains } from "@/lib/data/admin-domain";

/**
 * /api/admin/users — integral user management.
 *
 *   GET                                  → { ok, users: ManagedUser[], adminDomains: string[] }
 *   POST   body { email, role, slugs? }  → set a user's access level
 *   DELETE body { email }                → revoke all access for a user
 *
 * Admin only. Manages the `adminEmails` and `clientAccess` lists in
 * clients.json as one coherent surface (see src/lib/data/users.ts).
 * ADMIN_EMAIL_DOMAIN accounts are admin by domain and are not editable here.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, users: loadUsers(), adminDomains: getAdminDomains() });
  }

  if (req.method === "POST") {
    const email = (req.body?.email as string | undefined)?.trim();
    const role = req.body?.role as UserRole | undefined;
    const slugs = req.body?.slugs;
    if (!email) return res.status(400).json({ error: "Missing email" });
    if (role !== "admin" && role !== "client") {
      return res.status(400).json({ error: "role must be 'admin' or 'client'" });
    }
    if (role === "client" && !Array.isArray(slugs)) {
      return res.status(400).json({ error: "slugs must be an array" });
    }
    const result = setUserAccess(email, role, (slugs as string[]) || []);
    return res.status(result.ok ? 200 : 400).json(result);
  }

  if (req.method === "DELETE") {
    const email = (req.body?.email as string | undefined)?.trim();
    if (!email) return res.status(400).json({ error: "Missing email" });
    const result = removeUser(email);
    return res.status(result.ok ? 200 : 400).json(result);
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
