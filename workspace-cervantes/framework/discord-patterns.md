# Discord Patterns

## Threading

### Regla principal: detectar contexto antes de responder

Los metadatos del mensaje incluyen `topic_id` y `thread_label` cuando el mensaje viene de un hilo:

- **Sin `topic_id`** → mensaje viene de un **canal**. Crear hilo nuevo con `thread-create` y responder dentro.
- **Con `topic_id`** → mensaje viene de un **hilo existente**. Responder directamente (el `chat_id` ya apunta al hilo). **NUNCA crear hilo nuevo.**

### Notas técnicas
- **thinkingDefault: high** — razonamiento va a thinking tokens (internos, no se publican). Resuelve el problema de texto intermedio publicándose en canal.
- **thread-create con messageId** del usuario → hilo vinculado al mensaje original (mejor UX que standalone)
- **Escudero en hilos**: sessions_spawn con thread:true → OpenClaw crea hilo, Escudero trabaja dentro
- **Sancho → NO_REPLY**: después de crear hilo + enviar contenido, o después de spawnar Escudero
- **Rocinante sin hilos**: usa sessions_send, no sessions_spawn → no crea hilos (QA es invisible)

## Config Clave

- `agents.defaults.thinkingDefault: high` — global, no por agente. Niveles: off/minimal/low/medium/high/xhigh
- `channels.discord.threadBindings.enabled: true`
- `channels.discord.threadBindings.spawnSubagentSessions: true` — Escudero crea hilos propios
- `spawnSubagentSessions` estaba en `false` para evitar hilos de Rocinante → ahora `true` porque Rocinante usa sessions_send (no spawn)

## systemPrompts por Canal

14 systemPrompts limpios: solo contexto cliente + PATHS + instrucciones de canal (sin HILOS/LINKS repetidos)

## Crons en Discord

Todos los crons que publican en Discord deben usar patrón:
1. `send` → mensaje corto al canal
2. `thread-create(messageId)` → crear hilo desde ese mensaje
3. Contenido completo dentro del hilo

## Continuidad entre hilos (cross-thread context)

### Problema
Los hilos de Discord crean sesiones aisladas en OpenClaw. Cada hilo tiene su propia sesión, separada del canal padre y de otros hilos. Un agente que participa en el hilo A no tiene contexto de lo que pasó en el hilo B, incluso si ambos son del mismo canal.

### Solución: registro de hilos en memory
Mantener un archivo `memory/discord-threads.md` que actúa como índice de continuidad:

- Cada hilo relevante se registra con: thread ID, canal padre, participantes, resumen, decisiones clave y estado
- Secciones separadas por estado: activos / resueltos
- `memory_search` indexa el archivo → permite búsqueda semántica ("fijate el hilo de routing")

### Protocolo
1. **Al crear un hilo** o participar en uno nuevo → registrar entrada en `memory/discord-threads.md`
2. **Cuando hay una decisión importante** → actualizar el resumen/decisiones del hilo
3. **Al resolver un tema** → mover a la sección "resueltos"
4. **Cuando alguien referencia otro hilo** → buscar en el archivo con `memory_search` y recuperar contexto

### Separación framework / instancia
- **Framework** (este archivo): la metodología — por qué se hace, cómo se estructura, el protocolo
- **Instancia** (`memory/discord-threads.md`): los datos concretos — IDs, resúmenes, decisiones de cada hilo real

## Bindings

- Cada binding mapea un canal Discord a un agente
- Channel overrides en openclaw.json: solo `systemPrompt`, `requireMention`. NO `agent` (schema inválido)
- Discord roles > allowlist por usuario para permisos
