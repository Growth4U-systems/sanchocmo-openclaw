# HEARTBEAT.md — Checks periódicos de Cervantes

## Reglas

- Hacer solo checks ligeros y mantenimiento pequeño.
- No ejecutar tareas de desarrollo automáticamente desde heartbeat.
- Si no hay nada accionable: responder con `heartbeat_respond` y `notify=false`.
- Si hay una alerta real: registrar el detalle en `memory/heartbeat-state.json` y devolver una notificación breve.
- Rotar como máximo 2 checks por heartbeat.

## SIEMPRE (cada heartbeat)

### Tareas pendientes
- Revisar `memory/TASKS.md` — hay tareas aprobadas pendientes?
- Si hay tareas aprobadas, resumirlas en `memory/heartbeat-state.json`; no ejecutarlas.
- Revisar mensajes recientes en `#cervantes-admin` solo si el canal/herramienta está disponible.

## Rotación (hacer 2-3 por heartbeat, rotar)

### 🖥️ Mission Control Server
- Verificar: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18790/`
- Si no responde 200 → registrar alerta con diagnóstico corto.

### 🏥 Servicios del sistema
- Verificar estado básico del gateway y Mission Control.
- Si hay servicios caídos → registrar alerta con diagnóstico corto.

### 📝 Memory Maintenance
- Si es el primer heartbeat del día: crear memory/daily/YYYY-MM-DD.md
- Como máximo una vez al día: revisar daily files desde la última actualización de memory/MEMORY.md:
  - System learnings (patterns, architecture, "never do X") → `framework/` (el archivo apropiado)
  - Instance state (clients, config, operational) → `memory/MEMORY.md`

### 👁️ Observar a Sancho (semanal)
- Revisar actividad reciente de Sancho en `../workspace-sancho/`
- Identificar patrones: ¿qué skills usa más? ¿dónde falla? ¿qué le falta?
- Proponer mejoras como tareas en TASKS.md

### 🔨 Tareas aprobadas
- Leer TASKS.md → sección "Aprobadas".
- Preparar un resumen/prioridad si hay algo pendiente.
- NO ejecutar tareas automáticamente desde heartbeat.

## Estado de checks
Trackear en `memory/heartbeat-state.json` (crear si no existe).
