# HEARTBEAT.md — Checks periódicos de Sancho (CMO)

## Reglas

- Hacer solo checks ligeros. No ejecutar skills largos, Foundation, Content Engine, Lead Sync ni Sales Call Prep desde heartbeat.
- Si no hay nada accionable: responder con `heartbeat_respond` y `notify=false`.
- Si hay una alerta real: registrar el detalle en `memory/heartbeat-state.json` y devolver una notificación breve.
- Rotar como máximo 2 checks por heartbeat.

### 📧 Email
- Revisar inbox de alfonso@growth4u.io (gog gmail inbox, últimas 5)
- Si hay algo urgente → registrar alerta

### 📅 Calendario
- Revisar próximas 48h (gog calendar upcoming)
- Si hay evento en <2h → registrar alerta

### 📝 Memory Maintenance
- Si es el primer heartbeat del día: crear memory/YYYY-MM-DD.md
- Cada 3 días: revisar daily files recientes → actualizar MEMORY.md

### 📊 Lead Sync
- Verificar que el cron `Lead Intelligence Hub — Nightly` corrió cuando correspondía.
- Si no corrió o falló → registrar alerta.
- NO ejecutar el skill desde heartbeat.

### 📞 Sales Call Prep
- Verificar que el cron `Sales Call Prep — Nightly` corrió cuando correspondía.
- Si hay llamadas mañana y no hay briefing generado → registrar alerta.
- NO ejecutar el skill desde heartbeat.

## Estado de checks
Trackear en memory/heartbeat-state.json
