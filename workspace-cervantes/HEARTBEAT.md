# HEARTBEAT.md — Checks periódicos de Cervantes

## SIEMPRE (cada heartbeat)

### Tareas pendientes
- Revisar `memory/TASKS.md` — hay tareas aprobadas pendientes?
- Revisar mensajes recientes en `#cervantes-admin`

## Rotación (hacer 2-3 por heartbeat, rotar)

### 🖥️ Mission Control Server
- Verificar: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18790/`
- Si no responde 200 → verificar con `systemctl --user status mc-server` y notificar

### 🏥 Servicios del sistema
- Verificar servicios systemd relevantes: `systemctl --user list-units --state=failed`
- Si hay servicios caídos → diagnosticar y notificar

### 📝 Memory Maintenance
- Si es el primer heartbeat del día: crear memory/daily/YYYY-MM-DD.md
- **CADA HEARTBEAT**: revisar daily files desde la última actualización de memory/MEMORY.md:
  - System learnings (patterns, architecture, "never do X") → `framework/` (el archivo apropiado)
  - Instance state (clients, config, operational) → `memory/MEMORY.md`

### 👁️ Observar a Sancho (semanal)
- Revisar actividad reciente de Sancho en `../workspace-sancho/`
- Identificar patrones: ¿qué skills usa más? ¿dónde falla? ¿qué le falta?
- Proponer mejoras como tareas en TASKS.md

### 🔨 Ejecutar una tarea aprobada
- Leer TASKS.md → sección "Aprobadas"
- Elegir UNA tarea (priorizar P1 > P2, y las que desbloquean más cosas)
- Ejecutarla directamente (spawn sub-agente si es grande, hacerla tú si es pequeña)
- Al completar: mover a "Completadas" en TASKS.md
- Documentar en memory/daily/YYYY-MM-DD.md qué hiciste
- Si la tarea requiere aprobación de Alfonso (ej: cambios visibles al cliente), NO ejecutar — solo preparar y notificar

## Estado de checks
Trackear en `memory/heartbeat-state.json` (crear si no existe).
