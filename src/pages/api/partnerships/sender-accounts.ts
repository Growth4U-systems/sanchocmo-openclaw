import type { NextApiRequest, NextApiResponse } from "next";
import {
  compose,
  getSlug,
  withErrorHandler,
  withSlugAuth,
} from "@/lib/api-middleware";
import {
  getSenderAccountSelection,
  listSenderAccounts,
  saveSenderAccountSelection,
} from "@/lib/partnerships/sender-accounts";

/**
 * Cuentas remitentes de Unipile (SAN-480).
 *
 *   GET /api/partnerships/sender-accounts?slug=...
 *     → { ok, configured, source: "yalc"|"config"|"none",
 *         accounts: [{ id, provider: "instagram"|"linkedin", label, status }],
 *         selectedAccountId, yalcError? }
 *
 *   PUT /api/partnerships/sender-accounts?slug=...
 *     Body: { senderAccountId: string | null }   // null = volver al default
 *     → { ok, selectedAccountId }
 *
 * Fuente de datos y contrato con el daemon de Yalc: ver
 * `src/lib/partnerships/sender-accounts.ts`. La selección persiste por tenant
 * en `brand/{slug}/outreach/settings.json` y se propaga como `senderAccountId`
 * en `POST /api/partnerships/contact`.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    const result = await listSenderAccounts(slug);
    return res.status(200).json({
      ok: true,
      ...result,
      selectedAccountId: getSenderAccountSelection(slug),
    });
  }

  if (req.method === "PUT") {
    const body = (req.body || {}) as { senderAccountId?: unknown };
    const raw = body.senderAccountId;
    if (raw !== null && raw !== undefined && typeof raw !== "string") {
      return res
        .status(400)
        .json({ error: "senderAccountId debe ser string o null." });
    }
    const selectedAccountId = saveSenderAccountSelection(
      slug,
      typeof raw === "string" ? raw : null,
    );
    return res.status(200).json({ ok: true, selectedAccountId });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
