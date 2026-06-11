import { findContentTaskByIdAcrossProjects } from "@/lib/data/content-tasks";
import { loadDraft, updateDraft } from "@/lib/data/drafts";
import { getThread } from "@/lib/data/mc-chat";

/**
 * Deterministic `clarify_status: pending → answered` transition.
 *
 * The clarify questions live as `:::ask` blocks inside `clarify.md` and are
 * answered by the human through the chat ask components, which emit
 * `[ask:<id>] respuesta: <text>` lines in a user message
 * (see `components/chat/ask-question.tsx`). Before this module, nothing on
 * the MC side reacted to those answers: the writer agent was *expected* to
 * flip the frontmatter, but the trigger prompt never instructed it
 * explicitly, so the doc routinely stayed `pending` forever and the
 * Documentos rail never showed the green check (SAN-152).
 *
 * `maybeMarkClarifyAnswered` runs on every user message posted via
 * `/api/chat/send`. When the message belongs to a content thread and the
 * answers (this message + thread history) cover every ask id present in the
 * clarify doc body, it persists `clarify_status: answered` plus the parsed
 * `clarify_answers` map in the frontmatter. Ask ids not present in the doc
 * (e.g. the media-gate questions the agent asks in the same thread) are
 * ignored, and docs already `answered`/`skipped` are never touched.
 */

/** `[ask:<id>] respuesta: <answer>` — one per line, as emitted by AskQuestionGroup. */
const ASK_ANSWER_RE = /^\[ask:([^\]\s]+)\]\s*respuesta:\s*(.*)$/gm;

/** Block form used in chat messages: `:::ask\n{json}\n:::`. */
const ASK_BLOCK_RE = /^:::ask\s*\n([\s\S]*?)\n:::\s*$/gm;

/** Inline form seen in doc bodies: `:::ask {json}` on a single line. */
const ASK_INLINE_RE = /^:::ask[ \t]+(\{.*)$/gm;

const CODE_FENCE_RE = /```[\s\S]*?```/g;

const ID_RE = /"id"\s*:\s*"([^"]+)"/;

/** Parse every `[ask:<id>] respuesta: …` line of a message into an id→answer map. */
export function extractAskAnswers(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text || !text.includes("[ask:")) return out;
  for (const m of text.matchAll(ASK_ANSWER_RE)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * Extract the ask ids declared in a markdown body. Tolerant by design: the
 * agent sometimes writes the block form and sometimes a single-line inline
 * form, and the JSON payload may not parse cleanly — we only need the `id`,
 * so a regex pull is enough. Blocks inside code fences are ignored (they are
 * protocol examples, not live questions).
 */
export function extractAskIds(body: string): string[] {
  if (!body || !body.includes(":::ask")) return [];
  const withoutFences = body.replace(CODE_FENCE_RE, "");
  const ids: string[] = [];
  const push = (payload: string) => {
    const idMatch = payload.match(ID_RE);
    if (idMatch && !ids.includes(idMatch[1])) ids.push(idMatch[1]);
  };
  for (const m of withoutFences.matchAll(ASK_BLOCK_RE)) push(m[1]);
  for (const m of withoutFences.matchAll(ASK_INLINE_RE)) push(m[1]);
  return ids;
}

/**
 * Content threads are `{slug}:content:{contentTaskId.toLowerCase()}` (see
 * `writer-trigger.ts#buildThreadId`). Returns the (lowercased) content task
 * id, or null when the thread doesn't belong to this slug's content engine.
 */
export function parseContentThreadId(threadId: string, slug: string): string | null {
  const prefix = `${slug}:content:`;
  if (!threadId.startsWith(prefix)) return null;
  const ctId = threadId.slice(prefix.length);
  return ctId.length > 0 ? ctId : null;
}

export interface ClarifyAutostatusResult {
  marked: boolean;
  /** Why the call did/didn't mark — for logs, never user-facing. */
  reason:
    | "marked"
    | "no-answers"
    | "not-content-thread"
    | "ct-not-found"
    | "no-clarify-doc"
    | "not-pending"
    | "no-ask-ids"
    | "incomplete";
}

/**
 * Inspect a just-posted user message and flip the content task's clarify doc
 * to `answered` when every ask declared in its body has an answer. Reads are
 * cheap (two JSON files + one markdown), so this runs inline in the send
 * endpoint; callers should still try/catch — a failure here must never block
 * the chat message itself.
 */
export function maybeMarkClarifyAnswered(
  slug: string,
  threadId: string,
  messageText: string,
): ClarifyAutostatusResult {
  const currentAnswers = extractAskAnswers(messageText);
  if (Object.keys(currentAnswers).length === 0) {
    return { marked: false, reason: "no-answers" };
  }

  const ctId = parseContentThreadId(threadId, slug);
  if (!ctId) return { marked: false, reason: "not-content-thread" };

  const found = findContentTaskByIdAcrossProjects(slug, ctId);
  if (!found) return { marked: false, reason: "ct-not-found" };

  const clarify = loadDraft(slug, found.ct.idea_id, "clarify");
  if (!clarify) return { marked: false, reason: "no-clarify-doc" };
  if ((clarify.meta.clarify_status ?? "pending") !== "pending") {
    return { marked: false, reason: "not-pending" };
  }

  const askIds = extractAskIds(clarify.body);
  if (askIds.length === 0) return { marked: false, reason: "no-ask-ids" };

  // Answers can arrive split across messages (each ask group submits its own
  // message). Merge the thread history first, current message last so the
  // newest answer wins.
  const merged: Record<string, string> = {};
  for (const msg of getThread(threadId).messages) {
    if (msg.role !== "user") continue;
    Object.assign(merged, extractAskAnswers(msg.text || ""));
  }
  Object.assign(merged, currentAnswers);

  if (!askIds.every((id) => id in merged)) {
    return { marked: false, reason: "incomplete" };
  }

  const clarifyAnswers: Record<string, string> = {};
  for (const id of askIds) clarifyAnswers[id] = merged[id];

  updateDraft(slug, found.ct.idea_id, "clarify", {
    meta: { clarify_status: "answered", clarify_answers: clarifyAnswers },
  });
  return { marked: true, reason: "marked" };
}
