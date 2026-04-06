# Learnings Consolidados

## Nunca Hacer (errores con consecuencias graves)

1. **Gateway restart durante webchat** — mata al agente en sesión. Pedir al humano que lo haga desde terminal.
2. **Heredoc con emojis en Python** → surrogates corrompen JSON. Usar siempre `\uXXXX` escapes.
3. **Inventar keys en openclaw.json** — schema estricto. SIEMPRE leer docs antes de editar config.
4. **Regex artesanal para markdown** — siempre librería estándar (marked.js). Cada doc nuevo revela edge cases.
5. **Consolidar prompts que scripts leen enteros** — si `llm_step.py` lee un archivo completo como prompt, NO juntar fases separadas en un solo archivo.
6. **Reinstalar plugins sin parchear primero** — reinstalar un plugin roto reproduce el crash. Flujo: parchear en local → verificar → solo entonces reinstalar.
7. **`plugins.allow` es allowlist EXCLUSIVA** — si la pones, SOLO esos plugins cargan. Discord bundled también se filtra.
8. **Reconnect loops sin kill switch** — siempre poner max retries o backoff exponencial.
9. **No verificar procesos zombie antes de restart** — `ps aux | grep openclaw-gateway` puede mostrar múltiples PIDs. Matar el viejo antes de iniciar uno nuevo.

## Config & Placement

- **Exec permissions**: `tools.exec.security` + `tools.exec.ask`, NO en `agents.defaults.exec` (crashea gateway).
- **Crons**: `openclaw cron add/edit/list`, persisten en `~/.openclaw/cron/jobs.json`. NO editar openclaw.json.
- **Cron delivery**: `delivery.mode: "announce"` + `channel: "last"` falla → usar `mode: none` y publicar explícitamente via message tool.
- **thinkingDefault**: global en `agents.defaults`, no por agente.
- **Discord plugin**: `openclaw plugins enable discord` no persiste entre restarts → usar `config set`.
- **Tailscale**: reset de Funnel borra config de serve → re-verificar `/` y `/mc` tras cambios.
- **Guild faltante en openclaw.json** = error silencioso más común.

## Discord Patterns

- **Thinking tokens** resuelven texto intermedio en canal.
- **thread-create con messageId** del usuario → hilo vinculado.
- **sessions_send** para QA silencioso. **sessions_spawn con thread:true** para trabajo visible.
- **Todos los crons** que publican en Discord: `send` → `thread-create(messageId)` → contenido en hilo.
- **Discord roles** > allowlist por usuario para permisos.
- **curl > urllib.request** para Discord API (urllib da error 1010).

## SOUL.md Design

- **Ejecutable, no punteros**: reglas P0 inline en SOUL.md, no en `workspace-sancho/_system/`.
- **Menos reglas bien escritas > muchas vagas**: de 21 a 11, mejor cumplimiento.
- **NO mandar instrucciones** via sessions_send. Mejorar skills y reglas.

## Calidad & QA

- **Sancho puede mentir sobre herramientas** — dijo "Apify website crawl" sin haberlo ejecutado. Regla de honestidad resuelve esto.
- **Docs tempranos (pre-reglas) son peores** — primeros pilares 50-60 líneas sin QA. Siempre regenerar con QA completo.
- **Checklists de herramientas**: items explícitos por tool (pegar run ID), prohibido completar con fallback genérico.

## Performance & Sub-agentes

- **Sub-agentes Opus para reestructuración masiva son lentos** (8 min para 2/5 archivos). Para tareas mecánicas, hacerlo directamente es más rápido.
- **Sub-agentes CSS rompen cosas** cuando tocan demasiado HTML/JS. Hacer cambios quirúrgicos uno a uno.
- **Gateway SIGTERM mata child processes** — scripts largos: usar `nohup`, `tmux`, o `exec(background:true)` + `process(poll)`.

## Arquitectura

- **Versionado por pilar**: `brand/{slug}/{pilar}/current.md` + `v1.md` + `history.json` + `qa-log.md`.
- **foundation-state.json** por cliente: fuente de verdad para statuses. File watcher en mc-server.js auto-regenera.
- **Aislamiento de contexto**: Daily Pulse filtró info interna a canal de cliente → Regla 0 en SOUL.md de Sancho.

## Hitos del Sistema

| Fecha | Hito |
|-------|------|
| 2026-02-25 | Nacimiento de Cervantes. Separación de Sancho. |
| 2026-02-26 | 14 tareas en sprint nocturno. Comic UI. Discord bindings. |
| 2026-02-27 | SOUL.md 531→99 líneas. 11 reglas cardinales. Aislamiento contexto P0. |
| 2026-02-28 | Intelligence Log. Threading resuelto (thinkingDefault:high). |
| 2026-03-01 | Onboarding 6 min. Tailscale Funnel. Crons en hilos. Supabase multi-tenant. |
| 2026-03-02 | 3 clientes onboarded (Paymatico, SanchoCMO, Growth4U). Foundation v2.0 diseñada. |
| 2026-03-03 | Foundation v2.0 implementada (56 skills, 4 protocolos, MC). T-042 auditoría (57 skills). |
| 2026-03-04 | Consolidación de learnings. Sección Evolución en SOUL.md. |
