import type { NextApiRequest, NextApiResponse } from "next";

const LEGACY_PORT = process.env.LEGACY_PORT || "18790";

/**
 * GET /api/system/connect-proxy?slug=X&apiId=Y
 * Proxies the legacy /connect/{slug}/{apiId} page through Next.js
 * so it can be loaded in an iframe (same origin).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug, apiId } = req.query;
  if (!slug || !apiId) {
    return res.status(400).json({ error: "Missing slug or apiId" });
  }

  try {
    const upstream = await fetch(
      `http://localhost:${LEGACY_PORT}/connect/${slug}/${apiId}`
    );
    const html = await upstream.text();

    // Rewrite for embedding in slider iframe
    const rewritten = html
      // Fix API fetch calls to point to legacy server
      .replace(/fetch\(['"]\/mc\/api\//g, `fetch('http://localhost:${LEGACY_PORT}/mc/api/`)
      .replace(/fetch\("\/mc\/api\//g, `fetch("http://localhost:${LEGACY_PORT}/mc/api/`)
      // Fix navigation links
      .replace(/href="\/mc"/g, `href="http://localhost:${LEGACY_PORT}/mc"`)
      .replace(/href='\/mc'/g, `href='http://localhost:${LEGACY_PORT}/mc'`)
      // Remove the back link
      .replace(/<a class="back"[^>]*>[\s\S]*?<\/a>/, "")
      // Remove the big H1 title (already shown in slider header)
      .replace(/<h1>[\s\S]*?<\/h1>/, "")
      // Remove the subtitle line
      .replace(/<p class="subtitle">[\s\S]*?<\/p>/, "")
      // Remove the security footer
      .replace(/<div style="margin-top:32px;padding-top:16px;border-top:1px solid[^"]*">[\s\S]*?<strong>🔒 Seguridad:<\/strong>[\s\S]*?<\/div>/g, "")
      // Adjust body style: remove max-width/margin so it fills the slider, reduce padding
      .replace(
        /body\s*\{[^}]*max-width:\s*600px[^}]*\}/,
        "body { font-family: 'Nunito', sans-serif; background: var(--bg); color: var(--text); max-width: 100%; margin: 0; padding: 16px 24px; line-height: 1.7; }"
      )
      // Add base target so any remaining links open in parent/new tab, not inside iframe
      .replace(/<head>/, '<head><base target="_blank">');

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(rewritten);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Proxy error";
    res.status(502).send(`<html><body><h2>Error connecting to legacy server</h2><p>${msg}</p></body></html>`);
  }
}
