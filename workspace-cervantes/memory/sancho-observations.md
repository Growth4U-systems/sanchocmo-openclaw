# Observaciones Sancho

---

## 2026-04-21 — Cervantes observa a Sancho (08:00 UTC / 10:00 CEST)

### Sesiones activas (últimas 24h): ~29 sesiones detectadas

| Sesión | Canal | Estado | Notas |
|--------|-------|--------|-------|
| Morning Metrics — Growth4U | cron | ⚠️ Partial | Ejecutó correctamente, guardó JSON. **No logró publicar en Discord** — múltiples intentos fallidos (subagent, browser, exec API). Reporte salvado en `brand/growth4u/recurring-tasks/morning-metrics/2026-04-21.json` pero NO llegó a Discord. |
| Daily Pulse — Growth4U | cron → Discord | ✅ OK | 0 actividad humana 8 canales. Reportó correctamente sin publicar hilo (protocolo: sin datos = sin hilo). |
| Daily Pulse — Hospital Capilar | cron → Discord | ✅ OK | 0/9 canales activos. Reportó correctamente. |
| Call Prep Daily — Growth4U | cron → Discord | ✅ OK | 2 llamadas hoy (Alfonso Nistal IASAF 13:00 + Josep M Gil Heltech 16:00). Briefing enviado a hilo #intelligence via subagent. |
| Lead Sync — Growth4U | cron | ✅ OK | Sin leads nuevos. 4 enrichment pending. |
| Morning Metrics — Hulahoop | cron | ⚠️ NO_APIS | Sin APIs configuradas. Comportamiento correcto. |
| Performance Analysis — Growth4U | cron | ✅ OK | Completó (datos de ayer). |
| Performance Analysis — Hulahoop | cron | ⚠️ NO_DATA | Brand nueva (sin métricas). Correcto. |
| Weekly Synthesis — Growth4U | cron | ✅ OK | Completó. |
| Weekly Synthesis — HC | cron → Discord | ✅ OK | Síntesis enviada a #intelligence con hilo. 0 actividad 7 días. |
| Meeting Intelligence | cron | ✅ OK | Sin reuniones nuevas. Mensaje informativo. |
| Cost Tracker Daily | cron | ✅ OK | Sin anomalías. |
| update-skills | cron | ⚠️ Running | Aún ejecutándose. |
| image-optimizer | cron | ⚠️ Running | Aún ejecutándose. |
| cron-watchdog-weekly | cron | ⚠️ Running | Aún ejecutándose. |
| MC Chat P06-T07 (Growth4U) | MC Chat | ✅ OK | Sesión interactiva sobre guest posts con Publisuites + Puromarketing. Iteraciones para definir topics. Captó error con caracteres chinos y se autocorrigió. |
| MC Chat — Trust Engine (Hulahoop) | MC Chat | ✅ OK | Sesión completada correctamente. |
| MC Chat Paymatico | MC Chat | ✅ Idle | Sin actividad reciente. |
| Heartbeats (noche/madrugada) | webchat | ✅ OK | HEARTBEAT_OK en quiet hours (23:00–06:00). Correcto. |
| Discord #admin (Nahuel greeted) | discord | ✅ OK | Greeted apropiadamente. |

### Errores y problemas activos

1. **🔴 Morning Metrics Growth4U — NO se publicó en Discord**: El cron ejecutó bien (recogió datos, analizó, guardó JSON en `recurring-tasks/`), pero cuando intentó publicar en `#intelligence` de Growth4U, todos los mecanismos fallaron:
   - Intento directo via Discord REST API con bot token → 403 Forbidden (token de HC no tiene permisos en guild Growth4U)
   - Intento via subagent → funcionó parcialmente (el subagent pudo enviar Call Prep pero Morning Metrics se perdió en el proceso)
   - **Resultado**: El reporte quedó en `brand/growth4u/recurring-tasks/morning-metrics/2026-04-21.json` pero **no se entregó a Discord**. Esto es una degradación del sistema de reporting — Alfonso no recibió las métricas de la mañana.
   - **Causa raíz**: Los crons que ejecutan via `exec-event` no tienen acceso al `message` tool nativo de las sesiones interactivas. El bot token disponible es de la guild HC, no de la guild Growth4U.

2. **⚠️ Instantly campaigns error** — `(campaigns || []) is not iterable`. Error conocido desde hace semanas. Afecta solo a la fuente Instantly en Morning Metrics; el resto de APIs (GA4, GSC, Meta Ads, GHL) funcionan OK.

3. **⚠️ update-skills, image-optimizer, cron-watchdog** — Todos en estado "running" desde hace horas. Posible timeout o doble-trigger. Monitorizar.

### Datos de marketing Growth4U (de Morning Metrics 2026-04-21)

| Métrica | Valor | vs Media 7d | Estado |
|---------|-------|-------------|--------|
| Spend | €133.79 | €137.99 | ✅ OK |
| Impresiones | 5,248 | 5,854 | ✅ OK |
| Clics | 35 | 47 | ⚠️ Bajo |
| CTR | 0.67% | 0.83% | ⚠️ Bajo |
| CPC | €3.82 | €3.07 | ⚠️ Alto |
| Leads | 1 | 2.7/día | ⚠️ **Día bajo** |
| Contactos GHL nuevos | 4 | — | ✅ 4 contactos (óscar, kiko requena, jose via lead magnet + daniel Facebook) |
| Citas GHL | 0 | — | ⚠️ Sigue sin haber citas |

**Análisis**: 1 solo lead (vs 2.7 media) es bajo pero no crítico — podría ser ruido de lunes. Lo más preocupante es el patrón simultáneo: CTR bajo + CPC alto + leads bajos. Esto sugiere fatiga de audiencia o creatividades que no resuenan. El día 04-19 tuvo 7 leads con CTR 1.09% y CPC €2.41 — ese es el benchmark a replicar.

### Interacción MC Chat — Guest Posts (P06-T07)

Sesión interactiva de ~30 minutos con Admin sobre validación de medios para guest posts. Sancho fue iterativo y receptivo:
- Captó que faltaba Puromarketing cuando Admin lo señaló
- Captó y autocorrigióerror de caracteres chinos en texto para Alfonso
- Pidió clarificación cuando el topic "El problema de growth que no es un problema de marketing" no fue entendido
- Respetó el execution guardrail: no ejecutó hasta tener aprobación

**Resultado**: Mensaje listo para enviar al equipo sobre los 3 medios (todostartups.com, josefacchin.com, Puromarketing) con topics diferenciados atados a Trust Engine. Pendiente de que Alfonso lo envíe.

### Reglas de canal

✅ **Correcto:**
- Call Prep → usó hilo en #intelligence (correcto)
- Daily Pulse HC → 0 actividad → sin публикация (protocolo correcto)
- MC Chat → se quedó en MC Chat (no invadió Discord)
- Discord greeting → apropiado
- Contenido largo → siempre en hilos, no en canal directo

❌ **Problemático:**
- Morning Metrics Growth4U → **no llegó a Discord**. Reporte salvado localmente pero no entregado.

### ¿Qué hizo bien Sancho

- ✅ **Call Prep de alta calidad** — 2 briefings detallados con company intel, historial, y objetivos claros para cada llamada
- ✅ **Detección proactiva de anomalías** — CTR 0.67%, CPC €3.82, 1 lead. Identificó correctamente que el día 04-19 (7 leads) fue outlier positivo y recomienda analizar qué cambió
- ✅ **MC Chat interactivo y receptivo** — autocorrige errores, pide clarificación cuando no entiende, no假设
- ✅ **Respectó quiet hours** — todos los heartbeats nocturnos fueron HEARTBEAT_OK
- ✅ **Client isolation** — Growth4U datos solo en canales Growth4U, HC solo en HC

### Patrones de mejora

1. **Discord publishing desde exec-event** — Morning Metrics lleva semanas sin poder publicar en Discord desde contexto cron. La causa es estructural: el bot token de HC no tiene acceso a la guild Growth4U. **Fix necesario**: Obtener bot token con acceso a guild Growth4U (1477741643762241548) o cambiar la arquitectura de delivery para estos crons.

2. **Topics para Puromarketing** — Llevamos varías sesiones en P06-T07 iterando sobre los topics para Puromarketing. La confusión sugiere que no tenemos claro el angle para ese medio en particular. Proponer a Alfonso definir los 2 topics para Puromarketing en la próxima sesión.

3. **Hulahoop sin APIs** — Lleva semanas quemando tokens. Considerar pausar hasta que configuren хотя бы una fuente de datos.

4. **Skill execution log** — Sin entradas nuevas desde 2026-04-14 (último entry: cost-tracker failure, Q=2). No podemos medir `skill_quality_score` objetivamente. Esto rompe el metric de calidad.

### Valoración general

**6.5/10** — Día operativo con degradación notable: Morning Metrics NO llegó a Discord (reportó guardar en JSON pero no publicó). Esto significa que Alfonso no vio las métricas de la mañana. Los crons que SÍ funcionan (Daily Pulse, Call Prep, Lead Sync) lo hacen bien. La calidad del análisis de métricas es buena — las alertas están bien identificadas y priorizadas. El problema es delivery, no contenido.

**Urgencia: Baja-Media.** No hay bloqueante sistémico, pero la degradación de Morning Metrics significa pérdida de visibilidad operativa. Si esto persiste otro día, tendré que alertar a Alfonso.

### Acciones para Cervantes

- [ ] **Investigar bot token Growth4U** — Obtener Discord bot token con permisos en guild `1477741643762241548`. Sin esto, los crons de Growth4U no pueden publicar en Discord.
- [ ] **Fix skill-execution-log** — Los crons no están escribiendo al log. Necesitamos asegurar que cada skill execution registre su quality score.
- [ ] **Deshabilitar Hulahoop Morning Metrics** hasta que configuren APIs.
- [ ] **topics Puromarketing** — Definir en próxima sesión con Admin.

---

*Fin observaciones 2026-04-21*