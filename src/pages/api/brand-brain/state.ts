import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { assembleBrandBrainState, brandExists } from "@/lib/data/brand-brain-assembler";

/**
 * GET /api/brand-brain/state?slug=X
 *
 * Devuelve el Brand Brain state del cliente — ENSAMBLADO al vuelo desde
 * manifest + tasks + company-brief + presentations/ (SAN-183 F5). El fichero
 * foundation-state.json murió como store; con una sola fuente de status (la
 * task 1:1 de cada pilar) ya no hay drift, así que el reconcile-on-read que
 * vivía aquí desapareció con él.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = req.query.slug as string;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  if (!brandExists(slug)) {
    return res.status(404).json({ error: "Brand Brain state not found" });
  }

  res.status(200).json(assembleBrandBrainState(slug));
}

export default withErrorHandler(handler);
