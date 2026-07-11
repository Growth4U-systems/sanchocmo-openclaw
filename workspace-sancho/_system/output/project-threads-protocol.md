# Protocol: Crear hilos de proyectos y tareas en Discord

> Cuando un strategic plan está aprobado y el usuario pide crear los proyectos en Discord.

## Prerequisitos
- `strategic-plan/strategic-plan-current.md` aprobado
- `projects/P{XX}/project.json` + `tasks.json` creados
- Canal `#projects` existe en el guild del cliente
- Canales temáticos existen (web, content, prospecting, etc.)

## Paso 0: Resolver datos del cliente

1. Leer `clients.json` → guild ID + mcToken del cliente
2. MC base URL: `{MC_BASE_URL}/portal/{mcToken}`
3. MC projects URL: `{MC_BASE}/projects/`
4. Leer `brand/{slug}/discord-channels.json` para obtener channel IDs
   - **Si no existe**: ejecutar `message(action=channel-list, guildId={guild_id})`, mapear canales por nombre, y escribir el fichero
   - Formato: `{ "guild_id": "...", "channels": { "projects": "id", "web": "id", ... } }`
5. Cada cliente tiene IDs diferentes — NUNCA hardcodear IDs de un cliente en otro

## Mapeo de canales

Cada tarea tiene un campo `channel` en tasks.json que mapea a un canal Discord del guild:

```
channel field → Discord channel name
web          → #web
content      → #content  
paid-ads     → #paid-ads
prospecting  → #prospecting
partners     → #partners
creatives    → #creatives
research     → #research
brand        → #brand
intelligence → #intelligence
learning     → #learning
```

## Flujo de creación (por proyecto)

### Paso 1: Crear hilo del proyecto en #projects

```
message(action=send, channel=discord, target="{projects_channel_id}", message="[P{XX}] {nombre}")
→ obtener message_id

message(action=thread-create, channel=discord, channelId="{projects_channel_id}", threadName="[P{XX}] {nombre}", messageId="{message_id}")
→ obtener thread_id → guardar como project_thread_id
```

Primer mensaje en el hilo del proyecto (**MENCIONAR al usuario**):
```
<@{sender_id}> 📋 **[P{XX}] {nombre}**

**Objetivo:** {objetivo}
**Estrategia:** {estrategia}
**Fase:** {fase}
**Review:** {review_date}

📊 **Métricas:** {baseline} → {target}

🔗 **Mission Control:** <{MC_BASE}/projects/>

---

**Tareas:** (links se añaden tras crear los hilos)
```

> ⚠️ Sin `<@{sender_id}>`, Discord no notifica y el hilo queda oculto para el usuario.

### Paso 2: Crear hilos de tareas en canales temáticos

Para cada tarea del proyecto:

```
message(action=send, channel=discord, target="{channel_id_del_canal_tematico}", message="[P{XX}-T{YY}] {nombre_tarea}")
→ obtener message_id

message(action=thread-create, channel=discord, channelId="{channel_id}", threadName="[P{XX}-T{YY}] {nombre_tarea}", messageId="{message_id}")
→ obtener task_thread_id → guardar en tasks.json
```

Primer mensaje en el hilo de la tarea (**MENCIONAR al usuario + LINK al proyecto + LINK al playbook**):
```
<@{sender_id}> 🔧 **[P{XX}-T{YY}] {nombre_tarea}**

{descripción}

📂 **Proyecto:** [P{XX}] {nombre_proyecto} → <https://discord.com/channels/{guild}/{project_thread_id}>
📖 **Playbook:** <{MC_BASE}/docs/brand/{slug}/projects/P{XX}/T{YY}/playbook.md>
🔗 **Mission Control:** <{MC_BASE}/projects/>

¿La ejecuto? Esperando confirmación.
```

> ⚠️ El link al proyecto es OBLIGATORIO — el usuario debe poder navegar tarea→proyecto con un click.
> ⚠️ Sin `<@{sender_id}>`, el usuario no ve la tarea en sus notificaciones.

### Paso 3: Mensaje resumen en el hilo del proyecto (links cruzados)

Después de crear TODOS los hilos de tareas, enviar un mensaje al hilo del proyecto con **links a cada hilo de tarea**:

```
📋 **Tareas creadas:**

• <https://discord.com/channels/{guild}/{task_thread_id_1}> — {nombre_T01} → #{channel}
• <https://discord.com/channels/{guild}/{task_thread_id_2}> — {nombre_T02} → #{channel}
...

Todas las tareas esperan confirmación antes de ejecutarse.
```

> ⚠️ **Links cruzados OBLIGATORIOS:**
> - Proyecto → cada tarea (links Discord en este resumen)
> - Cada tarea → proyecto (link Discord en el primer mensaje de la tarea)
> Sin links cruzados, el usuario no puede navegar entre proyecto y tareas.

### Paso 4: Actualizar JSONs

- En `project.json`: guardar `discord.project_thread_id`
- En `tasks.json`: guardar `discord_thread_id` por cada tarea
- MC mostrará los 💬 con links directos a Discord

### Paso 5: Actualizar MC project links

Los links 💬 en Mission Control se generan automáticamente desde los thread_ids en los JSONs.

## Orden de ejecución

Ir proyecto por proyecto:
1. P01 → crear hilo proyecto + todas sus tareas + resumen
2. P02 → idem
3. ...
4. P08 → idem

**IMPORTANTE:**
- Entre proyectos, esperar ~2 segundos (rate limit Discord)
- Máximo 3 tool calls seguidos sin update al hilo (regla de TOOLS.md)
- Dar un update cada 2-3 proyectos creados

## Protocolo de ejecución de tareas

Cuando el usuario confirma una tarea:
1. Sancho ejecuta la tarea usando el skill correspondiente
2. Al completar: mensaje en el hilo de la tarea con resultado + output files
3. Actualizar status en tasks.json → `completed`
4. **Renombrar hilo de la tarea**: `✅ [P{XX}-T{YY}] {nombre}` (añadir ✅ al inicio)
5. Mensaje en hilo del proyecto: "✅ P{XX}-T{YY} completada. Progreso: X/Y"
6. Si todas las tareas completadas → proponer value review + renombrar hilo del proyecto

## Protocolo de cambio de estado en hilos Discord

> ⚠️ **Cuando cambia el estado de un proyecto o tarea, SIEMPRE actualizar el nombre del hilo en Discord Y el status en MC (JSON).**

### Tareas

| Estado nuevo | Acción en hilo Discord | JSON |
|---|---|---|
| `completed` / `done` | Renombrar: `✅ [P{XX}-T{YY}] {nombre}` | status → `completed` |
| `cancelled` | Renombrar: `❌ ~~[P{XX}-T{YY}] {nombre}~~` | status → `cancelled` |
| `blocked` | Renombrar: `⛔ [P{XX}-T{YY}] {nombre}` | status → `blocked` |
| `in-progress` | Renombrar: `🔧 [P{XX}-T{YY}] {nombre}` | status → `in-progress` |
| `todo` | Renombrar: `[P{XX}-T{YY}] {nombre}` (sin emoji) | status → `todo` |

Usar `message(action=channel-edit, channel=discord, channelId="{thread_id}", name="{nuevo_nombre}")` para renombrar.

### Proyectos

| Estado nuevo | Acción en hilo Discord | JSON |
|---|---|---|
| `completed` | Renombrar: `✅ [P{XX}] {nombre}` | status → `completed` en project.json |
| `cancelled` | Renombrar: `❌ [P{XX}] {nombre}` | status → `cancelled` |
| `reviewed` | Renombrar: `✅ [P{XX}] {nombre} — Reviewed` | status → `reviewed` |
| `paused` | Renombrar: `⏸️ [P{XX}] {nombre}` | status → `paused` |

### Sync bidireccional obligatorio
Cada cambio de estado actualiza SIEMPRE:
1. El nombre del hilo en Discord (visual para el usuario)
2. El status en tasks.json / project.json (datos para MC)
3. MC refleja automáticamente los cambios del JSON

## Protocolo de nuevas tareas

Antes de entrar aquí, agotar en este orden: (1) continuar con la skill primaria,
(2) cambiar a otra skill perteneciente al mismo agente si sigue siendo la misma
tarea —la tarea es el límite y `skills[]` solo prioriza—, (3) intervención temporal de Sancho para diagnóstico/reparación/config o
comandos no cubiertos. Ninguna de esas tres opciones crea tarea. Solo continuar
con este protocolo cuando cambió realmente el dominio o el entregable.

Si surge necesidad de nueva tarea:
1. Validar vs strategic plan (alineado / parcial / no)
2. Buscar primero una tarea activa compatible dentro del mismo proyecto/grupo
3. Si hay una coincidencia inequívoca: reutilizar su hilo canónico; si hay varias, pedir elección
4. Si no existe: sugerir crearla dentro del mismo grupo y esperar confirmación explícita; la creación exige la propuesta pendiente emitida por servidor y el mensaje humano afirmativo actual
5. Si aprobada: crear en tasks.json + crear hilo en canal correspondiente
6. Actualizar hilo del proyecto con la nueva tarea
7. "¿La ejecuto?"

## Regla cardinal

**NUNCA ejecutar una tarea sin confirmación explícita del usuario.**
Preguntar siempre: "¿La ejecuto?" y esperar respuesta.
