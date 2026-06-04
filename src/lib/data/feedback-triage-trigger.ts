/**
 * Feedback-triage trigger.
 *
 * Asks Sansón (via the OpenClaw gateway, same pattern as writer-trigger.ts) to
 * run skills/_shared/feedback-triage.md over the client comments on a doc and
 * POST categorized insights back to /api/clients/{slug}/feedback-insights/ingest.
 *
 * Fire-and-forget. No-op (no gateway call) when the doc has no comments.
 */

import crypto from "crypto";
import { addMessage, getChatSecret, getGatewayUrl } from "./mc-chat";
import { type CommentRow, loadDocComments } from "@/lib/comments";
import { getCommentedDocPath, getOriginalDocPath } from "@/lib/comments-file";

export interface TriggerFeedbackTriageInput {
  slug: string;
  /** Original doc path (not the .commented sibling). For content drafts this is
   *  the draft dir, e.g. `brand/{slug}/content/drafts/{ideaId}`. */
  docPath: string;
  skillId: string | null;
  source: "auto" | "manual";
}

export interface TriggerFeedbackTriageResult {
  forwardedToGateway: boolean;
  threadId: string;
  runId: string;
  commentCount: number;
  error?: string;
}

function buildThreadId(slug: string, docPath: string): string {
  const docSlug = docPath.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `${slug}:feedback:${docSlug}`;
}

/** Resolve comments for a doc, tolerant of the `.commented` sibling and of
 *  directory-style docPaths (content drafts have per-channel commented files). */
async function resolveComments(slug: string, docPath: string): Promise<CommentRow[]> {
  const exact = await loadDocComments(slug, getCommentedDocPath(docPath));
  if (exact.length > 0) return exact;
  const all = await loadDocComments(slug);
  // Match children of a directory-style docPath (content drafts store
  // per-channel `.commented` files under the draft dir). Use a trailing
  // slash so `idea-1` does not also match `idea-10`.
  const prefix = `${docPath}/`;
  return all.filter(
    (c) =>
      c.docPath.startsWith(prefix) ||
      getOriginalDocPath(c.docPath).startsWith(prefix),
  );
}

function buildTriageMessage(
  input: TriggerFeedbackTriageInput,
  comments: CommentRow[],
  runId: string,
): string {
  const commentLines = comments
    .map((c, i) => {
      const quote = c.anchorText ? `\n   sobre: "${c.anchorText.slice(0, 300)}"` : "";
      return `${i + 1}. [${c.id}] ${c.author}:${quote}\n   ${c.body.replace(/\n+/g, " ").slice(0, 800)}`;
    })
    .join("\n");

  return [
    `Analizá el feedback del cliente sobre este entregable y clasificá cada comentario.`,
    ``,
    `LEE PRIMERO Y SEGUÍ OBLIGATORIAMENTE: \`skills/_shared/feedback-triage.md\`.`,
    ``,
    `Datos:`,
    `- slug: ${input.slug}`,
    `- docPath: ${input.docPath}`,
    `- skillId: ${input.skillId ?? "(desconocido)"}`,
    `- runId: ${runId}`,
    ``,
    `Comentarios del cliente (${comments.length}):`,
    commentLines,
    ``,
    `Cuando termines, POSTEá los insights a:`,
    `  $MC_BASE/api/clients/${input.slug}/feedback-insights/ingest`,
    `con header \`Authorization: Bearer $SANCHO_INTERNAL_API_TOKEN\` y el runId ${runId}.`,
    `NO edites ningún SKILL.md, archivo de brand, ni el formulario — MC rutea lo aceptado.`,
  ].join("\n");
}

export async function triggerFeedbackTriage(
  input: TriggerFeedbackTriageInput,
): Promise<TriggerFeedbackTriageResult> {
  const runId = `fbr_${crypto.randomUUID()}`;
  const threadId = buildThreadId(input.slug, input.docPath);
  const comments = await resolveComments(input.slug, input.docPath);

  if (comments.length === 0) {
    return { forwardedToGateway: false, threadId, runId, commentCount: 0, error: "no comments" };
  }

  const message = buildTriageMessage(input, comments, runId);
  addMessage(
    threadId,
    "system",
    `🛡️ Pidiendo a Sansón que analice el feedback de ${input.docPath}...`,
  );
  addMessage(threadId, "user", message);

  const secret = getChatSecret();
  const payload = {
    slug: input.slug,
    threadId,
    threadName: `Feedback triage ${input.docPath}`,
    text: message,
    userId: "mc-feedback-triage",
    userName: "Mission Control",
    skill: "feedback-triage",
    skills: ["feedback-triage"],
    agent: "sanson",
    threadState: "continue",
    docPath: input.docPath,
    isAdmin: true,
    senderRole: "admin",
  };

  try {
    const res = await fetch(`${getGatewayUrl()}/mc-chat/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-MC-Secret": secret } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        forwardedToGateway: false,
        threadId,
        runId,
        commentCount: comments.length,
        error: `gateway ${res.status}: ${text}`,
      };
    }
    return { forwardedToGateway: true, threadId, runId, commentCount: comments.length };
  } catch (e) {
    return {
      forwardedToGateway: false,
      threadId,
      runId,
      commentCount: comments.length,
      error: e instanceof Error ? e.message : "Gateway unreachable",
    };
  }
}
