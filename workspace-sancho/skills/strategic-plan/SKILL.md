---
name: strategic-plan
description: "Post-Foundation strategic plan: analyzes current state (web, tools, channels, content), defines objectives, detects gaps, selects channels and GTM strategies, and generates a prioritized action plan with campaigns. Runs AFTER Foundation is complete. Replaces gtm-orchestrator. Use when: Foundation approved and client needs 'what do we do now?', or when re-evaluating strategy quarterly. Triggers: strategic plan, qué hacemos ahora, plan de acción, post-foundation, next steps, plan estratégico, qué canales, cómo crecemos. NOT for: Foundation (use foundation-orchestrator), individual campaign execution (use execution skills directly), or initial onboarding (use sancho-start/phase-0-diagnostic)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Plan
  depends_on: foundation-orchestrator
  chains_to: channel-prioritization, execution-skills
  context_required:
    - brand/{slug}/foundation-state.json
    - brand/{slug}/company-brief/current.md
    - brand/{slug}/go-to-market/ecps/current.md
    - brand/{slug}/go-to-market/positioning/*/current.md
    - brand/{slug}/market-and-us/competitors/current.md
    - brand/{slug}/market-and-us/self/current.md
    - brand/{slug}/brand-voice/current.md
  context_writes:
    - brand/{slug}/strategic-plan.md
    - brand/{slug}/current-state.md
    - brand/{slug}/go-to-market/channel-plan.md
---

# Strategic Plan — De Foundation a Acción

> Foundation = QUIÉN eres, A QUIÉN sirves, QUÉ dices. Este skill = QUÉ HACER, EN QUÉ ORDEN, CON QUÉ.

## Gate Check

```
if foundation-state.json NOT exists OR status != "approved":
    STOP → "Foundation incompleta. Completa Foundation primero."
```

Mínimo: company-brief + ECPs + positioning + competitors + self-intelligence + brand-voice.

---

## Mode Detection

```
if brand/{slug}/strategic-plan/current.md NOT exists:
    → MODE = INIT (pipeline completo, 8 pasos)
else:
    → MODE = UPDATE (operación sobre plan existente)
```

---

## Mode UPDATE — Operación sobre plan existente

Leer `strategic-plan/current.md` + `projects/registry.json`.

Detectar intención del usuario:

| Intención | Acción |
|-----------|--------|
| "Nuevo proyecto" / "Quiero hacer X" / intelligence sugiere | → **Nuevo proyecto** |
| "Añade tarea a P01" | → **Nueva tarea** en proyecto existente |
| "Crea los proyectos" / "Crea los hilos" / "Monta los proyectos en Discord" | → **Crear hilos Discord** (Fase 2 de "Al aprobar el plan") |
| "P01 está terminado" / todas las tareas completed | → **Value review** |
| "Nuevos objetivos" / "Siguiente ciclo" | → **Nuevo ciclo** (versionar plan, crear nuevo) |

### Crear hilos Discord

Si `registry.json` + tasks.json existen PERO no tienen `discord_thread_id`:

1. Leer `_system/project-threads-protocol.md`
2. Resolver channel IDs desde `brand/{slug}/discord-channels.json` (o crear con channel-list)
3. Ejecutar Fase 2 de "Al aprobar el plan" — crear hilos proyecto por proyecto
4. **IMPORTANTE:** Usar `thread-create` para CADA proyecto y CADA tarea. NUNCA mensajes planos.

### Nuevo proyecto

1. Leer `strategic-plan/current.md` — objetivos y canales actuales
2. Evaluar alineación:
   - **SÍ** → "Encaja con el plan. Lo creo como P{XX}."
   - **PARCIAL** → "Tiene sentido pero tienes P{XX} abiertos. ¿Primero terminar esos?"
   - **NO** → "No está en el plan. Si quieres lo añadimos, pero implica desviar foco de [objetivos actuales]."
3. Esperar confirmación del usuario
4. Crear `projects/P{XX}-{slug}/project.json` + `tasks.json`
5. Actualizar `registry.json` + `strategic-plan/current.md` (añadir a proyectos activos)
6. Crear hilo en `#projects`: `[P{XX}] Nombre`
7. Crear hilos de tareas en canales temáticos

### Nueva tarea

1. Leer `projects/P{XX}/tasks.json`
2. Añadir tarea con ID secuencial, canal asignado
3. Crear hilo en canal temático: `[P{XX}-T{YY}] Nombre`

### Value review

1. Leer `project.json` — objetivo, métricas baseline/target
2. Obtener métricas actuales (analytics, preguntar al usuario, o inferir de outputs)
3. Generar `value-review.md` — cumplido sí/no/parcial, antes/después, learnings
4. Marcar proyecto como `reviewed` en `registry.json`
5. Si learnings sugieren nuevo proyecto → proponer (vuelve a "Nuevo proyecto")

### Nuevo ciclo

1. Copiar `strategic-plan/current.md` → `strategic-plan/v{X}.md`
2. Actualizar `history.json`
3. Ejecutar pipeline INIT con nuevos objetivos (reutiliza Foundation + datos acumulados)

---

## Mode INIT — Pipeline completo: 8 Pasos

### Paso 1: Cargar Foundation (~2 min)

Leer TODOS los docs de Foundation. No preguntar nada. Extraer:

- company-brief → negocio, etapa, equipo, presupuesto, stack
- ecps → dolores, perfiles, dónde pasan tiempo, cómo descubren
- positioning → UVP, USPs, ángulos por ECP, objeciones
- competitors → battle cards, canales que usan, debilidades
- self-intelligence → fortalezas, debilidades, reviews, presencia digital
- brand-voice → tono, vocabulario
- budget/stack → recursos disponibles

Si `phase-0-diagnostic` se ejecutó → leer sus scores como contexto.

---

### Paso 2: Consolidar Estado Actual (~3 min)

Foundation ya investigó la mayoría: `self-intelligence` tiene presencia digital, canales, reviews. `company-brief` tiene stack y equipo. **NO re-scrapear lo que ya existe.**

Leer `self-intelligence` + `company-brief` + `stack.md` y extraer:
1. **Destino de conversión** — ¿dónde se envía al cliente? (web/app/formulario/agenda/no existe). Si no está claro en Foundation → preguntar en Paso 3.
2. **Canales activos** — de self-intelligence (ya analizados).
3. **Herramientas** — de company-brief/stack.md.
4. **Contenido existente** — de self-intelligence (blog, casos de éxito, assets).

**Solo scrapear con web_fetch si:**
- Foundation tiene >30 días y cosas pueden haber cambiado
- El destino de conversión no está documentado
- Hay canales nuevos no cubiertos en self-intelligence

Si `current-state.md` ya existe → leerlo y validar. Si no → generarlo con datos de Foundation + lo nuevo que falte. Ver template en [references/current-state-checklist.md](references/current-state-checklist.md).

---

### Paso 3: Preguntas al Usuario (~3 min)

**Máximo 3 preguntas.** Primero presentar resumen del paso 2 para validación.

Preguntas obligatorias:
1. **Objetivo principal**: Awareness / Lead Gen / Conversión / Autoridad / Retención / Expansión / Comunidad
2. **Horizonte temporal**: Corto (1-3m) / Medio (3-6m) / Largo (6-12m)
3. **¿Qué probaste que NO funcionó?**

**ESPERAR respuesta antes de continuar.**

---

### Paso 4: Detectar Gaps (~2 min)

Cruzar Foundation + estado actual + objetivo → listar qué FALTA:

- 🔴 **Crítico** (resolver ANTES de ejecutar): sin destino de conversión, sin analytics
- 🟡 **Alto** (resolver en paralelo): sin blog/CMS, sin email tool, sin casos de éxito
- 🟢 **Bajo** (resolver cuando convenga): sin social scheduling, sin CRM completo

Gaps 🔴 bloquean ejecución. Incluirlos como Fase 0 del plan.

---

### Paso 5: Priorizar Canales (~3 min)

- Si `channel-plan.md` existe → leerlo, validar vigencia con datos del paso 2.
- Si no existe → ejecutar `channel-prioritization` como sub-paso.

Cruzar canales con gaps: si un canal necesita algo que no existe → incluir setup como prerequisito en el plan.

---

### Paso 6: Seleccionar Estrategias (~5 min)

Cargar [references/strategies-catalog.json](references/strategies-catalog.json) — catálogo de estrategias GTM (fuente de verdad única, editable desde Mission Control).

Ejecutar scoring del catálogo:

1. **Filtrar** por B2B/B2C + cuadrante Hormozi viable
2. **Puntuar**: `Score = (Dolor×0.25) + (Objetivo×0.25) + (Resource×0.25) + (Time×0.25) [+1 intelligence boost]`
3. **Recomendar top 2-3** con tabla de scoring

Para cada recomendada:
```
ESTRATEGIA: [Nombre] (#XX)
├── Cuadrante Hormozi + Score
├── Por qué (ligado a dolores + objetivos + gaps del cliente)
├── Tiempo al primer resultado
├── Prerequisites pendientes
├── Skills que activará
└── KPIs objetivo (del catálogo)
```

---

### Paso 7: Generar Plan de Acción (~5 min)

Plan temporal con 3 fases + revisión:

- **FASE 0** (Día 1-2): Resolver gaps 🔴 críticos
- **FASE 1** (Semana 1): Ejecutar estrategias A y B — pasos concretos + KPI target
- **FASE 2** (Semana 2-3): Medir Fase 1 → ajustar → activar estrategia C si procede
- **REVISIÓN**: A las 4 semanas, re-evaluar con datos reales

Cada estrategia aprobada genera una carpeta de campaña:
```
campaigns/{YYYY-MM}-{strategy-slug}/
  brief.md | tasks/ | content/ | results.md
```

---

### Paso 8: Presentar y Aprobar (~2 min)

Presentar: estado actual → gaps → canales → estrategias con scoring → plan de acción.

```
¿Con qué quieres proceder?
 [1] Aprobar plan → genera campañas
 [2] Ajustar estrategias → re-puntuar
 [3] Cambiar objetivo/horizonte → recalcular
 [4] Resolver gaps primero → plan de setup
```

**Esperar aprobación antes de escribir archivos.**

---

### Paso 8.5: Proponer Idea Generation Tasks (~3 min)

Después de aprobar el plan, ANTES de escribir archivos:

Para cada estrategia aprobada → proponer **recurring tasks** concretas para el Idea Generation System.

**Lógica:**
1. Por cada estrategia, inferir qué intelligence recurrente la alimenta
2. Definir: nombre, frecuencia, fuentes, canal destino
3. Presentar como tabla para aprobación

**Ejemplo para estrategia "Content SEO+GEO":**
```
| Tarea | Frecuencia | Fuentes | Canal destino |
|-------|-----------|---------|---------------|
| Buscar PAA para keywords del cliente | Cada 7 días | Serper PAA, SERP gaps | Blog |
| Monitor menciones en LLMs | Cada 14 días | GEO multi-provider | Blog, LinkedIn |
| Scan blogs competencia para gaps | Cada 7 días | SERP analysis, competitor URLs | Blog |
| Trending topics del nicho | Cada 3 días | Google Trends, news | Blog, IG, LinkedIn, Twitter |
```

**Ejemplo para estrategia "LinkedIn Outreach":**
```
| Tarea | Frecuencia | Fuentes | Canal destino |
|-------|-----------|---------|---------------|
| Señales LinkedIn (cambios puesto, fundraising) | Diario | Signal monitor | Outreach |
| Identificar partners potenciales | Cada 14 días | SERP discovery, influencer finder | Partners |
| Monitor contenido competencia LinkedIn | Cada 7 días | Social media extractor | LinkedIn |
```

**Catálogo de fuentes disponibles:**
- PAA (People Also Ask) — via Serper
- SERP gaps — via audit engines
- GEO visibility — via multi-provider analysis
- Google Trends / trending topics
- Competitor content monitoring
- Signal detection (LinkedIn, web)
- News / eventos del sector
- Influencer/partner discovery
- Own media gaps (del audit)

**Presentar al usuario:**
```
📋 **Idea Generation — Tareas recurrentes propuestas:**

Para [{estrategia A}]:
[tabla]

Para [{estrategia B}]:
[tabla]

¿Apruebas estas tareas? Las crearé como recurring_tasks 
en el Idea Generation System → notificaciones en #intelligence.
```

**Esperar aprobación.** El usuario puede modificar frecuencias, eliminar tareas, o añadir nuevas.

**Al aprobar:**
- Crear `recurring_tasks` entries (JSON en `brand/{slug}/idea-generation/recurring-tasks.json` hasta que exista backend)
- Crear crons correspondientes en Sancho (via cron tool)
- Las ideas generadas irán a `idea_bank` → notificación Discord #intelligence → MC para aprobar/rechazar

---

Después de aprobación, ofrecer SIEMPRE:

```
✅ Plan aprobado. ¿Quieres que genere la presentación?
→ Generaré slides con tu visual identity usando el Presentation Summary del plan.
```

---

## Output: Estructura narrativa del plan

El documento `strategic-plan/current.md` sigue un arco narrativo — NO el orden de los pasos internos. Debe leerse como una historia, no como un log de proceso.

```
1. RESUMEN EJECUTIVO — 3-4 frases: quién eres, qué quieres, qué vamos a hacer
2. DÓNDE ESTAMOS HOY — Estado actual destilado (destino, canales, herramientas, contenido)
3. QUÉ NOS FRENA — Gaps priorizados (🔴🟡🟢) con acción concreta por gap
4. DÓNDE QUEREMOS IR — Objetivo + horizonte + métrica baseline → target
5. CÓMO VAMOS A LLEGAR — Canales priorizados + estrategias seleccionadas (score, por qué, KPIs)
6. QUÉ HACEMOS PRIMERO — Roadmap por fases (Fase 0 → Fase 1 → Fase 2)
7. PROYECTOS — Lista con objetivo, métrica, target, review date
8. CÓMO MEDIMOS — Dashboard de métricas por semana/mes
9. IDEA GENERATION — Tareas recurrentes por estrategia (nombre, frecuencia, fuentes, canal destino)
```

**No incluir en el documento:**
- Logs del proceso ("el usuario dijo X")
- Verificaciones internas de capacidad
- Metadata de skills

**Cada dato debe citar su fuente** con link relativo al documento origen.

### Presentation Summary (obligatorio)

Al final del documento, incluir `## Presentation Summary` siguiendo `_system/presentation-summary-protocol.md`:
- Slides destiladas del contenido del plan
- Cada dato con `source: "[doc](ruta-relativa)"`
- Max 6 bullets por slide
- Arco narrativo respetado
- Sin info interna

Este Presentation Summary permite generar presentación con frontend-slides bajo demanda.

### Modelo de datos

Ver [references/data-model.md](references/data-model.md) para schemas de `project.json`, `tasks.json`, y `value-review.md`.

### Al aprobar el plan:

**Fase 1: Escribir archivos**

1. Escribir `brand/{slug}/strategic-plan/current.md` (documento vivo, versionable)
2. Crear `brand/{slug}/projects/registry.json` (si no existe)
3. Por cada estrategia aprobada → crear proyecto:
   - Carpeta `brand/{slug}/projects/P{XX}-{slug}/`
   - `project.json` con objetivo, métricas baseline/target, origin, review_date
   - `tasks.json` con tareas iniciales, canal temático asignado, descripción, owner, **skill** (ver [data-model.md](references/data-model.md))
   - ⚠️ **SIEMPRE asignar `"skill"` a cada tarea** — es el skill de Escudero que ejecutará la tarea. Consultar `strategies-catalog.json` campo `skills` de la estrategia. Si no hay match claro, usar `doc-coauthoring`. Flujo: Escudero ejecuta con el skill → Rocinante verifica contra Foundation + Brand Voice + Brand Visual.
   - `playbook.md` resumen del proyecto con links a playbooks de tareas
   - `T{YY}/playbook.md` por cada tarea — detalle individual de la tarea
   - ⚠️ **NUNCA juntar todo en un solo playbook.** Cada tarea = su propia carpeta + playbook.

**Fase 2: Crear hilos en Discord (OBLIGATORIO)**

> ⚠️ **NUNCA publicar proyectos como mensajes planos.** Los proyectos son HILOS (`thread-create`), no mensajes.
> Leer `_system/project-threads-protocol.md` ANTES de empezar.

4. Preguntar: "Plan aprobado con X proyectos y Y tareas. ¿Creo los hilos en Discord?"
5. **Resolver datos del cliente:**
   - Leer `brand/{slug}/discord-channels.json` para channel IDs
   - Si no existe → `message(action=channel-list, guildId={guild})` → crear el fichero
   - Obtener `mcToken` de `clients.json` → MC URL: `https://sancho-cmo.taild48df2.ts.net/mc/portal/{mcToken}/projects/`
6. **Por cada proyecto** (ir uno a uno):

   a. **Crear hilo de proyecto en #projects:**
   ```
   message(action=thread-create, channel=discord, channelId="{projects_channel_id}", threadName="[P{XX}] {nombre}", messageId="{msg_id}")
   ```
   
   b. **Primer mensaje en el hilo del proyecto** (mencionar al usuario con `<@{sender_id}>`):
   ```
   <@{sender_id}> 📋 **[P{XX}] {nombre}**
   
   🎯 **Objetivo:** {objetivo}
   📋 **Estrategia:** {estrategia}
   📅 **Review:** {review_date}
   📊 **Métricas:** {baseline} → {target}
   
   🔗 **Mission Control:** <{MC_URL}>
   
   Tareas: (links se añaden tras crear los hilos)
   ```
   
   c. **Por cada tarea del proyecto → crear hilo en su canal temático:**
   ```
   message(action=thread-create, channel=discord, channelId="{channel_id_del_canal}", threadName="[P{XX}-T{YY}] {nombre_tarea}", messageId="{msg_id}")
   ```
   
   d. **Primer mensaje en el hilo de la tarea** (mencionar al usuario + link al proyecto):
   ```
   <@{sender_id}> 🔧 **[P{XX}-T{YY}] {nombre_tarea}**
   
   {descripción}
   
   📂 **Proyecto:** [P{XX}] {nombre_proyecto} → <https://discord.com/channels/{guild}/{project_thread_id}>
   🔗 **Mission Control:** <{MC_URL}>
   
   ¿La ejecuto? Esperando confirmación.
   ```
   
   e. **Mensaje resumen en el hilo del proyecto** (tras crear TODOS los hilos de tareas, con links cruzados):
   ```
   📋 **Tareas:**
   • <https://discord.com/channels/{guild}/{task_thread_id}> — {nombre} → #{canal}
   • <https://discord.com/channels/{guild}/{task_thread_id}> — {nombre} → #{canal}
   ...
   Todas esperan confirmación antes de ejecutarse.
   ```
   
   > ⚠️ **SIEMPRE mencionar al usuario** (`<@{sender_id}>`) en el primer mensaje de cada hilo (proyecto y tarea). Sin mención, Discord no notifica y los hilos quedan ocultos.
   > ⚠️ **SIEMPRE links cruzados**: tarea→proyecto (link Discord al hilo del proyecto), proyecto→tareas (links Discord a cada hilo de tarea).

7. **Guardar thread IDs en los JSONs:**
   - `project.json` → añadir `"discord": { "project_thread_id": "{id}" }`
   - `tasks.json` → añadir `"discord_thread_id": "{id}"` en cada tarea
   - MC mostrará los 💬 automáticamente con links a Discord

8. En cada hilo de tarea: "¿La ejecuto?" → **NUNCA ejecutar sin confirmación explícita**

### Nomenclatura proyectos

Secuencial por cliente: P01, P02, P03... Tareas: P01-T01, P01-T02...

---

## Documento vivo

El strategic plan NO es one-shot. Es la **fuente de verdad de qué se está haciendo y por qué**.

### Versionado
- `current.md` = plan activo
- Cuando se completa un ciclo o cambian objetivos → copiar a `vX.md`, crear nuevo `current.md`
- Cada versión = un ciclo (mensual o trimestral)

### Validación de nuevos proyectos

Cuando surge un proyecto nuevo (de intelligence, usuario, o value review):

1. Leer `strategic-plan/current.md` + `projects/registry.json`
2. Evaluar alineación con objetivos y proyectos activos
3. Responder según el resultado:

```
¿Alineado con strategic-plan/current.md?
├── SÍ → "Encaja con el plan. Lo creo como P{XX}."
├── PARCIAL → "Entiendo el interés, pero tienes P{XX}, P{YY} y P{ZZ} abiertos con deadlines en {fechas}. 
│              Recomiendo terminar esos primero. Si insistes, lo creo pero afecta a {proyectos}."
└── NO → "Esto NO está en el plan estratégico. El plan actual tiene {N} proyectos activos
           enfocados en {objetivo}. Crear esto ahora desvía foco de:
           - P{XX} ({nombre}) — deadline {fecha}
           - P{YY} ({nombre}) — deadline {fecha}
           Mi recomendación: no ahora. Si quieres, lo agendamos para {fase/trimestre posterior}."
```

> ⚠️ **Sé tajante cuando no tiene sentido.** El CMO protege el foco del equipo.
> Citar SIEMPRE: el plan estratégico, los proyectos activos afectados, y sus deadlines.
> No suavizar por cortesía — decir claramente "esto no tiene sentido ahora" si no lo tiene.
> El usuario tiene la última palabra, pero la recomendación debe ser clara y directa.

Siempre: informar al usuario con datos concretos, esperar decisión, actualizar plan si se acepta.

### Monitoreo de objetivos

Sancho vigila si los objetivos del plan se están cumpliendo:
- Si todas las tareas de todos los proyectos se completan → proponer value reviews
- Si métricas target se alcanzan → "Objetivos cumplidos. ¿Nuevos objetivos?"
- Si métricas no avanzan → "P01 lleva 30 días sin mover la métrica. ¿Ajustamos?"

### Cambio de estado → actualizar hilo Discord + MC

> ⚠️ SIEMPRE que cambie el estado de un proyecto o tarea, actualizar el nombre del hilo en Discord Y el JSON.
> Ver `_system/project-threads-protocol.md` → "Protocolo de cambio de estado en hilos Discord".

Resumen rápido:
- **Completado** → `✅ [P{XX}] nombre` / `✅ [P{XX}-T{YY}] nombre`
- **Cancelado** → `❌ [P{XX}] nombre`
- **Bloqueado** → `⛔ [P{XX}-T{YY}] nombre`
- **En progreso** → `🔧 [P{XX}-T{YY}] nombre`

Usar `message(action=channel-edit, channelId="{thread_id}", name="{nuevo_nombre}")`.

### Value Review

Al completar un proyecto → generar `value-review.md`:
- Objetivo cumplido: sí/no/parcial
- Métricas antes/después
- Qué funcionó, qué no
- Learnings → alimentan futuros planes
- Siguiente acción recomendada

---

## Relación con otros skills

| Acción | Skill/Archivo |
|--------|---------------|
| **Llama** | `channel-prioritization` (si no existe channel-plan.md) |
| **Lee** | Foundation completa, phase-0-diagnostic (si existe), `references/strategies-catalog.json` |
| **Produce** | `strategic-plan/current.md`, `current-state.md`, `projects/*/project.json`, `projects/*/tasks.json` |
| **Encadena** | Execution skills por tarea. Value reviews al completar proyecto |
| **Valida** | Nuevos proyectos propuestos vs plan activo |

---

## ✅ Self-QA

1. ¿Se leyeron TODOS los docs de Foundation?
2. ¿Estado actual consolidado de Foundation (no re-scrapeado sin razón)?
3. ¿Gaps cruzados con stack.md + datos reales?
4. ¿Estrategias ejecutables con recursos del cliente?
5. ¿Proyectos con objetivo medible (métrica + baseline + target)?
6. ¿Tareas asignadas a canal temático correcto (channel field)?
7. ¿Cada tarea tiene description y owner?
8. ¿Review date definida para cada proyecto?
9. ¿Aprobación del usuario antes de crear proyectos?
10. ⚠️ **¿Hilos creados con `thread-create`?** (NUNCA mensajes planos en #projects)
11. ⚠️ **¿Mención `<@sender_id>` en CADA hilo?** (sin mención = hilo oculto para el usuario)
12. ⚠️ **¿Links cruzados?** Proyecto→tareas (links en resumen) + Tarea→proyecto (link en primer mensaje)
13. ¿Cada hilo de proyecto tiene link a MC?
14. ¿Cada hilo de tarea tiene link al proyecto padre + link a MC?
15. ¿`discord_thread_id` guardado en tasks.json y project.json?
16. ¿Cada tarea pregunta "¿La ejecuto?" y espera confirmación?
17. ¿Se propusieron recurring tasks de Idea Generation por cada estrategia aprobada?
18. ¿Las recurring tasks tienen nombre, frecuencia, fuentes y canal destino definidos?
19. ¿Se crearon los crons/JSON de recurring_tasks al aprobar?
