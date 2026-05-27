/**
 * Configurable admin-by-domain check.
 *
 * Any Google account whose email domain matches ADMIN_EMAIL_DOMAIN is treated
 * as a full admin at login, independent of the explicit `adminEmails` list in
 * clients.json. ADMIN_EMAIL_DOMAIN is a comma-separated list of bare domains
 * (e.g. "acme.com,acme.io"); a leading "@" is tolerated. When unset, there is
 * no implicit domain admin — admin access is granted only via `adminEmails`
 * or the admin token. This replaces the former hardcoded "@growth4u.io".
 */

function parseDomains(): string[] {
  const raw = process.env.ADMIN_EMAIL_DOMAIN || "";
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function getAdminDomains(): string[] {
  return parseDomains();
}

export function isAdminDomainEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return parseDomains().some((domain) => e.endsWith(`@${domain}`));
}
