import type { PartnershipLead } from "./types";

function cleanHandle(handle?: string | null): string {
  return (handle || "").trim().replace(/^@+/, "");
}

function cleanUrl(value?: string | null): string | null {
  const url = (value || "").trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(url)) return `https://${url}`;
  return null;
}

export function buildSocialProfileUrl(
  lead: Partial<Pick<PartnershipLead, "handle" | "network" | "profileUrl">>,
): string | null {
  const explicit = cleanUrl(lead.profileUrl);
  if (explicit) return explicit;

  const handle = cleanHandle(lead.handle);
  if (!handle) return null;

  const network = (lead.network || "").trim().toLowerCase();
  if (network.startsWith("insta") || network === "ig") return `https://www.instagram.com/${handle}/`;
  if (network.startsWith("tik") || network === "tt") return `https://www.tiktok.com/@${handle}`;
  if (network.startsWith("you") || network === "yt") return `https://www.youtube.com/@${handle}`;

  return null;
}
