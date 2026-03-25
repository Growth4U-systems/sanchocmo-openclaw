## 2026-03-24 — Observaciones Sancho

### Sesiones activa (24h)
- **Webchat**: Gateway restart, verificó resolved channels. Cervantes Brain sigue unresolved — problema de permisos Discord, no OpenClaw.
- **Discord #trust-engine-qu-necesitas**: Entregó audit + listas Trust Engine completos
- **Discord #migración-escudero**: Backend arrancado, preguntó sobre continuidad de prueba Trust Engine
- **Discord #cron-jobs**: Reportó 26 cron jobs configurados, todos OK/idle
- **Discord #métricas-y-kpis (G4U)**: Añadió outbound como nuevo canal en metrics plan
- **Discord #projects**: Preguntó a Alfonso qué necesita del Trust Engine (opciones: web, landing, materiales)
- **Discord #campañas-google-ads-meta-ads-plan-por-nicho**: Identificó líneas a eliminar del doc (formularios Es Normal/Postparto)
- **Cron Morning Metrics**: Growth4U — 8 leads (€14.54/lead), CPL mejorado vs media, 0 citas
- **Cron Morning Metrics Multi-Client**: Sin alertas rojas, 8 leads (casi x2 media 7d)
- **Cron cost-tracker-daily**: Sin anomalías — uso 21% media
- **Cron Regenerar Dashboard**: 40/84 pilares completados
- **Cron update-skills**: OpenClaw 2026.3.13→2026.3.23-2, 11 skills actualizados
- **Cron Daily Metrics Collector**: 5/5 fuentes OK

### Errores/Skills que fallaron
- **Cron Daily Pulse FALLÓ**: La herramienta `message` no soporta acción `read` — no puede leer mensajes de Discord. Error reportado en #infra.
- **Skill positioning-messaging** (audit 16 Mar): Q=3.0 — complejidad excesiva. Pendiente simplificar.

### Problemas detectados
1. **Cron Daily Pulse roto**: Tool limitation, no de Sancho. Se requiere habilitar lectura de mensajes o usar API alternativa.
2. **Canales unresolved persistentes**: Cervantes Brain (`1478770422093709502`), 1 canal Growth4U, 4 canales Kleva — permisos Discord, no OpenClaw.
3. **0 citas de 8 leads**: Mismo patrón que ayer — fricción lead→cita. Los leads vienen de Facebook sin tags, verificar flujo nurturing.

### Reglas de canal
✅ Menciones correctas (@Alfonso, @Martin)
✅ Respuestas en hilos correctos
✅ NO_REPLY cuando corresponde
✅ Métricas reportadas en canales correctos (#intelligence, #métricas-y-kpis)
✅ Análisis estructurado con tablas y emojis

### Notas
- Sancho funcionando bien — crons ejecutándose correctamente
- El fallo del Daily Pulse es una limitación de herramientas, no un error de Sancho
- El issue de leads sin tags de Facebook fue detectado (mismo problema que ayer)
- Los canales unresolved son problema de permisos Discord, no de configuración de OpenClaw
- **NO requiere atención de Alfonso** — los problemas son técnicos/de infraestructura