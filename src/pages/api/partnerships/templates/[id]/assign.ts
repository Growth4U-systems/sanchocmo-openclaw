import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { assignTemplateToSearch, TemplateValidationError } from "@/lib/partnerships";

/**
 * Asignar/instanciar una plantilla en una búsqueda (SAN-80).
 *
 *   POST /api/partnerships/templates/{id}/assign
 *     Body: { slug, searchId? , campaignId? } — una de las dos referencias.
 *     Instancia una COPIA congelada en el registro de la búsqueda
 *     (idempotente por templateId). → { ok, instance, search }
 *
 * Misma lógica que la tool MCP `yalc_assign_template` y que la fila
 * "Plantillas" del plan del chat (assignTemplatesFromPlan).
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing template id" });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const body = (req.body || {}) as { searchId?: unknown; campaignId?: unknown };
  try {
    const result = assignTemplateToSearch(slug, id, {
      searchId: typeof body.searchId === "string" && body.searchId ? body.searchId : undefined,
      campaignId: typeof body.campaignId === "string" && body.campaignId ? body.campaignId : undefined,
    });
    return res.status(200).json({ ok: true, instance: result.instance, search: result.search });
  } catch (err) {
    if (err instanceof TemplateValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
