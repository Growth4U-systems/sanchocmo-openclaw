# Observaciones Sancho — 2026-04-05

## Sesiones (últimas 24h): ~10 sesiones

| Canal | Tipo | Estado | Notes |
|-------|------|--------|-------|
| Cron | Morning Metrics — Growth4U | ✅ | 5/6 APIs OK, publicado en #intelligence, 1 error (Instantly — conocido) |
| Discord | #growth4u-gm | ✅ | Morning Metrics publicado + análisis + 3 propuestas acción |
| Cron | Regenerar Dashboard | ✅ | 54 tareas, 100 eventos, 35/81 pilares |
| Cron | update-skills | ✅ | 8 plugins actualizados, reportado en hilo Discord |
| Cron | cost-tracker-daily | ✅ | Sin anomalías, HEARTBEAT_OK |
| Cron | Lead Sync — Growth4U | ❌ FAILED | Error API: "Third-party apps now draw from your extra usage" |
| Heartbeat | Sancho (21:31 UTC) | ❌ FAILED | Mismo error API que Lead Sync |
| Heartbeat | Cervantes (21:05 UTC) | ❌ FAILED | Mismo error API |
| Cron | Cervantes backup-sancho | ✅ | 32h desde último backup — dentro de rango |
| Cron | Cervantes cost-tracker-daily | ❌ FAILED | Mismo error API |

## Errores / Fallos

1. **⚠️ Anthropic API key agotado — afecta a TODOS los crons en Opus/Sonnet** ❌ CRÍTICO
   - Error generalizado: `400 {"type":"error","error":{"type":"invalid_request_error","message":"Third-party apps now draw from your extra usage, not your plan limits. We've added a $200 credit to get you started. Claim it at claude.ai/settings/usage"}}}`
   - Afecta: Lead Sync, Sancho heartbeat, Cervantes heartbeat, Cervantes cost-tracker-daily
   - Los crons que usan MiniMax (Morning Metrics, update-skills, Regenerar Dashboard) SÍ funcionaron
   - El canal Discord funciona via delivery-mirror/OpenAI (no Anthropic) — por eso Morning Metrics llegó
   - **El API key de Anthropic está seco** — necesita recarga o cambio de plan
   - **Nota**: Ya ha ocurrido antes (cf. observaciones 2026-04-01: overloaded_error, 2026-04-04: rate_limit_error)

2. **Instantly error persistente** ⚠️
   - Morning Metrics reporta error en Instantly (fuente email outreach)
   - Lleva días igual — conocido, bajo impacto

## Preguntas sin respuesta

- Ninguna. Sin interacción humana (domingo).

## Reglas de canal

✅ **Discord**: Morning Metrics publicado correctamente en hilo, formato tabla markdown + análisis
✅ **Cron execution**: Morning Metrics con 5 APIs OK, análisis accionable (3 propuestas para el lunes)
✅ **Metricool sin datos**: Reportó 0 metrics correctamente (no lo ignora)
✅ **Hilo pattern**: Morning Metrics usa hilo correctamente en #intelligence

## Patrones de mejora

1. **🟢 MiniMax crons funcionando**: Morning Metrics, update-skills, Regenerar Dashboard usaron MiniMax y completaron sin error. La estrategia de usar MiniMax para crons está funcionando cuando Anthropic falla.

2. **🟢 Morning Metrics calidad alta**: Análisis con desglose 7 días, correlación CTR/CPC, propuestas accionables concretas. Formato consistente.

3. **🔴 API key Anthropic es el bottleneck recurrente**: Este es el 3er día consecutivo con errores de Anthropic (04-01: overloaded, 04-04: rate_limit, 04-05: API key agotado). Los crons en Opus/Sonnet fallan sistemáticamente cuando el API tiene problemas.

4. **🟡 Los crons deben migrar a MiniMax por defecto**: Morning Metrics ($0.0037) vs Lead Sync fallido ($7+ de retries). MiniMax es 100x más barato y no falla por rate limits de Anthropic. Esta migración ya está parcialmente hecha pero incompleta — Lead Sync sigue en Claude Sonnet 4.5.

5. **🟡 Lead Sync necesita migrar a MiniMax urgentemente**: Es el cron más caro ($7+ por ejecución cuando falla) y más crítico para G4U. Si usara MiniMax no fallaría por este error de API key.

6. **🟡 Heartbeat de Sancho en Opus es innecesario**: Solo hace email + calendar check — podría ser Haiku. Cada heartbeat fallido cuesta ~$3 en tokens desperdiciados.

## Métricas del día

- **Sesiones activas**: ~10 (muy bajo — domingo)
- **Clientes con interacción humana**: 0
- **Crons ejecutados OK**: 4/7
- **Crons fallidos**: 3 (todos por API key Anthropic agotado)
- **Errores API**: 4+ (todos mismo error: API key agotado)
- **Coste estimado 24h**: Muy bajo por falta de actividad humana

## Veredicto

**Día operativo severely impactado por API key agotado.** Sancho está funcionando dentro de lo posible: Morning Metrics ejecutó en MiniMax y entregó correctamente. Pero la raíz del problema es clara: el API key de Anthropic está agotado y lleva 3 días consecutivos con errores (overloaded → rate_limit → key exhausted). Los crons que usan Anthropic fallan sistemáticamente.

**⚠️ ALERTA CRÓNICA — API key agotado (3er día consecutivo)**
- Morning Metrics funciona via MiniMax ✅
- Lead Sync, heartbeats, cost-tracker fallen ❌
- Solución real: recargar API key de Anthropic O migrar todos los crons a MiniMax
- La migración a MiniMax ya está parcialmente hecha (04-04) pero Lead Sync y heartbeats siguen en Opus
- **Acción para Alfonso**: Recargar Anthropic API key en claude.ai/settings/usage Y/OU migrate crons restantes a MiniMax

**No hay urgencias que requieran notificación inmediata a Alfonso** — el sistema está degradado pero no bloqueado (MiniMax crons funcionan). Si el API key no se recarga en 24-48h, habrá que hacer migración completa a MiniMax.
