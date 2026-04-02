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

CONTEXTO DE MARCA:
- PRIMERO lee ./brand/{slug}/foundation-state.json → usa brand_summary + file_index para resolver paths
- Luego lee los archivos específicos:
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
- **SIEMPRE** incluye `brand/{slug}/foundation-state.json` en el contexto — contiene `brand_summary` y `file_index` para resolver paths a cualquier archivo
- Lee `context_required` del skill que va a ejecutar
- Pasa esos archivos como contexto al Escudero (resolviéndolos desde `file_index` cuando sea posible)
- NUNCA pases todo `./brand/` — solo lo que el skill necesita
- Si el Escudero crea archivos nuevos, debe actualizar `file_index` en foundation-state.json

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

## Progress Updates (obligatorio en tareas >2 min)

Toda tarea que dure más de ~2 minutos DEBE incluir progress updates en el hilo de Discord.

**Cadencia**: ~5 minutos (configurable por cliente/tarea).

### Para Escudero (spawn)

Añadir al final de CADA spawn prompt:

```
⚠️ PROGRESS UPDATES — REGLA HARD (NO OPCIONAL):
- Cuenta tus tool calls (web_search, web_fetch, read, write, etc.)
- Después de CADA 3 tool calls, PARA y envía update al hilo:
  message(action=send, channel=discord, target="<thread_id>", message="🔄 **Update (X/Y)**: [qué llevas] → [qué sigue] → ETA: ~Z min")
- NO hagas más de 3 tool calls seguidos sin enviar update. MÁXIMO 3.
- Primer update: después de los primeros 3 tool calls.
- Update final: "✅ **Completado**: [resumen de 1 línea]"
- Si no envías updates, el usuario asume que estás muerto. COMUNICA.
```

### Para Sancho (tareas propias largas)

Cuando ejecutes deep research, Foundation pillars, o cualquier tarea >2 min:
- Cuenta tus tool calls. Después de CADA 3 tool calls, PARA y envía update al hilo.
- Formato: `🔄 **Update (X/Y)**: progreso → siguiente → ETA`
- Usa `message(action=send)` para updates — NO texto entre tool calls (regla Discord).
- MÁXIMO 3 tool calls seguidos sin update. Sin excepciones.

### Ejemplo real

```
🔄 **Update (3/10 fuentes)**: 3 búsquedas completadas — datos de TAM y 2 competidores. Siguiente: scraping de reviews. ETA: ~8 min.

🔄 **Update (7/10 fuentes)**: 7 fuentes procesadas. Compilando documento. ETA: ~3 min.

✅ **Completado**: Deep research de mercado capilar — 14 fuentes, 8.500 palabras. Doc listo en el hilo.
```

---

## Subagent Completion Handling (OBLIGATORIO)

Cuando recibes un `[Internal task completion event]` de un subagente:

### Regla cardinal: NUNCA responder solo NO_REPLY a un completion event.

**Protocolo para cada completion event:**

1. **Actualizar estado** — `foundation-state.json` o tracking relevante (status → pending-review/completed)
2. **Verificar si hay más tareas pendientes del mismo batch** — Si hay N tareas lanzadas en paralelo, trackear cuántas han terminado.
3. **Cuando TODAS las tareas del batch terminen:**
   - **Postear resumen consolidado** al hilo de Discord del usuario (NO al canal principal)
   - **Incluir**: qué se completó, links a los docs (URLs de MC, no rutas), hallazgos clave (3-5 bullets por análisis)
   - **Pedir acción**: review/aprobación del usuario para avanzar al siguiente paso
   - **Indicar next step**: qué pilar/tarea sigue en el DAG
4. **Si solo UNA tarea del batch terminó y faltan otras:**
   - Actualizar estado silenciosamente (NO_REPLY está OK aquí)
   - PERO si la última tarea lleva >10 min sin completar, enviar update parcial al hilo

### Tracking de batches

Al lanzar N Escuderos en paralelo, crear tracker temporal:
```json
// En foundation-state.json o inline en el dispatch
{
  "batch_id": "uuid",
  "thread_id": "discord_thread_id",
  "tasks": ["market-analysis", "competitor-analysis", "self-analysis"],
  "completed": [],
  "all_done_action": "post-consolidated-summary-and-request-review"
}
```

Cuando `completed.length === tasks.length` → ejecutar `all_done_action`.

### Ejemplo correcto

```
# Recibo completion de self-analysis (1/3 del batch)
→ Actualizar state → NO_REPLY (esperando las otras 2)

# Recibo completion de competitor-analysis (2/3)
→ Actualizar state → NO_REPLY (falta 1)

# Recibo completion de market-analysis (3/3 — ÚLTIMO)
→ Actualizar state
→ Postear al hilo: "✅ Los 3 análisis están completos. Resúmenes: [...]"
→ Pedir review: "Alex, revisa y confirma para avanzar al SWOT"
→ Indicar next step
```

### Thread por pilar (Foundation)

Cuando un pilar de Foundation se completa, CREAR un hilo dedicado en #onboarding:

```
# 1. Crear hilo en #onboarding
message(action=thread-create, channel=discord, channelId="<onboarding_channel>", threadName="📊 Market Analysis — {Cliente}")

# 2. Publicar resumen ejecutivo (formato del foundation-orchestrator)
message(action=send, channel=discord, target="<thread_id>", message="───\n📊 MARKET ANALYSIS\n───\n• bullet 1\n• bullet 2\n📄 Doc: <url>\n───\n¿Correcto? ¿Cambios?")
```

**Un hilo por pilar.** No mezclar pilares en un solo hilo. No dumpar todo en el hilo de onboarding.

### Anti-patrón (lo que pasó y NO debe repetirse)

```
# ❌ MAL — Recibo completion, actualizo JSON, respondo NO_REPLY en TODOS
# El usuario ve "Session ended" en los hilos de Escudero y nada más
# El flujo se detiene completamente

# ❌ MAL — Dumpar los 3 resúmenes en un solo mensaje en el hilo existente
# El usuario no puede revisar/aprobar cada pilar individualmente
```

---

## Reglas

1. **Un spawn por tarea.** No mezclar tareas en un solo Escudero.
2. **Context Matrix.** Pasar SOLO los archivos que el skill necesita.
3. **Persona obligatoria.** Todo Escudero recibe un persona profile.
4. **QA antes de publicar.** Contenido importante pasa por Rocinante.
5. **Trackear en TASKS.md.** Todo dispatch genera o referencia una tarea.
6. **Progress updates.** Toda tarea >2 min incluye updates cada ~5 min (ver sección arriba).
7. **Cron safety net.** Al spawnar tarea larga, activar cron `progress-update-steer` (ID: `bf4b712d-1ed4-49df-acac-1c7ce4d19097`):
   - Activar: `cron(action=update, jobId="bf4b712d-1ed4-49df-acac-1c7ce4d19097", patch={enabled: true})`
   - El cron usa Haiku (barato) cada 5 min para steer sub-agentes activos
   - Se auto-desactiva cuando detecta 0 sub-agentes activos
