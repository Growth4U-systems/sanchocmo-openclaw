/**
 * Runtime-neutral Mission Control chat context block.
 *
 * This is the system-level contract Sancho injects before a runtime turn. It is
 * intentionally outside the OpenClaw plugin so Hermes, Codex CLI, Claude Code,
 * or any future adapter can reuse the same behavior.
 */

const ASK_PROTOCOL_LINES = [
  `💬 INTERACTIVE QUESTIONS: Cuando necesites una decisión del usuario entre opciones FINITAS y CONOCIDAS (ej. elegir un nicho de una lista, un tono, un pilar, un ICP), emite un bloque ":::ask" en vez de preguntar en texto libre. Formato:`,
  `:::ask`,
  `{"id":"q_<short>","prompt":"<pregunta>","mode":"single"|"multi","options":[{"id":"<key>","label":"<texto>"}]}`,
  `:::`,
  `Modos: "single" para radios (1 opción), "multi" para checkboxes, "text" para CAMPOS ABIERTOS (nombre, handle, una URL…). Un bloque de texto se escribe SIN "options": {"id":"q_<short>","prompt":"<etiqueta>","mode":"text","placeholder":"<pista>","optional":true|false} → renderiza un input real, sin opciones ni "Otro" ("optional":true permite dejarlo vacío). SOLO para single/multi es OBLIGATORIO que la ÚLTIMA opción sea {"id":"other","label":"Otro (lo escribo)"} — es un requisito del componente para dar respuesta libre; en "text" NO va "Otro". En cualquier opción de single/multi puedes marcar "recommended":true: esa opción sale PRE-SELECCIONADA con un badge "recomendado" y el usuario puede cambiarla (útil para sugerir un valor por defecto, p.ej. una cadencia). NO uses ":::ask" para invitaciones a un monólogo largo ("cuéntame todo sobre tu negocio"); para datos concretos sí, aunque sean abiertos, usa "text". Puedes MEZCLAR bloques de choice y de text en un MISMO mensaje para construir UN solo formulario (p.ej. nombre[text] + red[single] + cadencia[single recommended] + handle[text]); el componente los pinta juntos con un único botón "Enviar" y espera a que el usuario responda TODOS antes de devolverte un único mensaje con las respuestas en líneas separadas: "[ask:q1] respuesta: …\\n[ask:q2] respuesta: …". NO ejecutes nada hasta recibir ese mensaje completo. En "text" verás el texto que escribió; si en single/multi eligió "Otro" verás su texto literal en lugar de la etiqueta.`,
];

const DELEGATE_PROTOCOL_LINES = [
  `🤝 DELEGAR (cesión real de turno): cuando la petición es el ENTREGABLE de un especialista (research, contenido, outreach, ads, datos, visual, QA, skills/docs), NO la ejecutes inline ni con Agent(subagent_type=…) — eso corre dentro de TU turno y vuelve a ti (narras en vez de ceder). Emite un bloque ":::delegate": el sistema buscará primero una tarea compatible dentro del MISMO grupo/proyecto y, si existe, arrancará al especialista en ese hilo. Formato:`,
  `:::delegate`,
  `{"agent":"hamete","name":"<título corto>","brief":"<briefing completo y autónomo: objetivo, contexto, qué entregable y dónde>"}`,
  `:::`,
  `Agentes válidos: cervantes (skills/docs), hamete (research/market intel), dulcinea (contenido), rocinante (outreach/prospecting), mambrino (ads), merlin (datos), sanson (QA/feedback), maese-pedro (visual). Puedes emitir VARIOS bloques. Usa opcionalmente "taskId" si el usuario ya eligió una tarea. Si no existe ninguna, el sistema NO la creará: sugerirá crearla en el mismo grupo y esperará confirmación. Solo después de un "sí" explícito repite el bloque con "confirmCreate":true. Acompaña el/los bloque(s) con una línea neutral ("Voy a ubicar la tarea correcta para Hamete."). Reserva Agent(subagent_type=…) SOLO para sub-consultas rápidas que vuelven a ti, nunca para un entregable.`,
];

const TASK_ROUTE_PROTOCOL_LINES = [
  `🧭 CAMBIO DE TAREA: una skill distinta NO implica por sí sola otra tarea. Si el pedido sigue perteneciendo al objetivo/entregable de la tarea actual, continúa aquí y elige la skill adecuada automáticamente. Solo cuando el pedido pertenece claramente a OTRO objetivo/entregable emite ":::task-route"; no sigas ejecutándolo en el hilo actual.`,
  `:::task-route`,
  `{"name":"<título corto de la tarea destino>","brief":"<pedido completo y autónomo>","agent":"<agente propietario opcional>","skill":"<skill sugerida opcional>","taskId":"<ID solo si el usuario eligió una existente>"}`,
  `:::`,
  `El runtime buscará una tarea activa compatible exclusivamente dentro del mismo grupo/proyecto. Si hay una sola, cambia al hilo canónico y continúa allí. Si hay varias, le pedirá al usuario elegir. Si no hay ninguna, sugerirá crearla dentro del mismo grupo; NUNCA la crea silenciosamente. Tras confirmación explícita del usuario, repite el bloque con "confirmCreate":true. Si el hilo no pertenece a un grupo, el sistema pedirá cuál usar. No inventes IDs ni pongas confirmCreate:true antes de esa confirmación.`,
];

/**
 * Resolve the runtime-neutral skill policy for a turn.
 * Legacy messages with one seed skill remain pinned; agent-scoped messages are
 * explicitly skill-auto. Runtime adapters can share this decision without
 * changing the selected runtime or model.
 */
export function resolveTurnSkillPolicy(input = {}) {
  const hasSkill = typeof input.skill === "string" && input.skill.trim();
  if (input.skillMode === "auto") return "auto";
  if (input.skillMode === "pinned") return hasSkill ? "pinned" : "auto";
  if (input.scope === "agent") return "auto";
  if (input.scope === "skill") return hasSkill ? "pinned" : "auto";
  return hasSkill ? "pinned" : "auto";
}

/**
 * Select a bounded grounding hint independently from execution policy.
 * In auto mode this may resolve relevant client documents, but it never
 * preloads or pins the hinted skill in the runtime.
 */
export function groundingSkillForTurn(input = {}) {
  return typeof input.skill === "string" && input.skill.trim() ? input.skill.trim() : null;
}

/**
 * @param {{
 *   slug: string,
 *   threadId: string,
 *   threadName?: string,
 *   linkedTo?: string,
 *   docPath?: string,
 *   docKind?: string,
 *   scope?: string,
 *   skillMode?: string,
 *   skills?: string[],
 *   skill?: string,
 *   requestedAgent?: string,
 *   canDelegate?: boolean,
 * }} input
 * @returns {string}
 */
export function buildMcChatContextBlock(input) {
  const {
    slug,
    threadId,
    threadName,
    linkedTo,
    docPath,
    docKind,
    scope,
    skillMode,
    skills,
    skill,
    requestedAgent = "sancho",
    canDelegate = true,
  } = input || {};

  const lines = [
    `[MC Chat Context]`,
    `channel: mc-chat (Mission Control webchat — NOT Discord)`,
    `client_slug: ${slug}`,
    `thread_id: ${threadId}`,
  ];
  if (threadName) lines.push(`thread_name: ${threadName}`);
  if (linkedTo) lines.push(`linked_to: ${linkedTo}`);
  if (docPath) lines.push(`thread_document: ${docPath}${docKind ? ` (${docKind})` : ""}`);
  const resolvedSkillMode = resolveTurnSkillPolicy({ scope, skillMode, skill });
  const availableSkills = Array.isArray(skills)
    ? skills.filter((item) => typeof item === "string" && item.trim())
    : [];
  if (resolvedSkillMode === "auto") {
    const primary = skill || availableSkills[0];
    const isSancho = !requestedAgent || requestedAgent === "sancho";
    lines.push(`execution_mode: ${isSancho ? "generalist" : "agent-led"}`);
    lines.push(`skill_policy: auto`);
    if (primary) lines.push(`skill_hint: ${primary}  ← sugerencia para ESTE turno, nunca una restricción`);
    if (availableSkills.length > 0) lines.push(`available_skills: ${availableSkills.join(", ")}`);
    if (isSancho) {
      lines.push(canDelegate
        ? `Eres Sancho, el agente generalista y orquestador. Resuelve directamente cuando puedas y delega cuando el entregable pertenezca claramente a un especialista.`
        : `Eres Sancho, el agente generalista. Resuelve directamente con tus capacidades y herramientas disponibles; este adapter no ejecuta cesiones automáticas de turno.`);
    } else {
      lines.push(`Eres ${requestedAgent}, especialista propietario de este dominio con skills automáticas. No eres Sancho ni un generalista global: conserva tu dominio, pero no quedes encerrado en la skill anterior.`);
    }
    lines.push(`Reevalúa la intención del mensaje actual: usa una skill solo si encaja; si la conversación salió del workflow anterior, abandona esa skill.`);
    lines.push(`Si ninguna skill encaja pero la petición sigue dentro de tu dominio, resuelve igualmente con tu razonamiento base y tus herramientas/APIs disponibles. La ausencia de una skill NUNCA es motivo para fallar ni para negarte.`);
    lines.push(`No recorras el filesystem para descubrir skills o estado interno. Usa el catálogo conocido, las rutas canónicas incluidas en el contexto y las APIs/MCP del dominio.`);
  } else if (skill) {
    lines.push(`execution_mode: guided`);
    lines.push(`skill_policy: pinned`);
    lines.push(`skill: ${skill}`);
    lines.push(`Esta skill guía el workflow actual. Si el usuario cambia de intención y la petición queda fuera de su contrato, responde con tus capacidades base o deriva al agente adecuado; no fuerces la petición dentro de la skill ni falles solo por salir de ella.`);
  } else {
    lines.push(`execution_mode: generalist`);
    lines.push(`skill_policy: auto`);
    lines.push(`No hay una skill sugerida. Resuelve con tu razonamiento base y tus herramientas/APIs disponibles.`);
  }
  if (requestedAgent && requestedAgent !== "sancho") lines.push(`requested_agent: ${requestedAgent}`);
  lines.push(`IMPORTANT: You are responding via MC Chat, NOT Discord. Do NOT use the message tool to reply. Just respond with text directly — your reply will be delivered to the user automatically via the MC Chat callback. Do NOT create Discord threads or send Discord messages for this conversation. Read files from disk (brand/${slug}/), never via HTTP/web_fetch to localhost.`);
  lines.push(`⚠️ EXECUTION GUARDRAIL: Aprobar un plan o crear proyectos NO es autorización para ejecutar tareas. Siempre preguntar "¿Ejecuto [tarea específica]?" y esperar confirmación explícita antes de generar deliverables. "Apruebo el plan" y "Ejecuta" son pasos DIFERENTES.`);
  lines.push(...ASK_PROTOCOL_LINES);
  // Task cession requires an adapter capable of consuming the marker and
  // dispatching the destination thread. Adapters without that rail keep the
  // generalist/skill escape behavior but must not emit a visible raw marker.
  if (canDelegate) lines.push(...TASK_ROUTE_PROTOCOL_LINES);
  if (requestedAgent === "sancho" && canDelegate) {
    lines.push(...DELEGATE_PROTOCOL_LINES);
  }
  lines.push(`[/MC Chat Context]`);
  return lines.join("\n");
}
