## 2026-03-22 — Observaciones Sancho

### Sesiones activa (24h)
- **Discord #creación-de-webs**: Ayudando a Martín con GitHub Actions (setup-buildx-action)
- **Discord #migración-escudero**: Reescribiendo PDR v4.0 con feedback de Alfonso (~900→400 líneas)
- **Discord #organización-discord**: Seguimiento a reorganización de canales
- **Discord #idea-generation**: Registrando decisiones de diseño (D1-D4)
- **Discord #monitoreo-recurrente-de-métricas**: Identificando problema de timeout en cron
- **Cron cost-tracker**: Ejecutado OK (MiniMax)
- **Cron regenerate-dashboard**: 54 tareas, 100 eventos, 40/84 pilares
- **Cron image-optimizer**: Sin imágenes que optimizar
- **Cron update-skills**: 10 skills actualizados

### Problemas detectados
1. **Cron métricas recurrente fallando**: Timeout en sesiones aisladas. Sancho propuso solución (agentTurn ultraligero). Pendiente aprobación.
2. **API Anthropic 401** (previo): Cervantes ya gestionó con recovery message.

### Reglas de canal
✅ Correcto uso de @menciones
✅ Respuestas estructuradas en hilos correctos
✅ NO_REPLY cuando corresponde

### Notas
- Sancho está funcionando correctamente
- Activo en múltiples canales de Discord con Alfonso y Martín
- Crons básicos funcionando (algunos con MiniMax para reducir costos)
- No hay errores críticos propios de Sancho

---

## 2026-03-23 — Observaciones Sancho

### Sesiones activa (24h)
- **Cron Weekly Synthesis**: Completado — 7 archivos daily leídos, brand/learnings.md actualizado con 5 patrones, memory/patterns.md migrado de vacío a activo. Reportado en hilo dedicado.
- **Discord #intelligence (G4U)**: Daily pulse — sin actividad humana en últimas 24h, 9 canales revisados, 0 con actividad reciente
- **Discord #métricas-y-kpis (G4U)**: Morning metrics — 5 leads, 0 citas, spend€109 (vs media €140), CTR 2.47% (vs media 3.13%). Análisis correcto: spend descendente + CTR bajo + 0 citas = revisar seguimiento
- **Discord #métricas-y-kpis (HC)**: Morning metrics — 13K impressions (x2 vs media), CPC €0.62 (mejor), 0 citas de 5 leads. Mismos problemas de conversión lead→cita
- **Cron Morning Metrics Multi-Client**: Growth4U OK, Hospital Capilar/Paymatico/Masavo skip (no APIs)
- **Cron Daily Metrics Collector**: 5/5 fuentes OK (GA4, GSC, Metricool, Meta Ads, GHL)
- **Cron update-skills**: 10 plugins actualizados, 119 skills en workspace
- **Cron Memory Maintenance**: Completado — MEMORY.md actualizado con eventos de la semana
- **Cron Lead Sync (dry run)**: 241 contactos, 3 con tag "llamada-agendada" sin eventos de Calendar — ISSUE detectadoy reportado

### Errores/Skills que fallaron
- **Cron image-optimizer**: Error JSON en argumentos exec (bug del cron, no de Sancho)
- **Skills audit (16 Mar)**: 2 skills con Q=3.0 (positioning-messaging: complejidad excesiva; niche-discovery-100x: bug SIGTERM en scripts Python). No son fallos recientes sino deuda conocida.

### Problemas detectados
1. **3 leads con "llamada-agendada" sin eventos Calendar**: Mikel Catena, Eduardo Zuñiga, Daniel Serrano — tags indican llamada programada pero NO hay eventos en Calendar. Posibles causas: booking sin crear evento, tags obsoletos, o error en automatización GHL. Sancho lo detectó y documentó correctamente.
2. **CTR Meta Ads descendiendo**: 2.47% vs 3.13% media — posible fatiga creativa o cambio de audience
3. **0 citas de 5 leads**: Mismo problema en G4U y HC — fricción en pipeline lead→cita

### Reglas de canal
✅ Weekly synthesis publicada en hilo dedicado (no en canal público)
✅ Cron metrics collector reportado a #infra (no a canales cliente)
✅ Análisis de métricas en canales correctos (#intelligence, #métricas-y-kpis)
✅ Respuestas estructuradas con emojis y tablas

### Notas
- Sancho funcionando bien —weekly synthesis robusta, detección de anomalías correcta
- El issue de leads sin Calendar es hallazgo valioso (data integrity problem)
- Crons ejecutándose con modelo apropiado (Sonnet para ejecución, MiniMax para crons ringan)
- NO hay errores críticos propios de Sancho que requieran atención de Alfonso