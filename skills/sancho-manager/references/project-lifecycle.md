# Project Lifecycle

> Máquina de estados completa de proyectos y tareas. Transiciones y responsables. Mission Control lee `project.json` + `tasks.json` **en vivo** — no hay paso de regeneración ni sincronización externa.

---

## Estados de Proyecto

```
proposed → active → completed → reviewed
                  ↘ paused
                  ↘ cancelled
```

| Estado | Significado | Quién triggerea |
|--------|------------|-----------------|
| `proposed` | Propuesto, pendiente validación vs strategic plan | Sancho Manager |
| `active` | Aprobado y en ejecución | Usuario (al aprobar propuesta) |
| `paused` | Pausado temporalmente | Usuario |
| `completed` | Todas las tareas hechas, pendiente value review | Automático (cuando última tarea = completed) |
| `reviewed` | Value review completada | Sancho Manager (tras generar value-review.md) |
| `cancelled` | Cancelado | Usuario |

## Estados de Tarea

Vocabulario canónico (ver `src/lib/task-status.ts`). El estado inicial es **`todo`** (nunca `pending`).

```
todo → in-progress → pending-review → completed
                   ↘ blocked
                   ↘ cancelled
```

| Estado | Significado | Quién triggerea |
|--------|------------|-----------------|
| `todo` | Creada, no empezada | Sancho Manager (al crear) |
| `in-progress` | En ejecución | Agente ejecutor (al empezar) |
| `pending-review` | Entregable listo, pendiente revisión humana | Agente ejecutor |
| `blocked` | Bloqueada por dependencia | Automático (si depends_on no completada) |
| `completed` | Terminada y aprobada | Usuario / agente (tras revisión) |
| `cancelled` | Cancelada | Usuario |

---

## Transiciones y acciones

### Proyecto: proposed → active
- **Trigger:** Usuario aprueba propuesta del Manager
- **Acciones:**
  1. Crear `project.json` + `tasks.json` (tasks en `todo`) + `playbook.md`
  2. Crear el hilo de chat vacío de cada task en `brand/{slug}/chat/{mc_chat_thread_id}.json`

### Proyecto: active → completed
- **Trigger:** Última tarea marcada como completed
- **Acciones:**
  1. Actualizar status en `project.json`
  2. Proponer value review al usuario

### Proyecto: completed → reviewed
- **Trigger:** Value review generada y aprobada
- **Acciones:**
  1. Generar `value-review.md`
  2. Actualizar status en `project.json`
  3. Si learnings sugieren acción → proponer nuevo proyecto

### Tarea: todo → in-progress
- **Trigger:** Usuario confirma "¿La ejecuto?" o el agente ejecutor empieza
- **Acciones:**
  1. Actualizar status en `tasks.json`

### Tarea: in-progress → pending-review → completed
- **Trigger:** Deliverable entregado y validado
- **Acciones:**
  1. Actualizar status en `tasks.json` (+ `completed` date al cerrar)
  2. Registrar `output_files` en `tasks.json`
  3. Actualizar `tasks_completed` en `project.json`
  4. Si era la última → trigger proyecto completed

### Tarea: → blocked
- **Trigger:** depends_on tiene tarea no completada
- **Acciones:**
  1. Actualizar status en `tasks.json`
  2. Notificar al usuario qué la bloquea

---

## Sincronización

Cada cambio de estado actualiza el **status en el JSON** (`project.json` / `tasks.json`). Mission Control lo refleja en vivo — no hay regeneración ni sistemas externos que sincronizar.

---

## Archivos por proyecto

```
projects/P{XX}/
  project.json          ← metadata del proyecto
  tasks.json            ← todas las tareas
  playbook.md           ← resumen + links a playbooks de tareas
  value-review.md       ← generado al completar (si aplica)
  T01/
    playbook.md         ← instrucciones detalladas de la tarea
  T02/
    playbook.md
  ...
```

> Cada tarea tiene su propia carpeta y playbook. NUNCA meter todo en un solo fichero.
> El playbook del proyecto es un resumen con links a los playbooks individuales.

---

## Regla cardinal

**NUNCA ejecutar una tarea sin confirmación explícita del usuario.** Siempre: "¿La ejecuto?"
