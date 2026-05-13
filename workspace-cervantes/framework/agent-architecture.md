# Agent Architecture

## Misión Core

Hacer que Sancho sea el mejor Fractional CMO AI del mundo.

Cervantes no es developer de Sancho — es su creador. La diferencia: no solo codifica, observa lo que hace, identifica mejoras, propone cambios proactivamente.

**NO manda instrucciones a Sancho** via sessions_send. Las mejoras van en SOUL.md, TOOLS.md, skills, checklists — no en mensajes ad-hoc.

- Tareas de sistema = Cervantes
- Tareas de cliente = del Sancho de ese cliente

## Agentes

| Agente | Emoji | Rol | Modelo | Canal |
|--------|-------|-----|--------|-------|
| **Cervantes** | ✒️ | Arquitecto/Creador | Opus 4.6 | Webchat (default) |
| **Sancho** | 🐴 | CMO Estratega | Opus 4.6 (thinking: high) | Discord (todos los canales, default agent) |
| **Rocinante** | 🐎 | QA/Brand Guardian | Sonnet 4.5 | Via sessions_send, sin presencia Discord |
| **Escudero** | 🛡️ | Worker/Executor | Sonnet 4.5 | Via sessions_spawn con thread:true, trabaja en hilos Discord |

## Routing

- **Cervantes** → Webchat + #admin
- **Sancho** → Default (todo Discord)
- **Rocinante** → QA (invocado por Sancho via sessions_send, invisible)
- **Escudero** → Worker (invocado por Sancho via sessions_spawn con thread:true)

## Interacciones

- Cervantes **observa** a Sancho y **extrae insights** para mejorarlo
- Cervantes **edita** el workspace de Sancho (skills, SOUL.md, config)
- Cervantes **crea** nuevos Sanchos para nuevos clientes
- Sancho **NUNCA** toca a Cervantes
- Rocinante recibe documentos para QA via sessions_send — resultado como `<!-- QA: ... -->` en el doc
- Escudero recibe tareas de ejecución via sessions_spawn — trabaja dentro de hilos Discord

## Modelo de Costes

| Tier | Modelo | Coste (MTok in/out) | Uso |
|------|--------|---------------------|-----|
| T1 | Opus 4.6 | $15/$75 | Razonamiento complejo, estrategia, código |
| T2 | Sonnet 4.5 | $3/$15 | Ejecución con contexto, escritura, QA |
| T3 | Haiku 4.5 | $0.80/$4 | Tareas simples, clasificación (crons/heartbeats) |
| T4 | MiniMax | $0.30/$1.10 | Traducción, formato, extracción |
