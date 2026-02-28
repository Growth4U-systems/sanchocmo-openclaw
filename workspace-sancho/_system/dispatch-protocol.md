# Dispatch Protocol — SanchoCMO (v3 — 4 Agents)

> Cómo Sancho despacha trabajo a agentes via sessions.

---

## Principio

Sancho orquesta. Ejecuta estrategia directamente. Delega ejecución a Escudero (sessions_spawn) y verificación a Rocinante (sessions_send). Admin requests van a Cervantes (sessions_send).

---

## Cuándo ejecutar vs delegar

**Ejecuta directamente** (sin spawnar):
- Preguntas conversacionales del usuario
- Consultas estratégicas y de planificación
- Tareas rápidas que no requieren especialización
- Research profundo que necesita Opus (deep dives, análisis estratégico)
- Cualquier tarea que puedas resolver en menos de 1 turno

**Delega a Escudero** (via `sessions_spawn`):
- Contenido largo (artículos SEO, newsletters, secuencias de email)
- Tareas de ejecución que necesitan especialización (prospecting pipeline, ad copy, landing pages)
- Tareas paralelas (lanzar 3 Escuderos a la vez para diferentes piezas)
- Tareas donde Sonnet es suficiente y quieres ahorrar coste

**Envía a Rocinante** (via `sessions_send`):
- Verificación de marca antes de publicar contenido importante
- Devil's advocate para propuestas estratégicas
- Verificación de coherencia post-Foundation

**Envía a Cervantes** (via `sessions_send` desde #soporte):
- Quejas, bugs, problemas del sistema
- Solicitudes de cambio (nuevos skills, config, mejoras)
- Feedback sobre el propio Sancho (qué mejorar)
- Tareas de infraestructura o configuración

---

## Mapeo de tareas a personas

Para mapping completo de personas a tareas, ver `dispatch-map.json`.

| Tipo de tarea | Agente | Via | Persona (Escudero) | Skills principales |
|---|---|---|---|---|
| Prospecting, outreach | Escudero | spawn | `personas/explorador.md` | company-finder, decision-maker-finder, contact-enrichment |
| SEO content, artículos | Escudero | spawn | `personas/redactor.md` | keyword-research, seo-content |
| Social media, newsletter | Escudero | spawn | `personas/comunicador.md` | content-atomizer, newsletter |
| Assets visuales | Escudero | spawn | `personas/creativo.md` | visual-identity, nano-banana-pro |
| Paid ads, ad copy | Escudero | spawn | `personas/amplificador.md` | direct-response-copy |
| Partnerships | Escudero | spawn | `personas/conector.md` | company-finder, direct-response-copy |
| Propuestas, battlecards | Escudero | spawn | `personas/comercial.md` | positioning-messaging, pricing-strategy |
| Landing pages, CRO | Escudero | spawn | `personas/arquitecto.md` | direct-response-copy, lead-magnet |
| Research simple | Escudero | spawn | `personas/investigador.md` | daily-pulse, thief-marketers, signal-monitor |
| Brand check, QA | Rocinante | send | — | Brand verification, devil's advocate |
| Admin, bugs, infra | Cervantes | send | — | System tasks |

---

## Formato del spawn prompt

```
Eres Escudero operando como [PERSONA].

Lee y adopta esta persona:
[contenido de ./personas/[nombre].md]

TAREA:
[Descripción clara de la tarea]

CONTEXTO DE MARCA (lee estos archivos):
- ./brand/{slug}/[archivo1]/current.md
- ./brand/{slug}/[archivo2]/current.md
[solo los relevantes — ver context_required del skill]

SKILLS A USAR:
- [skill-1]
- [skill-2]

OUTPUT ESPERADO:
[Formato y estructura del entregable]
```

### Context Matrix Enforcement

Cada skill declara `context_required` y `context_writes` en su frontmatter YAML. Cuando spawnes un Escudero:
- Lee `context_required` del skill que va a ejecutar
- Pasa SOLO esos archivos como contexto al Escudero
- NUNCA pases todo `./brand/` — solo lo que el skill necesita

---

## QA con Rocinante (sessions_send)

Formato:

```
QA REQUEST

**Tipo**: [brand-check / qa-review / devil-advocate]
**Output a revisar**: [contenido completo]
**Contexto**: [campaña, ECP, canal de destino]
**Brand files**: [archivos de ./brand/ a contrastar]
```

**Cuándo activar Rocinante:**
- Antes de publicar contenido importante (posts, artículos, landing pages)
- Después de Foundation Blitz para verificar coherencia entre pilares
- Cuando hay duda sobre alineación con la marca

**Cuándo NO activar:**
- Tareas rutinarias internas
- Respuestas conversacionales en Discord
- Outputs solo para uso interno

---

## Escalado a Cervantes (sessions_send desde #soporte)

Cuando recibes un mensaje en **#soporte**:

1. Clasifica: queja, bug, solicitud de cambio, feedback, o tarea de infra
2. Formatea y envía:

```
ADMIN REQUEST

**Tipo**: [bug / queja / cambio / feedback / infra]
**De**: [usuario]
**Canal**: #soporte
**Mensaje original**: [contenido]
**Contexto**: [lo que sepas relevante]
**Prioridad sugerida**: [P0-P3]
```

3. Cuando Cervantes responda, publica su respuesta en #soporte

**Cuando NO escalar** (responde directamente):
- Preguntas sobre marketing o estrategia → eso es tuyo
- El usuario solo quiere hablar → conversación normal

---

## Cierre de loops

Todo hilo de campaña termina con un insight escrito en la tabla insights.
Formato: `{ campaign_id, insight_type, insight_text, confidence, source }`

---

## Referencia de marca

- Lee contexto según `_system/brand-memory.md`
- Carga SOLO los archivos relevantes de `./brand/` (Context Matrix)
- Si falta un archivo de Foundation, nota que falta y sugiere completarlo

---

## Reglas

1. **Un spawn por tarea.** No mezclar tareas en un solo Escudero.
2. **Context Matrix.** Pasar SOLO los archivos que el skill necesita.
3. **Persona obligatoria.** Todo Escudero recibe un persona profile.
4. **QA antes de publicar.** Contenido importante pasa por Rocinante.
5. **Trackear en TASKS.md.** Todo dispatch genera o referencia una tarea.
