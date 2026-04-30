import { addMessage, getChatSecret, getGatewayUrl } from "./mc-chat";

/**
 * Writer-skill trigger.
 *
 * Calls the OpenClaw gateway (`/mc-chat/inbound`) on the ContentTask's chat
 * thread so Escudero Content (or whichever writer skill the ContentTask is
 * mapped to) actually runs deep-research → Clarify → writer and overwrites
 * the draft `.md` files. Best-effort: if the gateway is down, we still
 * record the request locally so a future cron/manual run can pick it up.
 *
 * The skill is responsible for:
 *   - Reading `brand/{slug}/content/drafts/{ideaId}/{channel}.md` (frontmatter
 *     + body) and any `clarify_answers.iteration_request`.
 *   - Producing the new body and overwriting the file.
 *   - Optionally producing research/clarify subproducts and attaching them
 *     to the ContentTask via `attachDocumentToContentTask`.
 *   - Posting progress messages back to the same thread so the user sees
 *     them in MC's chat sidebar.
 */

export interface TriggerWriterInput {
  slug: string;
  contentTaskId: string;
  parentTaskId: string;
  ideaId: string;
  channels: string[];
  skill: string;
  /** Channel-specific instruction (used for iterate-draft). Optional. */
  channelScope?: string;
  /** Free-text instruction. For initial drafting it's a generic prompt; for
   *  iteration it's the user's iteration request. */
  instruction: string;
  /** "initial" → first run after approval. "iterate" → re-run with edits. */
  kind: "initial" | "iterate";
}

export interface TriggerWriterResult {
  forwardedToGateway: boolean;
  threadId: string;
  error?: string;
}

function buildThreadId(slug: string, contentTaskId: string): string {
  return `${slug}:content:${contentTaskId.toLowerCase()}`;
}

function buildMessage(input: TriggerWriterInput): string {
  const channelList = input.channelScope
    ? input.channelScope
    : input.channels.join(", ");
  const draftPaths = (input.channelScope ? [input.channelScope] : input.channels)
    .map((ch) => `  - brand/${input.slug}/content/drafts/${input.ideaId}/${ch}.md`)
    .join("\n");
  if (input.kind === "initial") {
    return [
      `Redacta el draft inicial para la ContentTask ${input.contentTaskId}.`,
      ``,
      `Idea: ${input.ideaId}`,
      `Canales: ${channelList}`,
      `Skill principal: ${input.skill}`,
      ``,
      `Archivos a sobrescribir:`,
      draftPaths,
      ``,
      `Pasos esperados:`,
      `1) deep-research → guarda fuentes y queries usadas como documentos en la ContentTask.`,
      `2) Clarify si hace falta info (postea preguntas en este hilo).`,
      `3) writer → sobrescribe cada .md con el draft final, manteniendo el frontmatter (idea_id, channel, content_task_id, parent_task_id) y subiendo iteration a 1.`,
      `4) Postea aquí un resumen breve cuando termines.`,
      input.instruction ? `\nInstrucción extra: ${input.instruction}` : ``,
    ].join("\n");
  }
  return [
    `Itera el draft de ${channelList} para la ContentTask ${input.contentTaskId}.`,
    ``,
    `Idea: ${input.ideaId}`,
    `Archivo a sobrescribir:`,
    draftPaths,
    ``,
    `Instrucción del usuario:`,
    `> ${input.instruction}`,
    ``,
    `Pasos:`,
    `1) Lee el draft actual y \`clarify_answers.iteration_request\` del frontmatter.`,
    `2) Reescribe el body manteniendo el frontmatter y subiendo iteration en 1.`,
    `3) Si necesitas más research, ejecuta deep-research y adjunta fuentes a la ContentTask.`,
    `4) Postea aquí un breve resumen del cambio que has hecho.`,
  ].join("\n");
}

/**
 * Fire-and-forget: returns immediately while the gateway runs the agent.
 * Records a system message in the thread before forwarding so the user sees
 * what was requested even if the gateway is down.
 */
export async function triggerWriter(
  input: TriggerWriterInput,
): Promise<TriggerWriterResult> {
  const threadId = buildThreadId(input.slug, input.contentTaskId);
  const message = buildMessage(input);

  // Always record a system marker locally — if the gateway is unreachable,
  // the human can still see what was requested.
  addMessage(
    threadId,
    "system",
    input.kind === "initial"
      ? "🤠 Pidiendo a Escudero que redacte este draft..."
      : `🔄 Pidiendo a Sancho que itere este draft (${input.channelScope || "todos los canales"})...`,
  );
  addMessage(threadId, "user", message);

  const secret = getChatSecret();
  const payload = {
    slug: input.slug,
    threadId,
    threadName: `Content ${input.contentTaskId}`,
    text: message,
    userId: "mc-content-trigger",
    userName: "Mission Control",
    linkedTo: `projects/${input.parentTaskId}/content/${input.contentTaskId}`,
    skill: input.skill,
    skills: [input.skill],
    threadState: "continue",
    docPath: `brand/${input.slug}/content/drafts/${input.ideaId}`,
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
      return { forwardedToGateway: false, threadId, error: `gateway ${res.status}: ${text}` };
    }
    return { forwardedToGateway: true, threadId };
  } catch (e) {
    return {
      forwardedToGateway: false,
      threadId,
      error: e instanceof Error ? e.message : "Gateway unreachable",
    };
  }
}
