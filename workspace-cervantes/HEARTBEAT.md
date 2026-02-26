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
- Si es el primer heartbeat del día: crear memory/YYYY-MM-DD.md
- Cada 3 días: revisar daily files recientes → actualizar MEMORY.md

### 👁️ Observar a Sancho (semanal)
- Revisar sesiones recientes de Sancho (sessions_list/sessions_history)
- Identificar patrones: ¿qué skills usa más? ¿dónde falla? ¿qué le falta?
- Proponer mejoras como tareas en TASKS.md

## Estado de checks
Trackear en memory/heartbeat-state.json
