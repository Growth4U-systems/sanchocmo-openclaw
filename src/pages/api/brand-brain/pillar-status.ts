import type { NextApiRequest, NextApiResponse } from "next";
import { withAuth, withErrorHandler, compose, canAccessSlug } from "@/lib/api-middleware";
import { setPillarStatusViaTask } from "@/lib/data/task-status-store";
import { normalizeTaskStatus, isLegacyStatusAlias, VALID_TASK_STATUSES } from "@/lib/task-status";
import { provisionYalcBrain } from "@/lib/yalc/provision";
import { runTrustScore, hasTrustScoreCache, isCompanyBriefCompletion } from "@/lib/trust-score/run";

/**
 * POST /api/brand-brain/pillar-status
 *
 * Escribe el status de un pilar de Foundation — es decir, el status de SU
 * task 1:1 (SAN-183 F5: las tasks son la única fuente; el árbol de
 * foundation-state.json murió). Sin dual-write ni reconcile.
 *
 * Vocabulario canónico: VALID_TASK_STATUSES (todo|in-progress|pending-review|
 * completed|blocked|cancelled). Los valores del vocabulario de pilar muerto
 * (approved, not-started, generated, done…) se aceptan como ALIASES LEGACY
 * transicionales y se normalizan con deprecation warning — retirar cuando las
 * sesiones de agente ciclen (follow-up en Linear).
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug, section, pillar, status, comment } = req.body;

  if (!slug || !section || !pillar || !status) {
    return res
      .status(400)
      .json({ error: "Missing slug, section, pillar, or status" });
  }

  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const lowered = String(status).toLowerCase();
  if (
    !(VALID_TASK_STATUSES as readonly string[]).includes(lowered) &&
    !isLegacyStatusAlias(lowered)
  ) {
    return res
      .status(400)
      .json({ error: "Invalid status: " + status, valid: VALID_TASK_STATUSES });
  }

  const canonical = normalizeTaskStatus(lowered);
  const result = setPillarStatusViaTask(slug, section, pillar, lowered, { comment });

  if (!result.ok) {
    const code = result.error?.includes("not found") ? 404 : 500;
    return res.status(code).json({ error: result.error || "status write failed" });
  }

  // Un pilar completado cambia la doctrina del brand — re-sync del brain de
  // YALC para que el outbound corra sobre la Foundation recién aprobada.
  // Fire-and-forget; el provisioning es idempotente.
  if (canonical === "completed" && result.pillarChanged) {
    void provisionYalcBrain(slug).catch((err) =>
      console.error(`[pillar-status] YALC brain re-sync failed for ${slug}:`, err),
    );
  }

  // Al completar el Company Brief (kickoff hecho → ya hay URL) arrancar el Trust
  // Score automáticamente. Resucita en código fiable el auto-arranque que el
  // foundation-orchestrator prometía pero nunca ejecutaba (SAN-309). Fire-and-forget
  // y NO bloqueante: si el analyzer falla (sin competidores, discovery caído), el
  // pilar trust-score queda pendiente sin trabar el kickoff. Guard de una sola vez
  // (sin cache previo): la corrida inicial es acá; el refresco recurrente lo hace el
  // cron semanal, y una re-aprobación del brief no relanza una corrida cara.
  if (
    isCompanyBriefCompletion(section, pillar, canonical, result.pillarChanged) &&
    !hasTrustScoreCache(slug)
  ) {
    void runTrustScore(slug)
      .then((outcome) => {
        if (!outcome.ok) {
          console.warn(`[pillar-status] Trust Score kickoff (${slug}): ${outcome.error}`);
        }
      })
      .catch((err) =>
        console.error(`[pillar-status] Trust Score kickoff failed for ${slug}:`, err),
      );
  }

  return res.status(200).json({
    ok: true,
    slug,
    section,
    pillar,
    oldStatus: result.oldStatus,
    newStatus: result.newStatus,
    canonicalStatus: canonical,
    pillarChanged: result.pillarChanged,
    tasksChanged: result.tasksChanged,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
