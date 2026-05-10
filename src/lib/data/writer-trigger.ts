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

/**
 * Build the curl one-liner the agent must run to PATCH a channel's phase on
 * the parent ContentTask. The .md frontmatter no longer carries a `status`
 * field — `tasks.json` (CT.channel_phases) is the single source of truth.
 *
 * The agent has `MC_BASE` available in env (same pattern as `content-image`).
 * Phase values mirror `ChannelPhase` in src/types/index.ts:
 *   researching | clarify-needed | drafting | draft | approved | published
 */
function curlPatchPhase(
  input: TriggerWriterInput,
  channels: string[],
  phase: string,
): string {
  const phasesObj = channels.reduce<Record<string, string>>((acc, c) => {
    acc[c] = phase;
    return acc;
  }, {});
  const body = JSON.stringify({
    slug: input.slug,
    parentTaskId: input.parentTaskId,
    id: input.contentTaskId,
    channel_phases: phasesObj,
  }).replace(/'/g, "'\\''");
  return `curl -fsS -X PATCH "$MC_BASE/api/content-engine/content-tasks" -H "Content-Type: application/json" -d '${body}'`;
}

function buildMessage(input: TriggerWriterInput): string {
  const channelList = input.channelScope
    ? input.channelScope
    : input.channels.join(", ");
  const targetChannels = input.channelScope ? [input.channelScope] : input.channels;
  const draftPaths = targetChannels
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
      `     - ${ideaDir}/proposal.md            (índice + ángulo, NO lo cambies salvo notas)`,
      `     - ${ideaDir}/research.md            (output del skill deep-research, ver §3a)`,
      `     - ${ideaDir}/QA-REPORT-research.md  (output de qa-bot sobre el research, ver §3a)`,
      `     - ${ideaDir}/clarify.md             (preguntas + respuestas de clarify)`,
      draftPaths,
      `   También permitido (append-only) — deep-research lo necesita:`,
      `     - brand/${input.slug}/intelligence/research-log.json`,
      `   PROHIBIDO escribir en \`campaigns/\`, \`published/\`, \`brand/${input.slug}/foundation/\`,`,
      `   o cualquier path que no esté en la lista de arriba. Mission Control descarta`,
      `   silenciosamente cualquier write fuera de esta whitelist.`,
      ``,
      `2. PHASE REPORTING — el .md NO lleva campo \`status\`. Reportas la fase`,
      `   por canal a tasks.json llamando a la API en cada transición:`,
      ``,
      `     # Al iniciar research:`,
      `     ${curlPatchPhase(input, targetChannels, "researching")}`,
      ``,
      `     # Al postear las preguntas de clarify:`,
      `     ${curlPatchPhase(input, targetChannels, "clarify-needed")}`,
      ``,
      `     # Al empezar a redactar (después de respuestas de clarify):`,
      `     ${curlPatchPhase(input, targetChannels, "drafting")}`,
      ``,
      `     # Al terminar el draft de un canal (sustituye el canal):`,
      `     ${curlPatchPhase(input, targetChannels.slice(0, 1), "draft")}`,
      ``,
      `   Phase values válidas: researching | clarify-needed | drafting | draft.`,
      `   "approved" y "published" las pone MC, no tú. clarify_status (pending |`,
      `   answered | skipped) sí va en el frontmatter del clarify.md.`,
      `   Si curl falla, posteas el error en el thread y NO continúas — la fase`,
      `   tiene que reflejarse en tasks.json antes de avanzar.`,
      ``,
      `3. FLUJO OBLIGATORIO — en este orden, sin saltos:`,
      `   a) DEEP-RESEARCH (ejecútalo tú mismo INLINE, NO spawnees subagent):`,
      `      - LEE primero \`skills/deep-research/SKILL.md\` y sus 4 references`,
      `        (\`phases.md\`, \`templates.md\`, \`quality.md\`, \`sources.md\`).`,
      `      - EJECUTA tú el workflow de 7 fases (SCOPE → SOURCES → EXTRACT →`,
      `        FRAMEWORK → DETAIL → QA → DELIVER) en esta misma sesión. NO uses`,
      `        Agent / Task / subagent — los subagents corren en otro sandbox y`,
      `        no ven \`brand/${input.slug}/\`, además de que tardan en bootstrap`,
      `        y se quedan sin tiempo en Phase 1.`,
      `      - Tampoco vale "hago web_search rápido y escribo un resumen". El`,
      `        output anterior salió pobre justo por eso. Las 7 fases son`,
      `        obligatorias.`,
      `      - Research question = angle_draft + signal.summary del idea ${input.ideaId}.`,
      `      - Output overrides (NO escribas en los paths canónicos del skill):`,
      `        · research final → ${ideaDir}/research.md`,
      `        · QA report      → ${ideaDir}/QA-REPORT-research.md`,
      `        · research-log   → brand/${input.slug}/intelligence/research-log.json`,
      `          (append entry; crea el archivo si no existe)`,
      `      - Reglas duras del SKILL.md: ≥10 fuentes únicas, ≥2 por entidad`,
      `        (≥1 oficial), web_search 3-5x por sección EN ESPAÑOL E INGLÉS`,
      `        (no solo EN), confidence model por dato`,
      `        (\`verified\`/\`reported\`/\`inferred\`), qa-bot OBLIGATORIO en Phase 6.`,
      `      - FORMATO del research.md = ENTREGABLE, no log de proceso. Usa la`,
      `        "Full Document Structure" de \`skills/deep-research/references/templates.md\`:`,
      `        Title + (Date/For/By/QA Score) → Scope Brief → Executive Summary →`,
      `        Taxonomy/Framework → Detailed Analysis (per entity) → Key`,
      `        Non-Obvious Finding → Recommendations → Sources Index. NUNCA uses`,
      `        "## Phase 1: SCOPE" / "## Phase 2: SOURCE DISCOVERY" / etc. como`,
      `        secciones — las 7 fases son tu workflow interno, NO el documento.`,
      `        El humano lee un research, no la receta que seguiste.`,
      `      - VERIFICACIÓN antes de avanzar a (b). Los 3 archivos deben existir`,
      `        Y tener contenido válido:`,
      `        ✓ ${ideaDir}/research.md             — estructura entregable per`,
      `                                                 templates.md, con sources`,
      `                                                 + confidence ratings inline.`,
      `        ✓ ${ideaDir}/QA-REPORT-research.md   — con QA score numérico.`,
      `        ✓ brand/${input.slug}/intelligence/research-log.json — entrada nueva`,
      `                                                 para esta idea.`,
      `        Si falta cualquiera, o el research.md NO sigue el formato`,
      `        entregable (Exec Summary / Taxonomy / Detailed Analysis / Sources`,
      `        Index, con confidence ratings), REPITE el deep-research. NO`,
      `        avances a Clarify con un research a medias o con secciones-fase.`,
      `      - Antes de empezar deep-research, ejecuta el curl de §2 con phase="researching".`,
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
      `      Marca clarify_status="pending" en clarify.md y ejecuta el curl de §2`,
      `      con phase="clarify-needed". POSTEA las preguntas en este hilo y PARA.`,
      `      NO empieces a redactar hasta que el humano responda y clarify_status`,
      `      pase a "answered" (o explícitamente "skipped" si no hay preguntas).`,
      `   c) Writer → SOLO si clarify_status ∈ {answered, skipped}:`,
      `      1) Ejecuta curl §2 con phase="drafting" para cada canal antes de empezar.`,
      `      2) Sobrescribe cada \`{channel}.md\` con el draft final. Frontmatter:`,
      `         mantén idea_id, channel, content_task_id, parent_task_id; sube`,
      `         iteration a 1; copia \`item_type\` desde clarify.md. NO escribas`,
      `         \`status:\` — ese campo ya no existe. El BODY del .md`,
      `         es el contenido publicable completo (no resúmenes ni links a otros`,
      `         archivos). Aplica reglas anti-AI-writing y \`[verifica cifra]\` markers`,
      `         tal como define \`skills/_shared/clarify-by-type.md\` §6-§7. Si una`,
      `         cifra no viene del humano (Q2 vaga) o de archivos de brand, NUNCA la`,
      `         inventes — márcala \`[verifica cifra]\` y lístala en el resumen del`,
      `         paso (d).`,
      `      3) Tras escribir cada \`{channel}.md\`, ejecuta curl §2 con`,
      `         phase="draft" para ESE canal (no para todos a la vez): el body`,
      `         del curl debe ser channel_phases:{"<channel>":"draft"}. Así se`,
      `         actualiza la fase por canal en tasks.json y la UI ve el progreso.`,
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
    `- El .md NO lleva campo \`status\`. La fase se reporta vía PATCH a la API.`,
    `- Si necesitas más research: añade al ${ideaDir}/research.md (NO crees nuevos archivos).`,
    `- Si necesitas más clarify: añade al ${ideaDir}/clarify.md y ejecuta:`,
    `    ${curlPatchPhase(input, targetChannels, "clarify-needed")}`,
    ``,
    `Pasos:`,
    `1) Antes de empezar, marca el canal como "drafting":`,
    `   ${curlPatchPhase(input, targetChannels, "drafting")}`,
    `2) Lee el draft actual y \`clarify_answers.iteration_request\` del frontmatter.`,
    `3) Reescribe el body manteniendo el frontmatter (sin \`status\`) y subiendo iteration en 1.`,
    `4) Cuando termines, marca el canal como "draft":`,
    `   ${curlPatchPhase(input, targetChannels, "draft")}`,
    `5) Postea aquí un breve resumen del cambio que has hecho.`,
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
