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
  `🤝 DELEGAR (cesión real de turno): cuando la petición es el ENTREGABLE de un especialista (research, contenido, outreach, ads, datos, visual, QA, skills/docs), NO la ejecutes inline ni con Agent(subagent_type=…) — eso corre dentro de TU turno y vuelve a ti (narras en vez de ceder). Emite un bloque ":::delegate": el especialista arranca en SU PROPIO hilo, opera su sistema y habla en su voz. Formato:`,
  `:::delegate`,
  `{"agent":"hamete","name":"<título corto>","brief":"<briefing completo y autónomo: objetivo, contexto, qué entregable y dónde>"}`,
  `:::`,
  `Agentes válidos: cervantes (skills/docs), hamete (research/market intel), dulcinea (contenido), rocinante (outreach/prospecting), mambrino (ads), merlin (datos), sanson (QA/feedback), maese-pedro (visual). Puedes emitir VARIOS bloques. Acompaña el/los bloque(s) con UNA línea para el usuario ("Lo paso a Hamete; te aviso cuando vuelva."). Reserva Agent(subagent_type=…) SOLO para sub-consultas rápidas que vuelven a ti, nunca para un entregable.`,
];

/**
 * @param {{
 *   slug: string,
 *   threadId: string,
 *   threadName?: string,
 *   linkedTo?: string,
 *   scope?: string,
 *   skills?: string[],
 *   skill?: string,
 *   requestedAgent?: string,
 * }} input
 * @returns {string}
 */
export function buildMcChatContextBlock(input) {
  const {
    slug,
    threadId,
    threadName,
    linkedTo,
    scope,
    skills,
    skill,
    requestedAgent = "sancho",
  } = input || {};

  const lines = [
    `[MC Chat Context]`,
    `channel: mc-chat (Mission Control webchat — NOT Discord)`,
    `client_slug: ${slug}`,
    `thread_id: ${threadId}`,
  ];
  if (threadName) lines.push(`thread_name: ${threadName}`);
  if (linkedTo) lines.push(`linked_to: ${linkedTo}`);
  if (scope === "agent" && Array.isArray(skills) && skills.length > 0) {
    const primary = skill || skills[0];
    lines.push(`skill: ${primary}  ← punto de partida sugerido, NO un límite`);
    lines.push(`Este es un hilo AMPLIO de tu dominio (${requestedAgent}). Puedes usar CUALQUIERA de tus skills en este MISMO hilo, sin abrir otro: ${skills.join(", ")}. Si el usuario pide algo que es tuyo (p.ej. una plantilla de outreach), cámbiate de skill y hazlo. NUNCA digas "no tengo esa skill" si está en tu set. Si de verdad es de otro agente (contenido, ads, datos), dilo y sugiere abrir su hilo.`);
  } else if (skill) {
    lines.push(`skill: ${skill}`);
  }
  if (requestedAgent && requestedAgent !== "sancho") lines.push(`requested_agent: ${requestedAgent}`);
  lines.push(`IMPORTANT: You are responding via MC Chat, NOT Discord. Do NOT use the message tool to reply. Just respond with text directly — your reply will be delivered to the user automatically via the MC Chat callback. Do NOT create Discord threads or send Discord messages for this conversation. Read files from disk (brand/${slug}/), never via HTTP/web_fetch to localhost.`);
  lines.push(`⚠️ EXECUTION GUARDRAIL: Aprobar un plan o crear proyectos NO es autorización para ejecutar tareas. Siempre preguntar "¿Ejecuto [tarea específica]?" y esperar confirmación explícita antes de generar deliverables. "Apruebo el plan" y "Ejecuta" son pasos DIFERENTES.`);
  lines.push(...ASK_PROTOCOL_LINES);
  if (requestedAgent === "sancho") {
    lines.push(...DELEGATE_PROTOCOL_LINES);
  }
  lines.push(`[/MC Chat Context]`);
  return lines.join("\n");
}
