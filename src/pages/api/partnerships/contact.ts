import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { contactPartnerLeads, PartnerContactError } from "@/lib/partnerships";
import { yalcErrorResponse } from "@/lib/yalc/client";
import { yalcGuardErrorResponse } from "@/lib/yalc/campaign-guards";

/**
 * Contactar creators (SAN-80) — la acción detrás del bulk "Contactar",
 * del movimiento Shortlist→Contacted y del "Enviar" del Inbox.
 *
 *   POST /api/partnerships/contact
 *     Body: {
 *       slug,
 *       leads: [{ id, campaignId }],         // o leadIds + campaignId
 *       sequence?:  [{ subject?, body, delayDays? }],  // Inbox: reply única
 *       sequenceName?,
 *       dryRun?: boolean                      // default true (NUNCA real)
 *     }
 *     → { ok, gates: [{ campaignId, runId, gateId, prompt, queuedLeads,
 *          dryRun, sequenceName, draftCount, previews }] }
 *
 * Sin secuencia explícita usa la plantilla de secuencia INSTANCIADA en la
 * búsqueda de cada campaña; sin plantilla asignada → 409 con mensaje
 * accionable. El envío ocurre al aprobar el gate (POST /api/yalc/gates).
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const body = (req.body || {}) as {
    leads?: unknown;
    leadIds?: unknown;
    campaignId?: unknown;
    sequence?: unknown;
    sequenceName?: unknown;
    dryRun?: unknown;
  };

  let leads: Array<{ id: string; campaignId: string }> = [];
  if (Array.isArray(body.leads)) {
    leads = body.leads
      .filter((item): item is { id: string; campaignId: string } => {
        const lead = item as { id?: unknown; campaignId?: unknown };
        return typeof lead?.id === "string" && typeof lead?.campaignId === "string";
      })
      .map((lead) => ({ id: lead.id, campaignId: lead.campaignId }));
  } else if (Array.isArray(body.leadIds) && typeof body.campaignId === "string") {
    leads = body.leadIds
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .map((id) => ({ id, campaignId: body.campaignId as string }));
  }

  try {
    const gates = await contactPartnerLeads({
      slug,
      leads,
      sequence: Array.isArray(body.sequence) ? (body.sequence as never) : undefined,
      sequenceName: typeof body.sequenceName === "string" ? body.sequenceName : undefined,
      dryRun: body.dryRun === false ? false : true,
    });
    return res.status(200).json({ ok: true, gates });
  } catch (err) {
    if (err instanceof PartnerContactError) {
      return res.status(err.status).json({ error: err.message });
    }
    const guard = yalcGuardErrorResponse(err);
    if (guard) return res.status(guard.status).json(guard.body);
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
