import fs from "fs";
import { CLIENTS_FILE } from "./paths";
import { writeClientsFile, loadClients } from "./clients";
import { loadAdminEmails } from "./admin-emails";

/**
 * Helpers to read/write the `clientAccess` map in clients.json.
 *
 * clientAccess maps a Google account email → list of client slugs that
 * account is allowed to see. It powers the "multi-client team member" case:
 * a user who is neither full admin (@growth4u.io / adminEmails, who see all
 * clients) nor a single-client portal user (tied to one slug by mcToken).
 *
 * The login flow reads this in src/pages/api/auth/[...nextauth].ts and the
 * resulting `allowedSlugs` is enforced via canAccessSlug() in
 * src/lib/api-middleware.ts.
 *
 * Writes are atomic and preserve the clients.json symlink — see
 * writeClientsFile in ./clients.
 */

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Load the full email → slugs map, with emails normalized to lowercase and
 * malformed entries filtered out.
 */
export function loadClientAccess(): Record<string, string[]> {
  try {
    const raw = JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf-8"));
    const map = (raw.clientAccess as unknown) || {};
    if (typeof map !== "object" || map === null || Array.isArray(map)) return {};
    const out: Record<string, string[]> = {};
    for (const [email, slugs] of Object.entries(map as Record<string, unknown>)) {
      if (!Array.isArray(slugs)) continue;
      const list = slugs.filter((s): s is string => typeof s === "string");
      if (list.length) out[normalize(email)] = list;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Slugs allowed for an email (case-insensitive). Empty array if no entry.
 */
export function getSlugsForEmail(email: string): string[] {
  return loadClientAccess()[normalize(email)] || [];
}

function saveClientAccess(map: Record<string, string[]>): void {
  const raw = JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf-8"));
  raw.clientAccess = map;
  writeClientsFile(raw);
}

type AccessResult = { ok: boolean; error?: string; access: Record<string, string[]> };

/**
 * Validate that an email is eligible for per-client access. @growth4u.io and
 * adminEmails accounts already see every client, so assigning them a subset
 * would be misleading.
 */
function validateEmail(e: string): string | null {
  if (!isValidEmail(e)) return "Email inválido";
  if (e.endsWith("@growth4u.io")) {
    return "Los emails @growth4u.io ya son admin (ven todos los clientes)";
  }
  if (loadAdminEmails().map(normalize).includes(e)) {
    return "Ese email es admin externo (ya ve todos los clientes)";
  }
  return null;
}

function validateSlugs(slugs: string[]): string | null {
  const known = new Set(loadClients().map((c) => c.slug));
  for (const s of slugs) {
    if (!known.has(s)) return `Cliente no existe: ${s}`;
  }
  return null;
}

/**
 * Replace the full slug list for an email (absolute set used by the UI).
 * An empty list removes the email from the map.
 */
export function setClientAccess(email: string, slugs: string[]): AccessResult {
  const e = normalize(email);
  const emailErr = validateEmail(e);
  if (emailErr) return { ok: false, error: emailErr, access: loadClientAccess() };

  const unique = Array.from(new Set(slugs));
  const slugErr = validateSlugs(unique);
  if (slugErr) return { ok: false, error: slugErr, access: loadClientAccess() };

  const map = loadClientAccess();
  if (unique.length === 0) {
    delete map[e];
  } else {
    map[e] = unique;
  }
  saveClientAccess(map);
  return { ok: true, access: map };
}

/**
 * Add a single slug to an email's allowed list.
 */
export function addClientAccess(email: string, slug: string): AccessResult {
  const current = getSlugsForEmail(email);
  if (current.includes(slug)) {
    return { ok: false, error: "Ese cliente ya está asignado", access: loadClientAccess() };
  }
  return setClientAccess(email, [...current, slug]);
}

/**
 * Remove a single slug; deletes the email entry when its list becomes empty.
 */
export function removeClientAccess(email: string, slug: string): AccessResult {
  const current = getSlugsForEmail(email);
  if (!current.includes(slug)) {
    return { ok: false, error: "Ese cliente no estaba asignado", access: loadClientAccess() };
  }
  return setClientAccess(email, current.filter((s) => s !== slug));
}
