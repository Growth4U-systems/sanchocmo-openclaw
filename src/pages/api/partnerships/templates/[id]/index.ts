import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { getTemplate, saveTemplate, TemplateValidationError } from "@/lib/partnerships";

/**
 * Plantilla individual (SAN-80).
 *
 *   GET /api/partnerships/templates/{id}?slug=…   → { template }
 *   PUT /api/partnerships/templates/{id}          → { ok, template }
 *     Body: { slug, name?, kind?, type?, description?, steps }
 *     (el editor del tab Plantillas guarda aquí; upsert por id).
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing template id" });

  if (req.method === "GET") {
    const template = getTemplate(slug, id);
    if (!template) return res.status(404).json({ error: `Plantilla no encontrada: ${id}` });
    return res.status(200).json({ template });
  }

  if (req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const existing = getTemplate(slug, id);
  if (!existing) return res.status(404).json({ error: `Plantilla no encontrada: ${id}` });

  const body = (req.body || {}) as Record<string, unknown>;
  try {
    const template = saveTemplate(slug, {
      id,
      name: typeof body.name === "string" && body.name.trim() ? body.name : existing.name,
      kind: body.kind === "brief" || body.kind === "sequence" ? body.kind : existing.kind,
      type: body.type === "b2b" || body.type === "partnerships" ? body.type : existing.type,
      description:
        typeof body.description === "string" ? body.description : existing.description,
      steps: Array.isArray(body.steps) ? (body.steps as never) : existing.steps,
    });
    return res.status(200).json({ ok: true, template });
  } catch (err) {
    if (err instanceof TemplateValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
