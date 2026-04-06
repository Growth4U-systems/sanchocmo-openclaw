# HEARTBEAT.md — Checks periódicos de Cervantes

## SIEMPRE (cada heartbeat)

### 🔑 Device Pairing
- Ejecutar: `openclaw devices list`
- Si hay pending devices → notificar a Alfonso inmediatamente
- NO aprobar automáticamente — solo notificar

## Rotación (hacer 2-3 por heartbeat, rotar)

### 🏥 Gateway Health
- Ejecutar: `openclaw status`
- Si gateway no está running → notificar
- Si hay critical warnings → notificar

### 🔄 Updates Disponibles
- Revisar si hay nueva versión de OpenClaw
- Si hay update → notificar (no actualizar automáticamente)

### 🖥️ Mission Control Server
- Verificar: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18790/`
- Si no responde 200 → reiniciar: `launchctl kickstart -k gui/$(id -u)/com.sancho.mc-server`

### 🤖 Discord Bot Status
- Verificar bot conectado (revisar en `openclaw status`)
- Si desconectado → notificar

### 🔄 Regenerar Mission Control
- Ejecutar: `python3 ~/.openclaw/workspace-sancho/scripts/regenerate.py`
- Solo si ha pasado >2h desde la última regeneración
- Trackear timestamp en heartbeat-state.json

### 📝 Memory Maintenance
- Si es el primer heartbeat del día: crear memory/daily/YYYY-MM-DD.md
- **CADA HEARTBEAT**: revisar daily files desde la última actualización de memory/MEMORY.md:
  - System learnings (patterns, architecture, "never do X") → `framework/` (el archivo apropiado)
  - Instance state (clients, config, operational) → `memory/MEMORY.md`

### 👁️ Observar a Sancho (semanal)
- Revisar sesiones recientes de Sancho (sessions_list/sessions_history)
- Identificar patrones: ¿qué skills usa más? ¿dónde falla? ¿qué le falta?
- Proponer mejoras como tareas en TASKS.md

### 🔨 Ejecutar una tarea aprobada
- Leer TASKS.md → sección "✅ Aprobadas"
- Elegir UNA tarea (priorizar P1 > P2, y las que desbloquean más cosas)
- Ejecutarla directamente (spawn sub-agente si es grande, hacerla tú si es pequeña)
- Al completar: mover a "✔️ Completadas" en TASKS.md + regenerar MC
- Documentar en memory/daily/YYYY-MM-DD.md qué hiciste
- Si la tarea requiere aprobación de Alfonso (ej: cambios visibles al cliente), NO ejecutar — solo preparar y notificar

### 📋 Actualizar CHANGELOG
- Si hubo cambios desde la última entrada del CHANGELOG → añadir entrada
- Archivo: `~/.openclaw/workspace-sancho/CHANGELOG.md`
- Formato Keep a Changelog (Added/Changed/Fixed/Removed)
- Solo si hay cambios reales — no crear entradas vacías

## Estado de checks
Trackear en memory/heartbeat-state.json
