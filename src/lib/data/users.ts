import { loadAdminEmails, addAdminEmail, removeAdminEmail } from "./admin-emails";
import { loadClientAccess, setClientAccess } from "./client-access";
import { isAdminDomainEmail } from "./admin-domain";

/**
 * Integral user-management layer over clients.json.
 *
 * A "user" here is a Google account (email) with an access level:
 *   - "admin"  → sees every client (stored in `adminEmails`)
 *   - "client" → sees only `slugs` (stored in `clientAccess[email]`)
 *
 * ADMIN_EMAIL_DOMAIN accounts are admin by domain (see the auth callback) and
 * are NOT stored here — they cannot be listed or edited.
 *
 * The two underlying lists are mutually exclusive: setUserAccess moves an
 * email between them atomically so a user is never both admin and scoped.
 */

export type UserRole = "admin" | "client";

export interface ManagedUser {
  email: string;
  role: UserRole;
  slugs: string[]; // empty for admins
}

type Result = { ok: boolean; error?: string; users: ManagedUser[] };

function isAdminDomain(email: string): boolean {
  return isAdminDomainEmail(email);
}

/**
 * Merged view of all explicitly-managed users (external admins + scoped users).
 */
export function loadUsers(): ManagedUser[] {
  const admins: ManagedUser[] = loadAdminEmails().map((email) => ({
    email,
    role: "admin" as const,
    slugs: [],
  }));
  const access = loadClientAccess();
  const scoped: ManagedUser[] = Object.entries(access).map(([email, slugs]) => ({
    email,
    role: "client" as const,
    slugs,
  }));
  // adminEmails and clientAccess are kept mutually exclusive, but de-dupe
  // defensively (admin wins) so a stale entry never shows a user twice.
  const seen = new Set(admins.map((u) => u.email));
  return [...admins, ...scoped.filter((u) => !seen.has(u.email))].sort((a, b) =>
    a.email.localeCompare(b.email)
  );
}

/**
 * Set a user's access level, moving them between adminEmails and clientAccess
 * so the two lists stay mutually exclusive.
 *
 *   role "admin"  → add to adminEmails, drop any clientAccess entry
 *   role "client" → set clientAccess slugs, drop from adminEmails
 *                   (empty slugs removes the user entirely)
 */
export function setUserAccess(email: string, role: UserRole, slugs: string[] = []): Result {
  const e = email.trim().toLowerCase();
  if (isAdminDomain(e)) {
    return { ok: false, error: "Ese dominio ya es admin automáticamente", users: loadUsers() };
  }

  if (role === "admin") {
    // Drop any scoped access first, then grant admin.
    setClientAccess(e, []);
    const r = addAdminEmail(e);
    // addAdminEmail returns ok:false if already present — treat that as success.
    if (!r.ok && !loadAdminEmails().map((x) => x.toLowerCase()).includes(e)) {
      return { ok: false, error: r.error, users: loadUsers() };
    }
    return { ok: true, users: loadUsers() };
  }

  // role === "client": remove any admin grant, then set scoped slugs.
  if (loadAdminEmails().map((x) => x.toLowerCase()).includes(e)) {
    removeAdminEmail(e);
  }
  const r = setClientAccess(e, slugs);
  if (!r.ok) {
    return { ok: false, error: r.error, users: loadUsers() };
  }
  return { ok: true, users: loadUsers() };
}

/**
 * Remove a user entirely (revoke both admin and scoped access).
 */
export function removeUser(email: string): Result {
  const e = email.trim().toLowerCase();
  if (loadAdminEmails().map((x) => x.toLowerCase()).includes(e)) {
    removeAdminEmail(e);
  }
  setClientAccess(e, []);
  return { ok: true, users: loadUsers() };
}
