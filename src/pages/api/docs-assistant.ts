import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  createDocsAssistantReceipt,
  dispatchDocsAssistantQuestion,
  docsAssistantQuestionSchema,
  hasValidDocsAssistantToken,
  isAllowedPrivateDocsUrl,
  readDocsAssistantRun,
  verifyDocsAssistantReceipt,
  type DocsAssistantDispatch,
  type DocsAssistantQuestion,
  type DocsAssistantRunState,
} from "@/lib/docs-assistant";

interface DocsAssistantDependencies {
  dispatch(input: DocsAssistantQuestion): Promise<DocsAssistantDispatch>;
  readRun(runId: string): DocsAssistantRunState;
}

const defaultDependencies: DocsAssistantDependencies = {
  dispatch: dispatchDocsAssistantQuestion,
  readRun: readDocsAssistantRun,
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function noStore(res: NextApiResponse): void {
  res.setHeader("Cache-Control", "private, no-store");
}

export async function docsAssistantHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  dependencies: DocsAssistantDependencies = defaultDependencies,
) {
  noStore(res);
  if (!process.env.SANCHO_DOCS_ASSISTANT_TOKEN) {
    return res.status(503).json({ error: "Docs assistant is not configured" });
  }
  const authorization = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  if (!hasValidDocsAssistantToken(authorization)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method === "POST") {
    let input: DocsAssistantQuestion;
    try {
      input = docsAssistantQuestionSchema.parse(req.body);
    } catch (error) {
      return res.status(400).json({
        error: "Invalid document review request",
        ...(error instanceof z.ZodError ? { issues: error.issues } : {}),
      });
    }
    if (!isAllowedPrivateDocsUrl(input.url)) {
      return res.status(403).json({ error: "Growie is only available for private docs.growth4u.io documents" });
    }

    const dispatched = await dependencies.dispatch(input);
    return res.status(202).json({
      ok: true,
      status: "pending",
      receipt: createDocsAssistantReceipt(dispatched),
      conversationId: dispatched.conversationId,
      retryAfterMs: 1_000,
    });
  }

  if (req.method === "GET") {
    const verified = verifyDocsAssistantReceipt(first(req.query.receipt));
    if (!verified) return res.status(400).json({ error: "Invalid or expired receipt" });
    const state = dependencies.readRun(verified.runId);
    if (state.status === "pending") {
      return res.status(202).json({ ok: true, status: "pending", retryAfterMs: 1_000 });
    }
    if (state.status === "failed") return res.status(502).json({ error: state.error });
    return res.status(200).json({
      ok: true,
      status: "completed",
      answer: state.answer,
      agent: state.agent || "sancho",
      readOnly: true,
      generatedAt: new Date().toISOString(),
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default withErrorHandler(docsAssistantHandler);
