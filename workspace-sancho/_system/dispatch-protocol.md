# Dispatch Protocol — SanchoCMO (v2 — 4 Agents)

> Como Sancho despacha trabajo a agentes via sessions.

## Principio

Sancho orquesta. Ejecuta estrategia directamente. Delega ejecucion a Escudero (sessions_spawn) y verificacion a Rocinante (sessions_send). Admin requests van a Cervantes (sessions_send).

## Mapeo de despacho

| Tipo de tarea | Agente | Via | Persona (Escudero) | Skills principales |
|---|---|---|---|---|
| Prospecting, outreach | Escudero | spawn | `personas/explorador.md` | company-finder, decision-maker-finder, contact-enrichment |
| SEO content, articulos | Escudero | spawn | `personas/redactor.md` | keyword-research, seo-content |
| Social media, newsletter | Escudero | spawn | `personas/comunicador.md` | content-atomizer, newsletter |
| Assets visuales | Escudero | spawn | `personas/creativo.md` | visual-identity, nano-banana-pro |
| Paid ads, ad copy | Escudero | spawn | `personas/amplificador.md` | direct-response-copy |
| Partnerships | Escudero | spawn | `personas/conector.md` | company-finder, direct-response-copy |
| Propuestas, battlecards | Escudero | spawn | `personas/comercial.md` | positioning-messaging, pricing-strategy |
| Landing pages, CRO | Escudero | spawn | `personas/arquitecto.md` | direct-response-copy, lead-magnet |
| Research simple | Escudero | spawn | `personas/investigador.md` | daily-pulse, thief-marketers, signal-monitor |
| Brand check, QA | Rocinante | send | — | Brand verification, devil's advocate |
| Admin, bugs, infra | Cervantes | send | — | System tasks |

## Formato del spawn prompt

Ver SOUL.md → "Despachar trabajo a Escudero" para el template completo.

## Reglas

1. **Un spawn por tarea.** No mezclar tareas en un solo Escudero.
2. **Context Matrix.** Pasar SOLO los archivos de `./brand/` que el skill necesita (ver `_system/skill-communication-protocol.md`).
3. **Persona obligatoria.** Todo Escudero recibe un persona profile que define su comportamiento.
4. **QA antes de publicar.** Contenido importante pasa por Rocinante via sessions_send.
5. **Trackear en TASKS.md.** Todo dispatch genera o referencia una tarea.
