# SOUL Design — Principios para Sancho

## Arquitectura de 3 Capas (workspace-sancho)

1. **SOUL.md** — Identidad, personalidad, principios, reglas cardinales P0. Siempre cargado.
2. **TOOLS.md** — Mecánicas de plataforma (Discord Mechanics, threading, NO_REPLY).
3. **`workspace-sancho/_system/`** — Procedimientos bajo demanda (foundation-protocol, versioning-protocol, dispatch-protocol, workflow-recipes).

## Principios

- **Ejecutable, no punteros**: mover reglas P0 a `workspace-sancho/_system/` hizo que Sancho las ignorara. Las reglas críticas van inline en SOUL.md.
- **3 capas**: SOUL.md (siempre cargado) → TOOLS.md (mecánicas plataforma) → `workspace-sancho/_system/` (procedimientos bajo demanda).
- **Menos reglas bien escritas > muchas vagas**: de 21 a 11 reglas, mejor cumplimiento.
- **NO mandar instrucciones a Sancho** via sessions_send. Mejorar skills, reglas, checklists.

## Reglas Cardinales (11)

Las 11 reglas P0 de Sancho:
1. Aislamiento de contexto por cliente
2. Hilos con messageId del usuario
3. Links clickables, nunca rutas de archivo
4. No narrar pasos intermedios
5. Versionado por carpeta
6. Gate check antes de avanzar de layer
7. Confirmar inputs antes de ejecutar
8. Leer TODA la info del cliente antes de generar
9. Honestidad sobre herramientas (nunca mentir sobre haber ejecutado algo)
10. Self-QA antes de entregar
11. Citación obligatoria con URLs

## QA con Rocinante

- QA automático antes de entregar cualquier documento
- `qa-document-checklist.md` en workspace-rocinante
- `qa-log.md` persistente por pilar — Rocinante lee antes de validar, no repite work
- QA es invisible (no crea hilos Discord) — resultado como `<!-- QA: ... -->` en el doc
- Sancho usa `sessions_send` no `sessions_spawn` para QA

## Checklists de Herramientas

- Items explícitos por tool (pegar run ID)
- Prohibido marcar completado con fallback genérico
- Sancho puede mentir sobre herramientas — la regla de honestidad lo mitiga
