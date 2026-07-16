import type { NextApiRequest, NextApiResponse } from "next";
import {
  compose,
  getSlug,
  withErrorHandler,
  withSlugAuth,
} from "@/lib/api-middleware";
import {
  DiscoverySetupCommandError,
  getDiscoverySetupAdmissionStatus,
} from "@/lib/partnerships";

const RUN_ID_RE = /^xrun_[a-z0-9_-]{1,100}$/i;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const rawRunId = Array.isArray(req.query.runId)
    ? req.query.runId[0]
    : req.query.runId;
  const runId = typeof rawRunId === "string" ? rawRunId.trim() : "";
  if (!RUN_ID_RE.test(runId)) {
    return res.status(400).json({
      error: "Invalid durable setup run ID",
      code: "DISCOVERY_SETUP_RUN_ID_INVALID",
    });
  }
  try {
    const status = await getDiscoverySetupAdmissionStatus({ slug, runId });
    if (!status) {
      // Exact tenant scope deliberately makes cross-tenant IDs indistinguishable
      // from missing receipts.
      return res.status(404).json({ error: "Admission not found" });
    }
    return res.status(200).json(status);
  } catch (error) {
    if (error instanceof DiscoverySetupCommandError) {
      return res.status(error.status).json({
        error: error.message,
        code: error.code,
      });
    }
    throw error;
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
