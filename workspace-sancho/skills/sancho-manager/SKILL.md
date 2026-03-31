---
name: sancho-manager
description: "Universal project manager. Breaks ANY objective into projects and tasks with measurable outcomes. Two modes: FROM GENERAL (ad-hoc → project/tasks) and FROM PROJECT (manage tasks within existing project). Use when: user asks 'organiza esto', 'necesito hacer X', 'crea proyecto', 'add task to P01', 'edita la tarea T03', 'qué hago primero', 'next steps', 'project status', 'value review', 'priorizar', 'roadmap', 'plan de trabajo', 'backlog', or any multi-step request that doesn't match a specific skill. Also use for operational next steps ('qué hago ahora', 'siguiente tarea') — distinct from strategic-plan which handles post-Foundation strategic direction. NOT for: Foundation (foundation-orchestrator), creating strategic plan from scratch (strategic-plan INIT), or executing individual tasks (Escudero). Triggers: organiza, planifica, desglosa, break down, plan this, crea proyecto, add task, edit task, task management, project status, qué hago primero, siguiente paso, next steps, value review, project review, priorizar, roadmap, plan de trabajo, backlog."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Plan
  layer: 0
  depends_on: null
  chains_to: strategic-plan, execution-skills
context_required:
  - brand/{slug}/strategic-plan/current.md
  - brand/{slug}/projects/registry.json
  - brand/{slug}/foundation-state.json
  - brand/{slug}/company-brief/current.md
context_writes:
  - brand/{slug}/projects/P{XX}-{slug}/project.json
  - brand/{slug}/projects/P{XX}-{slug}/tasks.json
  - brand/{slug}/projects/P{XX}-{slug}/playbook.md
  - brand/{slug}/projects/registry.json
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
   - Hilo Discord contiene [P{XX}] → MODE = PROJECT
   - Usuario menciona P{XX} explícitamente → MODE = PROJECT

2. ¿Pide status general sin proyecto específico?
   - "¿Qué hago?" / "next steps" / "status" sin P{XX} → MODE = STATUS

3. Todo lo demás → MODE = GENERAL
```

---

## Mode GENERAL — De petición ad-hoc a proyecto

### Paso 0: Context Hydration (~1 min)

Leer en paralelo:
- `brand/{slug}/strategic-plan/current.md` — objetivos y canales actuales
- `brand/{slug}/projects/registry.json` — proyectos existentes (evitar duplicación)
- `brand/{slug}/foundation-state.json` — estado Foundation
- `brand/{slug}/company-brief/current.md` — contexto de negocio

Si `registry.json` no existe (primer proyecto del cliente), crearlo con `next_id: 1` y `projects: []`.
Si otros archivos no existen, continuar sin ellos (warning, no bloqueo).

Al presentar archivos al usuario, usar siempre links tokenizados de MC (leer `clients.json` para obtener `mcToken`):
`{MC_BASE}/docs/brand/{slug}/projects/P{XX}-{slug}/playbook.md`

### Paso 1: Entender el Objetivo (~1 min)

Parsear la petición del usuario. Extraer:
- **Resultado deseado** (el outcome, no la actividad)
- **A quién afecta** (qué ECP si aplica)
- **Cómo se mide el éxito**

**Principio: Inferir primero, preguntar después.** Si no queda claro, máximo 2 preguntas.

### Paso 2: Alignment Check (Gate Advisory)

Cruzar con `strategic-plan/current.md`:

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

1. **Asignar P{XX}** — Leer `registry.json.next_id`, incrementar
2. **Crear `projects/P{XX}-{slug}/project.json`** — Seguir schema de [data-model.md](../strategic-plan/references/data-model.md):
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
     "discord": { "project_thread_id": null, "project_channel": "projects" },
     "tasks_total": N,
     "tasks_completed": 0,
     "value_review": null
   }
   ```
3. **Crear `projects/P{XX}-{slug}/tasks.json`** — Array de tareas:
   ```json
   {
     "project_id": "P{XX}",
     "tasks": [
       {
         "id": "T01",
         "name": "...",
         "description": "...",
         "deliverable": "...",
         "done_criteria": "...",
         "depends_on": null,
         "status": "pending",
         "owner": "Sancho",
         "channel": "...",
         "discord_thread_id": null,
         "skill": "...",
         "created": "{hoy}",
         "completed": null,
         "output_files": [],
         "notes": ""
       }
     ]
   }
   ```
4. **Crear `projects/P{XX}-{slug}/playbook.md`** — Resumen con links a playbooks de tareas
5. **Crear `projects/P{XX}-{slug}/T{YY}/playbook.md`** — Por cada tarea, instrucciones detalladas
6. **Actualizar `registry.json`** — Añadir entrada, incrementar `next_id`
7. **Regenerar MC data:** `python3 scripts/regenerate.py` (para que MC refleje el nuevo proyecto)
8. **Ofrecer crear hilos Discord** — "¿Creo los hilos en Discord?" → Si sí, seguir `_system/project-threads-protocol.md` (resolver channel IDs desde `brand/{slug}/discord-channels.json` primero; si no existe, ejecutar `message(action=channel-list)` para crearlo)

---

## Mode PROJECT — Gestión dentro de un proyecto existente

Leer `projects/P{XX}-{slug}/project.json` + `tasks.json`.

Detectar sub-modo:

### Add Task

1. Leer `tasks.json` → determinar siguiente T{YY}
2. Proponer tarea con todos los campos obligatorios (usar `depends_on: "P{XX}-T{YY}"` formato completo)
3. **ESPERAR aprobación**
4. Crear en `tasks.json` + crear `T{YY}/playbook.md`
5. Actualizar `tasks_total` en `project.json`
6. **Regenerar MC data:** `python3 scripts/regenerate.py`
7. Ofrecer crear hilo Discord en canal temático

### Edit Task

1. Leer `tasks.json` → encontrar tarea por ID
2. Presentar campos actuales, proponer cambios
3. **ESPERAR aprobación**
4. Actualizar campos en `tasks.json` + actualizar `T{YY}/playbook.md` si aplica
5. **Regenerar MC data:** `python3 scripts/regenerate.py`
6. Si el hilo Discord existe y cambió el nombre → renombrar hilo

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
4. Actualizar `project.json` → status = `reviewed`
5. Actualizar `registry.json`
6. **Regenerar MC data:** `python3 scripts/regenerate.py`
7. Renombrar hilo Discord: `✅ [P{XX}] {nombre} — Reviewed`
8. Si learnings sugieren acción → proponer nuevo proyecto (vuelve a Mode GENERAL)

### Close / Cancel

1. Confirmar con usuario
2. Actualizar status en `project.json` + `registry.json`
3. **Regenerar MC data:** `python3 scripts/regenerate.py`
4. Renombrar hilo Discord según protocolo:
   - Completed: `✅ [P{XX}] {nombre}`
   - Cancelled: `❌ [P{XX}] {nombre}`

---

## Mode STATUS — Dashboard cross-project

Cuando el usuario pregunta "¿qué hago?" o "status" sin especificar proyecto.

1. Leer `registry.json` → todos los proyectos con status `active`
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

## Gate Checks

### 1. Foundation (soft)
```
if foundation-state.json NOT exists OR sections.company-brief.status != "approved":
    WARN → "Foundation incompleta. Puedo crear el proyecto, pero sin contexto estratégico la alineación será limitada."
    CONTINUE (no bloquear)
```

### 2. Strategic Alignment (advisory)
Ver Paso 2 de Mode GENERAL. Informativo — el usuario siempre tiene la última palabra.

### 3. Execution
**NUNCA ejecutar una tarea sin confirmación explícita.** Siempre preguntar: "¿La ejecuto?"

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
- [ ] `registry.json` actualizado con `next_id` correcto
- [ ] Alignment check ejecutado vs strategic plan (si existe)
- [ ] Estimaciones usan velocidad-AI (no timelines de agencia)
- [ ] `description` y `approach` escritos para ser legibles por cualquiera (no técnico)
- [ ] `python3 scripts/regenerate.py` ejecutado después de crear/actualizar proyectos o tareas
- [ ] Hilos Discord mencionan al usuario (`<@{sender_id}>`) en el primer mensaje
- [ ] Links cruzados: proyecto→tareas + tarea→proyecto en Discord
- [ ] Links al usuario usan MC tokenizado (nunca rutas de archivo)

---

## Relación con otros skills

| Relación | Skill | Frontera |
|----------|-------|----------|
| Defiere a | `foundation-orchestrator` | Creación y gestión del DAG de Foundation |
| Defiere a | `strategic-plan` (INIT) | Crear plan estratégico completo desde cero |
| Lee de | `strategic-plan/current.md` | Objetivos, canales, para alignment checks |
| Lee de | `foundation-state.json` | Estado de Foundation |
| Lee de | `skills/strategic-plan/references/strategies-catalog.json` | Vincular tareas a estrategias del catálogo (poblar `strategy.catalog_id` en project.json) |
| Escribe | project.json, tasks.json, playbook.md | Artefactos de proyecto |
| Escribe | registry.json | Índice de proyectos |
| Encadena con | Skills de ejecución | Via dispatch para ejecutar tareas |
| Encadena con | `project-threads-protocol.md` | Para creación de hilos Discord |
