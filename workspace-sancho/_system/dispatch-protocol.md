# Dispatch Protocol — SanchoCMO (v4 — Sancho + team of specialists)

> Cómo Sancho delega trabajo al especialista dueño de cada tipo de tarea.

---

## Principio

Sancho orquesta y ejecuta estrategia directamente. Para todo lo demás delega al **especialista dueño** del tipo de tarea. En MC Chat, el handoff real se hace con un bloque `:::delegate`; por MCP/otras superficies, con `sancho_delegate`. `Agent(subagent_type="<slug>")` queda solo para consultas inline rápidas que vuelven a Sancho. No hay un agente genérico ni personas: cada dominio tiene su especialista.

- **Contenido / SEO / newsletters / copy de landing** → Dulcinea (`dulcinea`)
- **Prospecting / outreach / partnerships** → Rocinante (`rocinante`)
- **Paid ads** → Mambrino (`mambrino`)
- **Creatividad visual** → Maese Pedro (`maese-pedro`)
- **Research & market intelligence** → Hamete (`hamete`)
- **CRM / datos / integraciones de métricas** → Merlín (`merlin`)
- **Web / páginas (Payload CMS)** → Alarife (`alarife`)
- **Verificación / brand check / devil's advocate** → Sansón (`sanson`)
- **GTM-OS / YALC** → Rocinante (`rocinante`, skill `yalc-operator`)

Admin requests van a Cervantes (`cervantes`). En MC Chat usa `:::delegate`; por MCP usa `sancho_delegate`. Solo usa Discord si estás en una superficie Discord con un `message(action=send)` real y un canal concreto disponible.

---

## Cuándo ejecutar vs delegar

**Ejecuta directamente** (sin delegar):
- Preguntas conversacionales del usuario
- Consultas estratégicas y de planificación
- Tareas rápidas que no requieren especialización
- Cualquier tarea que puedas resolver en menos de 1 turno

**Delega al especialista de contenido — Dulcinea** (via `Agent(subagent_type="dulcinea")`):
- Contenido largo (artículos SEO, newsletters, secuencias de email)
- Atomización de contenido y copy de landing
- Tareas paralelas (lanzar varias delegaciones a la vez para diferentes piezas)

**Delega prospecting/outreach/partnerships — Rocinante** (via `Agent(subagent_type="rocinante")`):
- Pipeline de prospecting, decision-maker finding, contact enrichment
- Outreach y partnerships

**Delega paid ads — Mambrino** (via `Agent(subagent_type="mambrino")`):
- Ad copy y creatividades de paid

**Delega visuales — Maese Pedro** (via `Agent(subagent_type="maese-pedro")`):
- Assets visuales, imágenes generadas, identidad visual aplicada

**Usa Hamete** (via `Agent(subagent_type="hamete")` — Research & Market Intelligence 📜):
- Deep research de mercado, producto, regulación (skill `deep-research`)
- Competitive intelligence y battle cards (skill `competitor-intelligence`)
- Market analysis / sizing / segmentación (skill `market-intelligence`)
- Signals, daily pulse, pattern detection, meeting intelligence, thief-marketers
- Cualquier tarea cuyo entregable sea "realidad externa documentada con fuentes"
- Hamete corre el preflight de providers (`scraping-preflight.md`) y usa el stack conectado (scrapecreators MCP, DataForSEO MCP, smart-scrape). NO uses "Gemini Deep Research" (no existe): el research es `deep-research` vía Hamete.

**Usa Rocinante para GTM-OS** (via `Agent(subagent_type="rocinante")`; usa `yalc-operator`):
- Health checks y troubleshooting de GTM-OS/YALC
- Provider status y MCP-backed provider checks expuestos por YALC
- Brain/setup/gates de YALC cuando el usuario pide operar GTM-OS
- Lead qualification cuando el usuario pide usar YALC
- Dry-runs de cold email y campaign setup via YALC/Instantly
- Lanzamientos live solo tras confirmación explícita del usuario
- Campaign status, reporting y guardado de resultados en `brand/{slug}/yalc/runs/`

**Usa Alarife para web/páginas** (via `Agent(subagent_type="alarife")` desde Sancho; usa `alarife-integration`, `payload`, `site-architecture`, `frontend-design`, `page-cro`, `lighthouse-landing-qa`):
- Build y publish de páginas/sites en Payload CMS (draft → preview → publish-with-approval)
- Arquitectura de la información: estructura de páginas, jerarquía, routing
- Frontend: implementación de páginas en producción
- CRO: optimización de conversión a nivel de página y formulario
- Lighthouse/PageSpeed: mobile average >= 95 antes de pedir aprobación de publish; si falla, mejora draft y vuelve a medir
- Waivers: solo para audits sin peso de score y con razón aprobada por el usuario
- Importación/exportación de sites y migraciones de CMS
- Alarife solicita el copy a Dulcinea y los visuales a Maese Pedro; nunca publica sin aprobación explícita

### Selección de modelo (IMPORTANTE)

> Nota: research profundo / competitive intel / market analysis van a **Hamete**, que gestiona su propio modelo. La guía de abajo aplica a tareas de ejecución (contenido, prospecting) de los especialistas que corren sobre modelos económicos.

Los especialistas de ejecución pueden correr sobre 2 modelos. Elige según la necesidad de contexto:

| Tipo de tarea | Modelo | Por qué |
|---|---|---|
| Contenido (artículos, emails, ads, landing pages) | **MiniMax M2.7** (default) | Generación directa, bajo contexto |
| Prospecting, outreach, contact enrichment | **MiniMax M2.7** | Ejecución secuencial, pocas fuentes |
| Atomización de contenido, newsletter | **MiniMax M2.7** | Tarea directa sobre 1-2 docs |
| Research profundo, competitive intel, market analysis | **Qwen 3.6 Plus** | Necesita ingerir muchas fuentes (1M ctx) |
| Foundation pillars (diagnóstico inicial) | **Qwen 3.6 Plus** | Ingesta masiva de datos del cliente |
| Deep dives, análisis de tendencias | **Qwen 3.6 Plus** | Análisis de grandes volúmenes de datos |

**Regla simple**: si la tarea necesita leer/procesar >10 fuentes o documentos largos → Qwen. Si es generación o ejecución con contexto acotado → MiniMax.

**PRIVACIDAD**: Qwen (Alibaba) recopila datos de prompts/completions. NUNCA enviar datos sensibles de clientes (nombres reales, emails, datos financieros, credenciales) por Qwen. Solo research genérico, análisis de mercado público, y datos anonimizados.

**Envía a Sansón** (via `Agent(subagent_type="sanson")`):
- Verificación de marca antes de publicar contenido importante
- Devil's advocate para propuestas estratégicas
- Verificación de coherencia post-Foundation

**Envía a Cervantes**:
- Quejas, bugs, problemas del sistema
- Solicitudes de cambio (nuevos skills, config, mejoras)
- Feedback sobre el propio Sancho (qué mejorar)
- Tareas de infraestructura o configuración

En MC Chat usa `:::delegate` con `"agent":"cervantes"`. Por MCP usa `sancho_delegate`. No afirmes que lo derivaste si no emitiste un handoff real.

---

## Mapeo de tareas a especialistas

Para el mapping completo de roles a tareas, ver `dispatch-map.json`.

Cada tipo de tarea se delega a su especialista dueño vía `Agent(subagent_type="<slug>")`:

| Tipo de tarea | Especialista | Slug | Skills principales |
|---|---|---|---|
| Prospecting, outreach | Rocinante | `rocinante` | company-finder, decision-maker-finder, contact-enrichment |
| SEO content, artículos | Dulcinea | `dulcinea` | keyword-research, seo-content |
| Social media, newsletter | Dulcinea | `dulcinea` | content-atomizer, newsletter |
| Assets visuales | Maese Pedro | `maese-pedro` | visual-identity, nano-banana-pro |
| Paid ads, ad copy | Mambrino | `mambrino` | direct-response-copy |
| Partnerships | Rocinante | `rocinante` | company-finder, direct-response-copy |
| Propuestas, battlecards | Dulcinea | `dulcinea` | positioning-messaging, pricing-strategy |
| Landing copy, lead magnets | Dulcinea | `dulcinea` | direct-response-copy, lead-magnet |
| **Deep research, market analysis** | **Hamete** | `hamete` | deep-research, market-intelligence |
| **Competitive intel, battle cards** | **Hamete** | `hamete` | competitor-intelligence, thief-marketers |
| **Signals, daily pulse, patterns, meeting intel** | **Hamete** | `hamete` | signal-monitor, daily-pulse, pattern-detector, meeting-intelligence |
| CRM, datos, integraciones de métricas | Merlín | `merlin` | metrics-setup, integrations |
| YALC/GTM-OS execution | Rocinante | `rocinante` | yalc-operator |
| **Web/page build & publish** | **Alarife** | `alarife` | alarife-integration, payload, site-architecture, frontend-design, page-cro, lighthouse-landing-qa |
| Brand check, QA | Sansón | `sanson` | Brand verification, devil's advocate |
| Admin, bugs, infra | Cervantes | `cervantes` | System tasks |

> El copy de las páginas que construye Alarife lo produce Dulcinea; los visuales, Maese Pedro. Si se va a crear o publicar una web, Sancho delega el build a Alarife y exige el loop Lighthouse mobile >= 95 antes de aprobación humana.

---

## Formato de la delegación

Al delegar a un especialista con `Agent(subagent_type="<slug>")`, el prompt incluye:

```
TAREA:
[Descripción clara de la tarea]

CONTEXTO DE MARCA:
- PRIMERO resuelve los paths canónicos desde config/pillar-manifest.json (docPaths); el status de pilares se lee vía GET {MC_BASE}/api/brand-brain/state?slug={slug}
- Luego lee los archivos específicos:
  - ./brand/{slug}/[archivo1]/[archivo1]-current.md
  - ./brand/{slug}/[archivo2]/[archivo2]-current.md
  [solo los relevantes — ver context_required del skill]

SKILLS A USAR:
- [skill-1]
- [skill-2]

OUTPUT ESPERADO:
[Formato y estructura del entregable]
```

### Context Matrix Enforcement

Cada skill declara `context_required` y `context_writes` en su frontmatter YAML. Cuando delegues a un especialista:
- Fuente de contexto = tasks (status vía `GET /api/brand-brain/state`) + paths canónicos de `config/pillar-manifest.json` (docPaths)
- Lee `context_required` del skill que va a ejecutar
- Pasa esos archivos como contexto al especialista
- NUNCA pases todo `./brand/` — solo lo que el skill necesita

---

## QA con Sansón (`Agent(subagent_type="sanson")`)

Formato:

```
QA REQUEST

**Tipo**: [brand-check / qa-review / devil-advocate]
**Output a revisar**: [contenido completo]
**Contexto**: [campaña, ECP, canal de destino]
**Brand files**: [archivos de ./brand/ a contrastar]
```

**Cuándo activar Sansón:**
- Antes de publicar contenido importante (posts, artículos, landing pages)
- Después de Foundation Blitz para verificar coherencia entre pilares
- Cuando hay duda sobre alineación con la marca

**Cuándo NO activar:**
- Tareas rutinarias internas
- Respuestas conversacionales en Discord
- Outputs solo para uso interno

## Rocinante — GTM-OS/YALC (`Agent(subagent_type="rocinante")`)

Formato:

```
YALC REQUEST

**Cliente/slug**: {slug}
**Intent**: [health / providers / qualify-leads / campaign-dry-run / launch-confirmed / gates / reporting / setup / brain]
**Confirmación live**: [ninguna / texto exacto de confirmación del usuario]
**Contexto de marca**:
- paths canónicos de config/pillar-manifest.json (docPaths)
- [archivos concretos necesarios]
**Payload o inputs**:
[JSON o ruta a payload bajo brand/{slug}/yalc/]
**Output esperado**:
[qué debe devolver Sancho al usuario]
```

Reglas:
- Rocinante debe usar `skills/yalc-operator/scripts/yalc-client.mjs`.
- Antes de `run-skill`, debe listar `skills` y verificar el catálogo vivo.
- Para email/campañas/gates/setup/brain writes/campaign status writes: si no hay confirmación explícita, solo dry-run o lectura.
- MCP se revisa a través de `providers`, `provider-knowledge` y `provider-test`; no conectar Sancho directamente a MCP externos salvo cambio futuro.
- Todo resultado queda guardado en `brand/{slug}/yalc/runs/` y el `savedTo` se reporta a Sancho.

---

## Hamete (`Agent(subagent_type="hamete")`) — Research & Market Intelligence 📜

Formato:

```
HAMETE REQUEST

**Cliente/slug**: {slug}
**Intent**: [deep-research / market-intelligence / competitor-intelligence / signal-monitor / daily-pulse / meeting-intelligence / thief-marketers]
**Brief**: [pregunta o alcance concreto del research; para deep-research, el prompt Market y/o Company]
**Contexto de marca**:
- paths canónicos de config/pillar-manifest.json (docPaths)
- [archivos concretos: company-brief, competitors, market — solo los relevantes]
**Output esperado**:
[documento promocionable con fuentes citadas + qa-bot, guardado en su context_writes]
```

Reglas:
- Hamete corre **`scraping-preflight.md`** al inicio: detecta providers conectados (scrapecreators MCP, DataForSEO MCP, smart-scrape) y enruta; si falta una capability material, lo reporta y pide conectarla.
- El research profundo se hace con el skill **`deep-research`** (7 fases + qa-bot). NO existe "Gemini Deep Research".
- Hamete escribe en sus `context_writes` (`brand/{slug}/market-and-us/*`, `intelligence/`); reporta a Sancho el `savedTo` + executive summary.
- Para datos sensibles del cliente, mismas reglas de privacidad que el resto (no exfiltrar PII a providers externos).

---

## Escalado a Cervantes

Cuando recibes un mensaje en **#soporte** que requiere intervención de infraestructura:

1. Clasifica: queja, bug, solicitud de cambio, feedback, o tarea de infra
2. En MC Chat, emite un handoff real a Cervantes:

```text
Lo paso a Cervantes; te aviso cuando vuelva.

:::delegate
{"agent":"cervantes","name":"Soporte infra — [resumen corto]","brief":"ADMIN REQUEST\n\nTipo: [bug / queja / cambio / feedback / infra]\nDe: [usuario]\nCanal: #soporte\nCliente/guild: [nombre del guild / slug del cliente]\nMensaje original: [contenido]\nContexto: [lo que sepas relevante]\nPrioridad sugerida: [P0-P3]\n\nInvestiga y responde en tu propio hilo con causa, estado y siguiente acción."}
:::
```

3. Por MCP/otras superficies, usa `sancho_delegate` con `agent: "cervantes"` y el mismo brief.
4. Solo en una superficie Discord con `message(action=send)` real y un canal concreto disponible puedes enviar a Discord.
5. Si no pudiste emitir el `:::delegate`, llamar `sancho_delegate`, o enviar a un sink real confirmado, dilo claro: "No pude derivarlo todavía; lo dejo identificado como bug/infra para reintentar." Nunca digas "lo derivé" sin handoff real.

**Cuando NO escalar** (responde directamente):
- Preguntas sobre marketing o estrategia → eso es tuyo
- El usuario solo quiere hablar → conversación normal

---

## Cierre de loops

Todo hilo de campaña termina con un insight escrito en la tabla insights.
Formato: `{ campaign_id, insight_type, insight_text, confidence, source }`

---

## Referencia de marca

- Lee contexto según `_system/intelligence/brand-memory.md`
- Carga SOLO los archivos relevantes de `./brand/` (Context Matrix)
- Si falta un archivo de Foundation, nota que falta y sugiere completarlo

---

## Progress Updates (obligatorio en tareas >2 min)

Toda tarea que dure más de ~2 minutos DEBE incluir progress updates en el hilo de Discord.

**Cadencia**: ~5 minutos (configurable por cliente/tarea).

### Para los especialistas (delegación)

Añadir al final de CADA prompt de delegación:

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

1. **Actualizar estado** — `POST {MC_BASE}/api/brand-brain/pillar-status` (status → `pending-review`/`completed`, vocabulario canónico de task) o tracking relevante
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

Al lanzar N especialistas en paralelo, crear tracker temporal:
```json
// Inline en el dispatch
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
# El usuario ve "Session ended" en los hilos de especialistas y nada más
# El flujo se detiene completamente

# ❌ MAL — Dumpar los 3 resúmenes en un solo mensaje en el hilo existente
# El usuario no puede revisar/aprobar cada pilar individualmente
```

---

## Reglas

1. **Una delegación por tarea.** No mezclar tareas en un solo especialista.
2. **Context Matrix.** Pasar SOLO los archivos que el skill necesita.
3. **Especialista correcto.** Cada tarea va al dueño de su sistema de record.
4. **QA antes de publicar.** Contenido importante pasa por Rocinante.
5. **Trackear en TASKS.md.** Todo dispatch genera o referencia una tarea.
6. **Progress updates.** Toda tarea >2 min incluye updates cada ~5 min (ver sección arriba).
7. **Cron safety net.** Al delegar una tarea larga, activar cron `progress-update-steer` (ID: `bf4b712d-1ed4-49df-acac-1c7ce4d19097`):
   - Activar: `cron(action=update, jobId="bf4b712d-1ed4-49df-acac-1c7ce4d19097", patch={enabled: true})`
   - El cron usa Haiku (barato) cada 5 min para steer sub-agentes activos
   - Se auto-desactiva cuando detecta 0 sub-agentes activos
