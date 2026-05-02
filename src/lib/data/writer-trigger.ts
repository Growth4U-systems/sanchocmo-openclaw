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
  const ideaDir = `brand/${input.slug}/content/drafts/${input.ideaId}`;

  if (input.kind === "initial") {
    return [
      `Redacta el draft inicial para la ContentTask ${input.contentTaskId}.`,
      ``,
      `Idea: ${input.ideaId}`,
      `Canales: ${channelList}`,
      `Skill principal: ${input.skill}`,
      ``,
      `═══════════════════════════════════════════════════════════════`,
      `RESTRICCIONES OBLIGATORIAS — el contenido fuera de estas se descarta.`,
      `═══════════════════════════════════════════════════════════════`,
      ``,
      `1. PATHS PERMITIDOS (whitelist absoluta).`,
      `   Solo puedes escribir/sobrescribir archivos dentro de:`,
      `     ${ideaDir}/`,
      `   Específicamente:`,
      `     - ${ideaDir}/proposal.md   (índice + ángulo, NO lo cambies salvo notas)`,
      `     - ${ideaDir}/research.md   (volcado de deep-research)`,
      `     - ${ideaDir}/clarify.md    (preguntas + respuestas de clarify)`,
      draftPaths,
      `   PROHIBIDO escribir en \`campaigns/\`, \`published/\`, \`brand/${input.slug}/foundation/\`,`,
      `   o cualquier path que no esté en la lista de arriba. Mission Control descarta`,
      `   silenciosamente cualquier write fuera de esta whitelist.`,
      ``,
      `2. STATUS CANÓNICOS — usar EXACTAMENTE estos valores en el frontmatter:`,
      `     status: pending | researching | clarify-needed | drafting | draft | approved | published`,
      `     clarify_status: pending | answered | skipped`,
      `   Cualquier otro valor (p.ej. "complete", "confirmed", "done") es RECHAZADO`,
      `   por la API y la transición falla. Lee la lista, no inventes.`,
      ``,
      `3. FLUJO OBLIGATORIO — en este orden, sin saltos:`,
      `   a) deep-research → escribe el resultado en ${ideaDir}/research.md`,
      `      (sources + queries + key findings). Pon status="researching" en los`,
      `      drafts de canal mientras esto pasa.`,
      `   b) Clarify → escribe ${ideaDir}/clarify.md siguiendo OBLIGATORIAMENTE`,
      `      las reglas en \`skills/_shared/clarify-by-type.md\` (lectura previa`,
      `      obligatoria). Pasos resumidos:`,
      `        - Clasifica el item en uno de los 7 tipos (dato_cifra | hot_take |`,
      `          launch | framework_playbook | caso_historia | tendencia_report |`,
      `          plataforma_cambia). Escribe \`item_type: <tipo>\` en el frontmatter`,
      `          de clarify.md.`,
      `        - Genera EXACTAMENTE 4 preguntas (Q1 provocación · Q2 evidencia ·`,
      `          Q3 insight no obvio · Q4 audiencia+cierre) con 4 opciones HIPÓTESIS`,
      `          específicas + Other cada una. Las opciones tienen que ser tesis`,
      `          concretas con cifra/cliente, NO "Confirmo / Contra / Matiz".`,
      `        - La Q3 está diseñada para que la mejor respuesta sea Other libre.`,
      `        - Antes de redactar las preguntas, lee proposal.md (angle_draft) y`,
      `          research.md. Las opciones deben empujar al humano a refinar el`,
      `          ángulo, no a aceptarlo.`,
      `      Marca todos los drafts de canal con status="clarify-needed" y`,
      `      clarify_status="pending". POSTEA las preguntas en este hilo y PARA.`,
      `      NO empieces a redactar hasta que el humano responda y clarify_status`,
      `      pase a "answered" (o explícitamente "skipped" si no hay preguntas).`,
      `   c) Writer → SOLO si clarify_status ∈ {answered, skipped}, sobrescribe`,
      `      cada \`{channel}.md\` con el draft final. Frontmatter: mantén idea_id,`,
      `      channel, content_task_id, parent_task_id; sube iteration a 1; pon`,
      `      status="draft"; copia \`item_type\` desde clarify.md. El BODY del .md`,
      `      es el contenido publicable completo (no resúmenes ni links a otros`,
      `      archivos). Aplica reglas anti-AI-writing y \`[verifica cifra]\` markers`,
      `      tal como define \`skills/_shared/clarify-by-type.md\` §6-§7. Si una`,
      `      cifra no viene del humano (Q2 vaga) o de archivos de brand, NUNCA la`,
      `      inventes — márcala \`[verifica cifra]\` y lístala en el resumen del`,
      `      paso (d).`,
      `   d) Postea aquí un resumen breve (≤6 líneas) cuando termines.`,
      ``,
      `4. POV / VOICE — sigue el brand-voice del cliente si existe en foundation`,
      `   (lectura, no escritura). Si no existe, usa lenguaje directo, sin clichés.`,
      ``,
      input.instruction ? `Instrucción extra del usuario: ${input.instruction}` : ``,
    ].filter(Boolean).join("\n");
  }
  return [
    `Itera el draft de ${channelList} para la ContentTask ${input.contentTaskId}.`,
    ``,
    `Idea: ${input.ideaId}`,
    `Archivo a sobrescribir (UNO solo, no toques otros canales):`,
    draftPaths,
    ``,
    `Instrucción del usuario:`,
    `> ${input.instruction}`,
    ``,
    `RESTRICCIONES:`,
    `- Solo puedes escribir en el path listado arriba.`,
    `- Status canónicos: pending|researching|clarify-needed|drafting|draft|approved|published.`,
    `- Si necesitas más research: añade al ${ideaDir}/research.md (NO crees nuevos archivos).`,
    `- Si necesitas más clarify: añade al ${ideaDir}/clarify.md y marca status="clarify-needed".`,
    ``,
    `Pasos:`,
    `1) Lee el draft actual y \`clarify_answers.iteration_request\` del frontmatter.`,
    `2) Reescribe el body manteniendo el frontmatter y subiendo iteration en 1.`,
    `   Pon status="draft" cuando termines.`,
    `3) Postea aquí un breve resumen del cambio que has hecho.`,
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
