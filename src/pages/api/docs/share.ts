/**
 * POST /api/docs/share — Create a public share link for a document.
 *
 * Body: { slug, docPath }
 * Returns: { ok, token, url, path }
 *
 * The returned URL is unauthenticated and can be shared with third parties.
 * Validation:
 *   - User must be authenticated (withAuth) AND have access to `slug`
 *   - `docPath` must live under `brand/{slug}/` (no cross-brand leakage)
 *   - File must exist on disk
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { signShareToken, buildShareUrl } from "@/lib/share-tokens";
import { resolveWorkspaceDocPath } from "@/lib/server/doc-paths";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, docPath } = req.body;
  if (!slug || !docPath) {
    return res.status(400).json({ error: "Missing slug or docPath" });
  }

  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  let resolved;
  try {
    resolved = resolveWorkspaceDocPath(BASE, String(docPath), { slug, requireBrand: true });
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid path" });
  }

  // File must exist on disk so the share link doesn't 404 immediately
  if (!resolved.exists || !fs.existsSync(resolved.absPath)) {
    return res.status(404).json({
      error: `File does not exist on disk: ${resolved.canonicalPath}`,
    });
  }

  // HTML-canonical sibling (SAN-149): when sharing a .md that has a
  // generated .html sibling, share the HTML — that's the client-facing
  // canonical document. `sharedPath` reveals the substitution.
  const sharedPath = resolved.htmlSibling ?? resolved.canonicalPath;

  const token = signShareToken({ slug, docPath: sharedPath });
  // Prefer explicit env config over request headers — behind a reverse
  // proxy (Tailscale, Cloudflare, ngrok) the Host header can be wrong.
  // buildShareUrl handles the fallback chain BASE_URL → NEXTAUTH_URL.
  const url = buildShareUrl(token);

  return res.status(200).json({
    ok: true,
    token,
    url,
    path: sharedPath,
    requestedPath: resolved.requestedPath,
    canonicalPath: resolved.canonicalPath,
    sharedPath,
    usedFallback: resolved.usedFallback,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
