# HEARTBEAT.md — Checks periódicos de Sancho (CMO)

## Rotación (hacer 2-3 por heartbeat, rotar)

### 📧 Email
- Revisar inbox de alfonso@growth4u.io (gog gmail inbox, últimas 5)
- Si hay algo urgente → notificar

### 📅 Calendario
- Revisar próximas 48h (gog calendar upcoming)
- Si hay evento en <2h → notificar

### 📝 Memory Maintenance
- Si es el primer heartbeat del día: crear memory/YYYY-MM-DD.md
- Cada 3 días: revisar daily files recientes → actualizar MEMORY.md

### 📊 Lead Sync (primer heartbeat después de 22:00)
- Ejecutar lead-intelligence-hub para cada cliente con lead_sync_enabled
- Sync completo: detectar nuevos leads + actualizar existentes
- NO ejecutar en otros heartbeats del día
- Trackear en memory/heartbeat-state.json → lead_sync.last_run

### 📞 Sales Call Prep (primer heartbeat después de 22:30, DESPUÉS del lead sync)
- Si hay llamadas en Calendar para mañana
- Ejecutar sales-call-prep para generar briefing con script personalizado
- Enviar briefing a Discord #intelligence
- NO ejecutar en otros heartbeats del día
- Trackear en memory/heartbeat-state.json → sales_call_prep.last_run

## Estado de checks
Trackear en memory/heartbeat-state.json
