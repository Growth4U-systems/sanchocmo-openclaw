# Sancho Observations — 2026-04-25

## Resumen sesiones (últimas 24h)

| Sesión | Canal | Output | Estado |
|--------|-------|--------|--------|
| Morning Metrics Growth4U | Discord (#intelligence Growth4U) | Reporte métricas + hilo | ✅ OK |
| Morning Metrics Hulahoop | — | "Sin APIs configuradas" | ✅ OK (correcto) |
| Daily Pulse Growth4U | Discord (#intelligence Growth4U) | Reporte + micro-briefs | ✅ OK |
| Daily Pulse Hospital Capilar | Discord | Reporte (canales todos silenciosos) | ✅ OK |
| Lead Sync Growth4U | — | 11 leads procesados, archivos actualizados | ⚠️ Parcial |
| Weekly Strategy Report Criptan | — | **ABORTADO** — archivo NO guardado | ❌ FAIL |
| Call Prep Weekly Growth4U | Discord (#intelligence Growth4U) | 0 llamadas cliente semana 27abr-1may | ✅ OK |
| Meeting Intelligence | Discord | Sin reuniones nuevas | ✅ OK |
| Social & Content Review Criptan | — | Informe guardado, mensaje a #intelligence | ✅ OK |
| Cost Tracker Daily | — | Sin anomalías | ✅ OK |

---

## Errores y skills fallidos

### 🔴 Crítico — Weekly Strategy Report Criptan (ABORTADO)
- **Sesión**: `agent:sancho:cron:41d660cb-c18f-4268-aa95-6275f2435f90`
- **Problema**: Sesión murió en write (~seq 20) — output truncado, archivo NO guardado
- **Mismo patrón que la semana pasada** (Cervantes alertó el 23 abr)
- **Impacto**: Review del 30 abr en 6 días — Criptan no tiene Strategy Report
- **Causa probable**: Generación de contenido extenso + thinking largo → timeout/abort

### 🟡 Lead Sync Growth4U — Discord posting fallido
- **Sesión**: `agent:sancho:cron:a68143d8-1309-46eb-a5dc-4c3fb35ee3d2`
- **Problema**: Bot no tiene acceso al canal `1477741644789842031` (Growth4U #intelligence)
- **Error**: `unknown channel` — 4 intentos de message() fallaron
- **Impacto**: Reporte no llegó a Discord, sync de archivos sí se completó
- **Nota**: Morning Metrics y Daily Pulse SÍ publicaron correctamente en ese canal — inconsistencia

### 🟡 Instantly campaigns error
- **Error**: `(campaigns || []) is not iterable` en metrics-collector
- **Sesión**: Morning Metrics Growth4U (secundario, no bloquó el reporte)
- **Impacto**: Campañas de Instantly no incluidas en reporte

---

## Preguntas sin responder / conocimientos no disponibles
- N/A — todas las sesiones fueron crons automatizados, no hubo interacción humana

---

## Reglas de canal — cumplimiento
- ✅ Growth4U — Morning Metrics正确的 publicó en #intelligence (channel ID correcto)
- ✅ Hulahoop — Respondió "Sin APIs configuradas" sin publicar en Discord
- ✅ Context isolation — sin leaks entre clientes
- ⚠️ Inconsistencia Discord: Lead Sync no pudo publicar donde Morning Metrics sí pudo

---

## Patrones de mejora

### 1. Criptan crons abortando consistentemente
**Desde**: Hace ~2 semanas (Cervantes detectó el patrón el 23 abr)
**Patrón**: Sesiones que generan contenido largo (Weekly Strategy Report, B2B Pipeline Review) mueren antes del write
**Hipótesis**: Modelo (MiniMax-M2.7) genera thinking extenso → consume contexto → aborta por timeout
**Evidence**: 2 aborts consecutivos en Weekly Strategy Report, 1 abort en B2B Pipeline Review
**Acción requerida**: Regenerar Weekly Strategy Report manualmente; revisar skill para partir generación o reducir thinking

### 2. Discord channel access inconsistency
**Patrón**: Morning Metrics y Daily Pulse publican correctamente en `#1477741644789842031`; Lead Sync falla con "unknown channel"
**Hipótesis**: El accountId "discord" vs "sancho" causa routing diferente, o hay race condition en guild resolution
**Acción requerida**: Investigar por qué some crons ven el canal y others no

### 3. Growth4U — CPC subiendo, leads bajando
**Métricas ayer** (24 abr): 1 lead (vs media 7d: 3.0/día), CPC €4.22 (vs media €4.01)
**Spend**: €160 (vs media €142) — gastando más, generando menos
**Tendencia**:ligera degradación vs días anteriores (5 leads el 23 abr)
**Acción requerida**: Monitorizar — si mañana mismo patrón, ajustar bidding

### 4. Funnel lead→cita sigue roto (DÍA 22+)
**Estado**: 22 leads con tag `llamada-agendada` vs casi 0 calls en calendario
**Observado ya**: Cervantes alertó el 22 abr, Alfonso sabe
**Nuevo**: 0 citas en appointments GHL (últimas 24h)
**Acción requerida**: Sin cambio — es problema del equipo de Alfonso, no de Sancho

---

## Acciones recomendadas

| Prioridad | Acción | Owner |
|----------|--------|-------|
| P0 | Regenerar Weekly Strategy Report Criptan manualmente (review 30 abr) | Cervantes |
| P1 | Investigar Discord channel access inconsistency (Lead Sync vs Morning Metrics) | Cervantes |
| P2 | Revisar skill Lead Sync para partir generación o reducir longitud output | Cervantes |
| P3 | Monitorizar CPC Growth4U mañana (si sigue >€4.50, ajustar bidding) | Sancho (next heartbeat) |

---

_Generado por Cervantes — cron:cedfbd22-cbd0-4a19-87a0-29337c4f2b37 — 2026-04-25 08:00 UTC_
