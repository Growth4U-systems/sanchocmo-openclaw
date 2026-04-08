# Project Lifecycle

> Máquina de estados completa de proyectos y tareas. Transiciones, responsables, y sincronización Discord.

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

```
pending → in-progress → completed
                      ↘ blocked
                      ↘ cancelled
```

| Estado | Significado | Quién triggerea |
|--------|------------|-----------------|
| `pending` | Creada, no empezada | Sancho Manager (al crear) |
| `in-progress` | En ejecución | Escudero (al empezar) |
| `blocked` | Bloqueada por dependencia | Automático (si depends_on no completada) |
| `completed` | Terminada | Escudero (al entregar deliverable) |
| `cancelled` | Cancelada | Usuario |

---

## Transiciones y acciones

### Proyecto: proposed → active
- **Trigger:** Usuario aprueba propuesta del Manager
- **Acciones:**
  1. Crear `project.json` + `tasks.json` + `playbook.md`
  2. `python3 scripts/regenerate.py`
  4. (Opcional) Crear hilo en #projects — mencionar usuario con `<@{sender_id}>`

### Proyecto: active → completed
- **Trigger:** Última tarea marcada como completed
- **Acciones:**
  1. Actualizar status en `project.json`
  2. `python3 scripts/regenerate.py`
  3. Proponer value review al usuario
  4. Mensaje en hilo del proyecto: "Todas las tareas completadas. ¿Hacemos value review?"

### Proyecto: completed → reviewed
- **Trigger:** Value review generada y aprobada
- **Acciones:**
  1. Generar `value-review.md`
  2. Actualizar status en `project.json`
  3. `python3 scripts/regenerate.py`
  4. Renombrar hilo Discord: `✅ [P{XX}] {nombre} — Reviewed`
  5. Si learnings sugieren acción → proponer nuevo proyecto

### Tarea: pending → in-progress
- **Trigger:** Usuario confirma "¿La ejecuto?" o Escudero empieza
- **Acciones:**
  1. Actualizar status en `tasks.json`
  2. Renombrar hilo Discord: `🔧 [P{XX}-T{YY}] {nombre}`

### Tarea: in-progress → completed
- **Trigger:** Deliverable entregado y validado
- **Acciones:**
  1. Actualizar status en `tasks.json` + `completed` date
  2. Registrar `output_files` en `tasks.json`
  3. Actualizar `tasks_completed` en `project.json`
  4. `python3 scripts/regenerate.py`
  5. Renombrar hilo Discord: `✅ [P{XX}-T{YY}] {nombre}`
  6. Mensaje en hilo del proyecto: "✅ T{YY} completada. Progreso: X/Y"
  7. Si era la última → trigger proyecto completed

### Tarea: → blocked
- **Trigger:** depends_on tiene tarea no completada
- **Acciones:**
  1. Actualizar status en `tasks.json`
  2. Renombrar hilo Discord: `⛔ [P{XX}-T{YY}] {nombre}`
  3. Notificar en hilo del proyecto qué la bloquea

---

## Sincronización Discord

Cada cambio de estado actualiza SIEMPRE:
1. **Nombre del hilo Discord** (visual para el usuario)
2. **Status en JSON** (datos para Mission Control)
3. **`python3 scripts/regenerate.py`** (para que MC refleje los cambios)

> Nota: El estado inicial de tareas es `pending` (no `todo`). Usar `pending` consistentemente en todos los JSONs.

### Emojis en hilos

| Estado | Emoji | Ejemplo hilo |
|--------|-------|--------------|
| pending | (ninguno) | `[P01-T03] Unificar booking` |
| in-progress | 🔧 | `🔧 [P01-T03] Unificar booking` |
| completed | ✅ | `✅ [P01-T03] Unificar booking` |
| blocked | ⛔ | `⛔ [P01-T04] Landing page` |
| cancelled | ❌ | `❌ [P01-T05] A/B test` |
| paused (proyecto) | ⏸️ | `⏸️ [P03] Cold Email` |
| reviewed (proyecto) | ✅ | `✅ [P01] Fontanería — Reviewed` |

---

## Archivos por proyecto

```
projects/P{XX}-{slug}/
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
