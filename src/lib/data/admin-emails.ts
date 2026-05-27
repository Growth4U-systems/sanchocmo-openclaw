import fs from "fs";
import { CLIENTS_FILE } from "./paths";
import { writeClientsFile } from "./clients";
import { isAdminDomainEmail } from "./admin-domain";

/**
 * Helpers to read/write the `adminEmails` array in clients.json.
 *
 * adminEmails grants admin role to specific external Google accounts at
 * login (see src/pages/api/auth/[...nextauth].ts). Emails in a configured
 * ADMIN_EMAIL_DOMAIN are always admin regardless of this list — this is
 * purely for external collaborators.
 *
 * Writes are atomic: write to tempfile + rename, with a timestamped backup
 * of the previous contents.
 */

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function loadAdminEmails(): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf-8"));
    const list = (raw.adminEmails as unknown) || [];
    if (!Array.isArray(list)) return [];
    return list.filter((e): e is string => typeof e === "string");
  } catch {
    return [];
  }
}

function saveAdminEmails(emails: string[]): void {
  const raw = JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf-8"));
  raw.adminEmails = emails;
  writeClientsFile(raw);
}

export function addAdminEmail(email: string): { ok: boolean; error?: string; emails: string[] } {
  const e = normalize(email);
  if (!isValidEmail(e)) return { ok: false, error: "Email inválido", emails: loadAdminEmails() };
  // Emails in ADMIN_EMAIL_DOMAIN are implicit admin — no need to add
  if (isAdminDomainEmail(e)) {
    return { ok: false, error: "Ese dominio ya es admin automáticamente", emails: loadAdminEmails() };
  }
  const current = loadAdminEmails();
  if (current.map(normalize).includes(e)) {
    return { ok: false, error: "Ese email ya está en la lista", emails: current };
  }
  const next = [...current, e];
  saveAdminEmails(next);
  return { ok: true, emails: next };
}

export function removeAdminEmail(email: string): { ok: boolean; error?: string; emails: string[] } {
  const e = normalize(email);
  const current = loadAdminEmails();
  if (!current.map(normalize).includes(e)) {
    return { ok: false, error: "Ese email no estaba en la lista", emails: current };
  }
  const next = current.filter((x) => normalize(x) !== e);
  saveAdminEmails(next);
  return { ok: true, emails: next };
}
