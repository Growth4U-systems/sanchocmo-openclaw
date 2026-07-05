import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import {
  getSearch,
  triggerDiscoveryRunner,
  updateRunnerState,
} from "@/lib/partnerships";

/**
 * POST /api/partnerships/searches/{id}/dispatch
 *
 * Reintenta el dispatch agentic de una búsqueda que quedó queued/error.
 * No ingesta fixtures ni candidatos: solo vuelve a avisar a Rocinante.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const searchId = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!searchId) return res.status(400).json({ error: "Missing search id" });

  const search = getSearch(slug, searchId);
  if (!search) {
    return res.status(404).json({ error: `Discovery search not found: ${searchId}` });
  }
  if (search.archivedAt) {
    return res.status(409).json({ error: "Esta búsqueda está archivada." });
  }
  if (search.runner.status === "done") {
    return res.status(409).json({ error: "Esta búsqueda ya terminó." });
  }
  if (search.runner.status === "running") {
    return res.status(409).json({ error: "El discovery ya está en ejecución." });
  }

  const dispatch = await triggerDiscoveryRunner({
    slug,
    searchId: search.id,
    title: search.title,
  });

  const next = updateRunnerState(slug, search.id, {
    status: dispatch.forwardedToGateway ? "queued" : "error",
    mode: null,
    queuedAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    error:
      dispatch.error ||
      (dispatch.forwardedToGateway
        ? null
        : "No se pudo avisar a Rocinante. Reintenta el discovery desde Encuentra."),
    stats: null,
  });

  return res.status(200).json({
    ok: dispatch.forwardedToGateway,
    search: next,
    runner: {
      mode: "agent",
      dispatched: dispatch.forwardedToGateway,
      threadId: dispatch.threadId,
      error: dispatch.error,
    },
  });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
