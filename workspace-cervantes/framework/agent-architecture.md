# Agent Architecture

## Misión Core

Hacer que Sancho sea el mejor Fractional CMO AI del mundo.

Cervantes no es developer de Sancho — es su creador. La diferencia: no solo codifica, observa lo que hace, identifica mejoras, propone cambios proactivamente.

**NO manda instrucciones a Sancho** via mensajes ad-hoc. Las mejoras van en SOUL.md, TOOLS.md, skills, checklists.

- Tareas de sistema = Cervantes
- Tareas de cliente = del Sancho de ese cliente

## Agentes

| Agente | Emoji | Rol | Modelo | Canal |
|--------|-------|-----|--------|-------|
| **Cervantes** | ✒️ | Arquitecto/Creador | Opus 4.6 | Webchat (default) |
| **Sancho** | 🐴 | CMO Estratega / Orquestador | Opus 4.6 (thinking: high) | Discord (todos los canales, default agent) |
| **Rocinante** | 🐎 | QA/Brand Guardian | Sonnet 4.5 | Especialista, vía `Agent(subagent_type="rocinante")` |

### Equipo de especialistas

Sancho ya no spawnea un "Escudero" genérico con personas. Delega cada tipo de tarea al especialista dueño vía `Agent(subagent_type="<slug>")`:

| Especialista | Slug | Dominio |
|--------------|------|---------|
| **Dulcinea** | `dulcinea` | Contenido / SEO / newsletters / copy de landing |
| **Rocinante** | `rocinante` | QA, brand guardian, GTM-OS/YALC |
| **Hamete** | `hamete` | Research y market intelligence |
| **Merlín** | `merlin` | CRM / datos / integraciones de métricas |
| **Maese Pedro** | `maese-pedro` | Creatividad visual |
| **Mambrino** | `mambrino` | Paid ads |
| **Sansón** | `sanson` | Verificación / devil's advocate |
| **Alarife** | `alarife` | Web / páginas (Payload CMS) |
| **Cervantes** | `cervantes` | Sistema / infraestructura |

## Routing

- **Cervantes** → Webchat + #admin
- **Sancho** → Default (todo Discord); orquesta y delega a los especialistas
- **Especialistas** (Dulcinea, Hamete, Rocinante, Merlín, Maese Pedro, Mambrino, Sansón, Alarife) → invocados por Sancho vía `Agent(subagent_type="<slug>")`

## Interacciones

- Cervantes **observa** a Sancho y **extrae insights** para mejorarlo
- Cervantes **edita** el workspace de Sancho (skills, SOUL.md, config)
- Cervantes **crea** nuevos Sanchos para nuevos clientes
- Sancho **NUNCA** toca a Cervantes
- Rocinante recibe documentos para QA vía `Agent(subagent_type="rocinante")` — resultado como `<!-- QA: ... -->` en el doc
- Los especialistas reciben tareas de ejecución vía `Agent(subagent_type="<slug>")` (p.ej. Dulcinea para contenido, Maese Pedro para visuales)

## Modelo de Costes

| Tier | Modelo | Coste (MTok in/out) | Uso |
|------|--------|---------------------|-----|
| T1 | Opus 4.6 | $15/$75 | Razonamiento complejo, estrategia, código |
| T2 | Sonnet 4.5 | $3/$15 | Especialistas: ejecución con contexto, escritura, QA |
| T3 | Haiku 4.5 | $0.80/$4 | Tareas simples, clasificación (crons/heartbeats) |
| T4 | MiniMax | $0.30/$1.10 | Traducción, formato, extracción |
