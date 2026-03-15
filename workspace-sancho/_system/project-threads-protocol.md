# Protocol: Crear hilos de proyectos y tareas en Discord

> Cuando un strategic plan está aprobado y el usuario pide crear los proyectos en Discord.

## Prerequisitos
- `strategic-plan/current.md` aprobado
- `projects/registry.json` + `projects/P{XX}-{slug}/tasks.json` creados
- Canal `#projects` existe en el guild del cliente
- Canales temáticos existen (web, content, prospecting, etc.)

## Paso 0: Resolver datos del cliente

1. Leer `clients.json` → guild ID + mcToken del cliente
2. MC base URL: `https://sancho-cmo.taild48df2.ts.net/mc/portal/{mcToken}`
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

Primer mensaje en el hilo del proyecto:
```
📋 **[P{XX}] {nombre}**

**Objetivo:** {objetivo}
**Estrategia:** {estrategia}
**Fase:** {fase}
**Review:** {review_date}

📊 **Métricas:** {baseline} → {target}

🔗 **Mission Control:** <{MC_BASE}/projects/>

---

**Tareas:** (links se añaden tras crear los hilos)
```

### Paso 2: Crear hilos de tareas en canales temáticos

Para cada tarea del proyecto:

```
message(action=send, channel=discord, target="{channel_id_del_canal_tematico}", message="[P{XX}-T{YY}] {nombre_tarea}")
→ obtener message_id

message(action=thread-create, channel=discord, channelId="{channel_id}", threadName="[P{XX}-T{YY}] {nombre_tarea}", messageId="{message_id}")
→ obtener task_thread_id → guardar en tasks.json
```

Primer mensaje en el hilo de la tarea:
```
🔧 **[P{XX}-T{YY}] {nombre_tarea}**

**Descripción:** {descripción}
**Canal:** #{channel}
**Owner:** {owner}

📂 **Proyecto:** [P{XX}] {nombre_proyecto} → <https://discord.com/channels/{guild}/{project_thread_id}>
🔗 **Mission Control:** <{MC_BASE}/projects/>

---

¿La ejecuto? Esperando confirmación para empezar.
```

### Paso 3: Mensaje resumen en el hilo del proyecto

Después de crear TODOS los hilos de tareas, enviar un mensaje al hilo del proyecto:

```
📋 **Tareas creadas:**

| # | Tarea | Canal | Estado |
|---|-------|-------|--------|
| [P{XX}-T01](https://discord.com/channels/{guild}/{task_thread_id}) | {nombre} | #{channel} | Por hacer |
| [P{XX}-T02](https://discord.com/channels/{guild}/{task_thread_id}) | {nombre} | #{channel} | Por hacer |
...

Todas las tareas esperan confirmación antes de ejecutarse.
```

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
4. Mensaje en hilo del proyecto: "✅ P{XX}-T{YY} completada. Progreso: X/Y"
5. Si todas las tareas completadas → proponer value review

## Protocolo de nuevas tareas

Si surge necesidad de nueva tarea:
1. Validar vs strategic plan (alineado / parcial / no)
2. Si aprobada: crear en tasks.json + crear hilo en canal correspondiente
3. Actualizar hilo del proyecto con la nueva tarea
4. "¿La ejecuto?"

## Regla cardinal

**NUNCA ejecutar una tarea sin confirmación explícita del usuario.**
Preguntar siempre: "¿La ejecuto?" y esperar respuesta.
