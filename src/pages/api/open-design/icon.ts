/**
 * GET /api/open-design/icon
 *
 * Proxy del `/app-icon.svg` que el daemon de Open Design sirve estáticamente
 * (apps/web/out/app-icon.svg). MC lo usa en el botón "Open Design Library"
 * de Media Creation para que el icono refleje siempre lo que el fork tiene
 * desplegado — si Growth4U-systems/open-design cambia el SVG y se redeploya
 * el container, MC lo recoge automáticamente en el próximo page load (sin
 * rebuild de MC ni assets duplicados).
 *
 * El asset está fuera del namespace `/api`, así que no pasa por la guarda
 * Phase 5: lo pedimos sin Authorization desde el container de MC.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { resolveOdConfig } from "@/lib/open-design/client";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }

  const { daemonUrl } = resolveOdConfig();
  const url = `${daemonUrl}/app-icon.svg`;

  let upstream: Response;
  try {
    upstream = await fetch(url);
  } catch (err) {
    res.status(503).json({
      error: "OD daemon offline",
      cause: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (!upstream.ok) {
    res.status(upstream.status).end();
    return;
  }

  res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "image/svg+xml");
  // El daemon ya emite Last-Modified; permitimos browser caching corto para
  // que un swap de icono en el fork se vea reflejado en ~minutos.
  res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.status(200).end(buffer);
}
