/**
 * POST /api/open-design/launch-editor?slug=<brand>
 *
 * Prepara el lanzamiento del editor agentic de Open Design:
 *   1. Setea el design system del brand como default en OD (PUT /api/app-config,
 *      `designSystemId: <slug>`). Así cuando el usuario abre la app de OD, el
 *      design system del cliente activo está pre-seleccionado.
 *   2. Devuelve la URL pública de la app de OD que el cliente debe abrir.
 *
 * La URL base se resuelve desde env (OD_PUBLIC_WEB_URL cuando OD_USE_PUBLIC=true,
 * OD_WEB_URL local en otro caso). Cambiar el deploy es solo cambiar el env.
 *
 * Response: { webUrl, designSystemId }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { resolveOdConfig, OdDaemonOfflineError } from "@/lib/open-design/client";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = (req.query.slug as string | undefined) ?? (req.body?.slug as string | undefined);
  if (!slug || typeof slug !== "string") {
    return res.status(400).json({ error: "Missing slug" });
  }

  const config = resolveOdConfig();

  // 1. Set the brand's design system as the OD daemon default. Best-effort:
  //    si el daemon está offline o devuelve error, seguimos abriendo OD igualmente
  //    porque el usuario puede seleccionar el design system a mano.
  let designSystemApplied = false;
  try {
    const response = await fetch(`${config.daemonUrl}/api/app-config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designSystemId: slug }),
    });
    designSystemApplied = response.ok;
  } catch (err) {
    if (err instanceof OdDaemonOfflineError) {
      return res.status(503).json({ error: err.message });
    }
    // Otros errores no bloquean — devolvemos webUrl con un warning.
  }

  return res.status(200).json({
    webUrl: config.webUrl,
    designSystemId: slug,
    designSystemApplied,
  });
}
