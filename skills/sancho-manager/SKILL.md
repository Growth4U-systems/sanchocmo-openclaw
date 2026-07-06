---
name: sancho-manager
description: "Universal project manager. Breaks ANY objective into projects and tasks with measurable outcomes. Two modes: FROM GENERAL (ad-hoc → project/tasks) and FROM PROJECT (manage tasks within existing project). Use when: user asks 'organiza esto', 'necesito hacer X', 'crea proyecto', 'add task to P01', 'edita la tarea T03', 'qué hago primero', 'next steps', 'project status', 'value review', 'priorizar', 'roadmap', 'plan de trabajo', 'backlog', or any multi-step request that doesn't match a specific skill. Also use for operational next steps ('qué hago ahora', 'siguiente tarea') — distinct from strategic-plan which handles post-Foundation strategic direction. NOT for: Foundation (foundation-orchestrator), creating strategic plan from scratch (strategic-plan INIT), or executing individual tasks (delega al especialista dueño). Triggers: organiza, planifica, desglosa, break down, plan this, crea proyecto, add task, edit task, task management, project status, qué hago primero, siguiente paso, next steps, value review, project review, priorizar, roadmap, plan de trabajo, backlog."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Plan
  layer: 0
  depends_on: null
  chains_to: strategic-plan, execution-skills
context_required:
  - brand/{slug}/strategic-plan/strategic-plan.current.md
  - brand/{slug}/projects/P*/project.json
  - brand/{slug}/company-brief/company-brief.current.md
context_writes:
  - brand/{slug}/projects/P{XX}/project.json
  - brand/{slug}/projects/P{XX}/tasks.json
  - brand/{slug}/projects/P{XX}/playbook.md
---

# Sancho Manager — Comodín de Gestión

> Convierte objetivos en trabajo organizado. No ejecuta, estructura y delega.

## Referencias

- [Task Decomposition Guide](references/task-decomposition-guide.md) — Framework para descomponer objetivos en tareas
- [Channel-Skill Map](references/channel-skill-map.md) — Mapeo tipo_tarea → canal → skill → persona
- [Project Lifecycle](references/project-lifecycle.md) — Máquina de estados de proyectos y tareas
- [Wildcard Routing](references/wildcard-routing.md) — Cuándo Manager maneja vs delega a otro skill

---

## Detección de Modo

```
1. ¿Hay contexto de proyecto activo?
   - El hilo de chat referencia [P{XX}] → MODE = PROJECT
   - Usuario menciona P{XX} explícitamente → MODE = PROJECT

2. ¿Pide status general sin proyecto específico?
   - "¿Qué hago?" / "next steps" / "status" sin P{XX} → MODE = STATUS

3. Todo lo demás → MODE = GENERAL
```

---

## Mode GENERAL — De petición ad-hoc a proyecto

### Triage de intención (GATE — entrada en blanco / "➕ Nueva tarea")

Cuando el usuario abre un chat nuevo (incl. el botón **"➕ Nueva tarea"**, hilo `…:new-task:…`) la primera entrada puede ser cualquier cosa. **No asumas que hay tarea. No crees nada en este gate. No hidrates contexto pesado todavía.** Clasifica:

| Intención | Señal | Qué haces |
|-----------|-------|-----------|
| **CHARLA / saludo / ambiguo** | "hola", "qué tal", una pregunta suelta, algo sin acción clara | Responde natural y breve. Ofrece: *"¿Quieres que organice algo o que cree una tarea? Cuéntame qué necesitas."* **No creas nada.** |
| **TAREA ÚNICA** | una cosa concreta y accionable (un entregable / un paso): "redacta el email a X", "monta la landing de Y" | → **Camino TAREA ÚNICA** (abajo) |
| **PROYECTO** | objetivo amplio / varios pasos: "lanza la campaña de Z", "organiza el go-to-market" | → continúa con **Paso 0: Context Hydration** (flujo de proyecto, abajo) |

**Paso 0 del gate — ¿de quién es este trabajo?** Antes de elegir camino, decide si la petición es el **entregable de un especialista**; si lo es, **cede el turno de inmediato** — en MC Chat con un bloque `:::delegate` (`{"agent":"<slug>","name":"…","brief":"…"}`), que arranca al especialista en su propio hilo. No la respondas con una shortlist improvisada ni la ejecutes inline, y NO uses `Agent(subagent_type)` para el entregable (corre en tu turno y vuelve a ti):

- research / fuentes / "lista de candidatos" / influencers / podcasts / mercado / competidores → **`hamete`**
- outreach / prospecting / contactar / secuencias / partnerships → **`rocinante`**
- contenido largo (SEO, newsletter, landing copy) → **`dulcinea`** · ads (Meta/Google) → **`mambrino`**
- visual / assets / creatividades → **`maese-pedro`** · data / atribución / forecasting → **`merlin`** · web / páginas / CRO → **`alarife`**

El especialista ejecuta (con fuentes y progress real, **en su propio hilo/task** — no lo narres tú); tú orquestas y cierras el loop. Responde inline **solo si es CHARLA** o un lookup factual de 1 turno que **no** es el entregable de ningún especialista. Si es el entregable de un especialista, va al especialista — **aunque la primera vía falle** (timeout/error/scope): repórtalo en alto (*"no se creó nada"*), nunca lo hagas tú a mano en el chat ni lo reclasifiques como "lookup rápido" para responderlo inline. (Mapa completo de dominios→agente en `SOUL.md`; reglas de handoff/fail-loud/operar-el-sistema en `PROTOCOLS.md` §20-22.)

**Regla de oro:** infiere primero. Si dudas entre charla y tarea, **pregunta una línea** ("¿Quieres que lo convierta en una tarea?") en vez de crear algo a ciegas.

**Run-autónomo:** si el usuario dice *"tira tú de todo / hazlo tú / no me preguntes / sorpréndeme"*, NO abras un cuestionario de scoping. Infiere los parámetros del contexto del cliente (`ecps.current.md`, `company-brief.current.md`, `competitors.current.md`), delega al especialista y deja que **vuelva solo en gates reales** del pipeline (aprobar shortlist, aprobar outreach), no al inicio. El scoping, si hace falta, lo hace el especialista en su hilo — no tú.

#### Camino TAREA ÚNICA (confirm-first — NO creas hasta que el usuario diga sí)

1. **Propón, no ejecutes.** Resume lo que entendiste y **ofrece** crearla:
   > *"Esto suena a una tarea: «{resumen en 1 línea}». ¿La creo? La asignaría a **{agente}** (skill `{skill}`). Para dejarla bien me vendría: entregable concreto y criterio de hecho — ¿algún canal o deadline?"*
   El **agente/skill** sale de [channel-skill-map.md](references/channel-skill-map.md) (tipo de tarea → canal → skill → agente owner). No lo inventes: si no encaja en el mapa, dilo y propón el más cercano.
2. **Recoge lo mínimo que falte** (máx 2 preguntas; infiere el resto). Campos: `name`, `description`, `deliverable`, `done_criteria`, `channel`, `skill`, `agent` (= owner del skill), `depends_on` (normalmente null).
3. **Espera confirmación explícita** ("sí, créala" / "[1] crear").
4. **Crea la tarea** (recién aquí):
   - Si hay un **proyecto activo que encaja** → añádela ahí (ver **Mode PROJECT → Añadir tarea**).
   - Si **no encaja en ninguno** → créala en un proyecto ligero para tareas sueltas (convención del cliente: usa un `P-Inbox`/ad-hoc existente, o crea un proyecto de 1 tarea). Anchors obligatorios: `skill` + `deliverable_file` + `mc_chat_thread_id`.
   - Enséñasela creada con su **agente asignado** y el siguiente paso.

> Solo cuando el objetivo es claramente de **varios pasos** subes a crear un proyecto entero (Paso 0–5). Para una cosa suelta, una tarea basta.

### Paso 0: Context Hydration (~1 min)

Leer en paralelo:
- `brand/{slug}/strategic-plan/strategic-plan.current.md` — objetivos y canales actuales
- `brand/{slug}/projects/P*/project.json` — escanear proyectos existentes (evitar duplicación)
- `GET {MC_BASE}/api/brand-brain/state?slug={slug}` — estado Foundation (status por pilar, vocabulario de task)
- `brand/{slug}/company-brief/company-brief.current.md` — contexto de negocio

Si no hay directorios `P*/` en `projects/`, el primer proyecto será P01.
Si otros archivos no existen, continuar sin ellos (warning, no bloqueo).

Al presentar archivos al usuario, usar siempre links tokenizados de MC (leer `clients.json` para obtener `mcToken`):
`{MC_BASE}/docs/brand/{slug}/projects/P{XX}/playbook.md`

### Paso 1: Entender el Objetivo (~1 min)

Parsear la petición del usuario. Extraer:
- **Resultado deseado** (el outcome, no la actividad)
- **A quién afecta** (qué ECP si aplica)
- **Cómo se mide el éxito**

**Principio: Inferir primero, preguntar después.** Si no queda claro, máximo 2 preguntas.

### Paso 2: Alignment Check (Gate Advisory)

Cruzar con `strategic-plan/strategic-plan.current.md`:

| Resultado | Acción |
|-----------|--------|
| **ALIGNED** | "Encaja con tu plan. Lo creo como P{XX}." |
| **PARTIAL** | "Tiene sentido pero tienes {N} proyectos activos. Recomiendo terminar {específicos} primero. ¿Quieres seguir?" |
| **NOT ALIGNED** | "No está en tu plan actual que se enfoca en {objetivo}. Crearlo desviaría foco de {proyectos activos}. Mi recomendación: {alternativa}. Tu decides." |

Si no existe strategic plan → skip alignment, notar: "Sin plan estratégico. Creo como proyecto standalone."

**ESPERAR confirmación del usuario si PARTIAL o NOT ALIGNED.**

### Paso 3: Descomponer en Tareas (~3 min)

Usar [task-decomposition-guide.md](references/task-decomposition-guide.md).

Cada tarea DEBE tener:

| Campo | Obligatorio | Ejemplo |
|-------|-------------|---------|
| `name` | Sí | "Crear landing page ECP1" |
| `description` | Sí | "Redactar copy persuasivo para..." |
| `deliverable` | Sí | "Landing page publicada con CTA" |
| `done_criteria` | Sí | "Página live, Pixel disparando Lead" |
| `channel` | Sí | "web" |
| `skill` | Sí | "direct-response-copy" |
| `owner` | Sí | "Sancho" (default) |
| `depends_on` | Sí | null o "P{XX}-T01" (siempre fully qualified) |

Consultar [channel-skill-map.md](references/channel-skill-map.md) para asignar canal y skill correctos.

**Reglas de descomposición:**
- 3-8 tareas por proyecto (menos de 3 no justifica el overhead de proyecto; más de 8 indica que el objetivo es demasiado amplio y conviene dividir en sub-proyectos)
- Cada tarea = 1 skill, 1 canal, 1 owner (si toca dos canales, son dos tareas — mantiene la ejecución limpia)
- `done_criteria` debe ser binario (sí/no), nunca subjetivo (permite verificar automáticamente sin ambigüedad)
- Maximizar tareas en paralelo (menos dependencias = menos tiempo total de ejecución)
- Owner = "Sancho" por defecto. Solo "Equipo" si genuinamente requiere acción humana.
- Si la estrategia viene del catálogo, anotar `strategy.catalog_id` en project.json (permite trazar resultados por estrategia)

### Paso 4: Presentar para Aprobación

Formato scannable:

```
📋 **PROYECTO: P{XX} — {nombre}**
Objetivo: {qué conseguimos}
Métrica: {baseline} → {target}
Review: {fecha}

**TAREAS:**
T01 → {nombre} | #{canal} | skill: {skill} | owner: {owner}
     Deliverable: {qué sale}
     Done: {criterio}

T02 → {nombre} | depende de T01 | #{canal} | ...
     Deliverable: {qué sale}
     Done: {criterio}
...

¿Apruebas? [1] Sí, crear proyecto [2] Ajustar tareas [3] Cancelar
```

**ESPERAR respuesta antes de crear nada.**

### Paso 5: Crear Artefactos

Al aprobar:

1. **Asignar P{XX}** — Escanear directorios `projects/P*/`, tomar el número más alto + 1
2. **Crear `projects/P{XX}/project.json`** — Seguir schema de [data-model.md](../strategic-plan/references/data-model.md):
   ```json
   {
     "id": "P{XX}",
     "name": "...",
     "description": "...",
     "approach": "...",
     "status": "active",
     "created": "{hoy}",
     "review_date": "{fecha}",
     "origin": { "type": "user-request", "detail": "..." },
     "objective": { "description": "...", "metric": "...", "baseline": 0, "target": 0, "unit": "..." },
     "strategy": { "catalog_id": null, "description": "..." },
     "channels": ["..."],
     "tasks_total": N,
     "tasks_completed": 0,
     "value_review": null
   }
   ```
3. **Crear `projects/P{XX}/tasks.json`** — Array de tareas:
   ```json
   {
     "project_id": "P{XX}",
     "tasks": [
       {
         "id": "P{XX}-T01",
         "name": "...",
         "description": "...",
         "deliverable": "...",
         "done_criteria": "...",
         "depends_on": null,
         "status": "todo",
         "owner": "Sancho",
         "agent": "{owner del skill}",
         "channel": "...",
         "type": "...",
         "skill": "...",
         "deliverable_file": "brand/{slug}/.../output.md",
         "mc_chat_thread_id": "task-p{xx}-t01",
         "created": "{hoy}",
         "completed": null,
         "output_files": [],
         "notes": ""
       }
     ]
   }
   ```
   > **Anchors obligatorios** (los 3, en cada task): `skill` + `deliverable_file` + `mc_chat_thread_id` (= `task-{id en minúsculas}`). `status` arranca en `todo` (vocabulario canónico de [task-status]; nunca `pending`). `agent` = owner del skill (ver [channel-skill-map.md](references/channel-skill-map.md)). Tasks `type: integration`/`execution` pueden omitir `deliverable_file`.
4. **Crear `projects/P{XX}/playbook.md`** — Resumen con links a playbooks de tareas
5. **Crear `projects/P{XX}/T{YY}/playbook.md`** — Por cada tarea, instrucciones detalladas
6. **Crear el hilo de chat vacío** de cada task en `brand/{slug}/chat/{mc_chat_thread_id}.json` (`{ "messages": [], "createdAt": "{hoy}" }`). Mission Control lee `tasks.json` + estos hilos **en vivo** — no hay paso de regeneración.

---

## Mode PROJECT — Gestión dentro de un proyecto existente

Leer `projects/P{XX}/project.json` + `tasks.json`.

Detectar sub-modo:

### Add Task

1. Leer `tasks.json` → determinar siguiente T{YY}
2. Proponer tarea con todos los campos obligatorios + los 3 anchors (`depends_on: "P{XX}-T{YY}"` formato completo)
3. **ESPERAR aprobación**
4. Crear en `tasks.json` (status `todo`) + `T{YY}/playbook.md` + el hilo de chat vacío `brand/{slug}/chat/{mc_chat_thread_id}.json`
5. Actualizar `tasks_total` en `project.json` (MC lo refleja en vivo)

### Edit Task

1. Leer `tasks.json` → encontrar tarea por ID
2. Presentar campos actuales, proponer cambios
3. **ESPERAR aprobación**
4. Actualizar campos en `tasks.json` + actualizar `T{YY}/playbook.md` si aplica (MC lo refleja en vivo)

### Status Review

1. Leer `project.json` + `tasks.json`
2. Presentar:
   ```
   📊 **P{XX} — {nombre}**
   Progreso: {completadas}/{total} tareas
   Review date: {fecha} ({días restantes})

   ✅ Completadas: T01, T03
   🔧 En progreso: T02
   ⛔ Bloqueadas: T04 (espera T02)
   📋 Pendientes: T05, T06

   → Siguiente accionable: T05 ({nombre}) — ¿La ejecuto?
   ```
3. Si hay tareas bloqueadas, sugerir desbloqueo

### Reorder / Reprioritize

1. Presentar orden actual con dependencias
2. Tomar input del usuario
3. Actualizar `depends_on` en `tasks.json`
4. Validar que dependencias siguen siendo acíclicas

### Value Review

Trigger: todas las tareas completadas O `review_date` alcanzada.

1. Leer `project.json` — objetivo, métricas baseline/target
2. Obtener métricas actuales (preguntar al usuario si no disponibles)
3. Generar `value-review.md` siguiendo template de [data-model.md](../strategic-plan/references/data-model.md)
4. Actualizar `project.json` → status = `reviewed` (MC lo refleja en vivo)
5. Si learnings sugieren acción → proponer nuevo proyecto (vuelve a Mode GENERAL)

### Close / Cancel

1. Confirmar con usuario
2. Actualizar status en `project.json` (`completed`/`cancelled`; MC lo refleja en vivo)

---

## Mode STATUS — Dashboard cross-project

Cuando el usuario pregunta "¿qué hago?" o "status" sin especificar proyecto.

1. Escanear `projects/P*/project.json` → todos los proyectos con status `active`
2. Para cada activo, leer `tasks.json` y calcular progreso
3. Presentar vista priorizada:

```
📊 **Estado de proyectos**

P01 Fontanería Web — 1/6 tareas ✅ | Review: 28 mar (VENCIDO)
  → Siguiente: T02 Configurar GA4 | #{web}

P02 LinkedIn Pipeline — 0/5 tareas | Review: 15 abr
  → Siguiente: T01 Definir ICP list | #{prospecting}

⚠️ Alertas:
- P01 tiene review vencida — ¿hacemos value review?
- P05 sin actividad en 12 días — ¿pausar o reactivar?

¿Qué quieres atacar?
```

---

## Mode RECURRING — Gestión de tareas recurrentes

sancho-manager gestiona el ciclo completo de recurring tasks:

### Gestión
- **Crear** nuevas recurring tasks (frecuencia, fuentes, canal destino)
- **Editar** configuración (cambiar frecuencia, fuentes, pausar/reactivar)
- **Listar** estado de todas las recurring tasks del cliente

### Análisis de resultados
- Cuando una recurring task genera insights (keywords, señales, tendencias):
  1. Analizar los resultados del último run
  2. Crear **tareas de análisis** (tipo `analysis`) en el proyecto correspondiente
  3. De esas tareas salen ideas/contactos → Idea Bank
  4. Las ideas se asignan a tareas content/outreach existentes

### Flujo
```
Recurring task (cron) → genera datos/insights
  → sancho-manager analiza resultados
    → Crea tareas de análisis en el proyecto
      → Ideas/contactos generados → Idea Bank
        → Se asignan a tareas content/outreach
```

---

## Gate Checks

### 1. Foundation (soft)
```
state = GET {MC_BASE}/api/brand-brain/state?slug={slug}
if state.sections.company-brief.status != "completed":
    WARN → "Foundation incompleta. Puedo crear el proyecto, pero sin contexto estratégico la alineación será limitada."
    CONTINUE (no bloquear)
```

### 2. Strategic Alignment (advisory)
Ver Paso 2 de Mode GENERAL. Informativo — el usuario siempre tiene la última palabra.

### 3. Execution
**NUNCA ejecutar una tarea sin confirmación explícita.**

Incluso si el usuario dice "ejecuta los proyectos" o "arranca todo":
1. Listar tareas pendientes con su estado
2. Preguntar: "¿Cuál quieres que ejecute primero?" o "¿Todas en paralelo?"
3. Esperar confirmación ESPECÍFICA por tarea o grupo de tareas
4. Ejecutar **delegando al especialista dueño** del skill vía `Agent(subagent_type=<slug>)` (no inline) — ver **Paso 0 del gate**

⚠️ **"Apruebo el plan" / "Crea los proyectos" = crear estructura (JSONs + playbooks)**
⚠️ **"Ejecuta T01" / "Arranca la Fase 0" = confirmación de ejecución**
**Son pasos DIFERENTES. Nunca confundirlos.**

---

## Self-QA Checklist

Antes de crear/presentar cualquier proyecto o tarea, verificar:

- [ ] Proyecto tiene: name, description, approach, objective (metric + baseline + target), review_date
- [ ] Cada tarea tiene: name, description, deliverable, done_criteria, channel, skill, owner
- [ ] `depends_on` usa formato fully qualified: `"P{XX}-T{YY}"` o null
- [ ] Dependencies son acíclicas y lógicas
- [ ] Channels asignados corresponden al tipo de tarea (web → #web, no #content)
- [ ] Skills asignados existen en `skills/` directory
- [ ] Owner = "Sancho" por defecto, "Equipo" solo si requiere acción humana genuina
- [ ] Carpeta `P{XX}/` creada con `project.json` válido
- [ ] Cada task tiene sus 3 anchors (`skill` + `deliverable_file` + `mc_chat_thread_id`) y status `todo`
- [ ] Hilo de chat vacío creado en `brand/{slug}/chat/{mc_chat_thread_id}.json` por task
- [ ] Alignment check ejecutado vs strategic plan (si existe)
- [ ] Estimaciones usan velocidad-AI (no timelines de agencia)
- [ ] `description` y `approach` escritos para ser legibles por cualquiera (no técnico)
- [ ] Links al usuario usan MC tokenizado (nunca rutas de archivo)

---

## Relación con otros skills

| Relación | Skill | Frontera |
|----------|-------|----------|
| Defiere a | `foundation-orchestrator` | Creación y gestión del DAG de Foundation |
| Defiere a | `strategic-plan` (INIT) | Crear plan estratégico completo desde cero |
| Lee de | `strategic-plan/strategic-plan.current.md` | Objetivos, canales, para alignment checks |
| Lee de | `GET /api/brand-brain/state?slug={slug}` | Estado de Foundation |
| Lee de | `skills/strategic-plan/references/strategies-catalog.json` | Vincular tareas a estrategias del catálogo (poblar `strategy.catalog_id` en project.json) |
| Escribe | project.json, tasks.json, playbook.md | Artefactos de proyecto |
| Escribe | projects/P{XX}/project.json | Datos del proyecto (el filesystem es el registro) |
| Escribe | brand/{slug}/chat/{mc_chat_thread_id}.json | Hilo de chat vacío por task (anchor) |
| Encadena con | Skills de ejecución | Via dispatch para ejecutar tareas |
