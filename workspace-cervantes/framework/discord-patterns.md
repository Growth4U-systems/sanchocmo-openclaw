# Discord Patterns

## Threading

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

## Bindings

- Cada binding mapea un canal Discord a un agente
- Channel overrides en openclaw.json: solo `systemPrompt`, `requireMention`. NO `agent` (schema inválido)
- Discord roles > allowlist por usuario para permisos
