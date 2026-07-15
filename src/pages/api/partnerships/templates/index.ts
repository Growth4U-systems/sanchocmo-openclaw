import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import {
  listTemplates,
  saveTemplate,
  templateSummary,
  TEMPLATE_VARIABLE_OPTIONS,
  TemplateValidationError,
} from "@/lib/partnerships";

/**
 * Biblioteca de plantillas de Outreach·Partnerships (SAN-80).
 *
 *   GET  /api/partnerships/templates?slug=…
 *     → { templates: PartnershipTemplate[], summaries } — biblioteca
 *       completa (secuencias + briefs). Workspace sin biblioteca → se
 *       siembran las 6 plantillas del mockup.
 *
 *   POST /api/partnerships/templates  { slug, name, kind?, type?, description?, steps }
 *     Crea una plantilla (id derivado del nombre). → { ok, template }
 *
 * Paridad UI = chat = MCP: la UI y la skill llaman aquí; el MCP expone
 * `yalc_assign_template` sobre el mismo store.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    const templates = listTemplates(slug);
    return res.status(200).json({
      templates,
      summaries: templates.map(templateSummary),
      variables: TEMPLATE_VARIABLE_OPTIONS,
      count: templates.length,
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  try {
    const template = saveTemplate(slug, {
      name: String(body.name || ""),
      kind: body.kind === "brief" ? "brief" : "sequence",
      type: body.type === "b2b" ? "b2b" : "partnerships",
      description: typeof body.description === "string" ? body.description : "",
      steps: Array.isArray(body.steps) ? (body.steps as never) : [],
    });
    return res.status(201).json({ ok: true, template });
  } catch (err) {
    if (err instanceof TemplateValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
