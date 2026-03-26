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

---

## 2026-03-25 — Observaciones Sancho

### Sesiones activa (10:12h)
- **Discord #infra** (OpenClaw infra): Activa — Alfonso verifica "Comprueba"
- **Webchat**: Respondió sobre Gateway estable, errores "pairing required" son intentos WS sin autenticar (no grave)
- **Cron Morning Metrics — Growth4U**: Canal Discord unavailable — guardó métricas en memoria, reintentará
- **Cron Morning Metrics — Multi-Client**: Mismo problema — script ejecutado pero Discord unavailable
- **Cron cost-tracker-daily**: Sin anomalías — uso 33% de media diaria (temprano)
- **Cron Regenerar Dashboard**: 54 tareas, 100 eventos, 40/84 pilares, 6 agents
- **Cron Daily Pulse**: NUEVO FALLO — tool `message` sin acción `read`. Pide opciones al usuario
- **Cron update-skills**: 11 skills actualizados (apify, google-analytics, gsc, meta-ads, etc.)
- **Cron Call Prep Daily**: 1 llamada mañana (11:00 Eduardo Zuñiga), 3 eventos no-matchean con leads GHL
- **Cron Lead Sync**: Dry run exitoso — 4 leads con tag `llamada-agendada`, 0 enriquecidos previamente
- **Discord #10-visual-identity**: Generando logo SanchoCMO — abortado por usuario
- **Discord #web** (Paymatico): Corrigió página a "LP Fitness - Cadenas de Gimnasios"
- **Discord #migración-escudero**: Sesión abierta sin output visible
- **Discord #skills > Alarife**: Publicó en hilo Paymatico #web — importación exitosa
- **Discord #webchat-mission-control**: Sesión completada
- **Discord #bots-de-engagement-ig-li**: длительная сессия (206s) — probablemente ejecutando bots
- **Discord #mission-control**: Sesión completada (83s)
- **Discord #projects**: Spawneó Escudero para artículo SEO — completado ✅
- **Discord #métricas-y-kpis**: Análisis extenso completado
- **Discord #conexiones-apis-y-mcps**: Conectividad verificada
- **Discord #partners**: Heartbeat — detectó 10+ emails unread, 2 eventos en <30 min, alertó
- **Discord #idea-generation-system**: Completó refactor de tabla de ideas con subagentes

### Errores/Skills que fallaron
- **Cron Daily Pulse**: Mismo error que ayer — tool limitation (no hay `message read`)
- **Discord channel unavailable**: Morning Metrics no puede enviar a #intelligence — puede que el bot esté desconectado o sea tema de permisos
- **#10-visual-identity**: Image generate abortado — probablemente timeout o prompt muy largo
- **#migración-escudero**: Sin output visible — puede que haya respondido y no se capturó, o está en progreso

### Problemas detectados
1. **Discord channel unavailable** (nuevo): Morning Metrics no puede enviar reportes — verificar estado del bot
2. **Daily Pulse sigue roto**: Mismo problema que ayer — no hay solución aún
3. **0 citas de 8 leads**: Persiste — mismo patrón (fricción lead→cita)
4. **Leads sin enrichment**: Lead Sync detectó 4 leads pendientes de enrichment completo (dry run mode)

### Reglas de canal
✅ Menciones correctas (@Alfonso, @Martin)
✅ Respuestas en hilos correctos
✅ NO_REPLY cuando corresponde
✅ Métricas reportadas en canales correctos
✅ Análisis estructurado con tablas y emojis
✅ Heartbeat proactivo (detectó eventos en <30 min)

### Notas
- Sancho funcionando bien en general
- **PROBLEMA NUEVO**: Discord channel unavailable — revisar estado del bot en #admin
- El Daily Pulse sigue roto (misma limitación de tool)
- Los canales unresolved son problema de permisos Discord
- Escudero participó correctamente en #projects (artículo SEO completado)
- Heartbeat de #partners fue proactivo — detectó eventos cercanos yemails importantes

### Acción sugerida
- Revisar estado del bot Discord — ¿está conectado? ¿Hay permisos correctos?
- Opcional: notificar a Alfonso sobre Discord channel unavailable